import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

const CEBU = { latitude: 10.3157, longitude: 123.8854 };
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

interface Forecast {
  updatedAt: string;
  stale: boolean;
  current: {
    temperatureC: number;
    feelsLikeC: number;
    humidityPercent: number;
    precipitationMm: number;
    windKph: number;
    weatherCode: number;
    uvIndex: number;
  };
  hourly: {
    time: string;
    temperatureC: number;
    precipitationProbability: number;
    weatherCode: number;
  }[];
  daily: {
    date: string;
    minC: number;
    maxC: number;
    precipitationProbability: number;
    weatherCode: number;
    sunrise: string;
    sunset: string;
  }[];
  risk: { level: string; reason: string };
  riskMeasurements: {
    rainMm: number;
    windKph: number;
    heatIndexC: number;
  };
}

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

  const loadForecast = useCallback(async (signal?: AbortSignal) => {
    if (!API_URL) {
      setError('Set EXPO_PUBLIC_API_URL to your backend URL.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const query = new URLSearchParams({
        latitude: String(CEBU.latitude),
        longitude: String(CEBU.longitude),
      });
      const response = await fetch(`${API_URL}/weather?${query}`, { signal });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? `Weather request failed (${response.status}).`);
      }
      setForecast((await response.json()) as Forecast);
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
    if (!forecast || !API_URL) return;
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

  const current = forecast?.current;
  const riskColor =
    forecast?.risk.level === 'Severe'
      ? '#FF668A'
      : forecast?.risk.level === 'Warning'
        ? '#FFB45A'
        : '#D2B0FF';

  return (
    <LinearGradient colors={['#17113C', '#52117A', '#190B37']} style={styles.screen}>
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
            <Text style={styles.eyebrow}>WEATHER WATCH</Text>
            <Text style={styles.city}>Cebu City</Text>
          </View>
          <Pressable style={styles.mapButton} onPress={() => router.push('/map-overview/index')}>
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
              <Text style={styles.condition}>{current ? weatherDescription(current.weatherCode) : 'Forecast unavailable'}</Text>
              <Text style={styles.temperature}>
                {current ? `${Math.round(current.temperatureC)}°` : '--°'}
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
                <View style={styles.forecastCard}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Hourly forecast</Text>
                    <Text style={styles.muted}>Next 24 hours</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.hourRow}>
                      {forecast.hourly.slice(0, 12).map((hour, index) => (
                        <View key={hour.time} style={styles.hourItem}>
                          <Text style={styles.hourTime}>
                            {index === 0 ? 'Now' : new Date(hour.time).toLocaleTimeString([], { hour: 'numeric' })}
                          </Text>
                          <Text style={styles.hourIcon}>{weatherIcon(hour.weatherCode)}</Text>
                          <Text style={styles.hourTemp}>{Math.round(hour.temperatureC)}°</Text>
                          <Text style={styles.rainChance}>{hour.precipitationProbability}%</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <View style={[styles.riskCard, { borderColor: riskColor }]}>
                  <Text style={styles.sectionTitle}>Weather risk · {forecast.risk.level}</Text>
                  <Text style={styles.muted}>{forecast.risk.reason}</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void loadSafetyGuidance()}
                    disabled={guidanceLoading}
                  >
                    <Text style={styles.guidanceButton}>
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
                  <Metric label="UV INDEX" value={`${current?.uvIndex ?? '--'}`} />
                  <Metric label="HUMIDITY" value={`${current?.humidityPercent ?? '--'}%`} />
                  <Metric label="WIND" value={`${current?.windKph ?? '--'} km/h`} />
                  <Metric label="RAIN NOW" value={`${current?.precipitationMm ?? '--'} mm`} />
                </View>

                <View style={styles.forecastCard}>
                  <Text style={styles.sectionTitle}>7-day forecast</Text>
                  {forecast.daily.map((day) => (
                    <View key={day.date} style={styles.dayRow}>
                      <Text style={styles.dayName}>
                        {new Date(day.date).toLocaleDateString([], { weekday: 'short' })}
                      </Text>
                      <Text style={styles.dayIcon}> {weatherIcon(day.weatherCode)} </Text>
                      <Text style={styles.muted}>{day.precipitationProbability}% rain</Text>
                      <Text style={styles.dayTemps}>{Math.round(day.minC)}° / {Math.round(day.maxC)}°</Text>
                    </View>
                  ))}
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
                {forecast?.stale && <Text style={styles.muted}>Showing the last available forecast.</Text>}
              </Pressable>
            ) : null}
            {forecast && (
              <Text style={styles.updatedAt}>
                {forecast.stale ? 'Last available update' : 'Updated'}{' '}
                {new Date(forecast.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                {' · Open-Meteo'}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function weatherDescription(code: number) {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorm';
}

function weatherIcon(code: number) {
  if (code === 0) return '☀';
  if (code <= 3) return '☁';
  if (code <= 48) return '≋';
  if (code <= 67 || (code >= 80 && code <= 82)) return '☂';
  return '⚡';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 40 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 24 },
  eyebrow: { color: '#D0B8E8', letterSpacing: 2, fontSize: 11, fontWeight: '700' },
  city: { color: '#FFFFFF', fontSize: 27, fontWeight: '700', marginTop: 5 },
  mapButton: { paddingHorizontal: 15, paddingVertical: 11, borderRadius: 20, backgroundColor: '#7200B7' },
  mapButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  hero: { alignItems: 'center', paddingBottom: 28 },
  condition: { color: '#E5D9F2', fontSize: 15 },
  temperature: { color: '#FFFFFF', fontSize: 86, lineHeight: 96, fontWeight: '200' },
  feelsLike: { color: '#E5D9F2', fontSize: 14 },
  highLow: { color: '#D5C2E7', fontSize: 13, marginTop: 6 },
  loading: { alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12 },
  muted: { color: '#D0C5DD', fontSize: 12 },
  forecastCard: { backgroundColor: 'rgba(42,20,72,0.78)', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  hourRow: { flexDirection: 'row', gap: 10 },
  hourItem: { minWidth: 52, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 5, borderRadius: 15, backgroundColor: 'rgba(119,0,185,0.4)' },
  hourTime: { color: '#E4D9EE', fontSize: 10 },
  hourIcon: { color: '#FFFFFF', fontSize: 20, marginVertical: 9 },
  hourTemp: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  rainChance: { color: '#D8BAFF', fontSize: 10, marginTop: 5 },
  riskCard: { backgroundColor: 'rgba(42,20,72,0.78)', borderWidth: 1, borderRadius: 18, padding: 16, gap: 8, marginBottom: 14 },
  guidanceButton: { alignSelf: 'flex-start', color: '#E8C9FF', fontSize: 13, fontWeight: '700', paddingVertical: 8 },
  guidanceContent: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)', paddingTop: 10 },
  guidanceExplanation: { color: '#FFFFFF', fontSize: 13, lineHeight: 19 },
  guidanceTip: { color: '#E7DDF0', fontSize: 12, lineHeight: 18 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  metric: { width: '48%', minHeight: 86, flexGrow: 1, backgroundColor: 'rgba(42,20,72,0.82)', borderRadius: 16, padding: 15, justifyContent: 'space-between' },
  metricLabel: { color: '#C8B4DC', fontSize: 10, letterSpacing: 1 },
  metricValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 42, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  dayName: { color: '#FFFFFF', width: 48, fontSize: 13 },
  dayIcon: { color: '#FFFFFF', fontSize: 16 },
  dayTemps: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  errorCard: { backgroundColor: '#56243E', padding: 14, borderRadius: 14, gap: 6 },
  errorText: { color: '#FFFFFF', fontSize: 13 },
  updatedAt: { color: '#C5B7D2', fontSize: 11, textAlign: 'center', marginTop: 5 },
});
