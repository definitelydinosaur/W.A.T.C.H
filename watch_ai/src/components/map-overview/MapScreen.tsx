import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView from './MapView';
import BottomSheet, { SheetSnap } from './BottomSheet';
import {
  HazardSeverity,
  MapFocus,
  MapHazard,
  MapStyleKey,
  SEVERITY_COLOR,
  SEVERITY_RANK,
} from './types';
import supabase from '../../lib/supabase';
import { profileApi } from '../../lib/profile-api';
import { Forecast, fetchForecast } from '../../lib/weather';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const SEARCH_DEBOUNCE_MS = 350;
const HAZARD_REFRESH_MS = 60_000;
const NEARBY_KM = 30;

interface Place {
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
}

interface Suggestion extends Place {
  key: string;
}

interface HazardRow {
  id: string;
  event_type: string | null;
  severity: string | null;
  description: string | null;
  location_lat: number | null;
  location_lon: number | null;
  detected_at: string | null;
}

interface HomeHazard {
  id: string;
  hazard?: {
    hazard_type: string;
    risk_level: string;
    safety_tips: string[];
  } | null;
}

const STYLE_OPTIONS: { key: MapStyleKey; label: string; group: string }[] = [
  { key: 'streets', label: 'Streets', group: 'Vector' },
  { key: 'dark', label: 'Dark', group: 'Vector' },
  { key: 'satellite', label: 'Satellite', group: 'Imagery' },
  { key: 'hybrid', label: 'Hybrid', group: 'Imagery' },
];

const DEFAULT_PLACE: Place = {
  name: 'Cebu City',
  detail: 'Cebu, Philippines',
  latitude: 10.3157,
  longitude: 123.8854,
};

const isSeverity = (value: string | null): value is HazardSeverity =>
  value === 'Advisory' ||
  value === 'Warning' ||
  value === 'Severe' ||
  value === 'Extreme';

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Parses direct coordinate queries like "10.3157, 123.8854". */
function parseCoordinates(text: string): Place | null {
  const match = text.match(
    /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/,
  );
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {
    name: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    detail: 'Fly to coordinates',
    latitude,
    longitude,
  };
}

function timeAgo(iso: string) {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - Date.parse(iso)) / 60_000),
  );
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

const humanize = (eventType: string) =>
  eventType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  const [place, setPlace] = useState<Place>(DEFAULT_PLACE);
  const [focus, setFocus] = useState<MapFocus>({
    latitude: DEFAULT_PLACE.latitude,
    longitude: DEFAULT_PLACE.longitude,
    token: 0,
  });
  const [homeCoordinates, setHomeCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [homeHazard, setHomeHazard] = useState<HomeHazard | null>(null);

  const [mapStyle, setMapStyle] = useState<MapStyleKey>('streets');
  const [styleOpen, setStyleOpen] = useState(false);
  const [showHazards, setShowHazards] = useState(true);
  const [snap, setSnap] = useState<SheetSnap>('peek');

  const [hazards, setHazards] = useState<MapHazard[]>([]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [forecastFailed, setForecastFailed] = useState(false);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const pickedName = useRef('');

  const flyTo = useCallback((next: Place, span = 0.01) => {
    setPlace(next);
    setFocus((previous) => ({
      latitude: next.latitude,
      longitude: next.longitude,
      span,
      token: previous.token + 1,
    }));
  }, []);

  // Load saved home location & personal alert safety tips
  useEffect(() => {
    let active = true;
    void profileApi<{
      profile: {
        home_location: {
          address: string;
          city: string | null;
          latitude: number;
          longitude: number;
        } | null;
      };
    }>('/profile')
      .then(({ profile }) => {
        const home = profile.home_location;
        if (!active || !home) return;
        setHomeCoordinates({
          latitude: home.latitude,
          longitude: home.longitude,
        });
        flyTo(
          {
            name: home.city || home.address.split(',')[0] || 'Home',
            detail: home.address,
            latitude: home.latitude,
            longitude: home.longitude,
          },
          0.02,
        );
      })
      .catch((error: unknown) =>
        console.warn('Unable to load home location:', error),
      );
    void profileApi<{ alerts: HomeHazard[] }>('/alerts')
      .then(({ alerts }) => {
        if (active) {
          setHomeHazard(
            alerts.find((a) => a.hazard?.safety_tips?.length) ?? null,
          );
        }
      })
      .catch((error: unknown) =>
        console.warn('Unable to load safety tips:', error),
      );
    return () => {
      active = false;
    };
  }, [flyTo]);

  // Poll active hazards from Supabase `hazards` table
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase
        .from('hazards')
        .select(
          'id, event_type, severity, description, location_lat, location_lon, detected_at',
        )
        .is('resolved_at', null)
        .not('location_lat', 'is', null)
        .not('location_lon', 'is', null)
        .order('detected_at', { ascending: false })
        .limit(200);
      if (!active) return;
      if (error) {
        console.warn('Unable to load hazards:', error.message);
        return;
      }
      const rows = (data ?? []) as HazardRow[];
      setHazards(
        rows.flatMap((row) =>
          row.location_lat !== null &&
          row.location_lon !== null &&
          isSeverity(row.severity)
            ? [
                {
                  id: row.id,
                  eventType: row.event_type ?? 'WEATHER_HAZARD',
                  severity: row.severity,
                  description:
                    row.description ?? 'Weather threshold breached.',
                  latitude: row.location_lat,
                  longitude: row.location_lon,
                  detectedAt: row.detected_at ?? new Date().toISOString(),
                },
              ]
            : [],
        ),
      );
    };
    void load();
    const interval = setInterval(() => void load(), HAZARD_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Fetch live weather metrics for the selected place
  useEffect(() => {
    const controller = new AbortController();
    setForecast(null);
    setForecastFailed(false);
    fetchForecast(controller.signal, {
      latitude: place.latitude,
      longitude: place.longitude,
    })
      .then(setForecast)
      .catch(() => {
        if (!controller.signal.aborted) setForecastFailed(true);
      });
    return () => controller.abort();
  }, [place.latitude, place.longitude]);

  // Debounced autocomplete & coordinate geocoding
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2 || text === pickedName.current) {
      setSuggestions([]);
      setSearchMessage('');
      setSearching(false);
      return;
    }
    const coordinates = parseCoordinates(text);
    if (coordinates) {
      setSuggestions([{ ...coordinates, key: 'coordinates' }]);
      setSearchMessage('');
      return;
    }
    if (!API_URL) {
      setSearchMessage('Set EXPO_PUBLIC_API_URL to enable place search.');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `${API_URL}/map/suggest?kind=location&query=${encodeURIComponent(text)}`,
          { signal: controller.signal },
        );
        const body = (await response.json()) as
          | {
              name: string;
              detail: string;
              address: string;
              latitude: number;
              longitude: number;
            }[]
          | { message?: string };
        if (!response.ok || !Array.isArray(body)) {
          throw new Error(
            (!Array.isArray(body) && body.message) || 'Search is unavailable.',
          );
        }
        setSuggestions(
          body.map((item) => ({
            key: `${item.latitude},${item.longitude},${item.name}`,
            name: item.name,
            detail: item.detail || item.address,
            latitude: item.latitude,
            longitude: item.longitude,
          })),
        );
        setSearchMessage(body.length ? '' : 'No places found.');
      } catch (error) {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setSearchMessage(
          error instanceof Error ? error.message : 'Search is unavailable.',
        );
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const selectSuggestion = (item: Suggestion) => {
    Keyboard.dismiss();
    pickedName.current = item.name;
    setQuery(item.name);
    setSuggestions([]);
    setSearchOpen(false);
    flyTo(item, 0.008);
    setSnap((current) => (current === 'peek' ? 'half' : current));
  };

  const submitQuery = async () => {
    const text = query.trim();
    if (!text) return;
    if (suggestions.length > 0) {
      selectSuggestion(suggestions[0]);
      return;
    }
    const coords = parseCoordinates(text);
    if (coords) {
      selectSuggestion({ ...coords, key: 'coordinates' });
      return;
    }
    if (!API_URL) return;
    Keyboard.dismiss();
    setSearching(true);
    try {
      const response = await fetch(
        `${API_URL}/map/geocode?query=${encodeURIComponent(text)}`,
      );
      const result = (await response.json()) as {
        name?: string;
        latitude?: number;
        longitude?: number;
        message?: string;
      };
      if (
        !response.ok ||
        typeof result.latitude !== 'number' ||
        typeof result.longitude !== 'number'
      ) {
        throw new Error(result.message ?? 'Location not found.');
      }
      const resolved: Suggestion = {
        key: `${result.latitude},${result.longitude}`,
        name: result.name ?? text,
        detail: `${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}`,
        latitude: result.latitude,
        longitude: result.longitude,
      };
      selectSuggestion(resolved);
    } catch (error) {
      setSearchMessage(
        error instanceof Error ? error.message : 'Location search failed.',
      );
    } finally {
      setSearching(false);
    }
  };

  const selectHazard = useCallback(
    (id: string) => {
      const hazard = hazards.find((item) => item.id === id);
      if (!hazard) return;
      flyTo(
        {
          name: humanize(hazard.eventType),
          detail: `${hazard.latitude.toFixed(4)}, ${hazard.longitude.toFixed(4)}`,
          latitude: hazard.latitude,
          longitude: hazard.longitude,
        },
        0.025,
      );
      setSnap('half');
    },
    [flyTo, hazards],
  );

  const nearbyHazards = useMemo(
    () =>
      hazards
        .filter(
          (hazard) =>
            distanceKm(
              place.latitude,
              place.longitude,
              hazard.latitude,
              hazard.longitude,
            ) <= NEARBY_KM,
        )
        .sort(
          (a, b) =>
            SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
            Date.parse(b.detectedAt) - Date.parse(a.detectedAt),
        ),
    [hazards, place.latitude, place.longitude],
  );

  const status = useMemo(() => {
    const top = nearbyHazards[0];
    if (top) {
      return {
        label: `${top.severity} · ${humanize(top.eventType)}`,
        color: SEVERITY_COLOR[top.severity],
      };
    }
    if (forecast && forecast.risk.level !== 'Normal') {
      const level = forecast.risk.level as HazardSeverity;
      return {
        label: `${forecast.risk.level} Risk`,
        color: SEVERITY_COLOR[level] ?? '#F2994A',
      };
    }
    return {
      label: forecastFailed ? 'Status unavailable' : 'Normal · Clear',
      color: forecastFailed ? '#9CA3AF' : '#34D399',
    };
  }, [nearbyHazards, forecast, forecastFailed]);

  const showingHomeArea = Boolean(
    homeCoordinates &&
      distanceKm(
        place.latitude,
        place.longitude,
        homeCoordinates.latitude,
        homeCoordinates.longitude,
      ) < 15,
  );

  // Lowered floating search bar (top: insets.top + 16, clearing camera notch)
  const searchTop = Math.max(insets.top + 16, 56);

  // 3 Snap Points: ['15%', '45%', '85%']
  const peekHeight = Math.max(Math.round(screenHeight * 0.15), 116 + insets.bottom);
  const halfHeight = Math.round(screenHeight * 0.45);
  const fullHeight = Math.round(screenHeight * 0.85);

  const metrics = forecast
    ? [
        {
          label: 'RAIN RATE',
          value: `${forecast.current.precipitationMm.toFixed(1)} mm/hr`,
        },
        {
          label: 'WIND SPEED',
          value: `${Math.round(forecast.current.windKph)} km/h ${forecast.current.windDirection}`,
        },
        {
          label: 'HEAT INDEX',
          value: `${Math.round(forecast.riskMeasurements.heatIndexC)}°C`,
        },
        {
          label: 'TEMPERATURE',
          value: `${Math.round(forecast.current.temperatureC)}°C (${Math.round(forecast.current.humidityPercent)}% RH)`,
        },
      ]
    : [];

  return (
    <View style={styles.screen}>
      <MapView
        latitude={place.latitude}
        longitude={place.longitude}
        label={place.name}
        mapStyle={mapStyle}
        focus={focus}
        hazards={hazards}
        showHazards={showHazards}
        onHazardPress={selectHazard}
      />

      {/* Lowered Floating Glassmorphic Search Bar */}
      <View
        style={[styles.searchWrap, { top: searchTop }]}
        pointerEvents="box-none"
      >
        <View style={styles.searchBar}>
          <BlurView
            intensity={65}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/home')
            }
          >
            <Text style={styles.iconText}>⌂</Text>
          </Pressable>
          <TextInput
            value={query}
            onChangeText={(text) => {
              pickedName.current = '';
              setQuery(text);
              setSearchOpen(true);
            }}
            onFocus={() => {
              setSearchOpen(true);
              setStyleOpen(false);
            }}
            onSubmitEditing={() => void submitQuery()}
            placeholder="Search barangay, city, or lat, lon…"
            placeholderTextColor="rgba(255,255,255,0.58)"
            returnKeyType="search"
            autoCorrect={false}
            style={styles.input}
            accessibilityLabel="Search map location"
          />
          {searching ? (
            <ActivityIndicator color="#C084FC" style={styles.spinner} />
          ) : query ? (
            <Pressable
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => {
                pickedName.current = '';
                setQuery('');
                setSuggestions([]);
                setSearchMessage('');
              }}
            >
              <Text style={styles.iconText}>✕</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Run search"
              onPress={() => void submitQuery()}
            >
              <Text style={styles.iconText}>⌕</Text>
            </Pressable>
          )}
        </View>

        {searchOpen && (suggestions.length > 0 || searchMessage) ? (
          <View style={styles.resultsCard}>
            <BlurView
              intensity={75}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            {suggestions.map((item) => (
              <Pressable
                key={item.key}
                style={styles.resultRow}
                onPress={() => selectSuggestion(item)}
              >
                <Text style={styles.resultName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.detail ? (
                  <Text style={styles.resultDetail} numberOfLines={1}>
                    {item.detail}
                  </Text>
                ) : null}
              </Pressable>
            ))}
            {searchMessage ? (
              <Text style={styles.resultMessage}>{searchMessage}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Floating Map Controls (Style Switcher & Hazards Toggle) */}
      <View
        style={[styles.controlsColumn, { top: searchTop + 62 }]}
        pointerEvents="box-none"
      >
        <Pressable
          style={styles.styleButton}
          accessibilityRole="button"
          accessibilityLabel="Switch map style"
          accessibilityState={{ expanded: styleOpen }}
          onPress={() => {
            Keyboard.dismiss();
            setSearchOpen(false);
            setStyleOpen((open) => !open);
          }}
        >
          <Text style={styles.styleGlyph}>◩</Text>
          <Text style={styles.styleButtonLabel}>
            {STYLE_OPTIONS.find((o) => o.key === mapStyle)?.label ?? 'Style'}
          </Text>
        </Pressable>

        {styleOpen ? (
          <View style={styles.stylePopover}>
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            {(['Vector', 'Imagery'] as const).map((group) => (
              <View key={group}>
                <Text style={styles.popoverGroup}>{group}</Text>
                {STYLE_OPTIONS.filter((o) => o.group === group).map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={styles.popoverRow}
                    onPress={() => {
                      setMapStyle(opt.key);
                      setStyleOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.popoverLabel,
                        mapStyle === opt.key && styles.popoverLabelActive,
                      ]}
                    >
                      {mapStyle === opt.key ? '● ' : '○ '}
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          style={[
            styles.hazardToggle,
            showHazards ? styles.hazardToggleOn : styles.hazardToggleOff,
          ]}
          accessibilityRole="switch"
          accessibilityLabel="Toggle hazard overlays"
          accessibilityState={{ checked: showHazards }}
          onPress={() => setShowHazards((on) => !on)}
        >
          <View
            style={[
              styles.hazardIndicatorDot,
              { backgroundColor: showHazards ? '#FFFFFF' : '#9CA3AF' },
            ]}
          />
          <Text
            style={[
              styles.hazardToggleText,
              showHazards && styles.hazardToggleTextOn,
            ]}
          >
            Hazards {showHazards ? 'ON' : 'OFF'}
          </Text>
        </Pressable>
      </View>

      {/* 3-Snap Contextual Bottom Sheet (15% Peek / 45% Half / 85% Full) */}
      <BottomSheet
        snap={snap}
        onSnapChange={setSnap}
        peekHeight={peekHeight}
        halfHeight={halfHeight}
        fullHeight={fullHeight}
        bottomInset={insets.bottom}
        header={
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleBlock}>
              <Text style={styles.placeTitle} numberOfLines={1}>
                {place.name}
              </Text>
              <Text style={styles.placeSubtitle} numberOfLines={1}>
                {place.detail ||
                  `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: `${status.color}24`,
                  borderColor: status.color,
                },
              ]}
            >
              <View
                style={[styles.statusDot, { backgroundColor: status.color }]}
              />
              <Text
                style={[styles.statusBadgeText, { color: status.color }]}
                numberOfLines={1}
              >
                {status.label}
              </Text>
            </View>
          </View>
        }
      >
        <ScrollView
          scrollEnabled={snap === 'full'}
          showsVerticalScrollIndicator={snap === 'full'}
          contentContainerStyle={styles.sheetContent}
        >
          {/* Mid-Expanded Section: Contextual Weather Metrics & Quick Summary */}
          <Text style={styles.sectionHeading}>CONTEXTUAL WEATHER METRICS</Text>
          {forecast ? (
            <View style={styles.metricGrid}>
              {metrics.map((m) => (
                <View key={m.label} style={styles.metricCard}>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                  <Text style={styles.metricValue}>{m.value}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.mutedText}>
              {forecastFailed
                ? 'Live weather metrics are currently unavailable.'
                : 'Loading live weather metrics…'}
            </Text>
          )}

          {forecast?.risk ? (
            <View style={styles.summaryBanner}>
              <Text style={styles.summaryTitle}>
                Risk Summary · {forecast.risk.level}
              </Text>
              <Text style={styles.summaryBody}>{forecast.risk.reason}</Text>
            </View>
          ) : null}

          {/* Fully-Expanded Section: Active Hazard Logs, Local Advisories & Safety Breakdown */}
          <Text style={styles.sectionHeading}>
            ACTIVE HAZARD LOGS ({nearbyHazards.length})
          </Text>
          {nearbyHazards.length === 0 ? (
            <Text style={styles.mutedText}>
              No active hazard events logged within {NEARBY_KM} km of this
              location.
            </Text>
          ) : (
            nearbyHazards.map((hazard) => (
              <Pressable
                key={hazard.id}
                style={[
                  styles.hazardCard,
                  { borderLeftColor: SEVERITY_COLOR[hazard.severity] },
                ]}
                onPress={() => selectHazard(hazard.id)}
              >
                <View style={styles.hazardCardHeader}>
                  <Text style={styles.hazardCardTitle}>
                    {humanize(hazard.eventType)}
                  </Text>
                  <Text
                    style={[
                      styles.hazardSeverityTag,
                      { color: SEVERITY_COLOR[hazard.severity] },
                    ]}
                  >
                    {hazard.severity} · {timeAgo(hazard.detectedAt)}
                  </Text>
                </View>
                <Text style={styles.hazardCardBody}>{hazard.description}</Text>
              </Pressable>
            ))
          )}

          <Text style={styles.sectionHeading}>
            LOCAL ADVISORY & SAFETY BREAKDOWN
          </Text>
          {showingHomeArea && homeHazard?.hazard ? (
            <View style={styles.advisoryCard}>
              <Text style={styles.advisoryTitle}>
                {homeHazard.hazard.hazard_type} · {homeHazard.hazard.risk_level}
              </Text>
              {homeHazard.hazard.safety_tips.slice(0, 3).map((tip) => (
                <Text key={tip} style={styles.advisoryTip}>
                  • {tip}
                </Text>
              ))}
            </View>
          ) : (
            <View style={styles.advisoryCard}>
              <Text style={styles.advisoryTip}>
                • Avoid low-lying or flood-prone streets during heavy downpours.
              </Text>
              <Text style={styles.advisoryTip}>
                • Stay clear of coastal areas, trees, and power lines during
                strong gusts.
              </Text>
              <Text style={styles.advisoryTip}>
                • Keep emergency contacts and a charged power bank accessible.
              </Text>
            </View>
          )}

          <Text style={styles.disclaimerText}>
            Always follow official PAGASA and local government (LGU) advisories.
            Map data © OpenStreetMap contributors.
          </Text>
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  searchWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: 'rgba(19, 24, 43, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  iconButton: {
    width: 46,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#E9D5FF',
    fontSize: 20,
    fontWeight: '700',
  },
  input: {
    flex: 1,
    height: 52,
    color: '#FFFFFF',
    fontSize: 14,
  },
  spinner: {
    marginHorizontal: 14,
  },
  resultsCard: {
    marginTop: 8,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(19, 24, 43, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  resultRow: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  resultName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  resultDetail: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    marginTop: 2,
  },
  resultMessage: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    padding: 14,
  },
  controlsColumn: {
    position: 'absolute',
    right: 16,
    alignItems: 'flex-end',
    gap: 10,
    zIndex: 25,
  },
  styleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: 'rgba(19, 24, 43, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  styleGlyph: {
    color: '#C084FC',
    fontSize: 16,
  },
  styleButtonLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  stylePopover: {
    minWidth: 158,
    padding: 8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(19, 24, 43, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  popoverGroup: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  popoverRow: {
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  popoverLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
  },
  popoverLabelActive: {
    color: '#C084FC',
    fontWeight: '800',
  },
  hazardToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  hazardToggleOn: {
    backgroundColor: '#BE123C',
    borderColor: '#FB7185',
  },
  hazardToggleOff: {
    backgroundColor: 'rgba(19, 24, 43, 0.86)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  hazardIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hazardToggleText: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 12,
    fontWeight: '800',
  },
  hazardToggleTextOn: {
    color: '#FFFFFF',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 6,
  },
  sheetTitleBlock: {
    flex: 1,
  },
  placeTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  placeSubtitle: {
    color: 'rgba(255, 255, 255, 0.64)',
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '48%',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    flexShrink: 1,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 44,
  },
  sectionHeading: {
    color: '#C084FC',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 16,
    marginBottom: 8,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  metricLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  summaryBanner: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(192, 132, 252, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(192, 132, 252, 0.28)',
  },
  summaryTitle: {
    color: '#F3E8FF',
    fontSize: 13,
    fontWeight: '800',
  },
  summaryBody: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  hazardCard: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderLeftWidth: 4,
  },
  hazardCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  hazardCardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  hazardSeverityTag: {
    fontSize: 11,
    fontWeight: '700',
  },
  hazardCardBody: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  advisoryCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 6,
  },
  advisoryTitle: {
    color: '#F3E8FF',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  advisoryTip: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    lineHeight: 18,
  },
  mutedText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
  },
  disclaimerText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 10,
    marginTop: 14,
    lineHeight: 15,
  },
});

