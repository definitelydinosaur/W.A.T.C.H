import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import supabase from '../../lib/supabase';

interface SafetyTips {
  do?: string[];
  do_list?: string[];
  prepare?: string[];
  prepare_list?: string[];
  avoid?: string[];
  dont_list?: string[];
  short_summary?: string;
  emergency_note?: string;
  ongoing_tip?: {
    short_summary?: string;
    do_list?: string[];
    dont_list?: string[];
    prepare_list?: string[];
    emergency_note?: string;
  };
}

interface NotificationDetail {
  id: string;
  title: string;
  body: string;
  kind: string;
  status: string;
  read_at: string | null;
  source_name: string | null;
  source_url: string | null;
  created_at: string;
  announcement_id: number | string | null;
  hazard_id: string | null;
  announcement?: {
    ai_summary: string | null;
    content?: string | null;
    source_name: string | null;
    published_at: string | null;
    source: string | null;
    source_url: string | null;
    category: string | null;
    ai_scope: 'institution' | 'local' | 'weather' | 'system' | null;
    is_class_suspension: boolean;
    suspension_reason: string | null;
    affected_levels: string | null;
    ai_key_points: string[] | null;
    pagasa_alert?:
      | {
          event: string | null;
          alert_status: string | null;
          severity: string | null;
          published_at: string | null;
          content: string | null;
        }
      | {
          event: string | null;
          alert_status: string | null;
          severity: string | null;
          published_at: string | null;
          content: string | null;
        }[]
      | null;
    system_details?: {
      schedule_or_date?: string | null;
      impact?: string | null;
      action_needed?: string | null;
      missing_info_note?: string | null;
    } | null;
    institution?: { name: string | null; short_name: string | null } | null;
  } | null;
  hazard?: {
    category: string | null;
    severity: string | null;
    hazard_type: string | null;
    risk_level: string | null;
    ai_summary: string | null;
    safety_tips: SafetyTips | null;
    expires_at: string | null;
    source_type?: string | null;
    source_name?: string | null;
    city?: string | null;
    province?: string | null;
    observed_at?: string | null;
    measurements?: Record<string, unknown> | null;
  } | null;
  pagasa_alert?: {
    event: string | null;
    alert_status: string | null;
    severity: string | null;
    published_at: string | null;
    content: string | null;
  } | null;
}

function isTips(value: unknown): value is SafetyTips {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getTipItems(...values: unknown[]): string[] {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    const items = value.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
    if (items.length) return items.map((item) => item.trim());
  }
  return [];
}

function formatHazardMeasurements(
  measurements: Record<string, unknown> | null | undefined,
) {
  if (!measurements) return '';
  const fields: [string, string, string][] = [
    ['heatIndexC', 'Heat index', '°C'],
    ['rainMm', 'Rainfall', ' mm/h'],
    ['windKph', 'Wind', ' km/h'],
    ['aqi', 'AQI', ''],
  ];
  return fields
    .flatMap(([key, label, unit]) => {
      const value = measurements[key];
      return typeof value === 'number' && Number.isFinite(value)
        ? [`${label}: ${value.toFixed(1)}${unit}`]
        : [];
    })
    .join(' · ');
}

function getDefaultSafetyGuidance(hazardText: string) {
  const text = hazardText.toLowerCase();
  if (/heat|heat index|extreme temperature/.test(text)) {
    return [
      {
        heading: 'Do',
        items: [
          'Drink water regularly and rest in a shaded or cool place.',
          'Reduce strenuous activity during the hottest hours.',
          'Check on children, older adults, and people with health conditions.',
        ],
      },
      {
        heading: "Don't",
        items: [
          'Avoid prolonged time in direct sun or hot, poorly ventilated spaces.',
          'Never leave children or pets in a parked vehicle.',
        ],
      },
      {
        heading: 'What to prepare',
        items: [
          'Keep drinking water and essential medicines nearby.',
          'Charge your phone and identify a cool place you can go to.',
        ],
      },
    ];
  }
  if (/flood|heavy rain|rainfall|monsoon/.test(text)) {
    return [
      {
        heading: 'Do',
        items: [
          'Monitor official weather and local government updates.',
          'Move to higher ground if water starts rising near your home.',
          'Follow evacuation instructions from local authorities.',
        ],
      },
      {
        heading: "Don't",
        items: [
          'Do not walk or drive through floodwater.',
          'Stay away from swollen rivers, drainage channels, and downed power lines.',
        ],
      },
      {
        heading: 'What to prepare',
        items: [
          'Keep water, medicines, a flashlight, and important documents ready.',
          'Know a safe route to higher ground or an evacuation center.',
        ],
      },
    ];
  }
  if (/typhoon|storm|strong wind|thunderstorm|cyclone/.test(text)) {
    return [
      {
        heading: 'Do',
        items: [
          'Monitor official PAGASA and local government updates.',
          'Stay indoors and away from windows during strong winds.',
          'Follow evacuation instructions from local authorities.',
        ],
      },
      {
        heading: "Don't",
        items: [
          'Stay away from floodwater and fallen power lines.',
          'Do not go outside to watch or record severe weather.',
        ],
      },
      {
        heading: 'What to prepare',
        items: [
          'Prepare water, essential medicines, a flashlight, and important documents.',
          'Charge your phone and power bank and know your evacuation route.',
        ],
      },
    ];
  }
  if (/air quality|aqi|smoke|air pollution/.test(text)) {
    return [
      {
        heading: 'Do',
        items: [
          'Reduce time outdoors and keep windows closed when air quality is poor.',
          'Follow health advice from local authorities.',
        ],
      },
      {
        heading: "Don't",
        items: [
          'Avoid strenuous exercise outdoors.',
          'Avoid smoke and do not burn waste.',
        ],
      },
      {
        heading: 'What to prepare',
        items: [
          'Keep prescribed medicines and a well-fitting mask available.',
          'Plan a lower-exertion indoor activity.',
        ],
      },
    ];
  }
  return [
    {
      heading: 'Do',
      items: [
        'Monitor official PAGASA and local government advisories.',
        'Follow instructions from local authorities.',
        'Check on family members and neighbors who may need help.',
      ],
    },
    {
      heading: "Don't",
      items: [
        'Avoid unnecessary exposure to hazardous conditions.',
        'Do not ignore official warnings or evacuation instructions.',
      ],
    },
    {
      heading: 'What to prepare',
      items: [
        'Keep drinking water, essential medicines, and a charged phone nearby.',
        'Identify a safe place and a way to receive official updates.',
      ],
    },
  ];
}

function isFacebookUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === 'facebook.com' ||
      hostname.endsWith('.facebook.com') ||
      hostname === 'fb.com' ||
      hostname.endsWith('.fb.com') ||
      hostname === 'fb.watch'
    );
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'Alert is unavailable.';
}

export default function AnnouncementScreen() {
  const router = useRouter();
  const { notificationId, announcementId, hazardId, pagasaId, id } =
    useLocalSearchParams<{
      notificationId?: string | string[];
      announcementId?: string | string[];
      hazardId?: string | string[];
      pagasaId?: string | string[];
      id?: string | string[];
    }>();
  const selectedNotificationId = Array.isArray(notificationId)
    ? notificationId[0]
    : notificationId;
  const legacyAnnouncementId = Array.isArray(id) ? id[0] : id;
  const selectedAnnouncementId = Array.isArray(announcementId)
    ? announcementId[0]
    : announcementId;
  const selectedHazardId = Array.isArray(hazardId) ? hazardId[0] : hazardId;
  const selectedPagasaId = Array.isArray(pagasaId) ? pagasaId[0] : pagasaId;
  const [detail, setDetail] = useState<NotificationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error('Sign in to view this alert.');

      let query = supabase
        .from('notifications')
        .select(
          'id,title,body,kind,status,read_at,source_name,source_url,created_at,announcement_id,hazard_id,announcement:announcements(ai_summary,content,source_name,published_at,source,source_url,category,ai_scope,is_class_suspension,suspension_reason,affected_levels,ai_key_points,pagasa_alert:pagasa_alerts!announcements_pagasa_alert_id_fkey(event,alert_status,severity,published_at,content),institution:institutions!announcements_institution_id_fkey(name,short_name)),hazard:hazards(category,severity,hazard_type,risk_level,ai_summary,safety_tips,expires_at,source_type,source_name,city,province,observed_at,measurements)',
        )
        .eq('user_id', userId)
        .is('deleted_at', null);
      if (selectedNotificationId)
        query = query.eq('id', selectedNotificationId);
      else if (selectedAnnouncementId)
        query = query.eq('announcement_id', selectedAnnouncementId);
      else if (legacyAnnouncementId)
        query = query.eq('announcement_id', legacyAnnouncementId);
      else if (selectedHazardId)
        query = query.eq('hazard_id', selectedHazardId);
      else if (selectedPagasaId)
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      else throw new Error('Alert was not found.');

      const { data, error: queryError } = await query.limit(1).maybeSingle();
      if (queryError) throw queryError;
      let row: NotificationDetail;
      let isSavedNotification = Boolean(data);
      if (data) {
        const savedRow = data as unknown as NotificationDetail;
        const linkedPagasa = savedRow.announcement?.pagasa_alert;
        row = {
          ...savedRow,
          pagasa_alert: Array.isArray(linkedPagasa)
            ? (linkedPagasa[0] ?? null)
            : (linkedPagasa ?? null),
        };
      } else if (selectedAnnouncementId || legacyAnnouncementId) {
        const id = selectedAnnouncementId ?? legacyAnnouncementId;
        const { data: announcement, error: announcementError } = await supabase
          .from('announcements')
          .select(
            'id,title,content,ai_summary,source,source_name,source_url,published_at,category,ai_scope,is_class_suspension,suspension_reason,affected_levels,ai_key_points,system_details,institution:institutions!announcements_institution_id_fkey(name,short_name)',
          )
          .eq('id', id!)
          .maybeSingle();
        if (announcementError) throw announcementError;
        if (!announcement)
          throw new Error('This alert is no longer available.');
        const scope =
          announcement.ai_scope === 'system' ||
          announcement.ai_scope === 'local' ||
          announcement.ai_scope === 'weather' ||
          announcement.ai_scope === 'institution'
            ? announcement.ai_scope
            : null;
        const relation = Array.isArray(announcement.institution)
          ? announcement.institution[0]
          : announcement.institution;
        row = {
          id: String(announcement.id),
          title: announcement.title ?? 'Announcement',
          body: announcement.ai_summary ?? announcement.content ?? '',
          kind: scope === 'system' ? 'system' : (scope ?? 'local'),
          status: 'Sent',
          read_at: null,
          source_name: announcement.source_name,
          source_url: announcement.source_url,
          created_at: announcement.published_at ?? new Date().toISOString(),
          announcement_id: announcement.id,
          hazard_id: null,
          announcement: {
            ai_summary: announcement.ai_summary,
            content: announcement.content,
            source_name: announcement.source_name,
            published_at: announcement.published_at,
            source: announcement.source,
            source_url: announcement.source_url,
            category: announcement.category,
            ai_scope: scope,
            is_class_suspension: announcement.is_class_suspension,
            suspension_reason: announcement.suspension_reason,
            affected_levels: announcement.affected_levels,
            ai_key_points: announcement.ai_key_points,
            system_details: announcement.system_details,
            institution:
              relation && typeof relation === 'object'
                ? {
                    name: relation.name ?? null,
                    short_name: relation.short_name ?? null,
                  }
                : null,
          },
        };
        isSavedNotification = false;
      } else if (selectedHazardId) {
        const { data: hazard, error: hazardError } = await supabase
          .from('hazards')
          .select(
            'id,category,severity,hazard_type,risk_level,ai_summary,safety_tips,expires_at,created_at,source_type,source_name,city,province,observed_at,measurements',
          )
          .eq('id', selectedHazardId)
          .maybeSingle();
        if (hazardError) throw hazardError;
        if (!hazard)
          throw new Error('This weather alert is no longer available.');
        row = {
          id: selectedHazardId,
          title: hazard.category ?? hazard.hazard_type ?? 'Weather hazard',
          body: hazard.ai_summary ?? 'See the weather alert details.',
          kind: 'weather_hazard',
          status: 'Sent',
          read_at: null,
          source_name: 'W.A.T.C.H. Weather Alert',
          source_url: null,
          created_at: hazard.created_at ?? new Date().toISOString(),
          announcement_id: null,
          hazard_id: selectedHazardId,
          hazard: {
            category: hazard.category,
            severity: hazard.severity,
            hazard_type: hazard.hazard_type,
            risk_level: hazard.risk_level,
            ai_summary: hazard.ai_summary,
            safety_tips: hazard.safety_tips,
            expires_at: hazard.expires_at,
            source_type: hazard.source_type,
            source_name: hazard.source_name,
            city: hazard.city,
            province: hazard.province,
            observed_at: hazard.observed_at,
            measurements: hazard.measurements,
          },
        };
        isSavedNotification = false;
      } else if (selectedPagasaId) {
        const { data: alert, error: pagasaError } = await supabase
          .from('pagasa_alerts')
          .select(
            'id,event,alert_status,severity,published_at,expires,created_at,content',
          )
          .eq('id', selectedPagasaId)
          .maybeSingle();
        if (pagasaError) throw pagasaError;
        if (!alert)
          throw new Error('This PAGASA alert is no longer available.');
        row = {
          id: String(alert.id),
          title: alert.event ?? 'PAGASA Alert',
          body:
            alert.content ?? 'See the official PAGASA advisory for details.',
          kind: 'weather',
          status: 'Sent',
          read_at: null,
          source_name: 'PAGASA',
          source_url: null,
          created_at: alert.published_at ?? alert.created_at,
          announcement_id: null,
          hazard_id: null,
          pagasa_alert: {
            event: alert.event,
            alert_status: alert.alert_status,
            severity: alert.severity,
            published_at: alert.published_at,
            content: alert.content,
          },
        };
        isSavedNotification = false;
      } else {
        throw new Error('This alert is no longer available.');
      }
      if (active) setDetail(row);
      if (active) {
        setExpired(
          Boolean(
            row.hazard?.expires_at &&
            Date.parse(row.hazard.expires_at) <= Date.now(),
          ),
        );
      }
      if (isSavedNotification && (row.status !== 'Read' || !row.read_at)) {
        const { error: readError } = await supabase
          .from('notifications')
          .update({ status: 'Read', read_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('user_id', userId);
        if (readError) throw readError;
      }
    };

    void load()
      .catch((loadError: unknown) => {
        if (active) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    legacyAnnouncementId,
    selectedAnnouncementId,
    selectedHazardId,
    selectedPagasaId,
    selectedNotificationId,
  ]);

  const sourceUrl =
    detail?.source_url?.trim() ||
    detail?.announcement?.source_url?.trim() ||
    null;
  const summary =
    (detail?.announcement?.ai_scope === 'system'
      ? (detail.announcement.content ?? detail.announcement.ai_summary)
      : detail?.announcement?.ai_summary) ??
    detail?.pagasa_alert?.content ??
    detail?.hazard?.safety_tips?.ongoing_tip?.short_summary ??
    detail?.hazard?.safety_tips?.short_summary ??
    detail?.hazard?.ai_summary ??
    detail?.body;
  const hazard = detail?.hazard;
  const tips = isTips(hazard?.safety_tips) ? hazard.safety_tips : null;
  const ongoingTip = tips?.ongoing_tip;
  const hazardText = [
    detail?.title,
    detail?.announcement?.category,
    detail?.announcement?.ai_scope,
    detail?.announcement?.ai_summary,
    hazard?.category,
    hazard?.hazard_type,
  ]
    .filter(Boolean)
    .join(' ');
  const isDisasterAdvisory =
    Boolean(hazard) ||
    /heat|flood|rain|typhoon|storm|wind|air quality|aqi|weather|disaster|evacuat/i.test(
      hazardText,
    );
  const isFacebookAnnouncement = Boolean(
    detail?.announcement &&
    (Boolean(sourceUrl && isFacebookUrl(sourceUrl)) ||
      /facebook/i.test(detail.announcement.source ?? '')),
  );
  const announcementGuidance = getTipItems(detail?.announcement?.ai_key_points);
  const storedSafetyGuidance = [
    {
      heading: 'Do',
      items: getTipItems(ongoingTip?.do_list, tips?.do_list, tips?.do),
    },
    {
      heading: "Don't",
      items: getTipItems(ongoingTip?.dont_list, tips?.dont_list, tips?.avoid),
    },
    {
      heading: 'What to prepare',
      items: getTipItems(
        ongoingTip?.prepare_list,
        tips?.prepare_list,
        tips?.prepare,
      ),
    },
  ];
  const safetyGuidance = isFacebookAnnouncement
    ? announcementGuidance.length
      ? [{ heading: 'From the Facebook post', items: announcementGuidance }]
      : []
    : isDisasterAdvisory
      ? getDefaultSafetyGuidance(hazardText).map((defaultSection) => {
          const storedSection = storedSafetyGuidance.find(
            (section) => section.heading === defaultSection.heading,
          );
          return {
            heading: defaultSection.heading,
            items:
              storedSection && storedSection.items.length
                ? storedSection.items
                : defaultSection.items,
          };
        })
      : storedSafetyGuidance.filter((section) => section.items.length > 0);
  const showSafetyGuidance =
    Boolean(hazard) || isDisasterAdvisory || isFacebookAnnouncement;
  const emergencyNote = ongoingTip?.emergency_note ?? tips?.emergency_note;
  const classSuspension = detail?.announcement?.is_class_suspension === true;
  const isSystemAnnouncement =
    detail?.kind === 'system' || detail?.announcement?.ai_scope === 'system';
  const categoryLabel = isSystemAnnouncement
    ? 'System'
    : hazard
      ? 'Weather'
      : detail?.announcement?.ai_scope === 'weather'
        ? 'Weather'
        : detail?.announcement?.ai_scope === 'local' ||
            detail?.kind === 'local' ||
            detail?.kind === 'announcement_local'
          ? 'Local'
          : 'Institution';
  const publishedAt =
    detail?.announcement?.published_at ??
    detail?.pagasa_alert?.published_at ??
    detail?.created_at ??
    '';
  const dateLabel = Number.isFinite(Date.parse(publishedAt))
    ? new Date(publishedAt).toLocaleString()
    : 'Date unavailable';
  const sourceName = detail?.pagasa_alert
    ? 'PAGASA'
    : hazard
      ? hazard.source_name ??
        (hazard.source_type === 'weather_auto'
          ? 'W.A.T.C.H. weather detection (not an official advisory)'
          : 'W.A.T.C.H. Weather Alert')
      : (detail?.source_name ??
        detail?.announcement?.source_name ??
        detail?.announcement?.source ??
        'W.A.T.C.H.');
  const sourceLinkLabel = sourceUrl
    ? isFacebookUrl(sourceUrl)
      ? 'View original post on Facebook'
      : 'View alert source'
    : null;
  const openSource = async () => {
    if (!sourceUrl) return;
    try {
      await Linking.openURL(sourceUrl);
    } catch (linkError) {
      console.error('Unable to open the official alert source:', linkError);
      Alert.alert('Link unavailable', 'The original post could not be opened.');
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#211344', '#171022', '#100D1D']}
        style={StyleSheet.absoluteFill}
      />
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.back}>‹ Alerts</Text>
      </Pressable>
      {loading ? (
        <ActivityIndicator color="#C9A7FF" style={styles.loading} />
      ) : error ? (
        <View style={styles.errorState}>
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Close</Text>
          </Pressable>
        </View>
      ) : detail ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.glass}>
            <BlurView
              intensity={42}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={['rgba(41, 28, 72, 0.88)', 'rgba(20, 17, 40, 0.94)']}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.category}>{categoryLabel.toUpperCase()}</Text>
            {classSuspension ? (
              <View style={styles.suspensionBanner}>
                <Text style={styles.suspensionBannerText}>NO CLASSES</Text>
              </View>
            ) : null}
            <Text style={styles.title}>{detail.title}</Text>
            <Text style={styles.timestamp}>
              Source: {sourceName} · {dateLabel}
            </Text>
            {hazard ? (
              <>
                <Text style={styles.hazardSeverity}>
                  {hazard.risk_level ?? hazard.severity ?? 'Weather'} advisory
                </Text>
                {[hazard.city, hazard.province].filter(Boolean).length ? (
                  <Text style={styles.detailLine}>
                    Affected area: {[hazard.city, hazard.province].filter(Boolean).join(', ')}
                  </Text>
                ) : null}
                {hazard.observed_at ? (
                  <Text style={styles.detailLine}>
                    Measured at: {new Date(hazard.observed_at).toLocaleString()}
                  </Text>
                ) : null}
                {formatHazardMeasurements(hazard.measurements) ? (
                  <Text style={styles.detailLine}>
                    Measurements: {formatHazardMeasurements(hazard.measurements)}
                  </Text>
                ) : null}
              </>
            ) : null}
            <Text style={styles.sectionTitle}>
              {isSystemAnnouncement ? 'Announcement details' : 'AI summary'}
            </Text>
            <Text style={styles.summary}>{summary}</Text>
            {detail.announcement?.content &&
            !['admin_manual', 'admin_system', 'admin_test_replay'].includes(
              detail.announcement.source ?? '',
            ) ? (
              <>
                <Text style={styles.sectionTitle}>Original source text</Text>
                <Text style={styles.original}>
                  {detail.announcement.content}
                </Text>
              </>
            ) : null}
            {detail.announcement ? (
              <>
                {isSystemAnnouncement && detail.announcement.system_details ? (
                  <>
                    {detail.announcement.system_details.schedule_or_date ? (
                      <Text style={styles.detailLine}>
                        Schedule / date:{' '}
                        {detail.announcement.system_details.schedule_or_date}
                      </Text>
                    ) : null}
                    {detail.announcement.system_details.impact ? (
                      <Text style={styles.detailLine}>
                        Impact: {detail.announcement.system_details.impact}
                      </Text>
                    ) : null}
                    {detail.announcement.system_details.action_needed ? (
                      <Text style={styles.detailLine}>
                        Action needed:{' '}
                        {detail.announcement.system_details.action_needed}
                      </Text>
                    ) : null}
                    {detail.announcement.system_details.missing_info_note ? (
                      <Text style={styles.detailLine}>
                        Missing information:{' '}
                        {detail.announcement.system_details.missing_info_note}
                      </Text>
                    ) : null}
                  </>
                ) : null}
                {!isSystemAnnouncement ? (
                  <Text style={styles.sectionTitle}>Details</Text>
                ) : null}
                {detail.announcement.suspension_reason ? (
                  <Text style={styles.detailLine}>
                    Reason:{' '}
                    {detail.announcement.suspension_reason.replace(/_/g, ' ')}
                  </Text>
                ) : null}
                {detail.announcement.affected_levels ? (
                  <Text style={styles.detailLine}>
                    Affected levels: {detail.announcement.affected_levels}
                  </Text>
                ) : null}
                {!isFacebookAnnouncement &&
                  (detail.announcement.ai_key_points ?? []).map(
                    (point, index) => (
                      <Text key={`${index}-${point}`} style={styles.tip}>
                        • {point}
                      </Text>
                    ),
                  )}
              </>
            ) : null}
            {showSafetyGuidance ? (
              expired ? (
                <Text style={styles.expired}>
                  This weather alert has expired. Check official advisories for
                  the latest information.
                </Text>
              ) : (
                <View>
                  <Text style={styles.sectionTitle}>Safety guidance</Text>
                  {safetyGuidance.map(({ heading, items }) => (
                    <View key={heading}>
                      <Text style={styles.guidanceHeading}>{heading}</Text>
                      {items.map((tip, index) => (
                        <Text key={tip} style={styles.tip}>
                          {index + 1}. {tip}
                        </Text>
                      ))}
                    </View>
                  ))}
                  {!safetyGuidance.length ? (
                    <Text style={styles.detailLine}>
                      No specific safety instructions were found in this
                      Facebook post.
                    </Text>
                  ) : null}
                  {emergencyNote ? (
                    <Text style={styles.emergencyNote}>{emergencyNote}</Text>
                  ) : null}
                </View>
              )
            ) : null}
            {sourceUrl && sourceLinkLabel ? (
              <Pressable onPress={() => void openSource()}>
                <Text style={styles.link}>{sourceLinkLabel}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.disclaimer}>
              AI-assisted summary. Always verify with the official source.
            </Text>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#171022',
    paddingTop: 54,
    paddingHorizontal: 20,
  },
  back: { color: '#D5B6FF', fontSize: 16, fontWeight: '600' },
  loading: { marginTop: 36 },
  error: { color: '#FFB4B4', padding: 20 },
  errorState: { alignItems: 'center', marginTop: 24 },
  backButton: {
    backgroundColor: '#5D3BA5',
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  backButtonText: { color: '#FFFFFF', fontWeight: '700' },
  content: { paddingTop: 22, paddingBottom: 36 },
  glass: {
    overflow: 'hidden',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(215, 193, 255, 0.20)',
    padding: 20,
    backgroundColor: '#201733',
  },
  category: {
    color: '#C9A7FF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  suspensionBanner: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: '#7A342F',
    borderColor: '#FF9D8F',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 12,
  },
  suspensionBannerText: {
    color: '#FFE7E2',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: { color: '#FFFFFF', fontSize: 23, fontWeight: '800', marginTop: 9 },
  timestamp: { color: '#A99BB9', fontSize: 12, marginTop: 8, lineHeight: 18 },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 9,
  },
  summary: { color: '#EEE6F7', fontSize: 16, lineHeight: 24 },
  hazardSeverity: {
    color: '#FFD18D',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  guidanceHeading: {
    color: '#E8DDF5',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 5,
  },
  detailLine: {
    color: '#E8DDF5',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 6,
  },
  original: { color: '#D1C8DD', fontSize: 14, lineHeight: 21 },
  tip: { color: '#E8DDF5', fontSize: 14, lineHeight: 21, marginBottom: 7 },
  expired: { color: '#FFD9A8', lineHeight: 21, marginTop: 20 },
  emergencyNote: {
    color: '#FFD9A8',
    lineHeight: 21,
    marginTop: 14,
    fontWeight: '600',
  },
  link: { color: '#D5B6FF', fontWeight: '700', lineHeight: 21, marginTop: 22 },
  disclaimer: { color: '#A99BB9', fontSize: 12, lineHeight: 18, marginTop: 24 },
});
