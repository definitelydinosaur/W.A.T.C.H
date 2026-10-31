import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import supabase from '../lib/supabase';

type AlertFilter = 'All' | 'Local' | 'Institution' | 'Weather';
type AlertKind = 'announcement_local' | 'announcement_institution' | 'weather_hazard';

interface AlertRow {
  id: string;
  user_id: string;
  announcement_id: number | null;
  hazard_id: string | null;
  title: string;
  body: string;
  status: string;
  kind: AlertKind | string;
  source_name: string | null;
  source_url: string | null;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
  announcement?: {
    ai_summary: string | null;
    city: string | null;
    category: string | null;
    source_url: string | null;
    institution?: { short_name: string | null } | null;
  } | null;
  hazard?: {
    hazard_type: string | null;
    risk_level: string | null;
    ai_summary: string | null;
  } | null;
}

const PAGE_SIZE = 20;
const FILTERS: AlertFilter[] = ['All', 'Local', 'Institution', 'Weather'];
const SELECT_FIELDS =
  'id,user_id,announcement_id,hazard_id,title,body,status,kind,source_name,source_url,created_at,read_at,deleted_at,announcement:announcements(ai_summary,city,category,source_url,institution:institutions(short_name)),hazard:hazards(hazard_type,risk_level,ai_summary)';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstRelation<T>(
  value: unknown,
  isValue: (item: unknown) => item is T,
): T | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isValue(candidate) ? candidate : null;
}

function isAnnouncement(value: unknown): value is NonNullable<AlertRow['announcement']> {
  return (
    isRecord(value) &&
    (typeof value.ai_summary === 'string' || value.ai_summary === null) &&
    (typeof value.city === 'string' || value.city === null) &&
    (typeof value.category === 'string' || value.category === null) &&
    (typeof value.source_url === 'string' || value.source_url === null)
  );
}

function isHazard(value: unknown): value is NonNullable<AlertRow['hazard']> {
  return (
    isRecord(value) &&
    (typeof value.hazard_type === 'string' || value.hazard_type === null) &&
    (typeof value.risk_level === 'string' || value.risk_level === null) &&
    (typeof value.ai_summary === 'string' || value.ai_summary === null)
  );
}

function isAlertRow(value: unknown): value is AlertRow {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.user_id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.body === 'string' &&
    typeof value.status === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.created_at === 'string'
  );
}

function normalizeAlertRow(value: unknown): AlertRow | null {
  if (!isAlertRow(value)) return null;
  const announcement = firstRelation(value.announcement, isAnnouncement);
  const institution = announcement
    ? firstRelation(announcement.institution, isRecord)
    : null;
  const hazard = firstRelation(value.hazard, isHazard);
  return {
    ...(value as AlertRow),
    announcement: announcement
      ? {
          ...announcement,
          institution:
            institution && typeof institution.short_name === 'string'
              ? { short_name: institution.short_name }
              : null,
        }
      : null,
    hazard,
  };
}

function filterKind(kind: string, filter: AlertFilter) {
  if (filter === 'All') return true;
  if (filter === 'Weather') return kind === 'weather_hazard';
  if (filter === 'Institution') return kind === 'announcement_institution';
  return kind === 'announcement_local';
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(value).toLocaleDateString();
}

function riskColor(level: string | null | undefined) {
  if (level === 'Severe') return '#FF6B78';
  if (level === 'Warning') return '#FF9D58';
  if (level === 'Advisory') return '#FFD166';
  return '#B9A6D8';
}

export default function AlertsScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [filter, setFilter] = useState<AlertFilter>('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [undoIds, setUndoIds] = useState<string[] | null>(null);
  const [undoLabel, setUndoLabel] = useState('');
  const alertsLength = useRef(0);
  const paging = useRef(false);

  const loadAlerts = useCallback(async (reset = true) => {
    if (!reset && paging.current) return;
    if (!reset) paging.current = true;
    if (reset) {
      setLoading(true);
      setError('');
    }
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      setError(sessionError.message);
      setLoading(false);
      setRefreshing(false);
      paging.current = false;
      return;
    }
    const currentUserId = sessionData.session?.user.id;
    if (!currentUserId) {
      setError('Sign in to view your alerts.');
      setLoading(false);
      setRefreshing(false);
      paging.current = false;
      return;
    }
    setUserId(currentUserId);
    const start = reset ? 0 : alertsLength.current;
    let query = supabase
      .from('notifications')
      .select(SELECT_FIELDS)
      .eq('user_id', currentUserId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (filter === 'Weather') query = query.eq('kind', 'weather_hazard');
    else if (filter === 'Institution') query = query.eq('kind', 'announcement_institution');
    else if (filter === 'Local') query = query.eq('kind', 'announcement_local');
    const { data, error: queryError } = await query.range(start, start + PAGE_SIZE - 1);
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      setRefreshing(false);
      paging.current = false;
      return;
    }
    const rows = (data ?? [])
      .map(normalizeAlertRow)
      .filter((row): row is AlertRow => row !== null);
    setAlerts((current) => {
      const next = reset ? rows : [...current, ...rows];
      alertsLength.current = next.length;
      return next;
    });
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
    setRefreshing(false);
    paging.current = false;
  }, [filter]);

  useEffect(() => {
    const timer = setTimeout(() => void loadAlerts(), 0);
    return () => clearTimeout(timer);
  }, [loadAlerts]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`alerts-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadAlerts();
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Alerts realtime subscription status: ${status}`);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAlerts, userId]);

  const visibleAlerts = useMemo(
    () => alerts.filter((item) => filterKind(item.kind, filter)),
    [alerts, filter],
  );

  const confirmDelete = (ids: string[]) => {
    if (!userId || !ids.length) return;
    Alert.alert(
      ids.length === 1 ? 'Delete alert?' : 'Clear all alerts?',
      'This removes the alert from your history. You can undo this action.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: ids.length === 1 ? 'Delete' : 'Clear all',
          style: 'destructive',
          onPress: () => {
            const deletedAt = new Date().toISOString();
            void supabase
              .from('notifications')
              .update({ deleted_at: deletedAt })
              .eq('user_id', userId)
              .in('id', ids)
              .then(({ error: updateError }) => {
                if (updateError) {
                  Alert.alert('Unable to delete', updateError.message);
                  return;
                }
                setAlerts((current) => current.filter((item) => !ids.includes(item.id)));
                setUndoIds(ids);
                setUndoLabel(ids.length === 1 ? 'Alert deleted' : 'Alerts cleared');
              });
          },
        },
      ],
    );
  };

  const undoDelete = async () => {
    if (!userId || !undoIds) return;
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ deleted_at: null })
      .eq('user_id', userId)
      .in('id', undoIds);
    if (updateError) {
      Alert.alert('Unable to undo', updateError.message);
      return;
    }
    setUndoIds(null);
    setUndoLabel('');
    void loadAlerts();
  };

  const clearAll = async () => {
    if (!userId) return;
    const ids: string[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error: queryError } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .range(offset, offset + 499);
      if (queryError) {
        Alert.alert('Unable to clear alerts', queryError.message);
        return;
      }
      const page = data ?? [];
      ids.push(...page.map((row) => row.id));
      if (page.length < 500) break;
    }
    if (ids.length) confirmDelete(ids);
  };

  const renderAlert = ({ item }: { item: AlertRow }) => {
    const isWeather = item.kind === 'weather_hazard';
    const badge = isWeather ? 'Weather' : item.kind === 'announcement_institution' ? 'Institution' : 'Local';
    const locationLabel = isWeather
      ? item.hazard?.risk_level ?? 'Weather'
      : item.kind === 'announcement_institution'
        ? item.announcement?.institution?.short_name ?? item.source_name ?? 'School'
        : item.announcement?.city ?? item.source_name ?? 'Local';
    const sourceUrl = item.source_url ?? item.announcement?.source_url;
    const summary = item.announcement?.ai_summary ?? item.hazard?.ai_summary ?? item.body;
    const unread = item.status !== 'Read' && !item.read_at;
    const severity = item.hazard?.risk_level;

    return (
      <Pressable
        onPress={() => router.push({
          pathname: '/alert_page/announcement',
          params: { notificationId: item.id },
        })}
        style={styles.card}
        accessibilityRole="button"
      >
        <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(41, 28, 72, 0.88)', 'rgba(20, 17, 40, 0.94)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.cardTop}>
          <View style={styles.badges}>
            <Text style={[styles.typeBadge, isWeather && { color: riskColor(severity) }]}>
              {isWeather ? '⚠  ' : ''}{badge}
            </Text>
            <Text style={styles.locationBadge}>{locationLabel}</Text>
          </View>
          <View style={styles.cardActions}>
            {unread ? <View style={styles.unreadDot} /> : null}
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                confirmDelete([item.id]);
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Delete alert"
              style={styles.trashButton}
            >
              <Text style={styles.trashIcon}>×</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text numberOfLines={3} style={styles.summary}>{summary}</Text>
        <View style={styles.cardFooter}>
          <Text numberOfLines={1} style={styles.source}>{item.source_name ?? 'W.A.T.C.H.'}</Text>
          <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
        </View>
        {sourceUrl ? (
          <Text style={styles.externalText}>
            For further details, please visit{' '}
            <Text
              style={styles.externalLink}
              onPress={(event) => {
                event.stopPropagation();
                void Linking.openURL(sourceUrl).catch((linkError: unknown) => {
                  console.error('Unable to open the official alert source:', linkError);
                  Alert.alert('Link unavailable', 'The original post could not be opened.');
                });
              }}
            >
              the original post
            </Text>
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#211344', '#171022', '#100D1D']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Alerts</Text>
        <Pressable onPress={clearAll} accessibilityRole="button">
          <Text style={styles.clearAll}>Clear all</Text>
        </Pressable>
      </View>
      <View style={styles.filters}>
        {FILTERS.map((value) => (
          <Pressable
            key={value}
            onPress={() => {
              if (value !== filter) {
                alertsLength.current = 0;
                setAlerts([]);
                setHasMore(true);
                setFilter(value);
              }
            }}
            style={[styles.filterChip, filter === value && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
              {value}
            </Text>
          </Pressable>
        ))}
      </View>
      {loading ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2].map((item) => (
            <View key={item} style={styles.skeletonCard}>
              <ActivityIndicator color="#C9A7FF" />
            </View>
          ))}
        </View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.stateMessage}>{error}</Text>
          <Pressable onPress={() => void loadAlerts()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visibleAlerts}
          keyExtractor={(item) => item.id}
          renderItem={renderAlert}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor="#D5B6FF"
              colors={['#C9A7FF']}
              onRefresh={() => {
                setRefreshing(true);
                void loadAlerts();
              }}
            />
          }
          onEndReached={() => {
            if (hasMore && !loading) void loadAlerts(false);
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <Text style={styles.stateMessage}>
              No alerts yet. We&apos;ll notify you about announcements and weather in your area.
            </Text>
          }
        />
      )}
      {undoIds ? (
        <View style={styles.snackbar}>
          <Text style={styles.snackbarText}>{undoLabel}</Text>
          <Pressable onPress={() => void undoDelete()}>
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
          <Pressable onPress={() => { setUndoIds(null); setUndoLabel(''); }}>
            <Text style={styles.dismissSnack}>×</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#171022', paddingTop: 54 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  back: { color: '#FFFFFF', fontSize: 34, width: 40 },
  title: { color: '#FFFFFF', fontSize: 23, fontWeight: '700' },
  clearAll: { color: '#D5B6FF', fontSize: 13, fontWeight: '600' },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  filterChip: { borderWidth: 1, borderColor: 'rgba(220, 204, 255, 0.24)', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  filterChipActive: { backgroundColor: 'rgba(117, 75, 208, 0.52)', borderColor: 'rgba(220, 204, 255, 0.62)' },
  filterText: { color: '#BEB2CB', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#FFFFFF' },
  list: { paddingHorizontal: 16, paddingBottom: 34, gap: 12, flexGrow: 1 },
  card: { overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(215, 193, 255, 0.20)', padding: 16, backgroundColor: '#201733' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  typeBadge: { color: '#D9C0FF', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  locationBadge: { color: '#BDB1CB', fontSize: 11, flexShrink: 1 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9A7FF' },
  trashButton: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  trashIcon: { color: '#B7A9C6', fontSize: 23, lineHeight: 25 },
  cardTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 12 },
  summary: { color: '#E4DCEA', fontSize: 13, lineHeight: 19, marginTop: 7 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 13 },
  source: { color: '#B9A8CC', fontSize: 11, flex: 1 },
  time: { color: '#A99BB9', fontSize: 11 },
  externalText: { color: '#B9A8CC', fontSize: 11, lineHeight: 16, marginTop: 10 },
  externalLink: { color: '#D5B6FF', textDecorationLine: 'underline', fontWeight: '600' },
  skeletonList: { paddingHorizontal: 16, gap: 12 },
  skeletonCard: { height: 130, borderRadius: 22, justifyContent: 'center', backgroundColor: 'rgba(47, 35, 67, 0.85)' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  stateMessage: { color: '#D5CDE0', padding: 22, textAlign: 'center', lineHeight: 21 },
  retryButton: { borderRadius: 16, backgroundColor: '#5D3BA5', paddingHorizontal: 22, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  snackbar: { position: 'absolute', left: 16, right: 16, bottom: 24, borderRadius: 16, backgroundColor: '#34264A', paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: 'rgba(220,204,255,0.24)' },
  snackbarText: { color: '#FFFFFF', flex: 1, fontSize: 13 },
  undoText: { color: '#D5B6FF', fontWeight: '800' },
  dismissSnack: { color: '#AFA3BD', fontSize: 20 },
});
