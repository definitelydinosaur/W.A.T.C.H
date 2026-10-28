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
  announcementContentHash,
  announcementsConflict,
  isDuplicateAnnouncement,
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

export interface SourceRow extends AlertSource {
  last_checked_at?: string | null;
}

export interface AnnouncementReviewRow {
  id: string;
  source_name: string;
  source_url: string | null;
  original_text: string;
  posted_at: string;
  category: string | null;
  ai_summary: string | null;
  confidence: number | null;
  affects_location: string | null;
  effective_date: string | null;
}

export interface UserAlertRow {
  id: string;
  announcement_id: string | null;
  hazard_id: string | null;
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: string;
  sent_at: string;
  created_at: string;
  announcement: {
    id: string;
    category: string | null;
    ai_summary: string | null;
    source_name: string;
    source_url: string | null;
    posted_at: string;
  } | null;
  hazard: {
    id: string;
    hazard_type: string;
    risk_level: string;
    safety_tips: string[];
    explanation: string | null;
    created_at: string;
  } | null;
}

interface RawUserAlertRow extends Omit<
  UserAlertRow,
  'announcement' | 'hazard'
> {
  announcement:
    | NonNullable<UserAlertRow['announcement']>
    | NonNullable<UserAlertRow['announcement']>[];
  hazard:
    NonNullable<UserAlertRow['hazard']> | NonNullable<UserAlertRow['hazard']>[];
}

interface ConflictAnnouncementRow {
  id: string;
  source_id: string | null;
  original_text: string;
  effective_date: string | null;
}

interface ConflictSourceRow {
  id: string;
  name: string;
  city: string | null;
  institution_id: string | null;
}

interface UserAudienceRow {
  id: string;
  home_location_id: string | null;
  institution_id: string | null;
  notification_prefs: { announcements?: boolean } | null;
}

interface UserLocationAudienceRow {
  user_id: string;
  city: string | null;
  barangay: string | null;
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
    const sourcesResult = await this.supabase
      .from('sources')
      .select('*')
      .eq('is_active', true)
      .eq('is_trusted', true);
    if (sourcesResult.error) {
      this.logger.error(
        `Trusted source query failed: ${sourcesResult.error.message}`,
      );
      return;
    }

    const sources = (sourcesResult.data ?? []) as SourceRow[];
    for (const source of sources) {
      try {
        const { posts, degraded } = await this.fetchSourcePosts(source);
        for (const post of posts) await this.processPost(source, post);
        const { error: updateError } = await this.supabase
          .from('sources')
          .update({
            last_checked_at: new Date().toISOString(),
            status: degraded ? 'degraded' : 'active',
            last_error: degraded
              ? 'Facebook access failed; a fallback feed was used.'
              : null,
          })
          .eq('id', source.id);
        if (updateError)
          this.logger.error(
            `Source status update failed: ${updateError.message}`,
          );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown source error';
        this.logger.error(
          `Source ${source.name} could not be processed: ${message}`,
        );
        const { error: updateError } = await this.supabase
          .from('sources')
          .update({
            last_checked_at: new Date().toISOString(),
            status: 'degraded',
            last_error: message.slice(0, 500),
          })
          .eq('id', source.id);
        if (updateError)
          this.logger.error(
            `Source failure status could not be saved: ${updateError.message}`,
          );
      }
    }
  }

  async createSource(input: CreateSourceDto) {
    const sourceResult = await this.supabase
      .from('sources')
      .insert({
        type: input.type,
        name: input.name.trim(),
        facebook_page_id: input.facebook_page_id || null,
        facebook_page_url: input.facebook_page_url || null,
        website_url: input.website_url || null,
        rss_url: input.rss_url || null,
        city: input.city?.trim() || null,
        institution_id: input.institution_id || null,
        is_trusted: input.is_trusted ?? false,
        is_active: true,
      })
      .select('*')
      .single();
    if (sourceResult.error)
      throw new ServiceUnavailableException(
        `Source could not be saved: ${sourceResult.error.message}`,
      );
    return sourceResult.data as SourceRow;
  }

  async setSourceActive(id: string, isActive: boolean) {
    if (typeof isActive !== 'boolean') {
      throw new BadRequestException('is_active must be a boolean.');
    }
    const sourceResult = await this.supabase
      .from('sources')
      .update({ is_active: isActive })
      .eq('id', id)
      .select('id, name, is_active')
      .maybeSingle();
    if (sourceResult.error)
      throw new ServiceUnavailableException(
        `Source could not be updated: ${sourceResult.error.message}`,
      );
    if (!sourceResult.data)
      throw new NotFoundException('Source was not found.');
    return sourceResult.data;
  }

  async addManualAnnouncement(input: ManualAnnouncementDto) {
    const sourceResult = await this.supabase
      .from('sources')
      .select('*')
      .eq('id', input.source_id)
      .eq('is_active', true)
      .eq('is_trusted', true)
      .maybeSingle();
    if (sourceResult.error)
      throw new ServiceUnavailableException(
        `Trusted sources could not be loaded: ${sourceResult.error.message}`,
      );
    const source = sourceResult.data as SourceRow | null;
    if (!source) {
      throw new NotFoundException('Trusted active source was not found.');
    }
    const post: RawPost = {
      externalPostId: input.external_post_id ?? `manual-${randomUUID()}`,
      text: input.text,
      url: input.source_url ?? source.facebook_page_url ?? source.website_url,
      postedAt: new Date(input.posted_at).toISOString(),
    };
    return this.processPost(source, post);
  }

  async getPendingReview() {
    const { data, error } = await this.supabase
      .from('announcements')
      .select(
        'id, source_name, source_url, original_text, posted_at, category, ai_summary, confidence, affects_location, effective_date',
      )
      .eq('status', 'pending_review')
      .order('posted_at', { ascending: false })
      .limit(100);
    if (error)
      throw new ServiceUnavailableException(
        `Review queue could not be loaded: ${error.message}`,
      );
    return { announcements: (data ?? []) as AnnouncementReviewRow[] };
  }

  async getUserAlerts(userId: string) {
    const { data, error } = await this.supabase
      .from('notifications')
      .select(
        'id, announcement_id, hazard_id, title, body, data, status, sent_at, created_at, announcement:announcements(id, category, ai_summary, source_name, source_url, posted_at), hazard:hazards(id, hazard_type, risk_level, safety_tips, explanation, created_at)',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error)
      throw new ServiceUnavailableException(
        `Alerts could not be loaded: ${error.message}`,
      );
    const rows = (data ?? []) as RawUserAlertRow[];
    return {
      alerts: rows.map((row) => ({
        ...row,
        announcement: Array.isArray(row.announcement)
          ? (row.announcement[0] ?? null)
          : row.announcement,
        hazard: Array.isArray(row.hazard)
          ? (row.hazard[0] ?? null)
          : row.hazard,
      })),
    };
  }

  async getAnnouncement(userId: string, id: string) {
    const { data: notification, error: notificationError } = await this.supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('announcement_id', id)
      .maybeSingle();
    if (notificationError)
      throw new ServiceUnavailableException(
        `Announcement access could not be checked: ${notificationError.message}`,
      );
    const { data: announcement, error } = await this.supabase
      .from('announcements')
      .select(
        'id, source_name, source_url, original_text, posted_at, category, ai_summary, confidence, status',
      )
      .eq('id', id)
      .eq('status', 'published')
      .maybeSingle();
    if (error)
      throw new ServiceUnavailableException(
        `Announcement could not be loaded: ${error.message}`,
      );
    if (!announcement || !notification)
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
      .select('id, status, read_at')
      .maybeSingle();
    if (error)
      throw new ServiceUnavailableException(
        `Notification could not be updated: ${error.message}`,
      );
    if (!data) throw new NotFoundException('Notification was not found.');
    return data;
  }

  private async fetchSourcePosts(source: SourceRow) {
    let degraded = false;
    const facebookToken = this.config.get<string>('FACEBOOK_ACCESS_TOKEN');
    if (source.facebook_page_id && facebookToken) {
      try {
        const posts = await new FacebookGraphAdapter(facebookToken).fetchLatest(
          source,
        );
        if (posts.length) return { posts, degraded };
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown error';
        const safeDetail = this.config.get<string>('FACEBOOK_ACCESS_TOKEN')
          ? detail.replaceAll(
              this.config.get<string>('FACEBOOK_ACCESS_TOKEN')!,
              '[redacted]',
            )
          : detail;
        degraded = true;
        this.logger.warn(
          `Facebook access failed for ${source.name}; trying the official feed: ${safeDetail}`,
        );
      }
    } else if (source.facebook_page_id) {
      degraded = true;
      this.logger.warn(
        `Facebook access is not configured for source ${source.name}.`,
      );
    }
    try {
      return {
        posts: await new OfficialFeedAdapter().fetchLatest(source),
        degraded,
      };
    } catch (error) {
      if (degraded) throw error;
      this.logger.warn(
        `Official RSS/website adapter failed for ${source.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { posts: [], degraded: true };
    }
  }

  private async processPost(source: SourceRow, post: RawPost) {
    if (!source.is_active || !source.is_trusted) return { ignored: true };
    const contentHash = announcementContentHash(post.text);
    const [postIdMatch, hashMatch] = await Promise.all([
      post.externalPostId
        ? this.supabase
            .from('announcements')
            .select('external_post_id, content_hash')
            .eq('source_id', source.id)
            .eq('external_post_id', post.externalPostId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.supabase
        .from('announcements')
        .select('external_post_id, content_hash')
        .eq('source_id', source.id)
        .eq('content_hash', contentHash)
        .maybeSingle(),
    ]);
    if (postIdMatch.error || hashMatch.error) {
      throw new ServiceUnavailableException(
        `Announcement dedupe lookup failed: ${postIdMatch.error?.message ?? hashMatch.error?.message}`,
      );
    }
    if (
      isDuplicateAnnouncement(
        [postIdMatch.data, hashMatch.data].filter(
          (
            item,
          ): item is {
            external_post_id: string | null;
            content_hash: string;
          } => item !== null,
        ),
        post.externalPostId,
        contentHash,
      )
    ) {
      return { duplicate: true };
    }

    const classification = await this.ai.classifyLocalAnnouncement({
      text: redactContactDetails(post.text),
      sourceName: source.name,
      city: source.city,
      postedAt: post.postedAt,
    });
    const statedLocation = classification.affects_location?.toLocaleLowerCase();
    const expectedLocations = [source.city, source.name]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLocaleLowerCase());
    const locationMismatch = Boolean(
      statedLocation &&
      expectedLocations.length &&
      !expectedLocations.some(
        (expected) =>
          statedLocation.includes(expected) ||
          expected.includes(statedLocation),
      ),
    );
    if (
      !classification.is_relevant ||
      locationMismatch ||
      shouldSkipOldAnnouncement(post.postedAt, classification.effective_date)
    ) {
      const { error } = await this.supabase.from('announcements').insert({
        source_id: source.id,
        source_name: source.name,
        source_url: post.url,
        source_type: source.type,
        external_post_id: post.externalPostId,
        content_hash: contentHash,
        original_text: post.text,
        posted_at: post.postedAt,
        category: classification.category,
        ai_summary: classification.summary,
        affects_location: classification.affects_location,
        effective_date: classification.effective_date,
        scope: classification.scope,
        confidence: classification.confidence,
        status: 'rejected',
      });
      if (error)
        throw new ServiceUnavailableException(
          `Announcement could not be recorded: ${error.message}`,
        );
      return { ignored: true };
    }

    const summary = `According to ${source.name}, ${classification.summary}`;
    const status =
      classification.confidence >= 0.7 ? 'published' : 'pending_review';
    const announcementResult = await this.supabase
      .from('announcements')
      .insert({
        source_id: source.id,
        source_name: source.name,
        source_url: post.url,
        source_type: source.type,
        external_post_id: post.externalPostId,
        content_hash: contentHash,
        original_text: post.text,
        posted_at: post.postedAt,
        category: classification.category,
        ai_summary: summary,
        affects_location: classification.affects_location,
        effective_date: classification.effective_date,
        scope: classification.scope,
        confidence: classification.confidence,
        status,
      })
      .select('id')
      .single();
    const announcementId =
      typeof announcementResult.data?.id === 'string'
        ? announcementResult.data.id
        : null;
    if (announcementResult.error || !announcementId) {
      if (announcementResult.error?.code === '23505')
        return { duplicate: true };
      throw new ServiceUnavailableException(
        `Announcement could not be saved: ${announcementResult.error?.message ?? 'No row returned'}`,
      );
    }

    if (status === 'published') {
      const conflicting = await this.findConflict(
        source,
        post,
        classification.effective_date,
      );
      if (conflicting.length) {
        const groupId = randomUUID();
        const { error: currentError } = await this.supabase
          .from('announcements')
          .update({ status: 'conflicting', conflict_group_id: groupId })
          .eq('id', announcementId);
        if (currentError)
          throw new ServiceUnavailableException(
            `Conflicting status could not be saved: ${currentError.message}`,
          );
        const { error: previousError } = await this.supabase
          .from('announcements')
          .update({ status: 'conflicting', conflict_group_id: groupId })
          .in('id', conflicting);
        if (previousError)
          throw new ServiceUnavailableException(
            `Conflicting notices could not be updated: ${previousError.message}`,
          );
        return { id: announcementId, status: 'conflicting' };
      }
      await this.notifyAudience(
        source,
        announcementId,
        classification.category,
        summary,
        post.url,
      );
    }
    return { id: announcementId, status };
  }

  private async findConflict(
    source: SourceRow,
    post: RawPost,
    effectiveDate: string | null,
  ) {
    const since = new Date(
      Date.parse(post.postedAt) - 24 * 60 * 60 * 1000,
    ).toISOString();
    const recentResult = await this.supabase
      .from('announcements')
      .select('id, source_id, original_text, effective_date')
      .neq('source_id', source.id)
      .gte('posted_at', since)
      .in('status', ['published', 'pending_review'])
      .limit(50);
    if (recentResult.error)
      throw new ServiceUnavailableException(
        `Conflict check failed: ${recentResult.error.message}`,
      );
    const recent = (recentResult.data ?? []) as ConflictAnnouncementRow[];
    const otherIds = [
      ...new Set(
        recent.flatMap((item) => (item.source_id ? [item.source_id] : [])),
      ),
    ];
    if (!otherIds.length) return [];
    const sourceResult = await this.supabase
      .from('sources')
      .select('id, name, city, institution_id')
      .in('id', otherIds);
    if (sourceResult.error)
      throw new ServiceUnavailableException(
        `Conflict source lookup failed: ${sourceResult.error.message}`,
      );
    const otherSources = (sourceResult.data ?? []) as ConflictSourceRow[];
    const sources = new Map(otherSources.map((item) => [item.id, item]));
    return recent
      .filter((item) => {
        if (!item.source_id) return false;
        const other = sources.get(item.source_id);
        const sameAudience =
          source.type === 'institution'
            ? other?.institution_id === source.institution_id
            : source.type === 'barangay'
              ? other?.name.toLocaleLowerCase() ===
                source.name.toLocaleLowerCase()
              : other?.city?.toLocaleLowerCase() ===
                source.city?.toLocaleLowerCase();
        const targetDate = effectiveDate ?? post.postedAt;
        const datesOverlap =
          !item.effective_date ||
          !targetDate ||
          new Date(item.effective_date).toDateString() ===
            new Date(targetDate).toDateString();
        return (
          sameAudience &&
          datesOverlap &&
          announcementsConflict(item.original_text, post.text)
        );
      })
      .map((item) => item.id);
  }

  private async notifyAudience(
    source: SourceRow,
    announcementId: string,
    category: string,
    summary: string,
    sourceUrl: string | null,
  ) {
    const profiles: UserAudienceRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data: page, error } = await this.supabase
        .from('user_info')
        .select('id, home_location_id, institution_id, notification_prefs')
        .range(offset, offset + 499);
      if (error)
        throw new ServiceUnavailableException(
          `Alert audience could not be loaded: ${error.message}`,
        );
      const typedPage = (page ?? []) as UserAudienceRow[];
      profiles.push(...typedPage);
      if (!page || page.length < 500) break;
    }
    if (!profiles?.length) return;
    const userIds = profiles.map((profile) => profile.id);
    const locationResult = await this.supabase
      .from('locations')
      .select('user_id, city, barangay')
      .eq('is_default', true)
      .in('user_id', userIds);
    if (locationResult.error)
      throw new ServiceUnavailableException(
        `User locations could not be loaded: ${locationResult.error.message}`,
      );
    const locations = (locationResult.data ?? []) as UserLocationAudienceRow[];
    const cityByUser = new Map(
      (locations ?? []).map((location) => [location.user_id, location.city]),
    );
    const barangayByUser = new Map(
      locations.map((location) => [location.user_id, location.barangay]),
    );
    const categoryLabels: Record<string, string> = {
      class_suspension: 'Class Suspension',
      holiday_no_class: 'No Classes',
      weather_update: 'Weather Update',
      emergency: 'Emergency',
      evacuation: 'Evacuation',
      other: 'Local Alert',
    };
    const categoryLabel =
      categoryLabels[category] ??
      (source.type === 'institution'
        ? 'Class & Safety Alert'
        : 'Local Safety Alert');
    const title = `${categoryLabel} - ${source.name}`;
    const body = `${summary}\nFor further information, visit ${sourceUrl ?? source.facebook_page_url ?? source.website_url ?? 'the official source'}`;

    for (const profile of profiles) {
      const audience = {
        id: profile.id,
        homeCity: cityByUser.get(profile.id),
        homeBarangay: barangayByUser.get(profile.id),
        institutionId: profile.institution_id,
        notificationPrefs: profile.notification_prefs,
      };
      if (!matchesAnnouncementAudience(source, audience)) continue;
      await this.push.sendUserNotification({
        userId: audience.id,
        announcementId,
        title,
        body,
        data: { type: 'announcement', announcementId },
      });
    }
  }
}

function redactContactDetails(text: string) {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
    .replace(/(?<!\d)\+?(?:\d[\s().-]?){9,15}(?!\d)/g, '[redacted phone]');
}
