import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useProfilePicture } from '../hooks/loadprofilepicture';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  AppState,
  Dimensions,
  Animated,
  Platform,
  Modal,
  Alert,
  Easing,
  PanResponder,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { profileApi } from '../lib/profile-api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TAB_BAR_WIDTH = SCREEN_WIDTH + 80;
const TAB_BAR_HEIGHT = TAB_BAR_WIDTH * (345 / 1170);
const COLLAPSED_ENCLOSURE_HEIGHT = Math.max(
  Platform.OS === 'ios' ? 122 : 114,
  Math.ceil(TAB_BAR_HEIGHT * 0.6 + 72)
);
const EXPANDED_ENCLOSURE_HEIGHT = Math.min(SCREEN_HEIGHT * 0.76, 640);
const APP_LAUNCH_STARTED_AT = Date.now();
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

const HOME_MENU_ITEMS = [
  { label: 'Home', image: require('../../assets/images/homepage/home.png') },
  { label: 'Alerts', image: require('../../assets/images/homepage/alert.png') },
  { label: 'Settings', image: require('../../assets/images/homepage/settings.png') },
  { label: 'Profile', image: require('../../assets/images/homepage/profile.png') },
];

type TimeOfDay = 'morning' | 'afternoon' | 'evening';

interface CityData {
  name: string;
  country: string;
  temp: number;
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
}

interface HomeLocation {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  city: string | null;
  province: string | null;
  barangay: string | null;
}

interface HomeForecast {
  updatedAt?: string;
  stale?: boolean;
  current: {
    temperatureC: number;
    feelsLikeC: number;
    humidityPercent: number;
    windKph: number;
    uvIndex: number;
    weatherCode: number;
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
}

interface HomeHazardAlert {
  id: string;
  title: string;
  hazard?: {
    hazard_type: string;
    risk_level: string;
    safety_tips: string[];
    created_at: string;
  } | null;
}

const CITIES: CityData[] = [
  {
    name: 'Montreal',
    country: 'Canada',
    temp: 19,
    condition: 'Mostly Clear',
    high: 24,
    low: 18,
    uv: 3,
    wind: 14,
    windDir: 'ESE',
    humidity: 74,
    airQuality: 28,
    airQualityLabel: 'Good',
    sunrise: '5:28 AM',
    sunset: '7:25 PM',
  },
  {
    name: 'Tokyo',
    country: 'Japan',
    temp: 22,
    condition: 'Gentle Rain',
    high: 25,
    low: 19,
    uv: 2,
    wind: 11,
    windDir: 'NNE',
    humidity: 82,
    airQuality: 19,
    airQualityLabel: 'Excellent',
    sunrise: '5:35 AM',
    sunset: '5:42 PM',
  },
  {
    name: 'New York',
    country: 'United States',
    temp: 21,
    condition: 'Partly Sunny',
    high: 26,
    low: 17,
    uv: 5,
    wind: 18,
    windDir: 'WSW',
    humidity: 62,
    airQuality: 45,
    airQualityLabel: 'Moderate',
    sunrise: '6:12 AM',
    sunset: '6:54 PM',
  },
  {
    name: 'London',
    country: 'United Kingdom',
    temp: 16,
    condition: 'Cloudy Mist',
    high: 19,
    low: 13,
    uv: 2,
    wind: 22,
    windDir: 'W',
    humidity: 88,
    airQuality: 24,
    airQualityLabel: 'Good',
    sunrise: '6:45 AM',
    sunset: '6:38 PM',
  },
  {
    name: 'Paris',
    country: 'France',
    temp: 18,
    condition: 'Scattered Clouds',
    high: 22,
    low: 14,
    uv: 4,
    wind: 13,
    windDir: 'SSW',
    humidity: 70,
    airQuality: 32,
    airQualityLabel: 'Good',
    sunrise: '7:15 AM',
    sunset: '7:20 PM',
  },
];

interface TimeTheme {
  label: string;
  badge: string;
  defaultCondition: string;
  bgGradient: [string, string, string];
  overlayGradient: [string, string, string];
  liquidCardTint: [string, string];
  glowColor: string;
  image: any;
  cloudCover: string;
}

const TIME_THEMES: Record<TimeOfDay, TimeTheme> = {
  morning: {
    label: 'Morning',
    badge: '🌅 MORNING DAWN',
    defaultCondition: 'Golden Sunrise',
    bgGradient: ['#2B3A60', '#A85A65', '#E28E72'],
    overlayGradient: ['rgba(30, 20, 45, 0.15)', 'rgba(40, 28, 50, 0.40)', 'rgba(25, 20, 38, 0.90)'],
    liquidCardTint: ['rgba(120, 75, 105, 0.38)', 'rgba(45, 32, 60, 0.65)'],
    glowColor: '#FFB86C',
    image: require('../../assets/images/clouds-morning.jpg'),
    cloudCover: '42% Cloud Cover',
  },
  afternoon: {
    label: 'Afternoon',
    badge: '☀️ AFTERNOON SKY',
    defaultCondition: 'Sunlit Clouds',
    bgGradient: ['#114E96', '#2274CA', '#4E9DE6'],
    overlayGradient: ['rgba(10, 30, 65, 0.15)', 'rgba(15, 45, 90, 0.40)', 'rgba(10, 28, 58, 0.90)'],
    liquidCardTint: ['rgba(35, 90, 160, 0.38)', 'rgba(15, 45, 95, 0.65)'],
    glowColor: '#64B5F6',
    image: require('../../assets/images/clouds-afternoon.jpg'),
    cloudCover: '58% Cloud Cover',
  },
  evening: {
    label: 'Evening',
    badge: '🌙 EVENING TWILIGHT',
    defaultCondition: 'Twilight Glow',
    bgGradient: ['#2E335A', '#1C1B33', '#111026'],
    overlayGradient: ['rgba(15, 10, 30, 0.20)', 'rgba(25, 18, 45, 0.50)', 'rgba(17, 16, 38, 0.94)'],
    liquidCardTint: ['rgba(72, 49, 157, 0.38)', 'rgba(32, 28, 64, 0.65)'],
    glowColor: '#C427FB',
    image: require('../../assets/images/clouds-evening.jpg'),
    cloudCover: '30% Cloud Cover',
  },
};

function getSystemTimeOfDay(): TimeOfDay {
  const currentHour = new Date().getHours();
  if (currentHour >= 5 && currentHour < 12) return 'morning';
  if (currentHour >= 12 && currentHour < 18) return 'afternoon';
  return 'evening';
}

function weatherDescriptionForCode(code: number) {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorm';
}

function formatClock(value?: string) {
  if (!value) return '--';
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface HourlyItem {
  id: string;
  time: string;
  temp: number;
  rainChance?: string;
  condition: 'rain' | 'cloud-moon' | 'cloud' | 'sun';
  desc: string;
}

const BASE_HOURLY_DATA: HourlyItem[] = [
  { id: '1', time: '12 AM', temp: 18, rainChance: '30%', condition: 'rain', desc: 'Light Rain Showers' },
  { id: '2', time: 'Now', temp: 19, condition: 'cloud-moon', desc: 'Mostly Clear & Calm' },
  { id: '3', time: '1 AM', temp: 19, rainChance: '20%', condition: 'rain', desc: 'Passing Showers' },
  { id: '4', time: '2 AM', temp: 18, condition: 'cloud-moon', desc: 'Clear Night Sky' },
  { id: '5', time: '3 AM', temp: 18, condition: 'cloud', desc: 'Cool Evening Breeze' },
  { id: '6', time: '4 AM', temp: 17, condition: 'cloud', desc: 'Scattered Clouds' },
  { id: '7', time: '5 AM', temp: 17, condition: 'cloud-moon', desc: 'First Dawn Light' },
  { id: '8', time: '6 AM', temp: 18, condition: 'sun', desc: 'Golden Sunrise' },
  { id: '9', time: '7 AM', temp: 20, condition: 'sun', desc: 'Clear Sunlit Morning' },
  { id: '10', time: '8 AM', temp: 22, condition: 'sun', desc: 'Bright Morning Sun' },
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
  { id: 'd1', day: 'Today', condition: 'cloud-moon', minTemp: 18, maxTemp: 24 },
  { id: 'd2', day: 'Mon', condition: 'rain', rainChance: '70%', minTemp: 17, maxTemp: 22 },
  { id: 'd3', day: 'Tue', condition: 'cloud', minTemp: 16, maxTemp: 21 },
  { id: 'd4', day: 'Wed', condition: 'sun', minTemp: 18, maxTemp: 25 },
  { id: 'd5', day: 'Thu', condition: 'sun', minTemp: 19, maxTemp: 26 },
  { id: 'd6', day: 'Fri', condition: 'rain', rainChance: '45%', minTemp: 18, maxTemp: 23 },
  { id: 'd7', day: 'Sat', condition: 'cloud-moon', minTemp: 17, maxTemp: 22 },
];

// Reusable iOS Liquid Glass Card
function LiquidGlassCard({
  children,
  style,
  tintColors,
  intensity = 60,
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
      {/* 1. Underlying Frosted Glass Blur */}
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />

      {/* 2. Liquid Glass Translucent Fluid Tint */}
      <LinearGradient
        colors={
          tintColors ?? [
            'rgba(255, 255, 255, 0.16)',
            'rgba(255, 255, 255, 0.04)',
            'rgba(18, 22, 45, 0.55)',
          ]
        }
        start={{ x: 0.1, y: 0.0 }}
        end={{ x: 0.9, y: 1.0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 3. Top Specular Liquid Light Refraction Rim */}
      <View style={styles.liquidSpecularTop} />

      {/* 4. Left Rim Ambient Highlight */}
      <View style={styles.liquidSpecularLeft} />

      {/* 5. Liquid Prismatic Shimmer Sweep */}
      {shimmerAnim && (
        <Animated.View
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
              'rgba(255, 255, 255, 0.09)',
              'rgba(255, 255, 255, 0.22)',
              'rgba(255, 255, 255, 0.09)',
              'rgba(255, 255, 255, 0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      {/* 6. Card Inner Content */}
      {children}
    </View>
  );
}

// Stylized Animated Vector Weather Icon Component
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
        <View style={[styles.cloudShape, { backgroundColor: '#B8C0D8' }]} />
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

export default function HomeScreen() {
  const router = useRouter();
  const { welcomeName: routeWelcomeName } = useLocalSearchParams<{
    welcomeName?: string | string[];
  }>();
  const welcomeName = typeof routeWelcomeName === 'string' ? routeWelcomeName.trim() : '';
  const [activeTab, setActiveTab] = useState<'hourly' | 'weekly'>('hourly');
  const [selectedCity, setSelectedCity] = useState<CityData>(CITIES[0]);
  const [selectedHourId, setSelectedHourId] = useState('2');
  const [homeLocation, setHomeLocation] = useState<HomeLocation | null>(null);
  const [homeWeather, setHomeWeather] = useState<HomeForecast | null>(null);
  const [latestSafetyAlert, setLatestSafetyAlert] = useState<HomeHazardAlert | null>(null);
  const [safetyTipsUnavailable, setSafetyTipsUnavailable] = useState(false);
  const [locationPromptPending, setLocationPromptPending] = useState(false);
  const [homeError, setHomeError] = useState('');
  const [menuExpanded, setMenuExpanded] = useState(false);
  const [citySelectorVisible, setCitySelectorVisible] = useState(false);
  const { profilePictureUrl, loadProfilePicture } = useProfilePicture();

  // Dashboard Collapse / Expand State
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(true);

  // Time of day state: auto or manual override
  const [timeMode, setTimeMode] = useState<'auto' | TimeOfDay>('auto');
  const [currentTimeOfDay, setCurrentTimeOfDay] = useState<TimeOfDay>(getSystemTimeOfDay());
  const [liveClock, setLiveClock] = useState(new Date());

  // Effective time of day
  const effectiveTimeOfDay: TimeOfDay = timeMode === 'auto' ? currentTimeOfDay : timeMode;
  const currentTheme = TIME_THEMES[effectiveTimeOfDay];

  // Dynamic Selected Weather derived from selected hour or city base
  const hourlyForecast =
    homeWeather?.hourly.slice(0, 10).map((hour, index): HourlyItem => ({
      id: String(index + 1),
      time:
        index === 1
          ? 'Now'
          : new Date(hour.time).toLocaleTimeString([], { hour: 'numeric' }),
      temp: Math.round(hour.temperatureC),
      rainChance: `${hour.precipitationProbability}%`,
      condition:
        hour.weatherCode === 0
          ? 'sun'
          : hour.weatherCode <= 3
            ? 'cloud'
            : hour.weatherCode <= 48
              ? 'cloud-moon'
              : 'rain',
      desc: weatherDescriptionForCode(hour.weatherCode),
    })) ?? BASE_HOURLY_DATA;
  const dailyForecast =
    homeWeather?.daily.map((day, index): DailyItem => ({
      id: `home-${day.date}`,
      day:
        index === 0
          ? 'Today'
          : new Date(`${day.date}T12:00:00`).toLocaleDateString([], {
              weekday: 'short',
            }),
      condition:
        day.weatherCode === 0
          ? 'sun'
          : day.weatherCode <= 3
            ? 'cloud'
            : day.weatherCode <= 48
              ? 'cloud-moon'
              : 'rain',
      minTemp: Math.round(day.minC),
      maxTemp: Math.round(day.maxC),
      rainChance: `${day.precipitationProbability}%`,
    })) ?? DAILY_DATA;
  const activeHour =
    hourlyForecast.find((hour) => hour.id === selectedHourId) ??
    hourlyForecast[1] ??
    BASE_HOURLY_DATA[1];
  const displayedTemp =
    homeWeather
      ? activeHour.temp
      : selectedHourId === '2'
        ? selectedCity.temp
        : activeHour.temp + (selectedCity.temp - 19);
  const displayedCondition =
    homeWeather
      ? activeHour.desc
      : selectedHourId === '2'
        ? selectedCity.condition
        : activeHour.desc;

  // ANIMATIONS
  const fadeAnim = useMemo(() => new Animated.Value(0), []);
  const cloudDriftAnim = useMemo(() => new Animated.Value(0), []);
  const imageFadeAnim = useMemo(() => new Animated.Value(1), []);
  const shimmerAnim = useMemo(() => new Animated.Value(-SCREEN_WIDTH), []);
  const pulseAnim = useMemo(() => new Animated.Value(0), []);
  const windSwayAnim = useMemo(() => new Animated.Value(0), []);
  const radarSweepAnim = useMemo(() => new Animated.Value(0), []);
  const sunFloatAnim = useMemo(() => new Animated.Value(0), []);
  const expandAnim = useMemo(() => new Animated.Value(1), []);
  const dragRubberBandAnim = useMemo(() => new Animated.Value(0), []);
  const menuAnim = useMemo(() => new Animated.Value(0), []);
  const welcomeAnim = useMemo(() => new Animated.Value(0), []);

  const loadHomeProfile = useCallback(async () => {
    try {
      const { profile } = await profileApi<{
        profile: {
          home_location: HomeLocation | null;
          location_prompt_dismissed_at: string | null;
        };
      }>('/profile');
      setHomeLocation(profile.home_location);
      setHomeWeather(null);
      setHomeError('');
      try {
        const { alerts } = await profileApi<{
          alerts: HomeHazardAlert[];
          last_updated: string | null;
        }>('/alerts');
        setLatestSafetyAlert(alerts.find((alert) => alert.hazard?.safety_tips?.length) ?? null);
        setSafetyTipsUnavailable(false);
      } catch (alertError) {
        console.warn('Unable to load local safety tips:', alertError);
        setSafetyTipsUnavailable(true);
      }

      const permission = await Location.getForegroundPermissionsAsync();
      setLocationPromptPending(!permission.granted);
      if (permission.granted && profile.location_prompt_dismissed_at) {
        void profileApi('/profile/location-prompt', {
          method: 'PATCH',
          body: JSON.stringify({ dismissedAt: null }),
        }).catch((error: unknown) => {
          console.warn('Unable to clear the location reminder:', error);
        });
      } else if (
        !permission.granted &&
        profile.location_prompt_dismissed_at &&
        Date.parse(profile.location_prompt_dismissed_at) < APP_LAUNCH_STARTED_AT
      ) {
        router.push({
          pathname: '/onboarding',
          params: { startRegistration: 'true', promptOnly: 'true' },
        });
      }

      if (!profile.home_location) {
        setHomeWeather(null);
        return;
      }

      const name =
        profile.home_location.city ||
        profile.home_location.barangay ||
        profile.home_location.address.split(',')[0] ||
        'Home';
      setSelectedCity((current) => ({
        ...current,
        name,
        country: 'Philippines',
      }));

      if (!API_URL) throw new Error('Set EXPO_PUBLIC_API_URL to your backend URL.');
      const query = new URLSearchParams({
        latitude: String(profile.home_location.latitude),
        longitude: String(profile.home_location.longitude),
      });
      const response = await fetch(`${API_URL}/weather?${query}`);
      const result = (await response.json()) as HomeForecast & {
        message?: string | string[];
      };
      if (!response.ok) {
        throw new Error(
          Array.isArray(result.message)
            ? result.message.join(', ')
            : result.message ?? 'Home weather is unavailable.',
        );
      }
      setHomeWeather(result);
      setHomeError('');
      setSelectedCity((current) => ({
        ...current,
        name,
        country: 'Philippines',
        temp: Math.round(result.current.temperatureC),
        condition: weatherDescriptionForCode(result.current.weatherCode),
        high: Math.round(result.daily[0]?.maxC ?? result.current.temperatureC),
        low: Math.round(result.daily[0]?.minC ?? result.current.temperatureC),
        uv: result.current.uvIndex,
        wind: result.current.windKph,
        humidity: result.current.humidityPercent,
        sunrise: formatClock(result.daily[0]?.sunrise),
        sunset: formatClock(result.daily[0]?.sunset),
      }));
    } catch (error) {
      setHomeError(
        error instanceof Error ? error.message : 'Unable to load your home weather.',
      );
      console.warn('Home profile refresh failed:', error);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void loadProfilePicture();
      void loadHomeProfile();
    }, [loadHomeProfile, loadProfilePicture]),
  );

  useEffect(() => {
    const checkLocationPermission = async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        setLocationPromptPending(!permission.granted);
      } catch (error) {
        console.error('Unable to check location permission:', error);
      }
    };

    void checkLocationPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkLocationPermission();
    });
    return () => subscription.remove();
  }, []);


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

  // Live ticking clock (updates every second for real-time responsiveness)
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setLiveClock(new Date());
      const detected = getSystemTimeOfDay();
      setCurrentTimeOfDay(detected);
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);


  useEffect(() => {
    imageFadeAnim.setValue(0.2);
    Animated.timing(imageFadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [effectiveTimeOfDay, imageFadeAnim]);


  useEffect(() => {
    // 1. Entrance Fade
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // 2. Cloud horizontal ambient drift
    Animated.loop(
      Animated.sequence([
        Animated.timing(cloudDriftAnim, {
          toValue: 20,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(cloudDriftAnim, {
          toValue: -20,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // 3. Liquid Glass Prismatic Shimmer Sweep
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: SCREEN_WIDTH * 1.5,
        duration: 4800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();

    // 4. Pulse / Breathing effect
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

    // 5. Compass / Wind vane sway animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(windSwayAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(windSwayAnim, {
          toValue: -1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // 6. Live Radar Sonar Sweep
    Animated.loop(
      Animated.timing(radarSweepAnim, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ).start();

    // 7. Sun / Moon floating motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(sunFloatAnim, {
          toValue: -6,
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
  }, [
    fadeAnim,
    cloudDriftAnim,
    shimmerAnim,
    pulseAnim,
    windSwayAnim,
    radarSweepAnim,
    sunFloatAnim,
  ]);

  // Expand / Collapse with smooth Spring Animation
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
          // Rubber-band drag feedback
          dragRubberBandAnim.setValue(gestureState.dy * 0.35);
        },
        onPanResponderRelease: (_, gestureState) => {
          // Reset rubber-band
          Animated.spring(dragRubberBandAnim, {
            toValue: 0,
            friction: 6,
            useNativeDriver: false,
          }).start();

          // 1. SWIPE DOWN -> Collapse
          if (gestureState.dy > 20) {
            collapseDashboard();
          }
          // 2. SWIPE UP -> Expand
          else if (gestureState.dy < -20) {
            expandDashboard();
          }
          // 3. TAP (Small movement) -> Toggle
          else if (Math.abs(gestureState.dy) < 15 && Math.abs(gestureState.dx) < 15) {
            toggleDashboard();
          }
        },
      }),
    [dragRubberBandAnim, collapseDashboard, expandDashboard, toggleDashboard]
  );

  // Interpolations for wind compass rotation
  const windRotate = windSwayAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-12deg', '12deg'],
  });

  // Animated height for bottom dashboard enclosure
  const sheetHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLLAPSED_ENCLOSURE_HEIGHT, EXPANDED_ENCLOSURE_HEIGHT],
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* 1. Underlying Sky Gradient */}
      <LinearGradient
        colors={currentTheme.bgGradient}
        start={{ x: 0.1, y: 0.0 }}
        end={{ x: 0.9, y: 1.0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 2. Full-Screen Dynamic Cloud Canvas with Continuous Living Drift */}
      <Animated.View
        style={[
          styles.fullScreenCloudWrapper,
          {
            opacity: imageFadeAnim,
            transform: [{ translateX: cloudDriftAnim }],
          },
        ]}
      >
        <Image
          source={currentTheme.image}
          style={styles.fullScreenCloudImage}
          contentFit="cover"
          transition={600}
        />
      </Animated.View>

      {/* 3. Atmospheric Ambient Glow */}
      <Animated.View
        style={[
          styles.atmosphericGlow,
          {
            backgroundColor: currentTheme.glowColor,
            opacity: pulseAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.28, 0.45],
            }),
            transform: [
              {
                scale: pulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.08],
                }),
              },
            ],
          },
        ]}
      />

      {/* 4. Full-Screen Protective Specular Vignette for Readability */}
      <LinearGradient
        colors={currentTheme.overlayGradient}
        start={{ x: 0.5, y: 0.0 }}
        end={{ x: 0.5, y: 1.0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 5. Scrollable Weather Dashboard */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {locationPromptPending && (
          <View style={styles.locationBanner}>
            <View style={styles.locationBannerText}>
              <Text style={styles.locationBannerTitle}>Enable location</Text>
              <Text style={styles.locationBannerDescription}>
                Turn on location access for more relevant local alerts.
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/onboarding',
                  params: { startRegistration: 'true', promptOnly: 'true' },
                })
              }
              style={styles.locationBannerButton}
            >
              <Text style={styles.locationBannerButtonText}>Enable</Text>
            </TouchableOpacity>
          </View>
        )}
        {!homeLocation && !locationPromptPending && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push('/settings_page/edit_profile')}
            style={styles.locationBanner}
          >
            <View style={styles.locationBannerText}>
              <Text style={styles.locationBannerTitle}>Add a home location</Text>
              <Text style={styles.locationBannerDescription}>
                Set a home location to load local weather.
              </Text>
            </View>
            <Text style={styles.locationBannerButtonText}>Set up</Text>
          </TouchableOpacity>
        )}
        {homeError ? (
          <Text accessibilityRole="alert" style={styles.homeError}>
            {homeError}
          </Text>
        ) : null}
        {homeWeather?.updatedAt ? (
          <Text style={styles.weatherUpdated}>
            {homeWeather.stale ? 'Weather unavailable · ' : 'Last updated · '}
            {new Date(homeWeather.updatedAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
        ) : null}
        {latestSafetyAlert?.hazard ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push('/alert_page/alert')}
            style={styles.aiSummaryCard}
          >
            <Text style={styles.aiSummaryEyebrow}>AI WEATHER SAFETY TIPS</Text>
            <Text style={styles.aiSummaryTitle}>
              {latestSafetyAlert.hazard.hazard_type} · {latestSafetyAlert.hazard.risk_level}
            </Text>
            {latestSafetyAlert.hazard.safety_tips.slice(0, 3).map((tip) => (
              <Text key={tip} style={styles.aiSummaryTip}>• {tip}</Text>
            ))}
            <Text style={styles.aiSummaryDisclaimer}>Follow official PAGASA/LGU advisories. View all alerts ›</Text>
          </TouchableOpacity>
        ) : null}
        {safetyTipsUnavailable ? (
          <View style={styles.safetyTipsUnavailable}>
            <Text accessibilityRole="alert" style={styles.safetyTipsUnavailableText}>
              Safety tips are unavailable right now
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => void loadHomeProfile()}
              style={styles.safetyTipsRetry}
            >
              <Text style={styles.safetyTipsRetryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {/* Top Header / Hero Weather View */}
        <Animated.View style={[styles.headerSection, { opacity: fadeAnim }]}>
          <TouchableOpacity
            onPress={() => setCitySelectorVisible(true)}
            activeOpacity={0.8}
            style={styles.cityPillButton}
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
          </View>
        </Animated.View>

        {/* Time of Day Liquid Glass Switcher */}
        <LiquidGlassCard
          style={styles.cycleSwitcherGlassCard}
          intensity={45}
          tintColors={['rgba(255, 255, 255, 0.18)', 'rgba(15, 20, 45, 0.45)']}
          shimmerAnim={shimmerAnim}
        >
          <View style={styles.cycleSwitcherInner}>
            <TouchableOpacity
              style={[styles.cyclePill, timeMode === 'auto' && styles.cyclePillActive]}
              onPress={() => setTimeMode('auto')}
              activeOpacity={0.8}
            >
              <Text style={[styles.cyclePillText, timeMode === 'auto' && styles.cyclePillTextActive]}>
                Auto (Live)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cyclePill, timeMode === 'morning' && styles.cyclePillActive]}
              onPress={() => setTimeMode('morning')}
              activeOpacity={0.8}
            >
              <Text style={[styles.cyclePillText, timeMode === 'morning' && styles.cyclePillTextActive]}>
                🌅 Morning
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cyclePill, timeMode === 'afternoon' && styles.cyclePillActive]}
              onPress={() => setTimeMode('afternoon')}
              activeOpacity={0.8}
            >
              <Text style={[styles.cyclePillText, timeMode === 'afternoon' && styles.cyclePillTextActive]}>
                ☀️ Afternoon
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cyclePill, timeMode === 'evening' && styles.cyclePillActive]}
              onPress={() => setTimeMode('evening')}
              activeOpacity={0.8}
            >
              <Text style={[styles.cyclePillText, timeMode === 'evening' && styles.cyclePillTextActive]}>
                🌙 Evening
              </Text>
            </TouchableOpacity>
          </View>
        </LiquidGlassCard>

        {/* Live Sky & Clock Liquid Pill Badge */}
        <LiquidGlassCard
          style={styles.liveSkyStatusCard}
          intensity={50}
          shimmerAnim={shimmerAnim}
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
              {currentTheme.badge} • ☁️ {currentTheme.cloudCover} • 🕒{' '}
              {liveClock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </Text>
          </View>
        </LiquidGlassCard>
      </ScrollView>

      {/* 6. UNIFIED LIQUID GLASS BOTTOM DASHBOARD ENCLOSURE (ENCLOSED WITH NAVBAR) */}
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
          intensity={80}
          tintColors={currentTheme.liquidCardTint}
          shimmerAnim={shimmerAnim}
        >
          {/* Top Drag Handle Header (Responds to BOTH TAP and SWIPE) */}
          <View
            style={styles.collapseToggleHeader}
            {...sheetPanResponder.panHandlers}
          >
            <View style={styles.dragHandle} />
          </View>



          {/* FULL DASHBOARD CONTENT (Visible when Expanded) */}
          {isDashboardExpanded && (
            <Animated.View style={[styles.expandedContentWrapper, { opacity: expandAnim }]}>
              {/* Segmented Liquid Tab Controls */}
              <View style={styles.tabBar}>
                <TouchableOpacity
                  onPress={() => setActiveTab('hourly')}
                  activeOpacity={0.8}
                  style={[styles.tabItem, activeTab === 'hourly' && styles.tabItemActive]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === 'hourly' ? styles.tabTextActive : styles.tabTextInactive,
                    ]}
                  >
                    Hourly Forecast
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setActiveTab('weekly')}
                  activeOpacity={0.8}
                  style={[styles.tabItem, activeTab === 'weekly' && styles.tabItemActive]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === 'weekly' ? styles.tabTextActive : styles.tabTextInactive,
                    ]}
                  >
                    Weekly Forecast
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Divider Specular Line */}
              <View style={styles.tabDivider} />

              {/* Scrollable Dashboard Cards */}
              <ScrollView
                style={styles.expandedDashboardScroll}
                showsVerticalScrollIndicator={false}
              >

              {/* Hourly View */}
              {activeTab === 'hourly' && (
                <View>
                  <Text style={styles.sectionSubtitle}>
                    Tap any time slot to inspect preview metrics
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.hourlyList}
                  >
                    {hourlyForecast.map((item) => {
                      const isSelected = selectedHourId === item.id;
                      const itemTemp = homeWeather
                        ? item.temp
                        : item.id === '2'
                          ? selectedCity.temp
                          : item.temp + (selectedCity.temp - 19);

                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => setSelectedHourId(item.id)}
                          activeOpacity={0.85}
                          style={[
                            styles.hourlyGlassCard,
                            isSelected
                              ? styles.hourlyGlassCardSelected
                              : styles.hourlyGlassCardDefault,
                          ]}
                        >
                          {/* Internal Liquid Sheen on Selected Card */}
                          {isSelected && (
                            <LinearGradient
                              colors={['rgba(255, 255, 255, 0.35)', 'rgba(72, 49, 157, 0.45)']}
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
                </View>
              )}

              {/* Weekly View */}
              {activeTab === 'weekly' && (
                <View style={styles.weeklyList}>
                  <Text style={styles.sectionSubtitle}>7-Day Temperature Range</Text>
                  {dailyForecast.map((item) => (
                    <View key={item.id} style={styles.weeklyRow}>
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
                          colors={['#48319D', '#00D2FF', '#FFAE35']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.tempBarProgress}
                        />
                        {/* Live Marker on Today */}
                        {item.day === 'Today' && (
                          <Animated.View
                            style={[
                              styles.tempBarCurrentMarker,
                              {
                                opacity: pulseAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0.7, 1],
                                }),
                              },
                            ]}
                          />
                        )}
                      </View>
                      <Text style={styles.weeklyMaxTemp}>{item.maxTemp}°</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* LIQUID GLASS WIDGETS GRID */}
              <View style={styles.detailsGrid}>
                {/* 1. Live Weather Radar Widget with Sonar Animation */}
                <LiquidGlassCard style={styles.wideWidgetCard} intensity={55}>
                  <View style={styles.widgetHeaderRow}>
                    <Text style={styles.widgetLabel}>LIVE DOPPLER RADAR</Text>
                    <View style={styles.radarLiveBadge}>
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
                      <Text style={styles.radarLiveText}>ACTIVE</Text>
                    </View>
                  </View>

                  <View style={styles.radarVisualContainer}>
                    {/* Sonar sweep rings */}
                    <Animated.View
                      style={[
                        styles.radarRing,
                        {
                          transform: [
                            {
                              scale: radarSweepAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.3, 1.8],
                              }),
                            },
                          ],
                          opacity: radarSweepAnim.interpolate({
                            inputRange: [0, 0.7, 1],
                            outputRange: [0.8, 0.3, 0],
                          }),
                        },
                      ]}
                    />
                    <View style={styles.radarCenterPin}>
                      <View style={styles.radarPinInner} />
                    </View>
                    <View style={styles.radarInfoCol}>
                      <Text style={styles.radarPrimaryText}>Precipitation Approaching</Text>
                      <Text style={styles.radarSecondaryText}>
                        Scattered cloud cover across {selectedCity.name}. No storm warnings.
                      </Text>
                    </View>
                  </View>
                </LiquidGlassCard>

                {/* 2. Air Quality Widget with Animated Spectrum */}
                <LiquidGlassCard style={styles.detailCard} intensity={55}>
                  <Text style={styles.detailLabel}>AIR QUALITY</Text>
                  <Text style={styles.detailValue}>
                    {selectedCity.airQuality} - {selectedCity.airQualityLabel}
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
                          left: `${Math.min(100, Math.max(10, selectedCity.airQuality))}%`,
                          transform: [
                            {
                              scale: pulseAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 1.3],
                              }),
                            },
                          ],
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.detailSub}>Air quality is ideal for outdoor activities.</Text>
                </LiquidGlassCard>

                {/* 3. UV Index Widget with Liquid Meter */}
                <LiquidGlassCard style={styles.detailCard} intensity={55}>
                  <Text style={styles.detailLabel}>UV INDEX</Text>
                  <Text style={styles.detailValue}>
                    {effectiveTimeOfDay === 'afternoon' ? '6 High' : `${selectedCity.uv} Moderate`}
                  </Text>
                  <View style={styles.uvMeterTrack}>
                    <LinearGradient
                      colors={['#00D2FF', '#FFAE35', '#FF416C']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.uvMeterFill,
                        { width: `${(effectiveTimeOfDay === 'afternoon' ? 6 : selectedCity.uv) * 10}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.detailSub}>
                    {effectiveTimeOfDay === 'afternoon'
                      ? 'Sun protection required from 11 AM - 4 PM.'
                      : 'Low to moderate risk of sun exposure.'}
                  </Text>
                </LiquidGlassCard>

                {/* 4. Wind & Gusts with Rotating Compass Vane */}
                <LiquidGlassCard style={styles.detailCard} intensity={55}>
                  <View style={styles.widgetHeaderRow}>
                    <Text style={styles.detailLabel}>WIND & GUSTS</Text>
                    <Animated.View style={{ transform: [{ rotate: windRotate }] }}>
                      <Text style={styles.compassNeedleIcon}>🧭</Text>
                    </Animated.View>
                  </View>
                  <Text style={styles.detailValue}>
                    {selectedCity.wind} km/h {selectedCity.windDir}
                  </Text>
                  <Text style={styles.detailSub}>
                    Gusts up to {selectedCity.wind + 9} km/h • Humidity {selectedCity.humidity}%
                  </Text>
                </LiquidGlassCard>

                {/* 5. Sunrise / Sunset with Floating Arc */}
                <LiquidGlassCard style={styles.detailCard} intensity={55}>
                  <View style={styles.widgetHeaderRow}>
                    <Text style={styles.detailLabel}>SOLAR CYCLE</Text>
                    <Animated.Text
                      style={[
                        styles.sunIconAnimated,
                        { transform: [{ translateY: sunFloatAnim }] },
                      ]}
                    >
                      {effectiveTimeOfDay === 'evening' ? '🌙' : '☀️'}
                    </Animated.Text>
                  </View>
                  <Text style={styles.detailValue}>
                    {effectiveTimeOfDay === 'morning' ? selectedCity.sunrise : selectedCity.sunset}
                  </Text>
                  <Text style={styles.detailSub}>
                    {effectiveTimeOfDay === 'morning'
                      ? `Sunset tonight at ${selectedCity.sunset}`
                      : `Next sunrise tomorrow at ${selectedCity.sunrise}`}
                  </Text>
                </LiquidGlassCard>
              </View>
                <View style={{ height: 18 }} />
              </ScrollView>
            </Animated.View>
          )}

        </LiquidGlassCard>
      </Animated.View>

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
              `Doppler radar stream active for ${selectedCity.name}, ${selectedCity.country}. Wind ${selectedCity.wind} km/h ${selectedCity.windDir}.`
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
                    } else if (item.label === 'Alerts') {
                      router.push('/alert_page/alert');
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

      {/* Saved home location selector */}
      <Modal visible={citySelectorVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <LiquidGlassCard style={styles.modalGlassCard} intensity={85} shimmerAnim={shimmerAnim}>
            <Text style={styles.modalTitle}>Home location</Text>
            <Text style={styles.modalSubtitle}>
              Local weather and alerts use this saved address.
            </Text>
            <Text style={styles.modalSubtitle}>
              {homeLocation?.address ?? 'No home location has been saved.'}
            </Text>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setCitySelectorVisible(false);
                router.push('/settings_page/edit_profile');
              }}
            >
              <Text style={styles.modalCloseText}>Change home location</Text>
            </TouchableOpacity>

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
    backgroundColor: '#0D0C1D',
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
  fullScreenCloudWrapper: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '124%',
    left: '-12%',
  },
  fullScreenCloudImage: {
    width: '100%',
    height: '100%',
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 62 : 46,
    paddingBottom: 130,
    alignItems: 'center',
  },
  locationBanner: {
    width: '90%',
    maxWidth: 430,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(33, 18, 56, 0.78)',
  },
  locationBannerText: {
    flex: 1,
  },
  locationBannerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  locationBannerDescription: {
    color: '#E1D2F2',
    fontSize: 11,
    marginTop: 3,
  },
  locationBannerButton: {
    minWidth: 58,
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#7000B8',
  },
  locationBannerButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  homeError: {
    width: '90%',
    maxWidth: 430,
    color: '#FFE0E7',
    fontSize: 12,
    padding: 10,
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(100, 25, 45, 0.64)',
  },
  weatherUpdated: {
    width: '90%',
    maxWidth: 430,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    marginBottom: 8,
  },
  aiSummaryCard: {
    width: '90%',
    maxWidth: 430,
    padding: 15,
    marginBottom: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(32, 20, 54, 0.82)',
  },
  safetyTipsUnavailable: {
    width: '90%',
    maxWidth: 430,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginBottom: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(100, 25, 45, 0.64)',
  },
  safetyTipsUnavailableText: {
    flex: 1,
    color: '#FFE0E7',
    fontSize: 12,
    marginRight: 12,
  },
  safetyTipsRetry: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#7000B8',
  },
  safetyTipsRetryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  aiSummaryEyebrow: {
    color: '#D5B6FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  aiSummaryTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 8,
  },
  aiSummaryTip: {
    color: '#F0E7F8',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  aiSummaryDisclaimer: {
    color: '#C6B3D7',
    fontSize: 10,
    marginTop: 10,
  },
  atmosphericGlow: {
    position: 'absolute',
    top: 80,
    left: SCREEN_WIDTH / 2 - 160,
    width: 320,
    height: 320,
    borderRadius: 160,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 6,
  },
  cityPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  cityText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  cityDropdownChevron: {
    marginLeft: 6,
    marginTop: -2,
  },
  chevronText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 16,
  },
  tempHero: {
    color: '#FFFFFF',
    fontSize: 104,
    fontWeight: '200',
    lineHeight: 112,
    marginTop: -2,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 12,
  },
  conditionText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '500',
    marginTop: -2,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  highLowRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  highLowText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  // Liquid Glass Card Core Design
  liquidGlassContainer: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 8,
  },
  liquidSpecularTop: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  liquidSpecularLeft: {
    position: 'absolute',
    top: 14,
    bottom: 14,
    left: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  shimmerBeam: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 140,
  },
  // Switchers & Badges
  cycleSwitcherGlassCard: {
    marginTop: 14,
    marginBottom: 8,
    borderRadius: 22,
  },
  cycleSwitcherInner: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
  },
  cyclePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  cyclePillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
  cyclePillText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    fontWeight: '600',
  },
  cyclePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  liveSkyStatusCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 6,
    marginBottom: 16,
  },
  liveStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00E676',
    marginRight: 8,
    shadowColor: '#00E676',
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  liveStatusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
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
    width: Math.min(SCREEN_WIDTH - 20, 420),
    height: '100%',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderBottomLeftRadius: Platform.OS === 'ios' ? 36 : 28,
    borderBottomRightRadius: Platform.OS === 'ios' ? 36 : 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  collapseToggleHeader: {
    width: '100%',
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 12,
    paddingBottom: 8,
    cursor: 'pointer',
    zIndex: 1,
  },
  dragHandle: {
    width: 48,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  expandedContentWrapper: {
    flex: 1,
  },
  expandedDashboardScroll: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  tabItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  tabItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabTextInactive: {
    color: 'rgba(255, 255, 255, 0.65)',
  },
  tabDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    marginHorizontal: 18,
    marginBottom: 14,
  },
  sectionSubtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  hourlyList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  hourlyGlassCard: {
    width: 66,
    height: 152,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  hourlyGlassCardDefault: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  hourlyGlassCardSelected: {
    backgroundColor: 'rgba(72, 49, 157, 0.45)',
    borderColor: 'rgba(255, 255, 255, 0.75)',
    shadowColor: '#00D2FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.65,
    shadowRadius: 12,
    elevation: 8,
  },
  hourlyTime: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  hourlyTimeSelected: {
    fontWeight: '700',
  },
  rainText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '700',
  },
  hourlyTemp: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  // Weekly View
  weeklyList: {
    paddingHorizontal: 18,
    gap: 10,
  },
  weeklyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  weeklyDay: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    width: 58,
  },
  weeklyConditionCol: {
    alignItems: 'center',
    width: 44,
  },
  weeklyRainText: {
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '700',
  },
  weeklyMinTemp: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 15,
    fontWeight: '500',
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
    width: '100%',
    height: '100%',
  },
  tempBarCurrentMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '42%',
    width: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFF',
    shadowRadius: 4,
    shadowOpacity: 1,
  },
  weeklyMaxTemp: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    width: 34,
    textAlign: 'left',
  },
  // Widgets Grid
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 18,
    gap: 12,
  },
  wideWidgetCard: {
    width: '100%',
    padding: 16,
    borderRadius: 24,
  },
  widgetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  widgetLabel: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  radarLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.4)',
  },
  radarDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00E676',
    marginRight: 5,
  },
  radarLiveText: {
    color: '#00E676',
    fontSize: 10,
    fontWeight: '700',
  },
  radarVisualContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  radarCenterPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 210, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#00D2FF',
  },
  radarPinInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  radarRing: {
    position: 'absolute',
    left: 2,
    top: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#00D2FF',
  },
  radarInfoCol: {
    marginLeft: 16,
    flex: 1,
  },
  radarPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  radarSecondaryText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    marginTop: 2,
  },
  detailCard: {
    width: (SCREEN_WIDTH - 66) / 2,
    maxWidth: 180,
    borderRadius: 24,
    padding: 15,
  },
  detailLabel: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  detailSub: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    lineHeight: 15,
  },
  spectrumBar: {
    height: 6,
    borderRadius: 3,
    marginVertical: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  spectrumPin: {
    position: 'absolute',
    top: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#000',
  },
  uvMeterTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginVertical: 8,
    overflow: 'hidden',
  },
  uvMeterFill: {
    height: '100%',
    borderRadius: 3,
  },
  compassNeedleIcon: {
    fontSize: 18,
  },
  sunIconAnimated: {
    fontSize: 18,
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
    borderColor: 'rgba(255, 174, 53, 0.4)',
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
    backgroundColor: '#00E5FF',
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
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  cityListScroll: {
    maxHeight: 240,
    marginBottom: 14,
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
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    marginTop: 2,
  },
  cityRowTemp: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '300',
  },
  modalOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  modalOptionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  modalCloseButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  modalCloseText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 15,
    fontWeight: '600',
  },
});
