import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { WeatherBackdrop } from '../../components/sky';
import { HourlyForecast, HourlyForecastItem } from '../../components/weather/hourly-forecast';
import {
  getHourTheme,
  manilaIso,
  sunTimesForDate,
  weatherGlyph,
} from '../../lib/solar-theme';
import {
  CEBU,
  Forecast,
  aqiLabel,
  fetchForecast,
  uvLabel,
  weatherDescription,
} from '../../lib/weather';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const formatTime = (iso: string) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '--';

interface SafetyGuidance {
  explanation: string;
  safetyTips: string[];
  aiUnavailable?: boolean;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

export default function WeatherWatchScreen() {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [guidance, setGuidance] = useState<SafetyGuidance | null>(null);
  const [guidanceError, setGuidanceError] = useState('');
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [selectedHourId, setSelectedHourId] = useState<string>('h0');

  const [tab, setTab] = useState<'hourly' | 'weekly'>('hourly');

  const loadForecast = useCallback(async (signal?: AbortSignal) => {
    try {
      setForecast(await fetchForecast(signal));
      setError('');
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Weather is unavailable. Try again shortly.',
      );
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadSafetyGuidance = async () => {
    if (!forecast) return;
    if (!API_URL) {
      setGuidanceError('Safety guidance needs EXPO_PUBLIC_API_URL to be set.');
      return;
    }
    setGuidanceLoading(true);
    setGuidanceError('');
    const { riskMeasurements, risk } = forecast;
    const hazardType =
      riskMeasurements.windKph >= 39
        ? 'wind'
        : riskMeasurements.rainMm >= 15
          ? 'rain'
          : riskMeasurements.heatIndexC >= 33
            ? 'heat'
            : 'general';
    try {
      const response = await fetch(`${API_URL}/ai/hazard-guidance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riskLevel: risk.level,
          hazardType,
          measurements: {
            ...riskMeasurements,
            temperatureC: forecast.current.temperatureC,
            humidityPercent: forecast.current.humidityPercent,
          },
        }),
      });
      const result = (await response.json()) as SafetyGuidance & { message?: string };
      if (!response.ok) throw new Error(result.message ?? 'Safety guidance is unavailable.');
      setGuidance(result);
    } catch (loadError) {
      setGuidanceError(
        loadError instanceof Error ? loadError.message : 'Safety guidance is unavailable.',
      );
    } finally {
      setGuidanceLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = setTimeout(() => {
      void loadForecast(controller.signal);
    }, 0);
    const interval = setInterval(() => void loadForecast(), REFRESH_INTERVAL_MS);
    return () => {
      clearTimeout(initialLoad);
      controller.abort();
      clearInterval(interval);
    };
  }, [loadForecast]);

  const hourlyItems = useMemo<HourlyForecastItem[]>(
    () =>
      (forecast?.hourly ?? []).map((h, i) => ({
        id: `h${i}`,
        iso: h.time,
        tempC: h.temperatureC,
        precipitationChance: h.precipitationProbability,
        precipitationMm: h.precipitationMm,
        weatherCode: h.weatherCode,
      })),
    [forecast?.hourly],
  );

  const selectedHour = useMemo(
    () => hourlyItems.find((h) => h.id === selectedHourId) ?? hourlyItems[0],
    [hourlyItems, selectedHourId],
  );

  const current = forecast?.current;
  const activeIso = selectedHour?.iso ?? manilaIso();
  const activeSun = useMemo(
    () => sunTimesForDate(forecast?.daily, activeIso),
    [forecast?.daily, activeIso],
  );
  const theme = useMemo(() => getHourTheme(activeIso, activeSun), [activeIso, activeSun]);

  const activeWeatherCode = selectedHour ? selectedHour.weatherCode : (current?.weatherCode ?? 0);
  const activeTempC = selectedHour ? selectedHour.tempC : current?.temperatureC;
  const activePrecipMm = selectedHour
    ? (selectedHour.precipitationMm ?? 0)
    : (current?.precipitationMm ?? 0);

  const riskColor =
    forecast?.risk.level === 'Severe'
      ? '#FF668A'
      : forecast?.risk.level === 'Warning'
        ? '#FFB45A'
        : theme.text.accent;

  return (
    <View style={styles.screen}>
      <WeatherBackdrop
        iso={activeIso}
        sun={activeSun}
        theme={theme}
        weatherCode={activeWeatherCode}
        windKph={current?.windKph ?? 0}
        windDirection={current?.windDirection}
        precipitationMm={activePrecipMm}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#FFFFFF"
            onRefresh={() => {
              setRefreshing(true);
              void loadForecast();
            }}
          />
        }
      >
        <View style={styles.topRow}>
          <View>
            <Text style={[styles.eyebrow, { color: theme.text.accent }]}>
              WEATHER WATCH · {theme.badge}
            </Text>
            <Text style={styles.city}>{CEBU.name}</Text>
          </View>
          <Pressable style={styles.mapButton} onPress={() => router.push('/map-overview')}>
            <Text style={styles.mapButtonText}>Map overview</Text>
          </Pressable>
        </View>

        {loading && !forecast ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.muted}>Loading live forecast…</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.condition}>
                {current ? weatherDescription(activeWeatherCode) : 'Forecast unavailable'}
              </Text>
              <Text style={styles.temperature}>
                {typeof activeTempC === 'number' ? `${Math.round(activeTempC)}°` : '--°'}
              </Text>
              <Text style={styles.feelsLike}>
                Feels like {current ? `${Math.round(current.feelsLikeC)}°` : '--°'}
              </Text>
              {forecast?.daily[0] && (
                <Text style={styles.highLow}>
                  H:{Math.round(forecast.daily[0].maxC)}°  L:{Math.round(forecast.daily[0].minC)}°
                </Text>
              )}
            </View>

            {forecast && (
              <>
                <View
                  style={[
                    styles.forecastCard,
                    { backgroundColor: theme.surface.card, borderColor: theme.surface.border },
                  ]}
                >
                  <View style={styles.tabs}>
                    {(['hourly', 'weekly'] as const).map((key) => (
                      <Pressable
                        key={key}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: tab === key }}
                        onPress={() => setTab(key)}
                        style={[styles.tab, tab === key && styles.tabActive]}
                      >
                        <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
                          {key === 'hourly' ? 'Hourly' : 'Weekly'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {tab === 'hourly' ? (
                    <HourlyForecast
                      items={hourlyItems}
                      sunTimesFor={(iso) => sunTimesForDate(forecast.daily, iso)}
                      theme={theme}
                      selectedId={selectedHour?.id}
                      onSelect={(item) => setSelectedHourId(item.id)}
                    />
                  ) : (
                    forecast.daily.map((day) => (
                      <View key={day.date} style={styles.dayRow}>
                        <Text style={styles.dayName}>
                          {new Date(`${day.date}T00:00`).toLocaleDateString([], { weekday: 'short' })}
                        </Text>
                        <Text style={styles.dayIcon}>
                          {weatherGlyph(day.weatherCode, `${day.date}T12:00`, {
                            sunrise: day.sunrise,
                            sunset: day.sunset,
                          })}
                        </Text>
                        <Text style={styles.muted}>{day.precipitationProbability}% rain</Text>
                        <Text style={styles.dayTemps}>
                          {Math.round(day.minC)}° / {Math.round(day.maxC)}°
                        </Text>
                      </View>
                    ))
                  )}
                </View>

                <View
                  style={[
                    styles.riskCard,
                    { backgroundColor: theme.surface.card, borderColor: riskColor },
                  ]}
                >
                  <Text style={styles.sectionTitle}>Weather risk · {forecast.risk.level}</Text>
                  <Text style={styles.muted}>{forecast.risk.reason}</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void loadSafetyGuidance()}
                    disabled={guidanceLoading}
                  >
                    <Text style={[styles.guidanceButton, { color: theme.text.accent }]}>
                      {guidanceLoading ? 'Getting safety guidance…' : 'View safety guidance'}
                    </Text>
                  </Pressable>
                  {guidance && (
                    <View style={styles.guidanceContent}>
                      <Text style={styles.guidanceExplanation}>{guidance.explanation}</Text>
                      {guidance.safetyTips.map((tip) => (
                        <Text key={tip} style={styles.guidanceTip}>• {tip}</Text>
                      ))}
                      {guidance.aiUnavailable && (
                        <Text style={styles.muted}>Static guidance shown; AI is unavailable.</Text>
                      )}
                    </View>
                  )}
                  {guidanceError ? <Text style={styles.errorText}>{guidanceError}</Text> : null}
                </View>

                <View style={styles.metricGrid}>
                  <Metric
                    label="AIR QUALITY"
                    value={forecast.airQuality.aqi === null ? '--' : `${Math.round(forecast.airQuality.aqi)} AQI`}
                    note={aqiLabel(forecast.airQuality.aqi)}
                    cardColor={theme.surface.card}
                  />
                  <Metric
                    label="UV INDEX"
                    value={`${Math.round(current?.uvIndex ?? 0)}`}
                    note={uvLabel(current?.uvIndex ?? 0)}
                    cardColor={theme.surface.card}
                  />
                  <Metric
                    label="WIND"
                    value={`${Math.round(current?.windKph ?? 0)} km/h`}
                    note={current?.windDirection}
                    cardColor={theme.surface.card}
                  />
                  <Metric
                    label="RAINFALL"
                    value={`${current?.precipitationMm ?? 0} mm`}
                    note={`Today ${forecast.daily[0]?.precipitationMm ?? 0} mm`}
                    cardColor={theme.surface.card}
                  />
                  <Metric
                    label="SUNRISE"
                    value={formatTime(forecast.daily[0]?.sunrise ?? '')}
                    cardColor={theme.surface.card}
                  />
                  <Metric
                    label="SUNSET"
                    value={formatTime(forecast.daily[0]?.sunset ?? '')}
                    cardColor={theme.surface.card}
                  />
                  <Metric
                    label="HUMIDITY"
                    value={`${current?.humidityPercent ?? '--'}%`}
                    cardColor={theme.surface.card}
                  />
                </View>
              </>
            )}

            {error ? (
              <Pressable
                style={styles.errorCard}
                onPress={() => {
                  setRefreshing(true);
                  void loadForecast();
                }}
              >
                <Text style={styles.errorText}>{error} Tap to retry.</Text>
                {forecast && <Text style={styles.muted}>Showing the last available forecast.</Text>}
              </Pressable>
            ) : null}
            {forecast && (
              <Text style={styles.updatedAt}>
                {'Updated '}
                {new Date(forecast.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                {' · Open-Meteo'}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Metric({
  label,
  value,
  note,
  cardColor,
}: {
  label: string;
  value: string;
  note?: string;
  cardColor?: string;
}) {
  return (
    <View style={[styles.metric, cardColor ? { backgroundColor: cardColor } : undefined]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {note ? <Text style={styles.muted}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0D24' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 40 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 24 },
  eyebrow: { color: '#D0B8E8', letterSpacing: 1.6, fontSize: 11, fontWeight: '700' },
  city: { color: '#FFFFFF', fontSize: 27, fontWeight: '700', marginTop: 5 },
  mapButton: { paddingHorizontal: 15, paddingVertical: 11, borderRadius: 20, backgroundColor: 'rgba(114,0,183,0.75)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  mapButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  hero: { alignItems: 'center', paddingBottom: 28 },
  condition: { color: '#E5D9F2', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  temperature: { color: '#FFFFFF', fontSize: 86, lineHeight: 96, fontWeight: '200', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 10 },
  feelsLike: { color: '#E5D9F2', fontSize: 14 },
  highLow: { color: '#D5C2E7', fontSize: 13, marginTop: 6 },
  loading: { alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12 },
  muted: { color: 'rgba(255,255,255,0.72)', fontSize: 12 },
  tabs: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 14, padding: 4, marginBottom: 14 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  tabActive: { backgroundColor: 'rgba(114,0,183,0.85)' },
  tabText: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  forecastCard: { backgroundColor: 'rgba(42,20,72,0.72)', borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  riskCard: { backgroundColor: 'rgba(42,20,72,0.72)', borderWidth: 1, borderRadius: 18, padding: 16, gap: 8, marginBottom: 14 },
  guidanceButton: { alignSelf: 'flex-start', color: '#E8C9FF', fontSize: 13, fontWeight: '700', paddingVertical: 8 },
  guidanceContent: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)', paddingTop: 10 },
  guidanceExplanation: { color: '#FFFFFF', fontSize: 13, lineHeight: 19 },
  guidanceTip: { color: '#E7DDF0', fontSize: 12, lineHeight: 18 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  metric: { width: '48%', minHeight: 86, flexGrow: 1, backgroundColor: 'rgba(42,20,72,0.75)', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderRadius: 16, padding: 15, justifyContent: 'space-between' },
  metricLabel: { color: 'rgba(255,255,255,0.68)', fontSize: 10, letterSpacing: 1, fontWeight: '600' },
  metricValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 42, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  dayName: { color: '#FFFFFF', width: 48, fontSize: 13 },
  dayIcon: { color: '#FFFFFF', fontSize: 18 },
  dayTemps: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  errorCard: { backgroundColor: '#56243E', padding: 14, borderRadius: 14, gap: 6 },
  errorText: { color: '#FFFFFF', fontSize: 13 },
  updatedAt: { color: 'rgba(255,255,255,0.68)', fontSize: 11, textAlign: 'center', marginTop: 5 },
});
