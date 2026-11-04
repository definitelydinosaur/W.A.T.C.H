import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

export interface HomeLocationInput {
  name: string;
  detail: string;
  address: string;
  latitude: number;
  longitude: number;
  city: string;
  province: string;
  barangay: string;
}

export interface InstitutionOption {
  id: string;
  name: string;
  short_name?: string | null;
  city?: string | null;
  province?: string | null;
  is_verified?: boolean;
  facebook_page_url?: string | null;
}

type LocationSuggestion = HomeLocationInput;

interface Props {
  visible: boolean;
  kind: 'location' | 'institution';
  onClose: () => void;
  onSelectLocation?: (location: HomeLocationInput) => void;
  onSelectInstitution?: (institution: InstitutionOption) => void;
  onClearInstitution?: () => void;
  includeCurrentLocation?: boolean;
}

export default function ProfileSelectionModal({
  visible,
  kind,
  onClose,
  onSelectLocation,
  onSelectInstitution,
  onClearInstitution,
  includeCurrentLocation = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [facebookPageUrl, setFacebookPageUrl] = useState('');
  const [locations, setLocations] = useState<LocationSuggestion[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentLocationLoading, setCurrentLocationLoading] = useState(false);
  const [error, setError] = useState('');

  const resetSearch = () => {
    setQuery('');
    setFacebookPageUrl('');
    setLocations([]);
    setInstitutions([]);
    setLoading(false);
    setCurrentLocationLoading(false);
    setError('');
  };

  const closePicker = () => {
    resetSearch();
    onClose();
  };

  const selectLocation = (location: HomeLocationInput) => {
    onSelectLocation?.(location);
    resetSearch();
  };

  const selectInstitution = (institution: InstitutionOption) => {
    onSelectInstitution?.(institution);
    resetSearch();
  };

  useEffect(() => {
    if (!visible) return;

    const normalized = query.trim();
    if (normalized.length < 2 || !API_URL) return;

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const path =
          kind === 'location'
            ? `/map/suggest?kind=location&query=${encodeURIComponent(normalized)}`
            : `/institutions?query=${encodeURIComponent(normalized)}`;
        const response = await fetch(`${API_URL}${path}`, {
          signal: controller.signal,
        });
        const result = (await response.json()) as
          | LocationSuggestion[]
          | InstitutionOption[]
          | { message?: string | string[] };
        if (!response.ok) {
          const message = (result as { message?: string | string[] }).message;
          throw new Error(
            Array.isArray(message)
              ? message.join(', ')
              : message ?? 'Search failed.',
          );
        }
        if (kind === 'location') {
          setLocations(result as LocationSuggestion[]);
        } else {
          setInstitutions(result as InstitutionOption[]);
        }
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setError(
            searchError instanceof Error ? searchError.message : 'Search failed.',
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [kind, query, visible]);

  const getCurrentLocation = async () => {
    if (!onSelectLocation) return;
    setCurrentLocationLoading(true);
    setError('');
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!permission.granted) {
        setError(
          permission.canAskAgain
            ? 'Allow location access to use your current location.'
            : 'Location access is blocked. Open settings to allow it.',
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const [address] = await Location.reverseGeocodeAsync(position.coords);
      const city = address?.city ?? address?.subregion ?? address?.district ?? '';
      const province = address?.region ?? '';
      const barangay = address?.district ?? '';
      const name =
        address?.name ??
        city ??
        `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
      const fullAddress = [
        address?.streetNumber,
        address?.street,
        name,
        address?.district,
        city,
        province,
        address?.country,
      ]
        .filter((part, index, parts) => {
          if (!part) return false;
          return parts.findIndex(
            (candidate) =>
              candidate?.toLocaleLowerCase() === part.toLocaleLowerCase(),
          ) === index;
        })
        .join(', ');

      selectLocation({
        name,
        detail: [city, province].filter(Boolean).join(', '),
        address: fullAddress || name,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        city,
        province,
        barangay,
      });
    } catch (locationError) {
      setError(
        locationError instanceof Error
          ? locationError.message
          : 'Unable to determine your current location.',
      );
    } finally {
      setCurrentLocationLoading(false);
    }
  };

  const addCustomInstitution = () => {
    const name = query.trim();
    if (name.length < 2 || !onSelectInstitution) return;
    selectInstitution({
      id: '',
      name,
      is_verified: false,
      facebook_page_url: facebookPageUrl.trim() || undefined,
    });
  };

  const openLocationSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(
        'Unable to open settings',
        'Please enable location access in your device settings.',
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closePicker}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={closePicker} />
        <View style={styles.card}>
          <LinearGradient
            colors={['#351356', '#511079', '#211238']}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.backgroundGradient]}
          />
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>
                {kind === 'location' ? 'Select home location' : 'Select institution'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close picker"
                onPress={closePicker}
                hitSlop={10}
              >
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            <View style={styles.searchField}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                accessibilityLabel={
                  kind === 'location' ? 'Search home location' : 'Search institution'
                }
                autoCapitalize="words"
                onChangeText={(value) => {
                  setQuery(value);
                  setLocations([]);
                  setInstitutions([]);
                  setLoading(false);
                  setError('');
                }}
                placeholder={
                  kind === 'location'
                    ? 'Search city or neighborhood'
                    : 'Search school or university'
                }
                placeholderTextColor="#82798E"
                returnKeyType="search"
                style={styles.searchInput}
                value={query}
              />
            </View>

            {includeCurrentLocation && kind === 'location' && (
              <Pressable
                accessibilityRole="button"
                disabled={currentLocationLoading}
                onPress={() => void getCurrentLocation()}
                style={styles.currentLocation}
              >
                {currentLocationLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.currentLocationText}>Use my current location</Text>
                )}
              </Pressable>
            )}

            {kind === 'institution' && onClearInstitution && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  resetSearch();
                  onClearInstitution();
                }}
                style={styles.clearButton}
              >
                <Text style={styles.clearText}>No institution</Text>
              </Pressable>
            )}

            {error || (query.trim().length >= 2 && !API_URL) ? (
              <View>
                <Text accessibilityRole="alert" style={styles.error}>
                  {error || 'Search is unavailable. Check the backend URL.'}
                </Text>
                {error.includes('Open settings') && (
                  <Pressable onPress={() => void openLocationSettings()}>
                    <Text style={styles.settingsLink}>Open settings</Text>
                  </Pressable>
                )}
              </View>
            ) : null}

            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.results}
              contentContainerStyle={styles.resultContent}
            >
              {loading ? (
                <ActivityIndicator color="#E6D0FF" />
              ) : kind === 'location' ? (
                locations.map((location, index) => (
                  <Pressable
                    accessibilityRole="button"
                    key={`${location.name}-${location.latitude}-${index}`}
                    onPress={() => selectLocation(location)}
                    style={styles.resultRow}
                  >
                    <Text style={styles.resultTitle}>{location.name}</Text>
                    {location.detail ? (
                      <Text style={styles.resultDetail}>{location.detail}</Text>
                    ) : null}
                  </Pressable>
                ))
              ) : (
                institutions.map((institution) => (
                  <Pressable
                    accessibilityRole="button"
                    key={institution.id}
                    onPress={() => selectInstitution(institution)}
                    style={styles.resultRow}
                  >
                    <Text style={styles.resultTitle}>{institution.name}</Text>
                    <Text style={styles.resultDetail}>
                      {[institution.short_name, institution.city, institution.province]
                        .filter(Boolean)
                        .join(' · ')}
                      {institution.is_verified === false ? ' · Pending review' : ''}
                    </Text>
                  </Pressable>
                ))
              )}
              {!loading && query.trim().length >= 2 && !error && (
                kind === 'location' ? (
                  locations.length === 0 ? (
                    <Text style={styles.empty}>No matching places found.</Text>
                  ) : null
                ) : (
                  <>
                    <Text style={styles.customTitle}>Can’t find your institution?</Text>
                    <TextInput
                      accessibilityLabel="Institution Facebook page URL"
                      autoCapitalize="none"
                      keyboardType="url"
                      onChangeText={setFacebookPageUrl}
                      placeholder="Facebook page URL (optional)"
                      placeholderTextColor="#82798E"
                      style={styles.customInput}
                      value={facebookPageUrl}
                    />
                    <Pressable
                      accessibilityRole="button"
                      onPress={addCustomInstitution}
                      style={styles.customButton}
                    >
                      <Text style={styles.currentLocationText}>
                        Add “{query.trim()}” for admin review
                      </Text>
                    </Pressable>
                  </>
                )
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(12, 7, 24, 0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '86%',
    overflow: 'hidden',
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  backgroundGradient: {
    zIndex: 0,
  },
  content: {
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  close: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
  },
  searchField: {
    width: '100%',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    marginBottom: 9,
    elevation: 2,
  },
  searchIcon: {
    color: '#7000B8',
    fontSize: 24,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 46,
    color: '#221632',
    fontSize: 14,
    paddingVertical: 0,
  },
  customInput: {
    width: '100%',
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: '#221632',
    fontSize: 13,
    marginBottom: 8,
  },
  currentLocation: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#7000B8',
  },
  currentLocationText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  clearButton: {
    paddingVertical: 10,
  },
  clearText: {
    color: '#E4D9EF',
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    color: '#FFD4DF',
    fontSize: 13,
    marginBottom: 6,
  },
  settingsLink: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  results: {
    flexGrow: 0,
  },
  resultContent: {
    gap: 7,
    paddingBottom: 8,
  },
  resultRow: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  resultTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  resultDetail: {
    color: '#D5C7E4',
    fontSize: 12,
    marginTop: 3,
  },
  empty: {
    color: '#D5C7E4',
    fontSize: 13,
    paddingVertical: 12,
  },
  customTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 8,
  },
  customButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#7000B8',
  },
});
