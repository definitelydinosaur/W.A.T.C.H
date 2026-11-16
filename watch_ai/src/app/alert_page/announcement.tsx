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
  announcement_id: number | null;
  hazard_id: string | null;
  announcement?: {
    title: string | null;
    content: string | null;
    ai_summary: string | null;
    published_at: string | null;
    source: string | null;
    source_url: string | null;
    category: string | null;
  } | null;
  hazard?: {
    category: string | null;
    severity: string | null;
    hazard_type: string | null;
    risk_level: string | null;
    ai_summary: string | null;
    safety_tips: { do?: string[]; prepare?: string[]; avoid?: string[] } | null;
    expires_at: string | null;
  } | null;
}

function isTips(value: unknown): value is { do?: string[]; prepare?: string[]; avoid?: string[] } {
  return typeof value === 'object' && value !== null;
}

export default function AnnouncementScreen() {
  const router = useRouter();
  const { notificationId, id } = useLocalSearchParams<{
    notificationId?: string | string[];
    id?: string | string[];
  }>();
  const selectedNotificationId = Array.isArray(notificationId)
    ? notificationId[0]
    : notificationId;
  const legacyAnnouncementId = Array.isArray(id) ? id[0] : id;
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
          'id,title,body,kind,status,read_at,source_name,source_url,created_at,announcement_id,hazard_id,announcement:announcements(title,content,ai_summary,published_at,source,source_url,category),hazard:hazards(category,severity,hazard_type,risk_level,ai_summary,safety_tips,expires_at)',
        )
        .eq('user_id', userId)
        .is('deleted_at', null);
      if (selectedNotificationId) query = query.eq('id', selectedNotificationId);
      else if (legacyAnnouncementId) query = query.eq('announcement_id', legacyAnnouncementId);
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
        if (active) setError(loadError instanceof Error ? loadError.message : 'Alert is unavailable.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [legacyAnnouncementId, selectedNotificationId]);

  const sourceUrl = detail?.source_url ?? detail?.announcement?.source_url;
  const summary =
    detail?.announcement?.ai_summary ??
    detail?.hazard?.ai_summary ??
    detail?.body;
  const hazard = detail?.hazard;
  const tips = isTips(hazard?.safety_tips) ? hazard.safety_tips : null;
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
      <LinearGradient colors={['#211344', '#171022', '#100D1D']} style={StyleSheet.absoluteFill} />
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.back}>‹  Alerts</Text>
      </Pressable>
      {loading ? (
        <ActivityIndicator color="#C9A7FF" style={styles.loading} />
      ) : error ? (
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      ) : detail ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.glass}>
            <BlurView intensity={42} tint="dark" style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['rgba(41, 28, 72, 0.88)', 'rgba(20, 17, 40, 0.94)']} style={StyleSheet.absoluteFill} />
            <Text style={styles.category}>
              {hazard ? `${hazard.risk_level ?? hazard.severity ?? 'Weather'} WEATHER ALERT` : (detail.announcement?.category ?? 'ANNOUNCEMENT').replace(/_/g, ' ').toUpperCase()}
            </Text>
            <Text style={styles.title}>{detail.title}</Text>
            <Text style={styles.timestamp}>
              {detail.source_name ?? detail.announcement?.source ?? 'W.A.T.C.H.'}
              {' · '}
              {new Date(detail.announcement?.published_at ?? detail.created_at).toLocaleString()}
            </Text>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.summary}>{summary}</Text>
            {detail.announcement?.content ? (
              <>
                <Text style={styles.sectionTitle}>Original announcement</Text>
                <Text style={styles.original}>{detail.announcement.content}</Text>
              </>
            ) : null}
            {hazard ? (
              expired ? (
                <Text style={styles.expired}>This weather alert has expired. Check official advisories for the latest information.</Text>
              ) : (
                <View>
                  {([
                    ['What to do', tips?.do],
                    ['What to prepare', tips?.prepare],
                    ['What to avoid', tips?.avoid],
                  ] as const).map(([heading, items]) => (
                    <View key={heading}>
                      <Text style={styles.sectionTitle}>{heading}</Text>
                      {(items ?? []).map((tip) => (
                        <Text key={tip} style={styles.tip}>• {tip}</Text>
                      ))}
                    </View>
                  ))}
                </View>
              )
            ) : null}
            {sourceUrl ? (
              <Pressable onPress={() => void openSource()}>
                <Text style={styles.link}>For further details, please visit the original post</Text>
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
  screen: { flex: 1, backgroundColor: '#171022', paddingTop: 54, paddingHorizontal: 20 },
  back: { color: '#D5B6FF', fontSize: 16, fontWeight: '600' },
  loading: { marginTop: 36 },
  error: { color: '#FFB4B4', padding: 20 },
  content: { paddingTop: 22, paddingBottom: 36 },
  glass: { overflow: 'hidden', borderRadius: 26, borderWidth: 1, borderColor: 'rgba(215, 193, 255, 0.20)', padding: 20, backgroundColor: '#201733' },
  category: { color: '#C9A7FF', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: '#FFFFFF', fontSize: 23, fontWeight: '800', marginTop: 9 },
  timestamp: { color: '#A99BB9', fontSize: 12, marginTop: 8, lineHeight: 18 },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 9 },
  summary: { color: '#EEE6F7', fontSize: 16, lineHeight: 24 },
  original: { color: '#D1C8DD', fontSize: 14, lineHeight: 21 },
  tip: { color: '#E8DDF5', fontSize: 14, lineHeight: 21, marginBottom: 7 },
  expired: { color: '#FFD9A8', lineHeight: 21, marginTop: 20 },
  link: { color: '#D5B6FF', fontWeight: '700', lineHeight: 21, marginTop: 22 },
  disclaimer: { color: '#A99BB9', fontSize: 12, lineHeight: 18, marginTop: 24 },
});
