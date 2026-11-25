import React, { useState } from 'react';
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
import {
  formatEventDateRange,
  formatShortManilaDate,
  formatTimestamp,
} from './history';
import {
  HAZARD_META,
  HAZARD_SEVERITY_COLOR,
  HAZARD_TYPES,
  SOURCE_BADGE_META,
  type Hazard,
  type HazardBounds,
  type HazardSeverityLevel,
} from './types';
import type { HazardHistory } from './use-hazard-history';

type DrawerKind = 'list' | 'events' | 'archive' | null;

interface Props {
  history: HazardHistory;
  /** Distance from the screen bottom (sit above the bottom sheet). */
  bottom: number;
  onFocusHazard: (hazard: Hazard) => void;
  onFitBounds: (bounds: HazardBounds) => void;
}

function severityColor(severity: string): string {
  if (
    severity === 'Advisory' ||
    severity === 'Warning' ||
    severity === 'Severe' ||
    severity === 'Extreme'
  ) {
    return HAZARD_SEVERITY_COLOR[severity as HazardSeverityLevel];
  }
  return '#60A5FA';
}

/** Day tabs + Major Cebu Events picker + 30-day archive + detail card. */
export default function HazardHistoryPanel({
  history,
  bottom,
  onFocusHazard,
  onFitBounds,
}: Props) {
  const {
    viewMode,
    selectedDate,
    selectedEvent,
    day,
    recentDays,
    allHistoryDays,
    majorEvents,
    visible,
    selected,
    selectedId,
    loading,
    error,
    isOfflineCache,
  } = history;

  const [drawer, setDrawer] = useState<DrawerKind>(null);

  const toggleDrawer = (target: Exclude<DrawerKind, null>) => {
    setDrawer((current) => (current === target ? null : target));
  };

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      {selected && (
        <HazardCard
          hazard={selected}
          onClose={() => history.setSelectedId(null)}
        />
      )}

      {drawer === 'list' && (
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>
              {viewMode === 'event' && selectedEvent
                ? selectedEvent.title
                : day.shortDate}{' '}
              · {visible.length} hazard{visible.length === 1 ? '' : 's'}
              {viewMode === 'live' ? ' · Live' : ' · Historical'}
            </Text>
            <Pressable onPress={() => setDrawer(null)} hitSlop={8}>
              <Text style={styles.drawerClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView>
            {visible.length === 0 && (
              <Text style={styles.empty}>
                {loading
                  ? 'Loading hazards…'
                  : 'No spatial hazards recorded for this view.'}
              </Text>
            )}
            {HAZARD_TYPES.map((type) => {
              const group = visible.filter((h) => h.type === type);
              if (group.length === 0) return null;
              return (
                <View key={type} style={styles.group}>
                  <Text
                    style={[
                      styles.groupTitle,
                      { color: HAZARD_META[type].color },
                    ]}
                  >
                    {HAZARD_META[type].glyph} {HAZARD_META[type].label} (
                    {group.length})
                  </Text>
                  {group.map((h) => {
                    const sourceBadge =
                      SOURCE_BADGE_META[h.sourceType ?? 'weather_auto'];
                    return (
                      <Pressable
                        key={h.id}
                        onPress={() => {
                          onFocusHazard(h);
                          setDrawer(null);
                        }}
                        style={[
                          styles.row,
                          h.id === selectedId && styles.rowActive,
                        ]}
                      >
                        <View style={styles.rowTop}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {h.title}
                          </Text>
                          <View
                            style={[
                              styles.miniSourceBadge,
                              { backgroundColor: sourceBadge.bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.miniSourceText,
                                { color: sourceBadge.fg },
                              ]}
                            >
                              {sourceBadge.shortLabel}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {[h.barangay, h.city].filter(Boolean).join(', ') ||
                            formatTimestamp(h.reportedAt)}{' '}
                          · {h.severity} ·{' '}
                          {h.status === 'active' ? 'Active' : 'Resolved'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {drawer === 'events' && (
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>
              Major Cebu Flood & Weather Events ({majorEvents.length})
            </Text>
            <Pressable onPress={() => setDrawer(null)} hitSlop={8}>
              <Text style={styles.drawerClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView>
            {majorEvents.length === 0 ? (
              <Text style={styles.empty}>
                No major historical events found yet. Apply the Cebu historical
                seed in Supabase to inspect recorded disasters.
              </Text>
            ) : (
              majorEvents.map((event) => {
                const isSelected =
                  viewMode === 'event' &&
                  selectedEvent?.incidentGroup === event.incidentGroup;
                const sevColor = severityColor(event.peakSeverity);
                return (
                  <Pressable
                    key={event.incidentGroup}
                    onPress={() => {
                      history.selectEvent(event.incidentGroup);
                      onFitBounds(event.bounds);
                      setDrawer(null);
                    }}
                    style={[styles.eventRow, isSelected && styles.rowActive]}
                  >
                    <View style={styles.eventRowTop}>
                      <Text style={styles.eventTitle} numberOfLines={2}>
                        {event.title}
                      </Text>
                      <View
                        style={[
                          styles.sevPill,
                          {
                            backgroundColor: `${sevColor}22`,
                            borderColor: sevColor,
                          },
                        ]}
                      >
                        <Text style={[styles.sevPillText, { color: sevColor }]}>
                          {event.peakSeverity}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.eventMeta}>
                      {formatEventDateRange(event.startDate, event.endDate)} ·{' '}
                      {event.hazardCount} affected area
                      {event.hazardCount === 1 ? '' : 's'}
                    </Text>
                    <Text style={styles.eventSubMeta} numberOfLines={1}>
                      {event.cities.join(', ')} · {event.sources.join(' / ')}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {drawer === 'archive' && (
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>30-Day Historical Snapshots</Text>
            <Pressable onPress={() => setDrawer(null)} hitSlop={8}>
              <Text style={styles.drawerClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView>
            {allHistoryDays.map((item, idx) => {
              const isCurrent =
                (idx === 0 && viewMode === 'live') ||
                (viewMode === 'date' && selectedDate === item.date);
              return (
                <Pressable
                  key={item.date}
                  onPress={() => {
                    history.selectDate(item.date);
                    setDrawer(null);
                  }}
                  style={[styles.archiveRow, isCurrent && styles.rowActive]}
                >
                  <Text style={styles.archiveDate}>
                    {idx === 0
                      ? `${formatShortManilaDate(item.date)} (Today Live)`
                      : `${formatShortManilaDate(item.date)} · ${item.date}`}
                  </Text>
                  <View style={styles.archiveRight}>
                    {item.peakSeverity ? (
                      <View
                        style={[
                          styles.archiveDot,
                          { backgroundColor: severityColor(item.peakSeverity) },
                        ]}
                      />
                    ) : null}
                    <Text style={styles.archiveCount}>
                      {item.count} hazard{item.count === 1 ? '' : 's'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {viewMode === 'event' && selectedEvent && (
        <View style={styles.eventBanner}>
          <View style={styles.eventBannerText}>
            <Text style={styles.eventBannerTitle} numberOfLines={1}>
              {selectedEvent.title}
            </Text>
            <Text style={styles.eventBannerSub} numberOfLines={1}>
              {formatEventDateRange(
                selectedEvent.startDate,
                selectedEvent.endDate,
              )}{' '}
              · {visible.length} mapped zone{visible.length === 1 ? '' : 's'}
            </Text>
          </View>
          <Pressable
            style={styles.eventBannerBtn}
            onPress={() => onFitBounds(selectedEvent.bounds)}
          >
            <Text style={styles.eventBannerBtnText}>Fit all</Text>
          </Pressable>
          <Pressable
            style={[styles.eventBannerBtn, styles.eventBannerLiveBtn]}
            onPress={history.selectLive}
          >
            <Text style={styles.eventBannerBtnText}>Live</Text>
          </Pressable>
        </View>
      )}

      {(loading || error) && (
        <View style={styles.statusStrip}>
          {loading ? (
            <ActivityIndicator size="small" color="#C084FC" />
          ) : null}
          <Text style={styles.statusStripText} numberOfLines={1}>
            {loading
              ? 'Loading official hazards…'
              : isOfflineCache
                ? 'Offline · showing cached hazards'
                : error}
          </Text>
          {error ? (
            <Pressable onPress={history.refresh} hitSlop={8}>
              <Text style={styles.statusRetry}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={styles.tabBar}>
        <Pressable
          style={[
            styles.controlButton,
            drawer === 'list' && styles.controlButtonActive,
          ]}
          onPress={() => toggleDrawer('list')}
        >
          <Text style={styles.controlButtonText}>
            {drawer === 'list' ? '▾ List' : '▸ List'}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.controlButton,
            (drawer === 'events' || viewMode === 'event') &&
            styles.eventsButtonActive,
          ]}
          onPress={() => toggleDrawer('events')}
        >
          <Text style={styles.controlButtonText}>Events</Text>
        </Pressable>

        <Pressable
          style={[
            styles.controlButton,
            drawer === 'archive' && styles.controlButtonActive,
          ]}
          onPress={() => toggleDrawer('archive')}
        >
          <Text style={styles.controlButtonText}>30d</Text>
        </Pressable>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {recentDays.map((d, i) => {
            const active =
              (i === 0 && viewMode === 'live') ||
              (viewMode === 'date' && selectedDate === d.dateKey);
            return (
              <Pressable
                key={d.dateKey}
                onPress={() => history.selectDate(d.dateKey)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {d.label}
                </Text>
                <Text style={[styles.badge, active && styles.tabTextActive]}>
                  {d.count} hazard{d.count === 1 ? '' : 's'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function HazardCard({
  hazard,
  onClose,
}: {
  hazard: Hazard;
  onClose: () => void;
}) {
  const meta = HAZARD_META[hazard.type];
  const active = hazard.status === 'active';
  const sourceBadge = SOURCE_BADGE_META[hazard.sourceType ?? 'weather_auto'];
  const sevColor = severityColor(hazard.severity);
  const locationLine = [hazard.barangay, hazard.city].filter(Boolean).join(' · ');

  const openSource = () => {
    if (!hazard.sourceUrl) return;
    void Linking.openURL(hazard.sourceUrl).catch(() => {
      Alert.alert(
        'Link unavailable',
        'Could not open the official source URL.',
      );
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={[styles.cardType, { color: meta.color }]}>
            {meta.glyph} {meta.label}
          </Text>
          <View
            style={[
              styles.sourceBadge,
              { backgroundColor: sourceBadge.bg },
            ]}
          >
            <Text style={[styles.sourceBadgeText, { color: sourceBadge.fg }]}>
              {sourceBadge.shortLabel}
            </Text>
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      <Text style={styles.cardTitle}>{hazard.title}</Text>
      {locationLine ? (
        <Text style={styles.cardLocation}>📍 {locationLine}</Text>
      ) : null}
      <Text style={styles.cardDesc}>{hazard.description}</Text>

      <View style={styles.cardMetaRow}>
        <Text style={styles.cardMeta}>
          Source: {hazard.sourceName ?? sourceBadge.shortLabel}
        </Text>
      </View>
      <Text style={styles.cardMeta}>
        Started: {formatTimestamp(hazard.reportedAt)}
      </Text>
      {hazard.resolvedAt && (
        <Text style={styles.cardMeta}>
          Resolved: {formatTimestamp(hazard.resolvedAt)}
        </Text>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.cardPills}>
          <View
            style={[
              styles.sevPill,
              { backgroundColor: `${sevColor}20`, borderColor: sevColor },
            ]}
          >
            <Text style={[styles.sevPillText, { color: sevColor }]}>
              {hazard.severity}
            </Text>
          </View>
          <Text
            style={[
              styles.status,
              {
                backgroundColor: active ? '#FDE8E8' : '#E5E7EB',
                color: active ? '#B91C1C' : '#4B5563',
              },
            ]}
          >
            {active ? 'Active' : 'Resolved'}
          </Text>
        </View>

        {hazard.sourceUrl ? (
          <Pressable style={styles.sourceLinkBtn} onPress={openSource}>
            <Text style={styles.sourceLinkText}>Official Source ↗</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, gap: 8, zIndex: 20 },
  drawer: {
    maxHeight: 260,
    marginHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  drawerTitle: {
    flex: 1,
    fontWeight: '700',
    fontSize: 13,
    color: '#111827',
  },
  drawerClose: { fontSize: 15, color: '#6B7280', fontWeight: '700' },
  empty: { color: '#6B7280', paddingVertical: 8, fontSize: 12 },
  group: { marginBottom: 8 },
  groupTitle: { fontWeight: '700', fontSize: 12, marginBottom: 4 },
  row: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8 },
  rowActive: { backgroundColor: '#E0E7FF' },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  rowTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: '#111827' },
  rowMeta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  miniSourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  miniSourceText: { fontSize: 9, fontWeight: '800' },
  eventRow: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  eventRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#111827' },
  eventMeta: { fontSize: 11, fontWeight: '600', color: '#374151', marginTop: 2 },
  eventSubMeta: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  archiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  archiveDate: { fontSize: 12, fontWeight: '600', color: '#111827' },
  archiveRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  archiveDot: { width: 8, height: 8, borderRadius: 4 },
  archiveCount: { fontSize: 12, color: '#4B5563', fontWeight: '600' },
  eventBanner: {
    marginHorizontal: 12,
    backgroundColor: 'rgba(88, 28, 135, 0.94)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(216, 180, 254, 0.35)',
  },
  eventBannerText: { flex: 1 },
  eventBannerTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  eventBannerSub: { color: '#E9D5FF', fontSize: 10, marginTop: 1 },
  eventBannerBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  eventBannerLiveBtn: { backgroundColor: '#BE123C' },
  eventBannerBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  statusStrip: {
    marginHorizontal: 12,
    backgroundColor: 'rgba(17,24,39,0.88)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusStripText: { flex: 1, color: '#E5E7EB', fontSize: 11 },
  statusRetry: { color: '#C084FC', fontSize: 11, fontWeight: '800' },
  tabBar: {
    marginHorizontal: 12,
    backgroundColor: 'rgba(17,24,39,0.92)',
    borderRadius: 14,
    padding: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlButton: {
    paddingHorizontal: 9,
    paddingVertical: 9,
    marginRight: 5,
    borderRadius: 10,
    backgroundColor: '#374151',
  },
  controlButtonActive: { backgroundColor: '#4B5563' },
  eventsButtonActive: { backgroundColor: '#6D28D9' },
  controlButtonText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  tab: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 6,
    backgroundColor: '#1F2937',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#fff' },
  tabText: { color: '#E5E7EB', fontWeight: '700', fontSize: 12 },
  tabTextActive: { color: '#111827' },
  badge: { color: '#9CA3AF', fontSize: 10, marginTop: 1 },
  card: {
    marginHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  cardType: { fontWeight: '700', fontSize: 12 },
  sourceBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  sourceBadgeText: { fontSize: 10, fontWeight: '800' },
  close: { fontSize: 16, color: '#6B7280' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 2 },
  cardLocation: { fontSize: 12, fontWeight: '600', color: '#374151' },
  cardDesc: { fontSize: 12, color: '#374151', lineHeight: 17 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  cardMeta: { fontSize: 11, color: '#6B7280' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 8,
  },
  cardPills: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sevPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  sevPillText: { fontSize: 11, fontWeight: '800' },
  status: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  sourceLinkBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
  },
  sourceLinkText: { color: '#4338CA', fontSize: 11, fontWeight: '700' },
});
