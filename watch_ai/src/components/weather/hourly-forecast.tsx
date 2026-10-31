import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  BLOCK_LABELS,
  HourTheme,
  SunTimes,
  formatHourLabel,
  getHourTheme,
  weatherGlyph,
} from '../../lib/solar-theme';

export interface HourlyForecastItem {
  id: string;
  /** Local ISO timestamp, e.g. "2026-10-29T14:00". */
  iso: string;
  tempC: number;
  /** 0..100 chance of precipitation. */
  precipitationChance: number;
  precipitationMm?: number;
  /** WMO weather code. */
  weatherCode: number;
}

interface Props {
  items: HourlyForecastItem[];
  /** Sunrise/sunset for the day an hourly timestamp falls on. */
  sunTimesFor: (iso: string) => SunTimes;
  /** Theme for the whole screen; drives text/surface colors so the list always has contrast. */
  theme: HourTheme;
  selectedId?: string;
  onSelect?: (item: HourlyForecastItem) => void;
  orientation?: 'horizontal' | 'vertical';
  /** The first item is labelled "Now". */
  firstIsNow?: boolean;
}

export function HourlyForecast({
  items,
  sunTimesFor,
  theme,
  selectedId,
  onSelect,
  orientation = 'horizontal',
  firstIsNow = true,
}: Props) {
  const horizontal = orientation === 'horizontal';

  const cards = items.map((item, index) => {
    const sun = sunTimesFor(item.iso);
    const hourTheme = getHourTheme(item.iso, sun);
    const selected = item.id === selectedId;
    const glyph = weatherGlyph(item.weatherCode, item.iso, sun);
    const label = formatHourLabel(item.iso, firstIsNow && index === 0);
    // Mark where the time-of-day block changes so the list reads as a day timeline.
    const startsBlock = index === 0 || getHourTheme(items[index - 1].iso, sunTimesFor(items[index - 1].iso)).block !== hourTheme.block;
    const rain = Math.round(item.precipitationChance);

    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.85}
        onPress={() => onSelect?.(item)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${label}, ${Math.round(item.tempC)} degrees, ${rain} percent chance of rain`}
        style={[
          horizontal ? styles.cardH : styles.cardV,
          {
            backgroundColor: theme.surface.card,
            borderColor: selected ? theme.surface.borderSelected : theme.surface.border,
          },
          selected && { backgroundColor: theme.surface.cardSelected },
        ]}
      >
        {/* A thin strip in the card's own sky color shows its time-of-day block. */}
        <LinearGradient
          colors={[hourTheme.bgGradient[1], hourTheme.bgGradient[2]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={horizontal ? styles.stripH : styles.stripV}
        />

        <View style={horizontal ? styles.colH : styles.rowV}>
          <View style={horizontal ? undefined : styles.labelColV}>
            <Text style={[styles.time, { color: selected ? theme.text.primary : theme.text.secondary }]}>
              {label}
            </Text>
            {startsBlock && (
              <Text style={[styles.block, { color: theme.text.accent }]} numberOfLines={1}>
                {BLOCK_LABELS[hourTheme.block]}
              </Text>
            )}
          </View>

          <Text style={horizontal ? styles.glyphH : styles.glyphV}>{glyph}</Text>

          <View style={horizontal ? styles.rainBoxH : styles.rainBoxV}>
            {rain >= 5 ? (
              <Text style={[styles.rain, { color: theme.text.accent }]}>💧 {rain}%</Text>
            ) : (
              <Text style={[styles.rain, { color: theme.text.muted }]}>—</Text>
            )}
            {!!item.precipitationMm && item.precipitationMm > 0 && (
              <Text style={[styles.rainMm, { color: theme.text.muted }]}>
                {item.precipitationMm.toFixed(1)} mm
              </Text>
            )}
          </View>

          <Text style={[styles.temp, { color: theme.text.primary }]}>{Math.round(item.tempC)}°</Text>
        </View>
      </TouchableOpacity>
    );
  });

  if (horizontal) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listH}
      >
        {cards}
      </ScrollView>
    );
  }
  return <View style={styles.listV}>{cards}</View>;
}

const styles = StyleSheet.create({
  listH: { gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  listV: { gap: 8 },
  cardH: {
    width: 74,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 12,
  },
  cardV: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stripH: { height: 4, width: '100%' },
  stripV: { height: '100%', width: 4, position: 'absolute', left: 0, top: 0 },
  colH: { alignItems: 'center', paddingTop: 10, gap: 6 },
  rowV: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 14,
    gap: 10,
  },
  labelColV: { width: 84 },
  time: { fontSize: 12, fontWeight: '600' },
  block: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4, marginTop: 1, maxWidth: 70, textAlign: 'center' },
  glyphH: { fontSize: 26, marginVertical: 2 },
  glyphV: { fontSize: 24 },
  rainBoxH: { minHeight: 30, alignItems: 'center', justifyContent: 'center' },
  rainBoxV: { flex: 1, alignItems: 'flex-start' },
  rain: { fontSize: 11, fontWeight: '600' },
  rainMm: { fontSize: 9, marginTop: 1 },
  temp: { fontSize: 17, fontWeight: '700' },
});
