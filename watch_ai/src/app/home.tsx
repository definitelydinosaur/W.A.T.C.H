import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useProfilePicture } from '../hooks/loadprofilepicture';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  Platform,
  Modal,
  Alert,
  Easing,
  PanResponder,
  FlatList,
  TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CEBU_LOCATIONS } from '../lib/cebu-locations';
import { WeatherBackdrop, compassToDeg } from '../components/sky';
import {
  getHourTheme,
  manilaIso,
  sunTimesForDate,
} from '../lib/solar-theme';
import {
  Forecast,
  aqiLabel,
  fetchForecast,
  uvLabel,
  weatherDescription,
} from '../lib/weather';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TAB_BAR_WIDTH = SCREEN_WIDTH + 80;
const TAB_BAR_HEIGHT = TAB_BAR_WIDTH * (345 / 1170);
const COLLAPSED_ENCLOSURE_HEIGHT = Math.max(
  Platform.OS === 'ios' ? 122 : 114,
  Math.ceil(TAB_BAR_HEIGHT * 0.6 + 72),
);
const EXPANDED_ENCLOSURE_HEIGHT = Math.min(SCREEN_HEIGHT * 0.72, 620);

const HOME_MENU_ITEMS = [
  { label: 'Home', image: require('../../assets/images/homepage/home.png') },
  { label: 'Alerts', image: require('../../assets/images/homepage/alert.png') },
  { label: 'Settings', image: require('../../assets/images/homepage/settings.png') },
  { label: 'Profile', image: require('../../assets/images/homepage/profile.png') },
];

interface CityData {
  name: string;
  country: string;
  temp: number;
  feelsLike: number;
  condition: string;
  high: number;
  low: number;
  uv: number;
  wind: number;
  windDir: string;
  humidity: number;
  airQuality: number;
  airQualityLabel: string;
  sunrise: string;
  sunset: string;
  rainNowMm?: number;
  rainTodayMm?: number;
  rainChance?: number;
  latitude: number;
  longitude: number;
}

const CITIES: CityData[] = CEBU_LOCATIONS.map((l) => ({
  name: l.name,
  country: l.area,
  latitude: l.latitude,
  longitude: l.longitude,
  temp: 28,
  feelsLike: 30,
  condition: 'Loading weather…',
  high: 31,
  low: 25,
  uv: 5,
  wind: 14,
  windDir: 'NE',
  humidity: 72,
  airQuality: 28,
  airQualityLabel: 'Good',
  sunrise: '5:45 AM',
  sunset: '5:35 PM',
}));

interface HourlyItem {
  id: string;
  time: string;
  iso: string;
  temp: number;
  rainChance?: string;
  precipitationMm?: number;
  weatherCode: number;
  condition: 'rain' | 'cloud-moon' | 'cloud' | 'sun';
  desc: string;
}

const BASE_HOURLY_DATA: HourlyItem[] = [
  { id: '2', time: 'Now', iso: '2026-10-31T13:00', temp: 29, weatherCode: 1, condition: 'sun', desc: 'Mostly Clear' },
  { id: 'h1', time: '2 PM', iso: '2026-10-31T14:00', temp: 30, weatherCode: 1, condition: 'sun', desc: 'Sunlit Sky' },
  { id: 'h2', time: '3 PM', iso: '2026-10-31T15:00', temp: 29, rainChance: '25%', precipitationMm: 0.3, weatherCode: 2, condition: 'cloud', desc: 'Partly Cloudy' },
  { id: 'h3', time: '4 PM', iso: '2026-10-31T16:00', temp: 28, rainChance: '30%', precipitationMm: 0.6, weatherCode: 2, condition: 'cloud', desc: 'Scattered Clouds' },
  { id: 'h4', time: '5 PM', iso: '2026-10-31T17:15', temp: 27, weatherCode: 1, condition: 'sun', desc: 'Golden Hour' },
  { id: 'h5', time: '6 PM', iso: '2026-10-31T18:00', temp: 26, weatherCode: 2, condition: 'cloud-moon', desc: 'Dusk Twilight' },
  { id: 'h6', time: '7 PM', iso: '2026-10-31T19:00', temp: 26, rainChance: '40%', precipitationMm: 1.2, weatherCode: 61, condition: 'rain', desc: 'Evening Showers' },
  { id: 'h7', time: '8 PM', iso: '2026-10-31T20:00', temp: 25, weatherCode: 1, condition: 'cloud-moon', desc: 'Starlit Night' },
  { id: 'h8', time: '9 PM', iso: '2026-10-31T21:00', temp: 25, weatherCode: 0, condition: 'cloud-moon', desc: 'Clear Night Sky' },
  { id: 'h9', time: '6 AM', iso: '2026-11-01T06:00', temp: 25, weatherCode: 0, condition: 'sun', desc: 'Morning Sunrise' },
];

interface DailyItem {
  id: string;
  day: string;
  condition: 'rain' | 'cloud-moon' | 'cloud' | 'sun';
  minTemp: number;
  maxTemp: number;
  rainChance?: string;
}

const DAILY_DATA: DailyItem[] = [
  { id: 'd0', day: 'Today', condition: 'sun', minTemp: 25, maxTemp: 31 },
  { id: 'd1', day: 'Sun', condition: 'rain', rainChance: '65%', minTemp: 24, maxTemp: 29 },
  { id: 'd2', day: 'Mon', condition: 'cloud', rainChance: '30%', minTemp: 25, maxTemp: 30 },
  { id: 'd3', day: 'Tue', condition: 'sun', minTemp: 25, maxTemp: 31 },
  { id: 'd4', day: 'Wed', condition: 'sun', minTemp: 26, maxTemp: 32 },
  { id: 'd5', day: 'Thu', condition: 'rain', rainChance: '50%', minTemp: 24, maxTemp: 29 },
  { id: 'd6', day: 'Fri', condition: 'cloud', minTemp: 25, maxTemp: 30 },
];

// Reusable High-Contrast iOS Glassmorphic Card
function LiquidGlassCard({
  children,
  style,
  tintColors,
  intensity = 65,
  shimmerAnim,
}: {
  children: React.ReactNode;
  style?: any;
  tintColors?: [string, string];
  intensity?: number;
  shimmerAnim?: Animated.Value;
}) {
  return (
    <View style={[styles.liquidGlassContainer, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={
          tintColors ?? [
            'rgba(18, 26, 52, 0.56)',
            'rgba(10, 15, 34, 0.72)',
          ]
        }
        start={{ x: 0.1, y: 0.0 }}
        end={{ x: 0.9, y: 1.0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.liquidSpecularTop} />
      <View style={styles.liquidSpecularLeft} />

      {shimmerAnim && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shimmerBeam,
            {
              transform: [{ translateX: shimmerAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255, 255, 255, 0)',
              'rgba(255, 255, 255, 0.06)',
              'rgba(255, 255, 255, 0.14)',
              'rgba(255, 255, 255, 0.06)',
              'rgba(255, 255, 255, 0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      {children}
    </View>
  );
}

// Stylized Animated Vector Weather Icon
function WeatherIcon({
  condition,
  size = 32,
  pulseAnim,
}: {
  condition: HourlyItem['condition'];
  size?: number;
  pulseAnim?: Animated.Value;
}) {
  if (condition === 'rain') {
    return (
      <View style={[styles.iconBox, { width: size, height: size }]}>
        <View style={styles.cloudShape} />
        <View style={styles.rainDropsRow}>
          <View style={styles.rainDrop} />
          <View style={[styles.rainDrop, { marginTop: 4 }]} />
          <View style={styles.rainDrop} />
        </View>
      </View>
    );
  }

  if (condition === 'sun') {
    return (
      <View style={[styles.iconBox, { width: size, height: size }]}>
        <Animated.View
          style={[
            styles.sunCircle,
            pulseAnim && {
              transform: [
                {
                  scale: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.12],
                  }),
                },
              ],
            },
          ]}
        />
        <View style={styles.sunRaysRing} />
      </View>
    );
  }

  if (condition === 'cloud') {
    return (
      <View style={[styles.iconBox, { width: size, height: size }]}>
        <View style={[styles.cloudShape, { backgroundColor: '#CBD5E8' }]} />
        <View style={[styles.cloudPuff, { left: 4, top: 4 }]} />
      </View>
    );
  }

  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      <View style={styles.crescentMoon} />
      <View style={[styles.cloudShape, { bottom: 2, right: 2, transform: [{ scale: 0.85 }] }]} />
    </View>
  );
}

// Apple Weather-style SVG Wind Radar Vector Dial
function WindRadarDial({
  windDir,
  windKph,
  swayAnim,
  accentColor,
}: {
  windDir: string;
  windKph: number;
  swayAnim: Animated.Value;
  accentColor: string;
}) {
  const fromDeg = compassToDeg(windDir) ?? 45;
  // Wind vector arrow points in the direction the wind blows toward
  const towardDeg = (fromDeg + 180) % 360;
  const rotate = swayAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [`${towardDeg - 5}deg`, `${towardDeg + 5}deg`],
  });

  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);

  return (
    <View style={styles.windDialBox}>
      <Svg width={108} height={108} viewBox="0 0 108 108">
        <Circle
          cx={54}
          cy={54}
          r={48}
          stroke="rgba(255,255,255,0.16)"
          strokeWidth={1.2}
          fill="rgba(8, 12, 28, 0.38)"
        />
        {ticks.map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const cardinal = deg % 90 === 0;
          const rOuter = 47;
          const rInner = cardinal ? 40 : 43;
          return (
            <Line
              key={deg}
              x1={54 + Math.cos(rad) * rInner}
              y1={54 + Math.sin(rad) * rInner}
              x2={54 + Math.cos(rad) * rOuter}
              y2={54 + Math.sin(rad) * rOuter}
              stroke={cardinal ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.28)'}
              strokeWidth={cardinal ? 1.6 : 1}
            />
          );
        })}
        <SvgText x={54} y={18} fill="#FF6B6B" fontSize="9" fontWeight="700" textAnchor="middle">
          N
        </SvgText>
        <SvgText x={92} y={57} fill="rgba(255,255,255,0.78)" fontSize="9" fontWeight="700" textAnchor="middle">
          E
        </SvgText>
        <SvgText x={54} y={97} fill="rgba(255,255,255,0.78)" fontSize="9" fontWeight="700" textAnchor="middle">
          S
        </SvgText>
        <SvgText x={16} y={57} fill="rgba(255,255,255,0.78)" fontSize="9" fontWeight="700" textAnchor="middle">
          W
        </SvgText>
      </Svg>

      {/* Animated Wind Vector Arrow */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}
      >
        <Svg width={108} height={108} viewBox="0 0 108 108">
          <G>
            <Line
              x1={54}
              y1={84}
              x2={54}
              y2={22}
              stroke={accentColor}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
            {/* Arrowhead pointing in wind travel direction */}
            <Polygon points="54,14 48,26 60,26" fill={accentColor} />
            {/* Tail ring */}
            <Circle cx={54} cy={85} r={3.5} stroke={accentColor} strokeWidth={1.8} fill="#0D132A" />
          </G>
        </Svg>
      </Animated.View>

      {/* Center Velocity Readout */}
      <View style={styles.windDialCenterBadge}>
        <Text style={styles.windDialSpeed}>{windKph}</Text>
        <Text style={styles.windDialUnit}>km/h</Text>
      </View>
    </View>
  );
}

const hourLabel = (iso: string) => {
  const h = parseInt(iso.slice(11, 13), 10);
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
};

const clockLabel = (iso: string) => {
  if (!iso) return '--';
  const m = iso.slice(14, 16);
  const h = parseInt(iso.slice(11, 13), 10);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};

function toCondition(code: number, hour: number): HourlyItem['condition'] {
  if (code >= 51) return 'rain';
  if (code <= 1) return hour >= 6 && hour < 18 ? 'sun' : 'cloud-moon';
  return 'cloud';
}

export default function HomeScreen() {
  const router = useRouter();
  const { welcomeName: routeWelcomeName } = useLocalSearchParams<{
    welcomeName?: string | string[];
  }>();
  const welcomeName = typeof routeWelcomeName === 'string' ? routeWelcomeName.trim() : '';
  const [baseCity, setSelectedCity] = useState<CityData>(CITIES[0]);
  const [cityQuery, setCityQuery] = useState('');
  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    if (!q) return CITIES;
    return CITIES.filter((c) => `${c.name} ${c.country}`.toLowerCase().includes(q));
  }, [cityQuery]);
  const [live, setLive] = useState<{ name: string; data: Forecast } | null>(null);
  const liveForecast = live?.name === baseCity.name ? live.data : null;

  // Live Open-Meteo data for the selected location, refreshed every 10 minutes
  useEffect(() => {
    const controller = new AbortController();
    const { name, latitude, longitude } = baseCity;
    const load = () =>
      fetchForecast(controller.signal, { latitude, longitude })
        .then((data) => setLive({ name, data }))
        .catch(() => {});
    void load();
    const interval = setInterval(load, 10 * 60 * 1000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [baseCity]);

  const isLive = !!liveForecast;
  const selectedCity = useMemo<CityData>(() => {
    if (!isLive || !liveForecast) return baseCity;
    const { current, daily, airQuality } = liveForecast;
    return {
      ...baseCity,
      temp: Math.round(current.temperatureC),
      feelsLike: Math.round(current.feelsLikeC),
      condition: weatherDescription(current.weatherCode),
      high: Math.round(daily[0]?.maxC ?? current.temperatureC),
      low: Math.round(daily[0]?.minC ?? current.temperatureC),
      uv: Math.round(current.uvIndex),
      wind: Math.round(current.windKph),
      windDir: current.windDirection,
      humidity: Math.round(current.humidityPercent),
      airQuality: Math.round(airQuality.aqi ?? 0),
      airQualityLabel: aqiLabel(airQuality.aqi),
      sunrise: clockLabel(daily[0]?.sunrise ?? ''),
      sunset: clockLabel(daily[0]?.sunset ?? ''),
      rainNowMm: current.precipitationMm,
      rainTodayMm: daily[0]?.precipitationMm ?? 0,
      rainChance: daily[0]?.precipitationProbability ?? 0,
    };
  }, [baseCity, isLive, liveForecast]);

  const hourlyData = useMemo<HourlyItem[]>(() => {
    if (!isLive || !liveForecast) return BASE_HOURLY_DATA;
    return liveForecast.hourly.map((h, i) => ({
      id: i === 0 ? '2' : `h${i}`,
      time: i === 0 ? 'Now' : hourLabel(h.time),
      iso: h.time,
      temp: Math.round(h.temperatureC),
      rainChance: h.precipitationProbability >= 15 ? `${h.precipitationProbability}%` : undefined,
      precipitationMm: h.precipitationMm,
      weatherCode: h.weatherCode,
      condition: toCondition(h.weatherCode, parseInt(h.time.slice(11, 13), 10)),
      desc: weatherDescription(h.weatherCode),
    }));
  }, [isLive, liveForecast]);

  const dailyData = useMemo<DailyItem[]>(() => {
    if (!isLive || !liveForecast) return DAILY_DATA;
    return liveForecast.daily.map((d, i) => ({
      id: `d${i}`,
      day:
        i === 0
          ? 'Today'
          : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
              new Date(`${d.date}T12:00:00Z`).getUTCDay()
            ],
      condition: toCondition(d.weatherCode, 12),
      minTemp: Math.round(d.minC),
      maxTemp: Math.round(d.maxC),
      rainChance: d.precipitationProbability >= 20 ? `${d.precipitationProbability}%` : undefined,
    }));
  }, [isLive, liveForecast]);

  const weekTempBounds = useMemo(() => {
    const mins = dailyData.map((d) => d.minTemp);
    const maxs = dailyData.map((d) => d.maxTemp);
    const min = Math.min(...mins);
    const max = Math.max(...maxs);
    return { min, span: Math.max(1, max - min) };
  }, [dailyData]);

  const tempOffset = isLive ? 0 : selectedCity.temp - 29;
  const [selectedHourId, setSelectedHourId] = useState('2');
  const [menuExpanded, setMenuExpanded] = useState(false);
  const [citySelectorVisible, setCitySelectorVisible] = useState(false);
  const { profilePictureUrl, loadProfilePicture } = useProfilePicture();

  const [isDashboardExpanded, setIsDashboardExpanded] = useState(true);
  const [liveClock, setLiveClock] = useState(new Date());

  const activeHour =
    hourlyData.find((h) => h.id === selectedHourId) ?? hourlyData[0];

  const activeIso = useMemo(() => {
    if (selectedHourId !== '2' && activeHour?.iso) return activeHour.iso;
    return manilaIso(liveClock);
  }, [selectedHourId, activeHour, liveClock]);

  const activeSun = useMemo(
    () => sunTimesForDate(liveForecast?.daily, activeIso),
    [liveForecast?.daily, activeIso],
  );

  // Smoothly interpolated Time-of-Day theme across Dawn, Midday, Golden Hour, Dusk, and Deep Night
  const solarTheme = useMemo(() => getHourTheme(activeIso, activeSun), [activeIso, activeSun]);

  const effectiveWeatherCode =
    selectedHourId === '2'
      ? (liveForecast?.current.weatherCode ?? activeHour.weatherCode)
      : activeHour.weatherCode;

  const effectivePrecipMm =
    selectedHourId === '2'
      ? (selectedCity.rainNowMm ?? 0)
      : (activeHour.precipitationMm ?? 0);

  const displayedTemp =
    selectedHourId === '2' ? selectedCity.temp : activeHour.temp + tempOffset;
  const displayedCondition =
    selectedHourId === '2' ? selectedCity.condition : activeHour.desc;

  // ANIMATIONS
  const fadeAnim = useMemo(() => new Animated.Value(0), []);
  const shimmerAnim = useMemo(() => new Animated.Value(-SCREEN_WIDTH), []);
  const pulseAnim = useMemo(() => new Animated.Value(0), []);
  const windSwayAnim = useMemo(() => new Animated.Value(0), []);
  const radarSweepAnim = useMemo(() => new Animated.Value(0), []);
  const sunFloatAnim = useMemo(() => new Animated.Value(0), []);
  const expandAnim = useMemo(() => new Animated.Value(1), []);
  const dragRubberBandAnim = useMemo(() => new Animated.Value(0), []);
  const menuAnim = useMemo(() => new Animated.Value(0), []);
  const welcomeAnim = useMemo(() => new Animated.Value(0), []);

  useFocusEffect(
    useCallback(() => {
      void loadProfilePicture();
    }, [loadProfilePicture]),
  );

  useEffect(() => {
    if (!welcomeName) return;
    welcomeAnim.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(welcomeAnim, {
        toValue: 1,
        duration: 550,
        useNativeDriver: true,
      }),
      Animated.delay(2400),
      Animated.timing(welcomeAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [welcomeAnim, welcomeName]);

  useEffect(() => {
    Animated.spring(menuAnim, {
      toValue: menuExpanded ? 1 : 0,
      friction: 8,
      tension: 65,
      useNativeDriver: false,
    }).start();
  }, [menuAnim, menuExpanded]);

  useEffect(() => {
    const clockInterval = setInterval(() => {
      setLiveClock(new Date());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: SCREEN_WIDTH * 1.5,
        duration: 5400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(windSwayAnim, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(windSwayAnim, {
          toValue: -1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    Animated.loop(
      Animated.timing(radarSweepAnim, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(sunFloatAnim, {
          toValue: -5,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(sunFloatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [fadeAnim, shimmerAnim, pulseAnim, windSwayAnim, radarSweepAnim, sunFloatAnim]);

  const expandDashboard = useCallback(() => {
    Animated.spring(expandAnim, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: false,
    }).start();
    setIsDashboardExpanded(true);
  }, [expandAnim]);

  const collapseDashboard = useCallback(() => {
    Animated.spring(expandAnim, {
      toValue: 0,
      friction: 8,
      tension: 40,
      useNativeDriver: false,
    }).start();
    setIsDashboardExpanded(false);
  }, [expandAnim]);

  const toggleDashboard = useCallback(() => {
    if (isDashboardExpanded) {
      collapseDashboard();
    } else {
      expandDashboard();
    }
  }, [collapseDashboard, expandDashboard, isDashboardExpanded]);

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: (_, gestureState) => Math.abs(gestureState.dy) > 6,
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 6,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, gestureState) => {
          dragRubberBandAnim.setValue(gestureState.dy * 0.35);
        },
        onPanResponderRelease: (_, gestureState) => {
          Animated.spring(dragRubberBandAnim, {
            toValue: 0,
            friction: 6,
            useNativeDriver: false,
          }).start();

          if (gestureState.dy > 20) {
            collapseDashboard();
          } else if (gestureState.dy < -20) {
            expandDashboard();
          } else if (Math.abs(gestureState.dy) < 15 && Math.abs(gestureState.dx) < 15) {
            toggleDashboard();
          }
        },
      }),
    [dragRubberBandAnim, collapseDashboard, expandDashboard, toggleDashboard],
  );

  const sheetHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLLAPSED_ENCLOSURE_HEIGHT, EXPANDED_ENCLOSURE_HEIGHT],
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* 1. Pure Procedural Time-of-Day Gradient Engine & Weather Condition Layers (No Pictures) */}
      <WeatherBackdrop
        iso={activeIso}
        sun={activeSun}
        theme={solarTheme}
        weatherCode={effectiveWeatherCode}
        windKph={selectedCity.wind}
        windDirection={selectedCity.windDir}
        precipitationMm={effectivePrecipMm}
      />

      {/* 2. Top Current Conditions Hero */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.headerSection, { opacity: fadeAnim }]}>
          <TouchableOpacity
            onPress={() => setCitySelectorVisible(true)}
            activeOpacity={0.8}
            style={[styles.cityPillButton, { backgroundColor: solarTheme.surface.headerScrim }]}
          >
            <Text style={styles.cityText}>{selectedCity.name}</Text>
            <View style={styles.cityDropdownChevron}>
              <Text style={styles.chevronText}>▾</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.tempHero}>{displayedTemp}°</Text>
          <Text style={styles.conditionText}>{displayedCondition}</Text>

          <View style={styles.highLowRow}>
            <Text style={styles.highLowText}>H:{selectedCity.high}°</Text>
            <Text style={[styles.highLowText, { marginLeft: 14 }]}>
              L:{selectedCity.low}°
            </Text>
            <Text style={[styles.highLowText, { marginLeft: 14, opacity: 0.86 }]}>
              Feels {selectedCity.feelsLike}°
            </Text>
          </View>
        </Animated.View>

        {/* Live Atmospheric Status Pill */}
        <LiquidGlassCard
          style={styles.liveSkyStatusCard}
          intensity={55}
          tintColors={solarTheme.liquidCardTint}
        >
          <View style={styles.liveStatusRow}>
            <Animated.View
              style={[
                styles.livePulseDot,
                {
                  opacity: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 1],
                  }),
                },
              ]}
            />
            <Text style={styles.liveStatusText}>
              {solarTheme.badge} • {selectedHourId === '2' ? 'LIVE' : activeHour.time} •{' '}
              {liveClock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </LiquidGlassCard>
      </ScrollView>

      {/* 3. iOS / Apple-Style Glassmorphism Weather Dashboard */}
      <Animated.View
        style={[
          styles.bottomDashboardEnclosure,
          {
            height: sheetHeight,
            transform: [{ translateY: dragRubberBandAnim }],
          },
        ]}
      >
        <LiquidGlassCard
          style={styles.bottomEnclosureCard}
          intensity={82}
          tintColors={solarTheme.liquidCardTint}
          shimmerAnim={shimmerAnim}
        >
          {/* Top Drag Handle Header */}
          <View style={styles.collapseToggleHeader} {...sheetPanResponder.panHandlers}>
            <View style={styles.dragHandle} />
          </View>

          {isDashboardExpanded && (
            <Animated.View style={[styles.expandedContentWrapper, { opacity: expandAnim }]}>
              <ScrollView
                style={styles.expandedDashboardScroll}
                contentContainerStyle={styles.dashboardCardsScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {/* CARD 1: HOURLY TIMELINE */}
                <LiquidGlassCard
                  style={styles.appleCard}
                  intensity={60}
                  tintColors={solarTheme.liquidCardTint}
                >
                  <View style={styles.appleCardHeader}>
                    <Text style={styles.appleCardHeaderText}>🕒 HOURLY TIMELINE</Text>
                    <Text style={[styles.appleCardHeaderMeta, { color: solarTheme.text.accent }]}>
                      Tap slot to preview sky
                    </Text>
                  </View>
                  <View style={styles.appleHeaderDivider} />

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.hourlyList}
                  >
                    {hourlyData.map((item) => {
                      const isSelected = selectedHourId === item.id;
                      const itemTemp =
                        item.id === '2'
                          ? selectedCity.temp
                          : item.temp + tempOffset;
                      const itemTheme = getHourTheme(
                        item.iso,
                        sunTimesForDate(liveForecast?.daily, item.iso),
                      );

                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => setSelectedHourId(item.id)}
                          activeOpacity={0.85}
                          style={[
                            styles.hourlyGlassCard,
                            isSelected
                              ? [
                                  styles.hourlyGlassCardSelected,
                                  { borderColor: solarTheme.surface.borderSelected },
                                ]
                              : styles.hourlyGlassCardDefault,
                          ]}
                        >
                          <LinearGradient
                            colors={[itemTheme.bgGradient[1], itemTheme.bgGradient[2]]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.hourlySkyStrip}
                          />
                          {isSelected && (
                            <LinearGradient
                              colors={['rgba(255, 255, 255, 0.24)', 'rgba(108, 124, 255, 0.32)']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={StyleSheet.absoluteFill}
                            />
                          )}

                          <Text
                            style={[
                              styles.hourlyTime,
                              isSelected && styles.hourlyTimeSelected,
                            ]}
                          >
                            {item.time}
                          </Text>

                          <WeatherIcon
                            condition={item.condition}
                            size={28}
                            pulseAnim={isSelected ? pulseAnim : undefined}
                          />

                          {item.rainChance ? (
                            <Text style={styles.rainText}>{item.rainChance}</Text>
                          ) : (
                            <View style={{ height: 14 }} />
                          )}

                          <Text style={styles.hourlyTemp}>{itemTemp}°</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </LiquidGlassCard>

                {/* CARD 2: 7-DAY FORECAST */}
                <LiquidGlassCard
                  style={styles.appleCard}
                  intensity={60}
                  tintColors={solarTheme.liquidCardTint}
                >
                  <View style={styles.appleCardHeader}>
                    <Text style={styles.appleCardHeaderText}>📅 7-DAY FORECAST</Text>
                    <Text style={styles.appleCardHeaderMeta}>Cebu Province</Text>
                  </View>
                  <View style={styles.appleHeaderDivider} />

                  <View style={styles.weeklyList}>
                    {dailyData.map((item, idx) => {
                      const barLeftPct =
                        ((item.minTemp - weekTempBounds.min) / weekTempBounds.span) * 100;
                      const barWidthPct = Math.max(
                        14,
                        ((item.maxTemp - item.minTemp) / weekTempBounds.span) * 100,
                      );
                      const currentMarkerPct = Math.min(
                        96,
                        Math.max(
                          4,
                          ((selectedCity.temp - weekTempBounds.min) / weekTempBounds.span) * 100,
                        ),
                      );

                      return (
                        <View
                          key={item.id}
                          style={[
                            styles.weeklyRow,
                            idx === dailyData.length - 1 && { borderBottomWidth: 0 },
                          ]}
                        >
                          <Text style={styles.weeklyDay}>{item.day}</Text>
                          <View style={styles.weeklyConditionCol}>
                            <WeatherIcon condition={item.condition} size={22} />
                            {item.rainChance && (
                              <Text style={styles.weeklyRainText}>{item.rainChance}</Text>
                            )}
                          </View>
                          <Text style={styles.weeklyMinTemp}>{item.minTemp}°</Text>
                          <View style={styles.tempBarTrack}>
                            <LinearGradient
                              colors={['#38BDF8', '#FACC15', '#FB923C']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={[
                                styles.tempBarProgress,
                                {
                                  left: `${barLeftPct}%`,
                                  width: `${Math.min(100 - barLeftPct, barWidthPct)}%`,
                                },
                              ]}
                            />
                            {item.day === 'Today' && (
                              <Animated.View
                                style={[
                                  styles.tempBarCurrentMarker,
                                  {
                                    left: `${currentMarkerPct}%`,
                                    opacity: pulseAnim.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [0.75, 1],
                                    }),
                                  },
                                ]}
                              />
                            )}
                          </View>
                          <Text style={styles.weeklyMaxTemp}>{item.maxTemp}°</Text>
                        </View>
                      );
                    })}
                  </View>
                </LiquidGlassCard>

                {/* CARD 3: WIND RADAR VECTOR */}
                <LiquidGlassCard
                  style={styles.appleCard}
                  intensity={60}
                  tintColors={solarTheme.liquidCardTint}
                >
                  <View style={styles.appleCardHeader}>
                    <Text style={styles.appleCardHeaderText}>💨 WIND RADAR VECTOR</Text>
                    <Text style={[styles.appleCardHeaderMeta, { color: solarTheme.text.accent }]}>
                      {selectedCity.windDir} Vector
                    </Text>
                  </View>
                  <View style={styles.appleHeaderDivider} />

                  <View style={styles.windCardBody}>
                    <View style={styles.windMetricsCol}>
                      <View style={styles.windStatRow}>
                        <View>
                          <Text style={styles.windStatValue}>{selectedCity.wind}</Text>
                        </View>
                        <View style={styles.windStatUnitCol}>
                          <Text style={styles.windStatUnit}>km/h</Text>
                          <Text style={styles.windStatLabel}>Sustained Wind</Text>
                        </View>
                      </View>
                      <View style={styles.windStatDivider} />
                      <View style={styles.windStatRow}>
                        <View>
                          <Text style={styles.windStatValue}>{selectedCity.wind + 8}</Text>
                        </View>
                        <View style={styles.windStatUnitCol}>
                          <Text style={styles.windStatUnit}>km/h</Text>
                          <Text style={styles.windStatLabel}>Peak Gusts</Text>
                        </View>
                      </View>
                      <Text style={styles.windDirectionNote}>
                        Originating from {selectedCity.windDir} • Humidity {selectedCity.humidity}%
                      </Text>
                    </View>

                    <WindRadarDial
                      windDir={selectedCity.windDir}
                      windKph={selectedCity.wind}
                      swayAnim={windSwayAnim}
                      accentColor={solarTheme.text.accent}
                    />
                  </View>
                </LiquidGlassCard>

                {/* BENTO ROW: UV INDEX + AIR QUALITY */}
                <View style={styles.bentoGrid}>
                  {/* CARD 4: UV INDEX */}
                  <LiquidGlassCard
                    style={styles.detailCard}
                    intensity={60}
                    tintColors={solarTheme.liquidCardTint}
                  >
                    <Text style={styles.detailLabel}>☀️ UV INDEX</Text>
                    <Text style={styles.detailValueBig}>{selectedCity.uv}</Text>
                    <Text style={[styles.detailBadge, { color: solarTheme.text.accent }]}>
                      {uvLabel(selectedCity.uv)}
                    </Text>
                    <View style={styles.spectrumBar}>
                      <LinearGradient
                        colors={['#22C55E', '#EAB308', '#F97316', '#EF4444', '#A855F7']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View
                        style={[
                          styles.spectrumPin,
                          {
                            left: `${Math.min(96, Math.max(4, (selectedCity.uv / 11) * 100))}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.detailSub}>
                      {selectedCity.uv >= 6
                        ? 'Use SPF 30+ protection until 4 PM.'
                        : 'Low UV risk for outdoor activity.'}
                    </Text>
                  </LiquidGlassCard>

                  {/* CARD 5: AIR QUALITY */}
                  <LiquidGlassCard
                    style={styles.detailCard}
                    intensity={60}
                    tintColors={solarTheme.liquidCardTint}
                  >
                    <Text style={styles.detailLabel}>🍃 AIR QUALITY</Text>
                    <Text style={styles.detailValueBig}>{selectedCity.airQuality}</Text>
                    <Text style={[styles.detailBadge, { color: solarTheme.text.accent }]}>
                      {selectedCity.airQualityLabel}
                    </Text>
                    <View style={styles.spectrumBar}>
                      <LinearGradient
                        colors={['#00E676', '#FFEB3B', '#FF9800', '#F44336']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <Animated.View
                        style={[
                          styles.spectrumPin,
                          {
                            left: `${Math.min(96, Math.max(6, (selectedCity.airQuality / 150) * 100))}%`,
                            transform: [
                              {
                                scale: pulseAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [1, 1.25],
                                }),
                              },
                            ],
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.detailSub}>
                      {selectedCity.airQuality <= 50
                        ? 'Clean air; ideal for outdoor activities.'
                        : 'Moderate particulates in the area.'}
                    </Text>
                  </LiquidGlassCard>

                  {/* CARD 6: LIVE DOPPLER PRECIPITATION */}
                  <LiquidGlassCard
                    style={styles.detailCard}
                    intensity={60}
                    tintColors={solarTheme.liquidCardTint}
                  >
                    <View style={styles.widgetHeaderRow}>
                      <Text style={styles.detailLabel}>🌧️ RAINFALL</Text>
                      <Animated.View
                        style={[
                          styles.radarDot,
                          {
                            opacity: pulseAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.4, 1],
                            }),
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.detailValueBig}>{selectedCity.rainNowMm ?? 0} mm</Text>
                    <Text style={[styles.detailBadge, { color: '#38BDF8' }]}>
                      Past Hour
                    </Text>
                    <Text style={styles.detailSub}>
                      {selectedCity.rainTodayMm ?? 0} mm expected today ({selectedCity.rainChance ?? 0}% chance).
                    </Text>
                  </LiquidGlassCard>

                  {/* CARD 7: SOLAR CYCLE */}
                  <LiquidGlassCard
                    style={styles.detailCard}
                    intensity={60}
                    tintColors={solarTheme.liquidCardTint}
                  >
                    <View style={styles.widgetHeaderRow}>
                      <Text style={styles.detailLabel}>🌇 SUNSET</Text>
                      <Animated.Text
                        style={[
                          styles.sunIconAnimated,
                          { transform: [{ translateY: sunFloatAnim }] },
                        ]}
                      >
                        {solarTheme.isDay ? '☀️' : '🌙'}
                      </Animated.Text>
                    </View>
                    <Text style={styles.detailValue}>{selectedCity.sunset}</Text>
                    <Text style={[styles.detailBadge, { color: solarTheme.text.accent }]}>
                      Dawn / Sunrise
                    </Text>
                    <Text style={styles.detailSub}>
                      Sunrise at {selectedCity.sunrise}
                    </Text>
                  </LiquidGlassCard>
                </View>

                <View style={{ height: 28 }} />
              </ScrollView>
            </Animated.View>
          )}
        </LiquidGlassCard>
      </Animated.View>

      {/* Bottom TabBar */}
      <View style={styles.fixedTabBar} pointerEvents="box-none">
        <Image
          source={require('../../assets/images/homepage/TabBar.png')}
          style={[StyleSheet.absoluteFill, { opacity: 0.9 }]}
          contentFit="fill"
          pointerEvents="none"
        />
        <TouchableOpacity
          style={styles.tabBarRadarButton}
          activeOpacity={0.65}
          accessibilityRole="button"
          accessibilityLabel="Open live weather radar"
          onPress={() =>
            Alert.alert(
              'Live Weather Radar',
              `Doppler radar stream active for ${selectedCity.name}, ${selectedCity.country}. Wind ${selectedCity.wind} km/h ${selectedCity.windDir}.`,
            )
          }
        />
        <TouchableOpacity
          style={styles.tabBarLocationButton}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Select location"
          onPress={() => setCitySelectorVisible(true)}
        />
        <TouchableOpacity
          style={styles.tabBarMenuButton}
          activeOpacity={0.65}
          accessibilityRole="button"
          accessibilityLabel={menuExpanded ? 'Close menu' : 'Open menu'}
          accessibilityState={{ expanded: menuExpanded }}
          onPress={() => setMenuExpanded((expanded) => !expanded)}
        />
      </View>

      {/* Top-Right Expandable Menu Pill */}
      <View style={styles.homeMenu} pointerEvents="box-none">
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.homeMenuPill,
            {
              height: menuAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [52, 208],
              }),
            },
          ]}
        >
          <LinearGradient
            colors={['#6738C7', '#382493']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.homeMenuPillGradient}
          >
            <TouchableOpacity
              style={styles.homeMenuItem}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={menuExpanded ? 'Home' : 'Open menu'}
              accessibilityState={{ expanded: menuExpanded }}
              onPress={() => setMenuExpanded((expanded) => !expanded)}
            >
              <Animated.View
                style={[
                  styles.homeMenuTopIcon,
                  {
                    opacity: menuAnim,
                    transform: [
                      {
                        scale: menuAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.75, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Image
                  source={HOME_MENU_ITEMS[0].image}
                  style={styles.homeMenuItemIcon}
                  contentFit="contain"
                />
              </Animated.View>
              <Animated.View
                style={[
                  styles.homeMenuTopIcon,
                  {
                    opacity: menuAnim.interpolate({
                      inputRange: [0, 0.6, 1],
                      outputRange: [1, 0, 0],
                    }),
                    transform: [
                      {
                        scale: menuAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0.75],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.homeMenuAvatar}>
                  {profilePictureUrl ? (
                    <Image
                      source={{ uri: profilePictureUrl }}
                      style={styles.homeMenuAvatarImage}
                      contentFit="cover"
                      onError={(error) => console.error('Profile picture image failed to load:', error)}
                      accessibilityLabel="Profile picture"
                    />
                  ) : (
                    <View style={styles.homeMenuAvatarPlaceholder}>
                      <View style={styles.homeMenuAvatarHead} />
                      <View style={styles.homeMenuAvatarBody} />
                    </View>
                  )}
                </View>
              </Animated.View>
            </TouchableOpacity>
            {HOME_MENU_ITEMS.slice(1).map((item, index) => (
              <Animated.View
                key={item.label}
                pointerEvents={menuExpanded ? 'auto' : 'none'}
                style={[
                  styles.homeMenuAnimatedItem,
                  {
                    opacity: menuAnim,
                    transform: [
                      {
                        translateY: menuAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-10 - index * 2, 0],
                        }),
                      },
                      {
                        scale: menuAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.homeMenuItem}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={() => {
                    setMenuExpanded(false);
                    if (item.label === 'Settings') {
                      router.push({
                        pathname: '/settings_page/settings',
                        params: { profilePictureUrl: profilePictureUrl ?? '' },
                      });
                    } else if (item.label === 'Profile') {
                      router.push('/Profile_page/profile');
                    }
                  }}
                >
                  <Image
                    source={item.image}
                    style={styles.homeMenuItemIcon}
                    contentFit="contain"
                  />
                </TouchableOpacity>
              </Animated.View>
            ))}
          </LinearGradient>
        </Animated.View>
      </View>

      {/* Interactive Liquid Glass City Selector Modal */}
      <Modal visible={citySelectorVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <LiquidGlassCard style={styles.modalGlassCard} intensity={85} shimmerAnim={shimmerAnim}>
            <Text style={styles.modalTitle}>Select Location</Text>
            <Text style={styles.modalSubtitle}>Cebu cities &amp; barangays · live Open-Meteo</Text>

            <TextInput
              style={styles.citySearchInput}
              value={cityQuery}
              onChangeText={setCityQuery}
              placeholder="Search city, town or barangay"
              placeholderTextColor="rgba(255, 255, 255, 0.45)"
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              accessibilityLabel="Search locations"
            />

            <FlatList
              style={styles.cityListScroll}
              data={filteredCities}
              keyExtractor={(c) => c.name}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              initialNumToRender={12}
              windowSize={7}
              ListEmptyComponent={
                <Text style={styles.cityRowCountry}>No matching location in Cebu.</Text>
              }
              renderItem={({ item: c }) => {
                const isCurrent = c.name === selectedCity.name;
                return (
                  <TouchableOpacity
                    style={[styles.cityRowCard, isCurrent && styles.cityRowCardActive]}
                    onPress={() => {
                      setSelectedCity(c);
                      setCitySelectorVisible(false);
                      setCityQuery('');
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cityRowName}>{c.name}</Text>
                      <Text style={styles.cityRowCountry}>
                        {c.country}
                        {isCurrent ? ` • ${selectedCity.condition}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.cityRowTemp}>{isCurrent ? `${selectedCity.temp}°` : ''}</Text>
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setCitySelectorVisible(false)}
            >
              <Text style={styles.modalCloseText}>Done</Text>
            </TouchableOpacity>
          </LiquidGlassCard>
        </View>
      </Modal>

      {welcomeName && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.welcomeToast,
            {
              opacity: welcomeAnim,
              transform: [
                {
                  translateY: welcomeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-90, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.welcomeToastText}>Welcome {welcomeName}!</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#040716',
    overflow: 'hidden',
  },
  welcomeToast: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 42,
    alignSelf: 'center',
    zIndex: 20,
    width: '88%',
    maxWidth: 420,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
    backgroundColor: 'rgba(36, 27, 73, 0.92)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  welcomeToastText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 58 : 44,
    paddingBottom: 120,
    alignItems: 'center',
  },
  headerSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cityPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 10, 26, 0.36)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.26)',
  },
  cityText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  cityDropdownChevron: {
    marginLeft: 6,
    marginTop: -2,
  },
  chevronText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 16,
  },
  tempHero: {
    color: '#FFFFFF',
    fontSize: 96,
    fontWeight: '200',
    lineHeight: 104,
    marginTop: 2,
    textAlign: 'center',
    alignSelf: 'center',
    paddingLeft: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 14,
  },
  conditionText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: -2,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  highLowRow: {
    flexDirection: 'row',
    marginTop: 5,
  },
  highLowText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  liquidGlassContainer: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  liquidSpecularTop: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1.2,
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  liquidSpecularLeft: {
    position: 'absolute',
    top: 14,
    bottom: 14,
    left: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  shimmerBeam: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 140,
  },
  liveSkyStatusCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 8,
    marginBottom: 12,
  },
  liveStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#00E676',
    marginRight: 8,
    shadowColor: '#00E676',
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  liveStatusText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  // Dashboard enclosure
  bottomDashboardEnclosure: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  bottomEnclosureCard: {
    width: Math.min(SCREEN_WIDTH - 16, 430),
    height: '100%',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    borderBottomLeftRadius: Platform.OS === 'ios' ? 34 : 26,
    borderBottomRightRadius: Platform.OS === 'ios' ? 34 : 26,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  collapseToggleHeader: {
    width: '100%',
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    zIndex: 1,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
  },
  expandedContentWrapper: {
    flex: 1,
  },
  expandedDashboardScroll: {
    flex: 1,
  },
  dashboardCardsScrollContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 110,
    gap: 12,
  },
  // Apple Weather-style Glass Cards
  appleCard: {
    width: '100%',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  appleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  appleCardHeaderText: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  appleCardHeaderMeta: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 11,
    fontWeight: '600',
  },
  appleHeaderDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    marginBottom: 12,
  },
  hourlyList: {
    gap: 10,
    paddingHorizontal: 2,
  },
  hourlyGlassCard: {
    width: 64,
    height: 138,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  hourlyGlassCardDefault: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  hourlyGlassCardSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(255, 255, 255, 0.85)',
  },
  hourlySkyStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  hourlyTime: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 13,
    fontWeight: '600',
  },
  hourlyTimeSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  rainText: {
    color: '#5CE1FF',
    fontSize: 11,
    fontWeight: '700',
  },
  hourlyTemp: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  // 7-Day Forecast Card
  weeklyList: {
    gap: 2,
  },
  weeklyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.14)',
  },
  weeklyDay: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    width: 54,
  },
  weeklyConditionCol: {
    alignItems: 'center',
    width: 42,
  },
  weeklyRainText: {
    color: '#5CE1FF',
    fontSize: 10,
    fontWeight: '700',
  },
  weeklyMinTemp: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 15,
    fontWeight: '600',
    width: 34,
    textAlign: 'right',
  },
  tempBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginHorizontal: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  tempBarProgress: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  tempBarCurrentMarker: {
    position: 'absolute',
    top: -1,
    width: 8,
    height: 8,
    marginLeft: -4,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#0A1024',
  },
  weeklyMaxTemp: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    width: 34,
    textAlign: 'left',
  },
  // Wind Radar Vector Card
  windCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  windMetricsCol: {
    flex: 1,
    gap: 6,
  },
  windStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  windStatValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  windStatUnitCol: {
    justifyContent: 'center',
  },
  windStatUnit: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '700',
  },
  windStatLabel: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 11,
    fontWeight: '500',
  },
  windStatDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginVertical: 2,
  },
  windDirectionNote: {
    color: 'rgba(255, 255, 255, 0.76)',
    fontSize: 11.5,
    marginTop: 2,
  },
  windDialBox: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  windDialCenterBadge: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10, 15, 34, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  windDialSpeed: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  windDialUnit: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 8.5,
    fontWeight: '600',
  },
  // 2-Column Bento Grid
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: 22,
    padding: 14,
  },
  widgetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  radarDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#38BDF8',
  },
  detailLabel: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  detailValueBig: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  detailBadge: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 4,
  },
  detailSub: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 4,
  },
  spectrumBar: {
    height: 6,
    borderRadius: 3,
    marginVertical: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  spectrumPin: {
    position: 'absolute',
    top: 0,
    width: 6,
    height: 6,
    marginLeft: -3,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#000',
  },
  sunIconAnimated: {
    fontSize: 17,
  },
  fixedTabBar: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    width: TAB_BAR_WIDTH,
    height: TAB_BAR_HEIGHT,
    marginLeft: -TAB_BAR_WIDTH / 2,
    zIndex: 110,
  },
  tabBarRadarButton: {
    position: 'absolute',
    left: '9%',
    top: '40%',
    width: '22%',
    height: '40%',
  },
  tabBarLocationButton: {
    position: 'absolute',
    left: '35%',
    top: '40%',
    width: '30%',
    height: '30%',
  },
  tabBarMenuButton: {
    position: 'absolute',
    right: '9%',
    top: '40%',
    width: '22%',
    height: '40%',
  },
  homeMenu: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 44,
    right: 18,
    alignItems: 'center',
    zIndex: 20,
    elevation: 20,
  },
  homeMenuPill: {
    width: 68,
    borderRadius: 34,
    overflow: 'hidden',
    shadowColor: '#21105F',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 7,
    elevation: 8,
  },
  homeMenuPillGradient: {
    flex: 1,
    borderRadius: 34,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.26)',
  },
  homeMenuTopIcon: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeMenuAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeMenuAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  homeMenuAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7E1F3',
  },
  homeMenuAvatarHead: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
    backgroundColor: '#6738C7',
  },
  homeMenuAvatarBody: {
    width: 21,
    height: 12,
    marginTop: 2,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: '#6738C7',
  },
  homeMenuItem: {
    width: 68,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeMenuAnimatedItem: {
    width: 68,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeMenuItemIcon: {
    width: 30,
    height: 30,
  },
  // Icons styling
  iconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloudShape: {
    width: 22,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  cloudPuff: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  sunCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFAE35',
  },
  sunRaysRing: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255, 174, 53, 0.45)',
  },
  crescentMoon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFAE35',
    shadowColor: '#FFAE35',
    shadowRadius: 4,
    shadowOpacity: 0.5,
  },
  rainDropsRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 3,
  },
  rainDrop: {
    width: 2,
    height: 6,
    borderRadius: 1,
    backgroundColor: '#5CE1FF',
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalGlassCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    padding: 24,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubtitle: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  cityListScroll: {
    maxHeight: 300,
    marginBottom: 14,
  },
  citySearchInput: {
    color: '#FFFFFF',
    fontSize: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  cityRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  cityRowCardActive: {
    backgroundColor: 'rgba(72, 49, 157, 0.55)',
    borderColor: 'rgba(255, 255, 255, 0.65)',
  },
  cityRowName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cityRowCountry: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 12,
    marginTop: 2,
  },
  cityRowTemp: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '300',
  },
  modalCloseButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  modalCloseText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
});
