import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { AiService, SystemAnnouncementFormat } from '../ai/ai.service';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';
import { PushService } from '../notifications/push.service';

type ManualSendInput = {
  type: 'institution' | 'local' | 'weather' | 'system';
  title: string;
  body: string;
  source_name?: string;
  source_url?: string;
  audience: 'all' | 'me' | 'institution';
  institution_id?: string;
};

type SystemAnnouncement = SystemAnnouncementFormat;

type AutomatedAnnouncementRow = {
  id: number;
  title: string | null;
  content: string | null;
  ai_summary: string | null;
  source: string | null;
  source_name: string | null;
  source_url: string | null;
  published_at: string;
  category: string | null;
  ai_scope: string | null;
  is_class_suspension: boolean;
  suspension_reason: string | null;
  affected_levels: string | null;
  ai_key_points: string[];
  institution_id: string | null;
};

type AdminFeedItem = {
  id: string;
  item_type: 'announcement' | 'hazard' | 'safety_tip' | 'pagasa';
  announcement_id: number | null;
  hazard_id: string | null;
  pagasa_id: number | null;
  title: string;
  content: string | null;
  ai_summary: string | null;
  source: string | null;
  source_name: string | null;
  source_url: string | null;
  published_at: string;
  category: string | null;
  ai_scope: string | null;
  is_class_suspension: boolean;
  suspension_reason: string | null;
  affected_levels: string | null;
  notification_counts: Record<string, number>;
};

type HazardFeedRow = {
  id: string;
  category: string | null;
  severity: string | null;
  hazard_type: string | null;
  risk_level: string | null;
  ai_summary: string | null;
  safety_tips: unknown;
  created_at: string;
  expires_at: string | null;
};

type PagasaFeedRow = {
  id: number;
  event: string | null;
  alert_status: string | null;
  severity: string | null;
  published_at: string | null;
  expires: string | null;
  created_at: string;
  content: string | null;
};

type HazardNotificationRow = { hazard_id: string; status: string };
type SafetyTipNotificationRow = {
  hazard_id: string;
  title: string;
  body: string;
  created_at: string;
  status: string;
  source_name: string | null;
  source_url: string | null;
};

type StoredDraft = {
  id: string;
  raw_text: string;
  ai_json: unknown;
  version_history: unknown;
  status: string;
};

type AdminNotificationKind =
  'announcement_local' | 'announcement_institution' | 'weather' | 'system';

@Injectable()
export class AdminFeaturesService {
  private readonly logger = new Logger(AdminFeaturesService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly ai: AiService,
    private readonly push: PushService,
  ) {}

  async getInstitutions() {
    const { data, error } = await this.supabase
      .from('institutions')
      .select('id,name,short_name')
      .order('name', { ascending: true })
      .limit(500)
      .overrideTypes<
        { id: string; name: string; short_name: string | null }[],
        { merge: false }
      >();
    if (error) {
      throw new ServiceUnavailableException(
        `Institutions could not be loaded: ${error.message}`,
      );
    }
    return { institutions: data ?? [] };
  }

  async sendManualNotification(adminId: string, input: ManualSendInput) {
    if (input.audience === 'institution' && !input.institution_id) {
      throw new BadRequestException(
        'Choose an institution before sending to its members.',
      );
    }

    const kind = {
      institution: 'announcement_institution',
      local: 'announcement_local',
      weather: 'weather',
      system: 'system',
    } as const;
    const notificationKind = kind[input.type];
    const { data: announcement, error: announcementError } = await this.supabase
      .from('announcements')
      .insert({
        title: input.title.trim(),
        content: input.body.trim(),
        ai_summary: input.body.trim(),
        source: 'admin_manual',
        source_name: input.source_name?.trim() || 'W.A.T.C.H. Admin',
        source_url: input.source_url?.trim() || null,
        category: input.type,
        ai_scope: input.type,
        status: 'published',
        published_at: new Date().toISOString(),
        institution_id:
          input.type === 'institution' ? (input.institution_id ?? null) : null,
      })
      .select('id')
      .single()
      .overrideTypes<{ id: number }, { merge: false }>();
    if (announcementError || !announcement) {
      throw new ServiceUnavailableException(
        `Manual announcement could not be saved: ${announcementError?.message ?? 'No row returned'}`,
      );
    }

    const recipients = await this.getRecipients(
      input.audience,
      adminId,
      input.audience === 'institution' ? input.institution_id : undefined,
    );
    const result = await this.sendToUsers(recipients, {
      announcementId: String(announcement.id),
      kind: notificationKind,
      title: input.title,
      body: input.body,
      sourceName: input.source_name?.trim() || 'W.A.T.C.H. Admin',
      sourceUrl: input.source_url?.trim() || null,
    });
    return {
      announcement_id: announcement.id,
      audience_count: recipients.length,
      ...result,
    };
  }

  async getAutomatedAnnouncements(
    pageValue?: string,
    limitValue?: string,
    searchValue?: string,
  ) {
    const page = Math.max(0, Number.parseInt(pageValue ?? '0', 10) || 0);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(limitValue ?? '20', 10) || 20),
    );
    const start = page * limit;
    const fetchEnd = start + limit - 1;
    const search = searchValue
      ?.trim()
      .replace(/[%,()*.]/g, ' ')
      .slice(0, 100);
    let announcementsQuery = this.supabase
      .from('announcements')
      .select(
        'id,title,content,ai_summary,source,source_name,source_url,published_at,category,ai_scope,is_class_suspension,suspension_reason,affected_levels,ai_key_points,institution_id',
      )
      .eq('status', 'published')
      .neq('source', 'admin_manual')
      .neq('source', 'admin_test_replay')
      .or('ai_scope.is.null,ai_scope.neq.system')
      .order('published_at', { ascending: false });
    if (search) {
      announcementsQuery = announcementsQuery.or(
        `title.ilike.%${search}%,ai_summary.ilike.%${search}%,content.ilike.%${search}%`,
      );
    }
    let hazardsQuery = this.supabase
      .from('hazards')
      .select(
        'id,category,severity,hazard_type,risk_level,ai_summary,safety_tips,created_at,expires_at',
      )
      .order('created_at', { ascending: false });
    if (search) {
      hazardsQuery = hazardsQuery.or(
        `category.ilike.%${search}%,hazard_type.ilike.%${search}%,ai_summary.ilike.%${search}%`,
      );
    }
    let pagasaQuery = this.supabase
      .from('pagasa_alerts')
      .select(
        'id,event,alert_status,severity,published_at,expires,created_at,content',
      )
      .order('published_at', { ascending: false });
    if (search) {
      pagasaQuery = pagasaQuery.or(
        `event.ilike.%${search}%,content.ilike.%${search}%`,
      );
    }
    let safetyTipsQuery = this.supabase
      .from('notifications')
      .select('hazard_id,title,body,created_at,status,source_name,source_url')
      .eq('kind', 'safety_tip')
      .not('hazard_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(Math.min(5000, Math.max(1000, fetchEnd + 1)));
    if (search) {
      safetyTipsQuery = safetyTipsQuery.or(
        `title.ilike.%${search}%,body.ilike.%${search}%`,
      );
    }
    const [
      { data: announcements, error: announcementsError },
      { data: hazards, error: hazardsError },
      { data: pagasaAlerts, error: pagasaError },
      { data: safetyTipRows, error: safetyTipsError },
    ] = await Promise.all([
      announcementsQuery
        .range(0, fetchEnd)
        .overrideTypes<AutomatedAnnouncementRow[], { merge: false }>(),
      hazardsQuery
        .range(0, fetchEnd)
        .overrideTypes<HazardFeedRow[], { merge: false }>(),
      pagasaQuery
        .range(0, fetchEnd)
        .overrideTypes<PagasaFeedRow[], { merge: false }>(),
      safetyTipsQuery.overrideTypes<
        SafetyTipNotificationRow[],
        { merge: false }
      >(),
    ]);
    if (announcementsError) {
      throw new ServiceUnavailableException(
        `Automated announcements could not be loaded: ${announcementsError.message}`,
      );
    }
    if (hazardsError) {
      throw new ServiceUnavailableException(
        `Weather hazards could not be loaded: ${hazardsError.message}`,
      );
    }
    if (pagasaError) {
      throw new ServiceUnavailableException(
        `PAGASA alerts could not be loaded: ${pagasaError.message}`,
      );
    }
    if (safetyTipsError) {
      throw new ServiceUnavailableException(
        `Safety-tip notifications could not be loaded: ${safetyTipsError.message}`,
      );
    }
    const announcementRows = announcements ?? [];
    const hazardRows = hazards ?? [];
    const pagasaRows = pagasaAlerts ?? [];
    const safetyRows = safetyTipRows ?? [];
    const announcementIds = announcementRows.map((item) => item.id);
    const hazardIds = hazardRows.map((item) => item.id);
    const [announcementNotifications, hazardNotifications] = await Promise.all([
      announcementIds.length
        ? this.supabase
            .from('notifications')
            .select('announcement_id,status')
            .in('announcement_id', announcementIds)
            .overrideTypes<
              { announcement_id: number; status: string }[],
              { merge: false }
            >()
        : Promise.resolve({ data: [], error: null }),
      hazardIds.length
        ? this.supabase
            .from('notifications')
            .select('hazard_id,status')
            .in('hazard_id', hazardIds)
            .overrideTypes<HazardNotificationRow[], { merge: false }>()
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (announcementNotifications.error) {
      throw new ServiceUnavailableException(
        `Announcement notification status could not be loaded: ${announcementNotifications.error.message}`,
      );
    }
    if (hazardNotifications.error) {
      throw new ServiceUnavailableException(
        `Hazard notification status could not be loaded: ${hazardNotifications.error.message}`,
      );
    }
    const countStatuses = <T extends { status: string }>(
      rows: T[],
      keyOf: (row: T) => string,
    ) =>
      rows.reduce<Record<string, Record<string, number>>>((result, row) => {
        const key = keyOf(row);
        result[key] ??= {};
        result[key][row.status] = (result[key][row.status] ?? 0) + 1;
        return result;
      }, {});
    const announcementCounts = countStatuses(
      announcementNotifications.data ?? [],
      (row) => String(row.announcement_id),
    );
    const hazardCounts = countStatuses(
      hazardNotifications.data ?? [],
      (row) => row.hazard_id,
    );
    const safetyTipGroups = new Map<
      string,
      { item: SafetyTipNotificationRow; counts: Record<string, number> }
    >();
    for (const row of safetyRows) {
      const current = safetyTipGroups.get(row.hazard_id);
      if (current) {
        current.counts[row.status] = (current.counts[row.status] ?? 0) + 1;
      } else {
        safetyTipGroups.set(row.hazard_id, {
          item: row,
          counts: { [row.status]: 1 },
        });
      }
    }

    const items: AdminFeedItem[] = [
      ...announcementRows.map((item) => ({
        id: `announcement-${item.id}`,
        item_type: 'announcement' as const,
        announcement_id: item.id,
        hazard_id: null,
        pagasa_id: null,
        title: item.title ?? 'Announcement',
        content: item.content,
        ai_summary: item.ai_summary,
        source: item.source,
        source_name: item.source_name,
        source_url: item.source_url,
        published_at: item.published_at,
        category: item.category,
        ai_scope: item.ai_scope,
        is_class_suspension: item.is_class_suspension,
        suspension_reason: item.suspension_reason,
        affected_levels: item.affected_levels,
        notification_counts: announcementCounts[String(item.id)] ?? {},
      })),
      ...hazardRows.map((item) => ({
        id: `hazard-${item.id}`,
        item_type: 'hazard' as const,
        announcement_id: null,
        hazard_id: item.id,
        pagasa_id: null,
        title: item.category ?? item.hazard_type ?? 'Weather hazard',
        content: null,
        ai_summary: item.ai_summary,
        source: 'weather',
        source_name: 'W.A.T.C.H. Weather Alert',
        source_url: null,
        published_at: item.created_at,
        category: item.category ?? item.hazard_type,
        ai_scope: 'weather',
        is_class_suspension: false,
        suspension_reason: null,
        affected_levels: null,
        notification_counts: hazardCounts[item.id] ?? {},
      })),
      ...pagasaRows.map((item) => ({
        id: `pagasa-${item.id}`,
        item_type: 'pagasa' as const,
        announcement_id: null,
        hazard_id: null,
        pagasa_id: item.id,
        title: item.event ?? 'PAGASA Alert',
        content: item.content,
        ai_summary: item.content,
        source: 'pagasa',
        source_name: 'PAGASA',
        source_url: null,
        published_at: item.published_at ?? item.created_at,
        category: item.severity ?? item.alert_status,
        ai_scope: 'weather',
        is_class_suspension: false,
        suspension_reason: null,
        affected_levels: null,
        notification_counts: {},
      })),
      ...[...safetyTipGroups.entries()].map(([hazardId, group]) => ({
        id: `safety-tip-${hazardId}`,
        item_type: 'safety_tip' as const,
        announcement_id: null,
        hazard_id: hazardId,
        pagasa_id: null,
        title: group.item.title,
        content: group.item.body,
        ai_summary: group.item.body,
        source: 'safety_tip',
        source_name: group.item.source_name ?? 'W.A.T.C.H. Safety Tip',
        source_url: group.item.source_url,
        published_at: group.item.created_at,
        category: 'Safety Tips',
        ai_scope: 'weather',
        is_class_suspension: false,
        suspension_reason: null,
        affected_levels: null,
        notification_counts: group.counts,
      })),
    ].sort(
      (left, right) =>
        Date.parse(right.published_at) - Date.parse(left.published_at),
    );
    const pageItems = items.slice(start, start + limit);
    return {
      items: pageItems,
      page,
      limit,
      has_more: items.length > start + limit,
    };
  }

  async resendAnnouncementToAdmin(id: string, adminId: string) {
    const announcementId = Number(id);
    if (!Number.isSafeInteger(announcementId) || announcementId < 1) {
      throw new BadRequestException(
        'Announcement ID must be a positive integer.',
      );
    }
    const { data: announcement, error } = await this.supabase
      .from('announcements')
      .select('id,title,ai_summary,content,source_name,source_url,ai_scope')
      .eq('id', announcementId)
      .neq('source', 'admin_manual')
      .maybeSingle()
      .overrideTypes<
        {
          id: number;
          title: string | null;
          ai_summary: string | null;
          content: string | null;
          source_name: string | null;
          source_url: string | null;
          ai_scope: string | null;
        },
        { merge: false }
      >();
    if (error) {
      throw new ServiceUnavailableException(
        `Announcement could not be loaded: ${error.message}`,
      );
    }
    if (!announcement)
      throw new NotFoundException('Announcement was not found.');
    const kind =
      announcement.ai_scope === 'weather'
        ? 'weather'
        : announcement.ai_scope === 'institution'
          ? 'announcement_institution'
          : 'announcement_local';
    const result = await this.push.sendUserNotification({
      userId: adminId,
      title: announcement.title ?? 'W.A.T.C.H. Alert',
      body: announcement.ai_summary ?? announcement.content ?? '',
      data: {},
      kind,
      announcementId: String(announcement.id),
      sourceName: announcement.source_name,
      sourceUrl: announcement.source_url,
      ignorePreferences: true,
    });
    const noToken = 'noToken' in result && result.noToken === true;
    return {
      ...result,
      sent: result.sent ? 1 : 0,
      failed: result.sent || noToken || result.duplicate ? 0 : 1,
      no_token: noToken ? 1 : 0,
      audience_count: 1,
    };
  }

  async resendHazardToAdmin(id: string, adminId: string, safetyTip: boolean) {
    const { data: hazard, error } = await this.supabase
      .from('hazards')
      .select('id,category,hazard_type,risk_level,ai_summary,safety_tips')
      .eq('id', id)
      .maybeSingle()
      .overrideTypes<
        {
          id: string;
          category: string | null;
          hazard_type: string | null;
          risk_level: string | null;
          ai_summary: string | null;
          safety_tips: unknown;
        },
        { merge: false }
      >();
    if (error) {
      throw new ServiceUnavailableException(
        `Weather hazard could not be loaded: ${error.message}`,
      );
    }
    if (!hazard) throw new NotFoundException('Weather hazard was not found.');
    const result = await this.push.sendUserNotification({
      userId: adminId,
      title: safetyTip
        ? `Safety tip: ${hazard.category ?? hazard.hazard_type ?? 'Weather hazard'}`
        : (hazard.category ?? hazard.hazard_type ?? 'Weather hazard'),
      body: hazard.ai_summary ?? 'See the weather alert for full details.',
      data: safetyTip ? { tip_key: `admin-test-${randomUUID()}` } : {},
      kind: safetyTip ? 'safety_tip' : 'weather_hazard',
      hazardId: hazard.id,
      sourceName: 'W.A.T.C.H. Weather Alert',
      ignorePreferences: true,
    });
    const noToken = 'noToken' in result && result.noToken === true;
    return {
      ...result,
      sent: result.sent ? 1 : 0,
      failed: result.sent || noToken || result.duplicate ? 0 : 1,
      no_token: noToken ? 1 : 0,
      audience_count: 1,
    };
  }

  async resendPagasaAlertToAdmin(id: string, adminId: string) {
    const alertId = Number(id);
    if (!Number.isSafeInteger(alertId) || alertId < 1) {
      throw new BadRequestException(
        'PAGASA alert ID must be a positive integer.',
      );
    }
    const { data: alert, error } = await this.supabase
      .from('pagasa_alerts')
      .select('id,event,content,published_at')
      .eq('id', alertId)
      .maybeSingle()
      .overrideTypes<
        {
          id: number;
          event: string | null;
          content: string | null;
          published_at: string | null;
        },
        { merge: false }
      >();
    if (error) {
      throw new ServiceUnavailableException(
        `PAGASA alert could not be loaded: ${error.message}`,
      );
    }
    if (!alert) throw new NotFoundException('PAGASA alert was not found.');
    const title = alert.event ?? 'PAGASA Alert';
    const body =
      alert.content ?? 'See the official PAGASA advisory for details.';
    const { data: announcement, error: insertError } = await this.supabase
      .from('announcements')
      .insert({
        title,
        content: body,
        ai_summary: body,
        source: 'admin_test_replay',
        source_name: 'PAGASA',
        category: 'weather',
        ai_scope: 'weather',
        status: 'published',
        published_at: alert.published_at ?? new Date().toISOString(),
      })
      .select('id')
      .single()
      .overrideTypes<{ id: number }, { merge: false }>();
    if (insertError || !announcement) {
      throw new ServiceUnavailableException(
        `PAGASA test alert could not be prepared: ${insertError?.message ?? 'No row returned'}`,
      );
    }
    const result = await this.push.sendUserNotification({
      userId: adminId,
      title,
      body,
      data: {},
      kind: 'weather',
      announcementId: String(announcement.id),
      sourceName: 'PAGASA',
      ignorePreferences: true,
    });
    const noToken = 'noToken' in result && result.noToken === true;
    return {
      ...result,
      sent: result.sent ? 1 : 0,
      failed: result.sent || noToken || result.duplicate ? 0 : 1,
      no_token: noToken ? 1 : 0,
      audience_count: 1,
    };
  }

  async formatSystemDraft(
    adminId: string,
    input: { raw_text: string; draft_id?: string },
  ) {
    const rawText = input.raw_text.trim();
    const formatted = await this.ai.formatSystemAnnouncement({ rawText });
    const now = new Date().toISOString();
    let draftId = input.draft_id;
    let priorHistory: unknown[] = [];

    if (draftId) {
      const { data: prior, error } = await this.supabase
        .from('system_announcement_drafts')
        .select('id,version_history,status')
        .eq('id', draftId)
        .eq('admin_id', adminId)
        .maybeSingle()
        .overrideTypes<
          { id: string; version_history: unknown; status: string },
          { merge: false }
        >();
      if (error) {
        throw new ServiceUnavailableException(
          `Draft could not be loaded: ${error.message}`,
        );
      }
      if (!prior || prior.status !== 'draft') {
        throw new NotFoundException(
          'Editable system announcement draft was not found.',
        );
      }
      priorHistory = Array.isArray(prior.version_history)
        ? prior.version_history
        : [];
    }
    const versionHistory = [
      ...priorHistory,
      { raw_text: rawText, ai_json: formatted, created_at: now },
    ];
    const payload = {
      raw_text: rawText,
      ai_json: formatted,
      version_history: versionHistory,
      updated_at: now,
    };
    if (draftId) {
      const { data, error } = await this.supabase
        .from('system_announcement_drafts')
        .update(payload)
        .eq('id', draftId)
        .eq('admin_id', adminId)
        .select('id,raw_text,ai_json,version_history,status')
        .single()
        .overrideTypes<StoredDraft, { merge: false }>();
      if (error) {
        throw new ServiceUnavailableException(
          `Formatted draft could not be saved: ${error.message}`,
        );
      }
      return data;
    }
    const { data, error } = await this.supabase
      .from('system_announcement_drafts')
      .insert({
        ...payload,
        admin_id: adminId,
        created_at: now,
        status: 'draft',
      })
      .select('id,raw_text,ai_json,version_history,status')
      .single()
      .overrideTypes<StoredDraft, { merge: false }>();
    if (error || !data) {
      throw new ServiceUnavailableException(
        `Formatted draft could not be saved: ${error?.message ?? 'No row returned'}`,
      );
    }
    draftId = data.id;
    return data;
  }

  async reviseSystemDraft(
    adminId: string,
    draftId: string,
    instruction: string,
  ) {
    const { data: draft, error } = await this.supabase
      .from('system_announcement_drafts')
      .select('raw_text,ai_json,version_history,status')
      .eq('id', draftId)
      .eq('admin_id', adminId)
      .maybeSingle()
      .overrideTypes<
        {
          raw_text: string;
          ai_json: unknown;
          version_history: unknown;
          status: string;
        },
        { merge: false }
      >();
    if (error) {
      throw new ServiceUnavailableException(
        `Draft could not be loaded: ${error.message}`,
      );
    }
    if (
      !draft ||
      draft.status !== 'draft' ||
      !isSystemAnnouncement(draft.ai_json)
    ) {
      throw new NotFoundException(
        'Reviewable system announcement draft was not found.',
      );
    }
    const formatted = await this.ai.formatSystemAnnouncement({
      rawText: draft.raw_text,
      previousVersion: draft.ai_json,
      instruction,
    });
    const history: unknown[] = Array.isArray(draft.version_history)
      ? (draft.version_history as unknown[])
      : [];
    const versionHistory = [
      ...history,
      {
        raw_text: draft.raw_text,
        ai_json: formatted,
        instruction,
        created_at: new Date().toISOString(),
      },
    ];
    const { data, error: updateError } = await this.supabase
      .from('system_announcement_drafts')
      .update({
        ai_json: formatted,
        version_history: versionHistory,
        updated_at: new Date().toISOString(),
      })
      .eq('id', draftId)
      .eq('admin_id', adminId)
      .eq('status', 'draft')
      .select('id,raw_text,ai_json,version_history,status')
      .maybeSingle()
      .overrideTypes<StoredDraft, { merge: false }>();
    if (updateError || !data) {
      throw new ServiceUnavailableException(
        `Revised draft could not be saved: ${updateError?.message ?? 'Draft changed during the request'}`,
      );
    }
    return data;
  }

  async discardSystemDraft(adminId: string, draftId: string) {
    const { data, error } = await this.supabase
      .from('system_announcement_drafts')
      .update({ status: 'discarded', updated_at: new Date().toISOString() })
      .eq('id', draftId)
      .eq('admin_id', adminId)
      .eq('status', 'draft')
      .select('id,status')
      .maybeSingle()
      .overrideTypes<{ id: string; status: string }, { merge: false }>();
    if (error) {
      throw new ServiceUnavailableException(
        `Draft could not be discarded: ${error.message}`,
      );
    }
    if (!data) throw new NotFoundException('Draft was not found.');
    return data;
  }

  async publishSystemDraft(adminId: string, draftId: string) {
    const { data: draft, error } = await this.supabase
      .from('system_announcement_drafts')
      .select('id,raw_text,ai_json,status,published_announcement_id')
      .eq('id', draftId)
      .eq('admin_id', adminId)
      .maybeSingle()
      .overrideTypes<
        {
          id: string;
          raw_text: string;
          ai_json: unknown;
          status: string;
          published_announcement_id: number | null;
        },
        { merge: false }
      >();
    if (error) {
      throw new ServiceUnavailableException(
        `Draft could not be loaded: ${error.message}`,
      );
    }
    if (draft?.status === 'published' && draft.published_announcement_id) {
      return {
        announcement_id: draft.published_announcement_id,
        already_published: true,
      };
    }
    if (
      !draft ||
      !['draft', 'publishing'].includes(draft.status) ||
      !isSystemAnnouncement(draft.ai_json)
    ) {
      throw new NotFoundException(
        'Publishable system announcement draft was not found.',
      );
    }

    if (draft.status === 'draft') {
      const { data: claimed, error: claimError } = await this.supabase
        .from('system_announcement_drafts')
        .update({ status: 'publishing', updated_at: new Date().toISOString() })
        .eq('id', draftId)
        .eq('admin_id', adminId)
        .eq('status', 'draft')
        .select('id')
        .maybeSingle()
        .overrideTypes<{ id: string }, { merge: false }>();
      if (claimError) {
        throw new ServiceUnavailableException(
          `Draft could not be claimed for publishing: ${claimError.message}`,
        );
      }
      if (!claimed)
        throw new ConflictException('This draft is already being published.');
    }

    const formatted = draft.ai_json;
    const now = new Date().toISOString();
    const { data: existingAnnouncement, error: lookupError } =
      await this.supabase
        .from('announcements')
        .select('id')
        .eq('source', 'admin_system')
        .eq('system_details->>draft_id', draftId)
        .maybeSingle()
        .overrideTypes<{ id: number }, { merge: false }>();
    if (lookupError) {
      throw new ServiceUnavailableException(
        `Existing system announcement could not be checked: ${lookupError.message}`,
      );
    }
    let announcementId = existingAnnouncement?.id;
    if (!announcementId) {
      const { data: announcement, error: insertError } = await this.supabase
        .from('announcements')
        .insert({
          title: formatted.title,
          content: formatted.body,
          ai_summary: formatted.summary,
          source: 'admin_system',
          source_name: 'Watch System',
          category: 'system',
          ai_scope: 'system',
          is_class_suspension: false,
          ai_key_points: formatted.key_points,
          system_details: {
            draft_id: draftId,
            schedule_or_date: formatted.schedule_or_date,
            impact: formatted.impact,
            action_needed: formatted.action_needed,
            missing_info_note: formatted.missing_info_note,
          },
          status: 'published',
          published_at: now,
        })
        .select('id')
        .single()
        .overrideTypes<{ id: number }, { merge: false }>();
      if (insertError || !announcement) {
        if (insertError?.code === '23505') {
          const { data: concurrent, error: concurrentError } =
            await this.supabase
              .from('announcements')
              .select('id')
              .eq('source', 'admin_system')
              .eq('system_details->>draft_id', draftId)
              .maybeSingle()
              .overrideTypes<{ id: number }, { merge: false }>();
          if (concurrentError || !concurrent) {
            throw new ServiceUnavailableException(
              `System announcement could not be published: ${concurrentError?.message ?? insertError.message}`,
            );
          }
          announcementId = concurrent.id;
        } else {
          await this.resetDraftAfterPublishFailure(draftId);
          throw new ServiceUnavailableException(
            `System announcement could not be published: ${insertError?.message ?? 'No row returned'}`,
          );
        }
      } else {
        announcementId = announcement.id;
      }
    }
    if (announcementId === undefined) {
      throw new ServiceUnavailableException(
        'The system announcement could not be finalized.',
      );
    }

    const recipients = await this.getRecipients('all', adminId);
    const result = await this.sendToUsers(recipients, {
      announcementId: String(announcementId),
      kind: 'system',
      title: formatted.title,
      body: formatted.summary,
      sourceName: 'Watch System',
      sourceUrl: null,
    });
    const { error: completeError } = await this.supabase
      .from('system_announcement_drafts')
      .update({
        status: 'published',
        published_announcement_id: announcementId,
        published_at: now,
        updated_at: now,
      })
      .eq('id', draftId)
      .eq('admin_id', adminId)
      .eq('status', 'publishing');
    if (completeError) {
      this.logger.error(
        `Published announcement ${announcementId} is missing its draft completion update: ${completeError.message}`,
      );
      throw new ServiceUnavailableException(
        'Announcement was sent, but its draft status could not be finalized. Retry safely to complete without duplicate notifications.',
      );
    }
    return {
      announcement_id: announcementId,
      audience_count: recipients.length,
      ...result,
    };
  }

  async getSystemAnnouncements() {
    const { data, error } = await this.supabase
      .from('announcements')
      .select(
        'id,title,ai_summary,content,ai_key_points,system_details,published_at',
      )
      .eq('ai_scope', 'system')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(100)
      .overrideTypes<
        {
          id: number;
          title: string;
          ai_summary: string | null;
          content: string | null;
          ai_key_points: string[];
          system_details: Record<string, unknown>;
          published_at: string;
        }[],
        { merge: false }
      >();
    if (error) {
      throw new ServiceUnavailableException(
        `Published system announcements could not be loaded: ${error.message}`,
      );
    }
    return { announcements: data ?? [] };
  }

  private async getRecipients(
    audience: ManualSendInput['audience'],
    adminId: string,
    institutionId?: string,
  ) {
    if (audience === 'me') return [adminId];
    if (audience === 'institution') {
      if (!institutionId)
        throw new BadRequestException('Institution is required.');
      const { data, error } = await this.supabase
        .from('user_institutions')
        .select('user_id')
        .eq('institution_id', institutionId)
        .overrideTypes<{ user_id: string }[], { merge: false }>();
      if (error) {
        throw new ServiceUnavailableException(
          `Institution audience could not be loaded: ${error.message}`,
        );
      }
      const { data: profiles, error: profileError } = await this.supabase
        .from('user_info')
        .select('id')
        .eq('institution_id', institutionId)
        .overrideTypes<{ id: string }[], { merge: false }>();
      if (profileError) {
        throw new ServiceUnavailableException(
          `Institution profile audience could not be loaded: ${profileError.message}`,
        );
      }
      return [
        ...new Set([
          ...(data ?? []).map((row) => row.user_id),
          ...(profiles ?? []).map((profile) => profile.id),
        ]),
      ];
    }
    const ids: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await this.supabase
        .from('user_info')
        .select('id')
        .order('id', { ascending: true })
        .range(offset, offset + 999)
        .overrideTypes<{ id: string }[], { merge: false }>();
      if (error) {
        throw new ServiceUnavailableException(
          `Notification audience could not be loaded: ${error.message}`,
        );
      }
      const rows = data ?? [];
      ids.push(...rows.map((row) => row.id));
      if (rows.length < 1000) break;
    }
    return [...new Set(ids)];
  }

  private async sendToUsers(
    userIds: string[],
    input: {
      announcementId: string;
      kind: AdminNotificationKind;
      title: string;
      body: string;
      sourceName: string;
      sourceUrl: string | null;
    },
  ) {
    let sent = 0;
    let failed = 0;
    let no_token = 0;
    let duplicate = 0;
    for (let offset = 0; offset < userIds.length; offset += 100) {
      const batch = userIds.slice(offset, offset + 100);
      const results = await Promise.all(
        batch.map(async (userId) => {
          try {
            const result = await this.push.sendUserNotification({
              userId,
              title: input.title,
              body: input.body,
              data: {},
              kind: input.kind,
              announcementId: input.announcementId,
              sourceName: input.sourceName,
              sourceUrl: input.sourceUrl,
              ignorePreferences: true,
            });
            return {
              sent: result.sent,
              duplicate: result.duplicate,
              noToken: 'noToken' in result && result.noToken === true,
            };
          } catch (error) {
            this.logger.error(
              `Admin notification failed for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            return { sent: false, duplicate: false, noToken: false };
          }
        }),
      );
      for (const result of results) {
        if (result.sent) sent += 1;
        else if (result.duplicate) duplicate += 1;
        else if (result.noToken) no_token += 1;
        else failed += 1;
      }
    }
    return { sent, failed, no_token, duplicate };
  }

  private async resetDraftAfterPublishFailure(draftId: string) {
    const { error } = await this.supabase
      .from('system_announcement_drafts')
      .update({ status: 'draft', updated_at: new Date().toISOString() })
      .eq('id', draftId)
      .eq('status', 'publishing');
    if (error) {
      this.logger.error(
        `Failed publish attempt left draft ${draftId} locked: ${error.message}`,
      );
    }
  }
}

function isSystemAnnouncement(value: unknown): value is SystemAnnouncement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.title === 'string' &&
    typeof item.summary === 'string' &&
    typeof item.body === 'string' &&
    Array.isArray(item.key_points) &&
    ['schedule_or_date', 'impact', 'action_needed', 'missing_info_note'].every(
      (key) => item[key] === null || typeof item[key] === 'string',
    )
  );
}
