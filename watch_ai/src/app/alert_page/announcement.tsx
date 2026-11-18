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
    source_name: string | null;
    published_at: string | null;
    source: string | null;
    source_url: string | null;
    category: string | null;
    ai_scope: 'institution' | 'local' | 'weather' | null;
    is_class_suspension: boolean;
    suspension_reason: string | null;
    affected_levels: string | null;
    ai_key_points: string[] | null;
    institution?: { name: string | null; short_name: string | null } | null;
  } | null;
  hazard?: {
    category: string | null;
    severity: string | null;
    hazard_type: string | null;
    risk_level: string | null;
    ai_summary: string | null;
    safety_tips: {
      do?: string[];
      prepare?: string[];
      avoid?: string[];
      ongoing_tip?: {
        title?: string;
        short_summary?: string;
        do_list?: string[];
        dont_list?: string[];
        emergency_note?: string;
      };
    } | null;
    expires_at: string | null;
  } | null;
}

function isTips(
  value: unknown,
): value is NonNullable<NotificationDetail['hazard']>['safety_tips'] {
  return typeof value === 'object' && value !== null;
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
  const { notificationId, announcementId, hazardId, id } =
    useLocalSearchParams<{
      notificationId?: string | string[];
      announcementId?: string | string[];
      hazardId?: string | string[];
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
          'id,title,body,kind,status,read_at,source_name,source_url,created_at,announcement_id,hazard_id,announcement:announcements(ai_summary,source_name,published_at,source,source_url,category,ai_scope,is_class_suspension,suspension_reason,affected_levels,ai_key_points,institution:institutions!announcements_institution_id_fkey(name,short_name)),hazard:hazards(category,severity,hazard_type,risk_level,ai_summary,safety_tips,expires_at)',
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
      else throw new Error('Alert was not found.');

      const { data, error: queryError } = await query.maybeSingle();
      if (queryError) throw queryError;
      if (!data) throw new Error('This alert is no longer available.');
      const row = data as unknown as NotificationDetail;
      if (active) setDetail(row);
      if (active) {
        setExpired(
          Boolean(
            row.hazard?.expires_at &&
            Date.parse(row.hazard.expires_at) <= Date.now(),
          ),
        );
      }
      if (row.status !== 'Read' || !row.read_at) {
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
    selectedNotificationId,
  ]);

  const sourceUrl = detail?.source_url ?? detail?.announcement?.source_url;
  const summary =
    detail?.announcement?.ai_summary ??
    detail?.hazard?.safety_tips?.ongoing_tip?.short_summary ??
    detail?.hazard?.ai_summary ??
    detail?.body;
  const hazard = detail?.hazard;
  const tips = isTips(hazard?.safety_tips) ? hazard.safety_tips : null;
  const ongoingTip = tips?.ongoing_tip;
  const classSuspension = detail?.announcement?.is_class_suspension === true;
  const categoryLabel = hazard
    ? 'Weather'
    : detail?.announcement?.ai_scope === 'weather'
      ? 'Weather'
      : detail?.announcement?.ai_scope === 'local' ||
          detail?.kind === 'local' ||
          detail?.kind === 'announcement_local'
        ? 'Local'
        : 'Institution';
  const publishedAt =
    detail?.announcement?.published_at ?? detail?.created_at ?? '';
  const dateLabel = Number.isFinite(Date.parse(publishedAt))
    ? new Date(publishedAt).toLocaleString()
    : 'Date unavailable';
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
              {detail.source_name ??
                detail.announcement?.source_name ??
                detail.announcement?.source ??
                'W.A.T.C.H.'}
              {' · '}
              {dateLabel}
            </Text>
            {hazard ? (
              <Text style={styles.hazardSeverity}>
                {hazard.risk_level ?? hazard.severity ?? 'Weather'} advisory
              </Text>
            ) : null}
            <Text style={styles.sectionTitle}>AI summary</Text>
            <Text style={styles.summary}>{summary}</Text>
            {detail.announcement ? (
              <>
                <Text style={styles.sectionTitle}>Details</Text>
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
                {(detail.announcement.ai_key_points ?? []).map(
                  (point, index) => (
                    <Text key={`${index}-${point}`} style={styles.tip}>
                      • {point}
                    </Text>
                  ),
                )}
              </>
            ) : null}
            {hazard ? (
              expired ? (
                <Text style={styles.expired}>
                  This weather alert has expired. Check official advisories for
                  the latest information.
                </Text>
              ) : (
                <View>
                  {(
                    [
                      ['Do', ongoingTip?.do_list ?? tips?.do],
                      ["Don't", ongoingTip?.dont_list ?? tips?.avoid],
                      ['What to prepare', tips?.prepare],
                    ] as const
                  ).map(([heading, items]) => (
                    <View key={heading}>
                      <Text style={styles.sectionTitle}>{heading}</Text>
                      {(items ?? []).map((tip) => (
                        <Text key={tip} style={styles.tip}>
                          • {tip}
                        </Text>
                      ))}
                    </View>
                  ))}
                  {ongoingTip?.emergency_note ? (
                    <Text style={styles.emergencyNote}>
                      {ongoingTip.emergency_note}
                    </Text>
                  ) : null}
                </View>
              )
            ) : null}
            {sourceUrl && !hazard ? (
              <Pressable onPress={() => void openSource()}>
                <Text style={styles.link}>View original post on Facebook</Text>
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
