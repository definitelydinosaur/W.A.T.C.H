import { useState } from 'react';
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

export default function MapOverviewScreen() {
  const [location, setLocation] = useState<LocationResult>({
    name: 'Cebu City',
    latitude: 10.3157,
    longitude: 123.8854,
  });
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

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
  error: { color: '#A0184D', fontSize: 12, marginTop: 10 },
});
