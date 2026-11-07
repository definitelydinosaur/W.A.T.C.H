import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { AiService } from '../ai/ai.service';
import {
  AnnouncementClassification,
  announcementsConflict,
  matchesAnnouncementAudience,
  shouldSkipOldAnnouncement,
} from '../ai/announcement-classifier';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';
import { PushService } from '../notifications/push.service';
import { CreateSourceDto } from './dto/create-source.dto';
import { ManualAnnouncementDto } from './dto/manual-announcement.dto';
import {
  AlertSource,
  FacebookGraphAdapter,
  OfficialFeedAdapter,
  RawPost,
} from './source-adapter';

type SourceRow = AlertSource & { last_checked_at?: string | null };
type AnnouncementStatus = 'published' | 'pending_review' | 'rejected';

interface AnnouncementRow {
  id: number;
  source_id: number | null;
  source_type: 'lgu' | 'institution' | 'manual';
  source: string;
  source_url: string | null;
  title: string;
  content: string;
  published_at: string;
  category: string | null;
  ai_summary: string | null;
  affects_location: string | null;
  effective_date: string | null;
  scope: string | null;
  confidence: number | null;
  status: AnnouncementStatus;
  city: string | null;
  institution_id: string | null;
  conflict_flag: boolean;
}

interface UserAudienceRow {
  id: string;
  home_location_id: number | null;
  institution_id: string | null;
  notification_prefs: { announcements?: boolean } | null;
}

interface UserLocationRow {
  loc_id: number;
  user_id: string;
  city: string | null;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly ai: AiService,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/5 * * * *', { waitForCompletion: true })
  async pollTrustedSources() {
    const { data, error } = await this.supabase
      .from('school_sources')
      .select(
        'id,source_type,school_name,facebook_url,facebook_page_id,website_url,rss_url,city,institution_id,is_active,is_degraded,last_checked_at',
      )
      .eq('is_active', true);
    if (error) {
      this.logger.error(`School sources could not be loaded: ${error.message}`);
      return;
    }

    const sourceCandidates: unknown = data;
    if (!Array.isArray(sourceCandidates)) {
      this.logger.error('School source query returned an invalid response.');
      return;
    }
    for (const candidate of sourceCandidates) {
      if (!isSourceRow(candidate)) {
        this.logger.warn(
          'Ignoring a school source with invalid database fields.',
        );
        continue;
      }
      const source = candidate;
      if (isPlaceholderSource(source)) continue;
      try {
        const { posts, degraded } = await this.fetchSourcePosts(source);
        for (const post of posts) {
          try {
            const facebookPostId = await this.storeFacebookPost(source, post);
            if (facebookPostId !== null) {
              await this.processPost(source, post, facebookPostId);
            }
          } catch (postError) {
            this.logger.error(
              `Post from ${source.school_name} could not be processed: ${errorMessage(postError)}`,
            );
          }
        }
        const { error: updateError } = await this.supabase
          .from('school_sources')
          .update({
            last_checked_at: new Date().toISOString(),
            is_degraded: degraded,
          })
          .eq('id', source.id);
        if (updateError) {
          this.logger.error(
            `Source status update failed for ${source.school_name}: ${updateError.message}`,
          );
        }
      } catch (sourceError) {
        const message = errorMessage(sourceError);
        this.logger.error(
          `Source ${source.school_name} could not be processed: ${message}`,
        );
        const { error: updateError } = await this.supabase
          .from('school_sources')
          .update({
            last_checked_at: new Date().toISOString(),
            is_degraded: true,
          })
          .eq('id', source.id);
        if (updateError) {
          this.logger.error(
            `Source failure status could not be saved: ${updateError.message}`,
          );
        }
      }
    }
  }

  async createSource(input: CreateSourceDto): Promise<SourceRow> {
    if (input.source_type === 'institution' && !input.institution_id) {
      throw new BadRequestException(
        'institution_id is required for an institution source.',
      );
    }
    if (input.source_type === 'lgu' && !input.city?.trim()) {
      throw new BadRequestException('city is required for an LGU source.');
    }
    const result = await this.supabase
      .from('school_sources')
      .insert({
        source_type: input.source_type,
        school_name: input.school_name.trim(),
        facebook_url: input.facebook_url,
        facebook_page_id: input.facebook_page_id ?? null,
        website_url: input.website_url ?? null,
        rss_url: input.rss_url ?? null,
        city: input.city?.trim() ?? null,
        province: input.province?.trim() ?? null,
        institution_id: input.institution_id ?? null,
        is_active: input.is_active ?? true,
        is_degraded: false,
      })
      .select('*')
      .single();
    const { error } = result;
    if (error) {
      throw new ServiceUnavailableException(
        `Source could not be saved: ${error.message}`,
      );
    }
    const source: unknown = result.data;
    if (!isSourceRow(source)) {
      throw new ServiceUnavailableException(
        'Source was saved, but the database returned an invalid source record.',
      );
    }
    return source;
  }

  async setSourceActive(id: string, isActive: boolean) {
    const sourceId = Number(id);
    if (!Number.isSafeInteger(sourceId) || sourceId < 1) {
      throw new BadRequestException('Source ID must be a positive integer.');
    }
    const { data, error } = await this.supabase
      .from('school_sources')
      .update({ is_active: isActive })
      .eq('id', sourceId)
      .select('id, school_name, is_active')
      .maybeSingle();
    if (error) {
      throw new ServiceUnavailableException(
        `Source could not be updated: ${error.message}`,
      );
    }
    if (!data) throw new NotFoundException('Source was not found.');
    return data;
  }

  async addManualAnnouncement(input: ManualAnnouncementDto) {
    const source = await this.resolveManualSource(input);
    const externalPostId = input.external_post_id ?? `manual-${randomUUID()}`;
    const post: RawPost = {
      externalPostId,
      text: input.text.trim(),
      url: input.source_url ?? source.facebook_url,
      postedAt: new Date(input.posted_at ?? Date.now()).toISOString(),
    };
    const existing = await this.findFacebookPost(source, externalPostId);
    if (existing !== null)
      return { duplicate: true, facebook_post_id: existing };
    const facebookPostId = await this.insertFacebookPost(source, post);
    if (facebookPostId === null) return { duplicate: true };
    return this.processPost(source, post, facebookPostId);
  }

  async getPendingReview() {
    const { data, error } = await this.supabase
      .from('announcements')
      .select(
        'id,source,source_url,title,content,published_at,category,ai_summary,confidence,affects_location,effective_date,scope,city,institution_id,conflict_flag',
      )
      .eq('status', 'pending_review')
      .order('published_at', { ascending: false })
      .limit(100);
    if (error) {
      throw new ServiceUnavailableException(
        `Review queue could not be loaded: ${error.message}`,
      );
    }
    return { announcements: data ?? [] };
  }

  async reviewAnnouncement(id: string, approved: boolean) {
    const announcementId = Number(id);
    if (!Number.isSafeInteger(announcementId) || announcementId < 1) {
      throw new BadRequestException(
        'Announcement ID must be a positive integer.',
      );
    }
    const { data, error } = await this.supabase
      .from('announcements')
      .update({ status: approved ? 'published' : 'rejected' })
      .eq('id', announcementId)
      .eq('status', 'pending_review')
      .select(
        'id,source_id,source_type,source,source_url,title,content,published_at,category,ai_summary,affects_location,effective_date,scope,confidence,status,city,institution_id,conflict_flag',
      )
      .maybeSingle();
    if (error) {
      throw new ServiceUnavailableException(
        `Announcement review could not be saved: ${error.message}`,
      );
    }
    if (!data)
      throw new NotFoundException('Pending announcement was not found.');
    if (approved) {
      if (!isAnnouncementRow(data)) {
        throw new ServiceUnavailableException(
          'Reviewed announcement has invalid database fields.',
        );
      }
      await this.notifyAudience(data);
    }
    return { announcement: data };
  }

  async createTestHazard(userId: string, hazardType: 'heat' | 'rain') {
    const profileResult = await this.supabase
      .from('user_info')
      .select('home_location_id')
      .eq('id', userId)
      .maybeSingle();
    const { error: profileError } = profileResult;
    const profile: unknown = profileResult.data;
    if (profileError) {
      throw new ServiceUnavailableException(
        `Home location could not be loaded: ${profileError.message}`,
      );
    }
    const locationId = Number(
      isRecord(profile) ? profile.home_location_id : null,
    );
    if (!Number.isSafeInteger(locationId) || locationId < 1) {
      throw new BadRequestException(
        'Save a home location before testing a hazard.',
      );
    }
    const locationResult = await this.supabase
      .from('locations')
      .select('loc_id,label,city,full_address')
      .eq('loc_id', locationId)
      .eq('user_id', userId)
      .maybeSingle();
    const { error: locationError } = locationResult;
    const location: unknown = locationResult.data;
    if (locationError) {
      throw new ServiceUnavailableException(
        `Home location could not be loaded: ${locationError.message}`,
      );
    }
    if (!isRecord(location)) {
      throw new NotFoundException('Home location was not found.');
    }

    const typeName = hazardType === 'heat' ? 'Extreme heat' : 'Heavy rainfall';
    const riskLevel = 'Severe';
    const locationName =
      (typeof location.label === 'string' && location.label) ||
      (typeof location.city === 'string' && location.city) ||
      'Home';
    const measurements: Record<string, number> =
      hazardType === 'heat'
        ? { temperatureC: 42, humidityPercent: 70, heatIndexC: 52 }
        : { rainMm: 30, windKph: 0 };
    const guidance = await this.ai.generateWeatherSafetyTips({
      hazardType: typeName,
      riskLevel,
      location: locationName,
      measurements,
    });
    const hazardResult = await this.supabase
      .from('hazards')
      .insert({
        location_id: locationId,
        category: typeName,
        severity: riskLevel,
        hazard_type: typeName,
        risk_level: riskLevel,
        ai_summary: guidance.summary,
        safety_tips: {
          do: guidance.do,
          prepare: guidance.prepare,
          avoid: guidance.avoid,
        },
        dedupe_key: `test:${randomUUID()}`,
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
    const { error: hazardError } = hazardResult;
    const hazard: unknown = hazardResult.data;
    if (hazardError || !isRecord(hazard) || typeof hazard.id !== 'string') {
      throw new ServiceUnavailableException(
        `Test hazard could not be saved: ${hazardError?.message ?? 'No row returned'}`,
      );
    }
    const hazardId = hazard.id;
    await this.push.sendUserNotification({
      userId,
      hazardId,
      kind: 'weather_hazard',
      sourceName: 'W.A.T.C.H. test simulation',
      title: `${typeName} - ${riskLevel} near ${locationName}`,
      body: `${guidance.do[0]}\n${guidance.do[1]}`,
      data: { type: 'hazard', hazardId },
    });
    return { hazardId, riskLevel, hazardType: typeName };
  }

  async getUserAlerts(userId: string, locationId?: number) {
    if (locationId !== undefined) {
      const { data: profile, error: profileError } = await this.supabase
        .from('user_info')
        .select('home_location_id')
        .eq('id', userId)
        .maybeSingle();
      if (profileError) {
        throw new ServiceUnavailableException(
          `User location could not be verified: ${profileError.message}`,
        );
      }
      if (Number(profile?.home_location_id) !== locationId) {
        throw new BadRequestException(
          'The requested location is not the authenticated user’s home location.',
        );
      }
    }
    const result = await this.supabase
      .from('notifications')
      .select(
        'id,announcement_id,hazard_id,title,body,data,status,kind,source_name,source_url,sent_at,created_at,read_at,deleted_at,announcement:announcements(id,title,content,ai_summary,published_at,source,source_url,category,city,institution_id),hazard:hazards(id,category,severity,ai_summary,hazard_type,risk_level,safety_tips,created_at,expires_at,location_id)',
      )
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    const { error } = result;
    if (error) {
      throw new ServiceUnavailableException(
        `Alerts could not be loaded: ${error.message}`,
      );
    }
    const alerts: unknown[] = Array.isArray(result.data) ? result.data : [];
    const first = alerts[0];
    return {
      alerts,
      last_updated:
        isRecord(first) && typeof first.created_at === 'string'
          ? first.created_at
          : null,
    };
  }

  async getAnnouncement(userId: string, id: string) {
    const announcementId = Number(id);
    if (!Number.isSafeInteger(announcementId) || announcementId < 1) {
      throw new BadRequestException(
        'Announcement ID must be a positive integer.',
      );
    }
    const { data: notification, error: notificationError } = await this.supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('announcement_id', announcementId)
      .is('deleted_at', null)
      .maybeSingle();
    if (notificationError) {
      throw new ServiceUnavailableException(
        `Announcement access could not be checked: ${notificationError.message}`,
      );
    }
    if (!notification)
      throw new NotFoundException('Announcement was not found.');
    const { data: announcement, error } = await this.supabase
      .from('announcements')
      .select(
        'id,title,content,source,source_url,published_at,category,ai_summary,confidence,status',
      )
      .eq('id', announcementId)
      .eq('status', 'published')
      .maybeSingle();
    if (error) {
      throw new ServiceUnavailableException(
        `Announcement could not be loaded: ${error.message}`,
      );
    }
    if (!announcement)
      throw new NotFoundException('Announcement was not found.');
    await this.markNotificationRead(userId, String(notification.id));
    return {
      announcement,
      disclaimer:
        'AI-assisted summary. Always verify with the official source.',
    };
  }

  async markNotificationRead(userId: string, id: string) {
    const { data, error } = await this.supabase
      .from('notifications')
      .update({ status: 'Read', read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('id,status,read_at')
      .maybeSingle();
    if (error) {
      throw new ServiceUnavailableException(
        `Notification could not be updated: ${error.message}`,
      );
    }
    if (!data) throw new NotFoundException('Notification was not found.');
    return data;
  }

  async softDeleteNotification(userId: string, id: string) {
    const { data, error } = await this.supabase
      .from('notifications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('id,deleted_at')
      .maybeSingle();
    if (error) {
      throw new ServiceUnavailableException(
        `Notification could not be deleted: ${error.message}`,
      );
    }
    if (!data) throw new NotFoundException('Notification was not found.');
    return data;
  }

  private async resolveManualSource(
    input: ManualAnnouncementDto,
  ): Promise<SourceRow> {
    if (input.source_id !== undefined) {
      const result = await this.supabase
        .from('school_sources')
        .select('*')
        .eq('id', input.source_id)
        .maybeSingle();
      const { error } = result;
      if (error) {
        throw new ServiceUnavailableException(
          `Source could not be loaded: ${error.message}`,
        );
      }
      const source: unknown = result.data;
      if (!isSourceRow(source)) {
        throw new NotFoundException('Source was not found or is invalid.');
      }
      return source;
    }
    if (!input.source_type) {
      throw new BadRequestException(
        'Provide source_id or source_type and its audience details.',
      );
    }
    if (input.source_type === 'lgu' && !input.city?.trim()) {
      throw new BadRequestException(
        'city is required for an LGU announcement.',
      );
    }
    if (input.source_type === 'institution' && !input.institution_id) {
      throw new BadRequestException(
        'institution_id is required for an institution announcement.',
      );
    }
    let query = this.supabase
      .from('school_sources')
      .select('*')
      .eq('source_type', input.source_type)
      .eq('is_active', true);
    if (input.source_type === 'lgu')
      query = query.eq('city', input.city!.trim());
    else query = query.eq('institution_id', input.institution_id!);
    const result = await query.limit(1).maybeSingle();
    const { error } = result;
    if (error) {
      throw new ServiceUnavailableException(
        `Source could not be loaded: ${error.message}`,
      );
    }
    const foundSource: unknown = result.data;
    if (foundSource !== null && foundSource !== undefined) {
      if (!isSourceRow(foundSource)) {
        throw new ServiceUnavailableException(
          'Matched source has invalid database fields.',
        );
      }
      return foundSource;
    }

    const sourceName =
      input.source_name?.trim() ??
      (input.source_type === 'lgu' ? `${input.city} LGU` : 'Institution');
    const insertResult = await this.supabase
      .from('school_sources')
      .insert({
        source_type: input.source_type,
        school_name: sourceName,
        facebook_url: `https://manual.invalid/${randomUUID()}`,
        city: input.source_type === 'lgu' ? input.city!.trim() : null,
        institution_id: input.institution_id ?? null,
        is_active: false,
      })
      .select('*')
      .single();
    const { error: insertError } = insertResult;
    const created: unknown = insertResult.data;
    if (insertError || !created) {
      throw new ServiceUnavailableException(
        `Manual source could not be saved: ${insertError?.message ?? 'No row returned'}`,
      );
    }
    if (!isSourceRow(created)) {
      throw new ServiceUnavailableException(
        'Manual source was saved, but the database returned invalid fields.',
      );
    }
    return created;
  }

  private async fetchSourcePosts(source: SourceRow) {
    let degraded = false;
    const facebookToken = this.config.get<string>('FACEBOOK_ACCESS_TOKEN');
    const hasFacebookSource = Boolean(
      source.facebook_page_id || source.facebook_url,
    );
    if (hasFacebookSource && facebookToken) {
      try {
        const posts = await new FacebookGraphAdapter(facebookToken).fetchLatest(
          source,
        );
        if (posts.length) return { posts, degraded };
      } catch (error) {
        degraded = true;
        this.logger.warn(
          `Facebook Graph access failed for ${source.school_name}; trying official feeds: ${errorMessage(error)}`,
        );
      }
    } else if (hasFacebookSource && !facebookToken) {
      degraded = true;
      this.logger.warn(
        `Facebook Graph access is not configured for ${source.school_name}.`,
      );
    }
    try {
      return {
        posts: await new OfficialFeedAdapter().fetchLatest(source),
        degraded,
      };
    } catch (error) {
      if (!degraded) {
        this.logger.warn(
          `Official feed failed for ${source.school_name}: ${errorMessage(error)}`,
        );
      }
      return { posts: [], degraded: true };
    }
  }

  private async storeFacebookPost(source: SourceRow, post: RawPost) {
    if (!post.externalPostId) {
      post.externalPostId = `post-${randomUUID()}`;
    }
    const existing = await this.findFacebookPost(source, post.externalPostId);
    if (existing !== null) return null;
    return this.insertFacebookPost(source, post);
  }

  private async findFacebookPost(source: SourceRow, externalPostId: string) {
    const { data, error } = await this.supabase
      .from('facebook_posts')
      .select('id')
      .eq('source_id', source.id)
      .eq('external_post_id', externalPostId)
      .maybeSingle();
    if (error) {
      throw new ServiceUnavailableException(
        `Facebook post dedupe lookup failed: ${error.message}`,
      );
    }
    return data ? Number(data.id) : null;
  }

  private async insertFacebookPost(source: SourceRow, post: RawPost) {
    const { data, error } = await this.supabase
      .from('facebook_posts')
      .insert({
        source_id: source.id,
        source_name: source.school_name,
        external_post_id: post.externalPostId,
        post_url: post.url,
        post_text: post.text,
        published_at: post.postedAt,
        collected_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error?.code === '23505') {
      const existing = await this.findFacebookPost(
        source,
        post.externalPostId ?? '',
      );
      return existing;
    }
    if (error || !data) {
      throw new ServiceUnavailableException(
        `Facebook post could not be saved: ${error?.message ?? 'No row returned'}`,
      );
    }
    return Number(data.id);
  }

  private async processPost(
    source: SourceRow,
    post: RawPost,
    facebookPostId: number,
  ) {
    const classification = await this.ai.classifyLocalAnnouncement({
      text: redactContactDetails(post.text),
      sourceName: source.school_name,
      city: source.city,
      postedAt: post.postedAt,
    });
    const locationMismatch = isLocationMismatch(
      classification.affects_location,
      source.city,
      source.school_name,
    );
    if (
      !classification.is_relevant ||
      locationMismatch ||
      shouldSkipOldAnnouncement(post.postedAt, classification.effective_date)
    ) {
      return { ignored: true, reason: 'irrelevant, out of area, or expired' };
    }

    const conflict = await this.findConflicts(source, post, classification);
    const status: AnnouncementStatus =
      classification.confidence < 0.7 || conflict.length
        ? 'pending_review'
        : 'published';
    const summary = attributeSummary(
      source.school_name,
      classification.summary,
    );
    const title =
      post.text
        .split(/\r?\n/)
        .find((line) => line.trim())
        ?.trim()
        .slice(0, 180) ?? 'Official announcement';
    const announcementResult = await this.supabase
      .from('announcements')
      .insert({
        source: source.school_name,
        title,
        content: post.text,
        published_at: post.postedAt,
        ai_summary: summary,
        source_type: source.source_type,
        source_id: source.id,
        facebook_post_id: facebookPostId,
        source_url: post.url,
        category: classification.category,
        affects_location: classification.affects_location,
        effective_date: classification.effective_date?.slice(0, 10) ?? null,
        scope: classification.scope,
        confidence: classification.confidence,
        status,
        city: source.city,
        institution_id: source.institution_id,
        conflict_flag: conflict.length > 0,
      })
      .select(
        'id,source_id,source_type,source,source_url,title,content,published_at,category,ai_summary,affects_location,effective_date,scope,confidence,status,city,institution_id,conflict_flag',
      )
      .single();
    const { error } = announcementResult;
    const announcement: unknown = announcementResult.data;
    if (error || !isAnnouncementRow(announcement)) {
      if (error?.code === '23505') return { duplicate: true };
      throw new ServiceUnavailableException(
        `Announcement could not be saved: ${error?.message ?? 'No row returned'}`,
      );
    }
    if (status === 'published') {
      await this.notifyAudience(announcement);
    } else if (conflict.length) {
      const { error: conflictError } = await this.supabase
        .from('announcements')
        .update({ status: 'pending_review', conflict_flag: true })
        .in('id', conflict);
      if (conflictError) {
        throw new ServiceUnavailableException(
          `Conflicting posts could not be queued for review: ${conflictError.message}`,
        );
      }
    }
    return { id: announcement.id, status };
  }

  private async findConflicts(
    source: SourceRow,
    post: RawPost,
    classification: AnnouncementClassification,
  ) {
    const result = await this.supabase
      .from('announcements')
      .select('id,source_type,city,institution_id,content,effective_date')
      .neq('source_id', source.id)
      .gte(
        'published_at',
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )
      .in('status', ['published', 'pending_review'])
      .limit(100);
    const { error } = result;
    if (error) {
      throw new ServiceUnavailableException(
        `Announcement conflict check failed: ${error.message}`,
      );
    }
    const targetDate =
      classification.effective_date?.slice(0, 10) ?? post.postedAt.slice(0, 10);
    const data: unknown = result.data;
    const rows: unknown[] = Array.isArray(data) ? data : [];
    const conflicts = rows.filter((item) => {
      if (!isRecord(item)) return false;
      const sameAudience =
        source.source_type === 'institution'
          ? item.institution_id === source.institution_id
          : typeof item.city === 'string' &&
            source.city &&
            normalizeCity(item.city) === normalizeCity(source.city);
      const effectiveDate =
        typeof item.effective_date === 'string' ? item.effective_date : null;
      const sameDate =
        !effectiveDate || effectiveDate.slice(0, 10) === targetDate;
      return (
        sameAudience &&
        sameDate &&
        typeof item.content === 'string' &&
        announcementsConflict(item.content, post.text)
      );
    });
    return conflicts.flatMap((item) =>
      isRecord(item) && typeof item.id === 'number' ? [item.id] : [],
    );
  }

  private async notifyAudience(announcement: AnnouncementRow) {
    const { data: profiles, error: profileError } = await this.supabase
      .from('user_info')
      .select('id,home_location_id,institution_id,notification_prefs');
    if (profileError) {
      throw new ServiceUnavailableException(
        `Alert audience could not be loaded: ${profileError.message}`,
      );
    }
    const users = (profiles ?? []) as UserAudienceRow[];
    const locationIds = users
      .map((profile) => profile.home_location_id)
      .filter((id): id is number => typeof id === 'number');
    const cityByLocation = new Map<number, string | null>();
    if (locationIds.length) {
      const { data: locations, error: locationError } = await this.supabase
        .from('locations')
        .select('loc_id,user_id,city')
        .in('loc_id', [...new Set(locationIds)]);
      if (locationError) {
        throw new ServiceUnavailableException(
          `User locations could not be loaded: ${locationError.message}`,
        );
      }
      for (const location of (locations ?? []) as UserLocationRow[]) {
        cityByLocation.set(location.loc_id, location.city);
      }
    }
    const kind =
      announcement.source_type === 'institution'
        ? 'announcement_institution'
        : 'announcement_local';
    const categoryLabels: Record<string, string> = {
      class_suspension: 'Class Suspension',
      holiday_no_class: 'No Classes',
      weather_update: 'Weather Update',
      air_quality: 'Air Quality Alert',
      emergency: 'Emergency',
      evacuation: 'Evacuation',
      other: 'Local Alert',
    };
    const title = `${categoryLabels[announcement.category ?? 'other'] ?? 'Local Alert'} - ${announcement.source} (${kind === 'announcement_local' ? 'Local' : 'Institution'})`;
    const body = `${announcement.ai_summary ?? announcement.title}\nFor further details, please visit ${announcement.source_url ?? 'the official source'}`;
    for (const profile of users) {
      const homeCity = profile.home_location_id
        ? cityByLocation.get(profile.home_location_id)
        : null;
      if (
        !matchesAnnouncementAudience(
          {
            type:
              announcement.source_type === 'institution'
                ? 'institution'
                : 'lgu',
            city: announcement.city,
            institutionId: announcement.institution_id,
          },
          {
            id: profile.id,
            homeCity,
            institutionId: profile.institution_id,
            notificationPrefs: profile.notification_prefs,
          },
        )
      ) {
        continue;
      }
      await this.push.sendUserNotification({
        userId: profile.id,
        announcementId: String(announcement.id),
        kind,
        sourceName: announcement.source,
        sourceUrl: announcement.source_url,
        title,
        body,
        data: {
          type: 'announcement',
          announcementId: String(announcement.id),
          url: announcement.source_url ?? '',
        },
      });
    }
  }
}

function isPlaceholderSource(source: SourceRow) {
  const url = source.facebook_url?.toLocaleLowerCase() ?? '';
  return (
    url.includes('replace_with') ||
    url.includes('manual.invalid') ||
    source.school_name.toLocaleLowerCase().includes('placeholder')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSourceRow(value: unknown): value is SourceRow {
  return (
    isRecord(value) &&
    (typeof value.id === 'number' || typeof value.id === 'string') &&
    (value.source_type === 'lgu' || value.source_type === 'institution') &&
    typeof value.school_name === 'string' &&
    (typeof value.facebook_url === 'string' || value.facebook_url === null) &&
    (typeof value.website_url === 'string' || value.website_url === null) &&
    (typeof value.rss_url === 'string' || value.rss_url === null) &&
    (typeof value.city === 'string' || value.city === null) &&
    (typeof value.institution_id === 'string' ||
      value.institution_id === null) &&
    typeof value.is_active === 'boolean'
  );
}

function isAnnouncementRow(value: unknown): value is AnnouncementRow {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    (typeof value.source_id === 'number' || value.source_id === null) &&
    (value.source_type === 'lgu' ||
      value.source_type === 'institution' ||
      value.source_type === 'manual') &&
    typeof value.source === 'string' &&
    (typeof value.source_url === 'string' || value.source_url === null) &&
    typeof value.title === 'string' &&
    typeof value.content === 'string' &&
    typeof value.published_at === 'string' &&
    (typeof value.category === 'string' || value.category === null) &&
    (typeof value.ai_summary === 'string' || value.ai_summary === null) &&
    (typeof value.affects_location === 'string' ||
      value.affects_location === null) &&
    (typeof value.effective_date === 'string' ||
      value.effective_date === null) &&
    (typeof value.scope === 'string' || value.scope === null) &&
    (typeof value.confidence === 'number' || value.confidence === null) &&
    (value.status === 'published' ||
      value.status === 'pending_review' ||
      value.status === 'rejected') &&
    (typeof value.city === 'string' || value.city === null) &&
    (typeof value.institution_id === 'string' ||
      value.institution_id === null) &&
    typeof value.conflict_flag === 'boolean'
  );
}

function isLocationMismatch(
  statedLocation: string | null,
  sourceCity: string | null,
  sourceName: string,
) {
  if (!statedLocation) return false;
  const normalizedStatement = normalizeCity(statedLocation);
  return ![sourceCity, sourceName]
    .filter((value): value is string => Boolean(value))
    .some((value) => {
      const normalizedExpected = normalizeCity(value);
      return (
        normalizedStatement.includes(normalizedExpected) ||
        normalizedExpected.includes(normalizedStatement)
      );
    });
}

function normalizeCity(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/^city\s+of\s+/, '')
    .replace(/\s+city$/, '')
    .replace(/\s+/g, ' ');
}

function attributeSummary(sourceName: string, summary: string) {
  return /^according to\b/i.test(summary.trim())
    ? summary.trim()
    : `According to ${sourceName}, ${summary.trim()}`;
}

function redactContactDetails(text: string) {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
    .replace(/(?<!\d)\+?(?:\d[\s().-]?){9,15}(?!\d)/g, '[redacted phone]');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}
