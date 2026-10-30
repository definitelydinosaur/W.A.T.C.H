import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import MapView from '../../components/map-overview/MapView';
import { profileApi } from '../../lib/profile-api';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

interface LocationResult {
  name: string;
  latitude: number;
  longitude: number;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
}

interface HomeHazard {
  id: string;
  hazard?: {
    hazard_type: string;
    risk_level: string;
    safety_tips: string[];
  } | null;
}

export default function MapOverviewScreen() {
  const [location, setLocation] = useState<LocationResult>({
    name: 'Cebu City',
    latitude: 10.3157,
    longitude: 123.8854,
  });
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [homeCoordinates, setHomeCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [homeHazard, setHomeHazard] = useState<HomeHazard | null>(null);
  const [tipsError, setTipsError] = useState('');

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
      .then((profile) => {
        if (!active) return;
        const home = profile.profile.home_location;
        if (home) {
          setHomeCoordinates({ latitude: home.latitude, longitude: home.longitude });
          setLocation({
            name: home.city || home.address.split(',')[0] || 'Home',
            latitude: home.latitude,
            longitude: home.longitude,
          });
        }
      })
      .catch((loadError: unknown) => {
        console.error('Unable to load the home location for map:', loadError);
      });
    void profileApi<{ alerts: HomeHazard[] }>('/alerts')
      .then((alertResult) => {
        if (!active) return;
        setHomeHazard(
          alertResult.alerts.find((alert) => alert.hazard?.safety_tips?.length) ?? null,
        );
        setTipsError('');
      })
      .catch((loadError: unknown) => {
        console.error('Unable to load home safety tips for map:', loadError);
        if (active) setTipsError('Local safety tips are unavailable.');
      });
    return () => {
      active = false;
    };
  }, []);

  const searchLocation = async () => {
    if (!query.trim()) {
      setError('Enter a city or place to search.');
      return;
    }
    if (!API_URL) {
      setError('Set EXPO_PUBLIC_API_URL to your backend URL.');
      return;
    }
    setSearching(true);
    setError('');
    Keyboard.dismiss();
    try {
      const response = await fetch(
        `${API_URL}/map/geocode?query=${encodeURIComponent(query.trim())}`,
      );
      const result = (await response.json()) as LocationResult & { message?: string };
      if (!response.ok) throw new Error(result.message ?? 'Location search failed.');
      setLocation(result);
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : 'Location search is unavailable.',
      );
    } finally {
      setSearching(false);
    }
  };

  const detail = [
    location.address?.city ?? location.address?.town ?? location.address?.village,
    location.address?.state,
    location.address?.country,
  ]
    .filter(Boolean)
    .join(', ');
  const showingHomeArea = Boolean(
    homeCoordinates &&
      Math.abs(location.latitude - homeCoordinates.latitude) < 0.15 &&
      Math.abs(location.longitude - homeCoordinates.longitude) < 0.15,
  );

  return (
    <View style={styles.screen}>
      <View style={styles.mapArea}>
        <MapView
          latitude={location.latitude}
          longitude={location.longitude}
          label={location.name}
        />
        <View style={styles.searchRow}>
          <Pressable style={styles.homeButton} onPress={() => router.replace('/weather-watch')}>
            <Text style={styles.homeIcon}>⌂</Text>
          </Pressable>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void searchLocation()}
            placeholder="Enter location"
            placeholderTextColor="#81758D"
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel="Search map location"
          />
          <Pressable style={styles.searchButton} onPress={() => void searchLocation()}>
            {searching ? <ActivityIndicator color="#6B21A8" /> : <Text style={styles.searchIcon}>⌕</Text>}
          </Pressable>
        </View>
      </View>
      <View style={styles.detailPanel}>
        <View style={styles.handle} />
        <Text style={styles.placeTitle}>{location.name}</Text>
        <Text style={styles.address}>{detail || 'Cebu City, Philippines'}</Text>
        <Text style={styles.coordinates}>
          {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
        </Text>
        <Text style={styles.mapAttribution}>Map data © OpenStreetMap contributors</Text>
        {showingHomeArea && homeHazard?.hazard ? (
          <View style={styles.safetyPanel}>
            <Text style={styles.safetyTitle}>
              {homeHazard.hazard.hazard_type} · {homeHazard.hazard.risk_level}
            </Text>
            {homeHazard.hazard.safety_tips.slice(0, 3).map((tip) => (
              <Text key={tip} style={styles.safetyTip}>• {tip}</Text>
            ))}
            <Text style={styles.safetyDisclaimer}>Follow official PAGASA/LGU advisories.</Text>
          </View>
        ) : null}
        {showingHomeArea && tipsError ? (
          <Text style={styles.tipsError}>{tipsError}</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EFF0FF' },
  mapArea: { flex: 1, minHeight: 300, position: 'relative' },
  searchRow: { position: 'absolute', top: 18, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 9 },
  homeButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  homeIcon: { color: '#6B21A8', fontSize: 23 },
  searchInput: { flex: 1, height: 42, paddingHorizontal: 16, borderRadius: 22, backgroundColor: '#FFFFFF', color: '#241C30', fontSize: 14 },
  searchButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  searchIcon: { color: '#6B21A8', fontSize: 24, lineHeight: 28 },
  detailPanel: { minHeight: 195, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 20, borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: '#F3F3FF', marginTop: -24 },
  handle: { alignSelf: 'center', width: 48, height: 4, borderRadius: 2, backgroundColor: '#D6D3E5', marginBottom: 20 },
  placeTitle: { color: '#1A1721', fontSize: 17, fontWeight: '800' },
  address: { color: '#6F6876', fontSize: 12, marginTop: 5 },
  coordinates: { color: '#817A88', fontSize: 11, marginTop: 12 },
  mapAttribution: { color: '#898391', fontSize: 10, marginTop: 12 },
  safetyPanel: { padding: 12, marginTop: 12, borderRadius: 14, backgroundColor: '#E8E2F6' },
  safetyTitle: { color: '#351356', fontSize: 13, fontWeight: '800' },
  safetyTip: { color: '#423A4D', fontSize: 11, lineHeight: 16, marginTop: 5 },
  safetyDisclaimer: { color: '#685A78', fontSize: 10, marginTop: 7 },
  tipsError: { color: '#A0184D', fontSize: 11, marginTop: 10 },
  error: { color: '#A0184D', fontSize: 12, marginTop: 10 },
});
