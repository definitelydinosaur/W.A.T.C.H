import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';

const STEPS = ['Home location', 'Institution', 'Preferences'];
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const PREFERENCES = [
  { id: 'weather', title: 'Severe weather alerts', description: 'Warnings for dangerous weather near you' },
  { id: 'safety', title: 'Community safety updates', description: 'Important hazards and local announcements' },
  { id: 'school', title: 'School announcements', description: 'Closures and updates from your institution' },
];

interface LocationSuggestion {
  name: string;
  detail: string;
}

export default function OnboardingScreen() {
  const { startRegistration } = useLocalSearchParams<{ startRegistration?: string }>();
  const { width, height } = useWindowDimensions();
  const horizontalGutter = Math.min(24, Math.max(16, width * 0.055));
  const verticalGutter = Math.min(36, Math.max(24, height * 0.045));
  const compactLayout = height < 680 || width < 360;
  const [step, setStep] = useState(startRegistration === 'true' ? 1 : 0);
  const [locationQuery, setLocationQuery] = useState('');
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [filteredLocations, setFilteredLocations] = useState<LocationSuggestion[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState('');
  const [institutionQuery, setInstitutionQuery] = useState('');
  const [showInstitutionSuggestions, setShowInstitutionSuggestions] = useState(false);
  const [filteredInstitutions, setFilteredInstitutions] = useState<LocationSuggestion[]>([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(false);
  const [institutionsError, setInstitutionsError] = useState('');
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([
    'weather',
    'safety',
    'school',
  ]);
  const [pageOffset] = useState(() => new Animated.Value(0));

  const continueOnboarding = () => {
    setShowLocationSuggestions(false);
    setShowInstitutionSuggestions(false);
    setLocationsLoading(false);
    setInstitutionsLoading(false);
    setStep((current) => Math.min(current + 1, 4));
  };
  const chooseRegistration = () => setStep(1);
  const chooseLogin = () => router.replace('/auth/login');
  const finishOnboarding = () =>
    router.replace({
      pathname: '/auth/register',
      params: { onboardingComplete: 'true' },
    });

  useLayoutEffect(() => {
    pageOffset.setValue(12);
    const transition = Animated.timing(pageOffset, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    });

    transition.start();
    return () => transition.stop();
  }, [pageOffset, step]);

  useEffect(() => {
    const query = locationQuery.trim();
    if (step !== 2 || !showLocationSuggestions || query.length < 2) {
      return;
    }
    if (!API_URL) return;

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLocationsLoading(true);
      try {
        const response = await fetch(
          `${API_URL}/map/suggest?kind=location&query=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as LocationSuggestion[] & { message?: string };
        if (!response.ok) throw new Error(result.message ?? 'Location search failed.');
        setFilteredLocations(result);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLocationsError(error instanceof Error ? error.message : 'Location search failed.');
        }
      } finally {
        if (!controller.signal.aborted) setLocationsLoading(false);
      }
    }, 650);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [locationQuery, showLocationSuggestions, step]);

  useEffect(() => {
    const query = institutionQuery.trim();
    if (step !== 3 || !showInstitutionSuggestions || query.length < 2) {
      return;
    }
    if (!API_URL) return;

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setInstitutionsLoading(true);
      try {
        const response = await fetch(
          `${API_URL}/map/suggest?kind=institution&query=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as LocationSuggestion[] & { message?: string };
        if (!response.ok) throw new Error(result.message ?? 'Institution search failed.');
        setFilteredInstitutions(result);
      } catch (error) {
        if (!controller.signal.aborted) {
          setInstitutionsError(error instanceof Error ? error.message : 'Institution search failed.');
        }
      } finally {
        if (!controller.signal.aborted) setInstitutionsLoading(false);
      }
    }, 650);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [institutionQuery, showInstitutionSuggestions, step]);

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Please allow location access in your browser settings.');
        return;
      }
      Alert.alert(
        'Unable to open settings',
        'Please enable location access in your device settings.',
      );
    }
  };

  const togglePreference = (preferenceId: string) => {
    setSelectedPreferences((current) =>
      current.includes(preferenceId)
        ? current.filter((id) => id !== preferenceId)
        : [...current, preferenceId],
    );
  };

  return (
    <LinearGradient
      colors={['#351356', '#511079', '#17152D']}
      locations={[0, 0.48, 1]}
      style={styles.screen}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: horizontalGutter,
            paddingVertical: verticalGutter,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.card,
            (step === 0 || step === 6) && styles.welcomeCard,
            step === 1 && styles.locationPermissionCard,
            compactLayout && styles.compactCard,
            {
              width: Math.min(width - horizontalGutter * 2, 460),
              minHeight: Math.max(0, height - verticalGutter * 2),
              paddingHorizontal: Math.min(26, Math.max(16, width * 0.07)),
              transform: [{ translateX: pageOffset }],
            },
          ]}
        >
          {step >= 2 && step <= 4 && (
            <ProgressIndicator currentStep={step === 2 ? 1 : step === 3 ? 2 : 3} />
          )}

          <View style={styles.mainContent}>
            {(step === 0 || step === 6) && (
              <Image
                source={require('../../utilities/Logo 1.png')}
                style={[styles.logo, compactLayout && styles.compactLogo]}
                resizeMode="contain"
                accessibilityLabel="W.A.T.C.H. weather logo"
              />
            )}

            {step === 0 && (
              <>
                <Text style={styles.scriptTitle}>Welcome aboard</Text>
                <Text style={styles.brand}>W.A.T.C.H.</Text>
                <PrimaryButton label="Get started" onPress={() => setStep(6)} />
              </>
            )}

            {step === 6 && (
              <>
                <Text style={[styles.heading, compactLayout && styles.compactHeading]}>
                  How would you like to continue?
                </Text>
                <PrimaryButton label="Log in" onPress={chooseLogin} />
                <PrimaryButton label="Register" onPress={chooseRegistration} />
                <Pressable onPress={() => setStep(0)} hitSlop={10}>
                  <Text style={styles.textLink}>Back</Text>
                </Pressable>
              </>
            )}

            {step === 1 && (
              <>
                <Text style={[styles.heading, compactLayout && styles.compactHeading]}>Enable precise location</Text>
                <View style={styles.locationIconCircle}>
                  <Image
                    source={require('../../utilities/pin icon.png')}
                    style={styles.locationIcon}
                    resizeMode="contain"
                    accessibilityLabel="Location pin"
                  />
                </View>
                <Text style={[styles.description, compactLayout && styles.compactDescription]}>
                  Your location will be used to show people near you relevant weather and safety alerts.
                </Text>
                <PrimaryButton label="Open Settings" onPress={openSettings} />
                <Pressable onPress={continueOnboarding} hitSlop={10}>
                  <Text style={styles.textLink}>Remind me later</Text>
                </Pressable>
              </>
            )}

            {step === 2 && (
              <>
                <Text style={[styles.heading, compactLayout && styles.compactHeading]}>Add Home Location</Text>
                <TextInput
                  style={styles.input}
                  placeholder="⌕   Enter location"
                  placeholderTextColor="#82798E"
                  value={locationQuery}
                  onChangeText={(value) => {
                    setLocationQuery(value);
                    setFilteredLocations([]);
                    setLocationsError('');
                    setLocationsLoading(false);
                    setShowLocationSuggestions(value.trim().length >= 2);
                  }}
                  autoCapitalize="words"
                  returnKeyType="search"
                  onSubmitEditing={() => {
                    if (filteredLocations[0]) {
                      setLocationQuery(filteredLocations[0].name);
                      setShowLocationSuggestions(false);
                      setLocationsLoading(false);
                    } else if (locationQuery.trim()) {
                      setLocationQuery(locationQuery.trim());
                      setShowLocationSuggestions(false);
                      setLocationsLoading(false);
                    }
                  }}
                  accessibilityLabel="Home location"
                />
                {showLocationSuggestions && locationQuery.trim().length >= 2 && (
                  <SuggestionList
                    suggestions={filteredLocations}
                    query={locationQuery}
                    loading={locationsLoading}
                    error={
                      locationsError ||
                      (!API_URL ? 'Location search is unavailable. Check the backend URL.' : '')
                    }
                    emptyLabel="No matching places found."
                    onSelect={(suggestion) => {
                      setLocationQuery(suggestion.name);
                      setShowLocationSuggestions(false);
                      setLocationsLoading(false);
                    }}
                    onCustomSelect={(query) => {
                      setLocationQuery(query);
                      setShowLocationSuggestions(false);
                      setLocationsLoading(false);
                    }}
                  />
                )}
                <Text style={styles.helperText}>
                  Add a city or neighborhood to get local alerts.
                </Text>
                <Text style={styles.notice}>
                  {privacyNoteForStep(1)}
                </Text>
              </>
            )}

            {step === 3 && (
              <>
                <Text style={[styles.heading, compactLayout && styles.compactHeading]}>Add Institution</Text>
                <TextInput
                  style={styles.input}
                  placeholder="⌕   Enter institution name"
                  placeholderTextColor="#82798E"
                  value={institutionQuery}
                  onChangeText={(value) => {
                    setInstitutionQuery(value);
                    setFilteredInstitutions([]);
                    setInstitutionsError('');
                    setInstitutionsLoading(false);
                    setShowInstitutionSuggestions(value.trim().length >= 2);
                  }}
                  autoCapitalize="words"
                  returnKeyType="search"
                  onSubmitEditing={() => {
                    if (filteredInstitutions[0]) {
                      setInstitutionQuery(filteredInstitutions[0].name);
                      setShowInstitutionSuggestions(false);
                      setInstitutionsLoading(false);
                    } else if (institutionQuery.trim()) {
                      setInstitutionQuery(institutionQuery.trim());
                      setShowInstitutionSuggestions(false);
                      setInstitutionsLoading(false);
                    }
                  }}
                  accessibilityLabel="Institution name"
                />
                {showInstitutionSuggestions && institutionQuery.trim().length >= 2 && (
                  <SuggestionList
                    suggestions={filteredInstitutions}
                    query={institutionQuery}
                    loading={institutionsLoading}
                    error={
                      institutionsError ||
                      (!API_URL ? 'Institution search is unavailable. Check the backend URL.' : '')
                    }
                    emptyLabel="No matching institutions found."
                    onSelect={(suggestion) => {
                      setInstitutionQuery(suggestion.name);
                      setShowInstitutionSuggestions(false);
                      setInstitutionsLoading(false);
                    }}
                    onCustomSelect={(query) => {
                      setInstitutionQuery(query);
                      setShowInstitutionSuggestions(false);
                      setInstitutionsLoading(false);
                    }}
                  />
                )}
                <Text style={styles.helperText}>
                  Add your school or institution for relevant announcements.
                </Text>
                <Text style={styles.notice}>
                  {privacyNoteForStep(2)}
                </Text>
              </>
            )}

            {step === 4 && (
              <>
                <Text style={[styles.heading, compactLayout && styles.compactHeading]}>Preferences</Text>
                <Text style={[styles.description, compactLayout && styles.compactDescription]}>
                  Choose the updates you would like to receive.
                </Text>
                <View style={styles.preferenceList}>
                  {PREFERENCES.map((preference) => {
                    const selected = selectedPreferences.includes(preference.id);
                    return (
                      <Pressable
                        key={preference.id}
                        onPress={() => togglePreference(preference.id)}
                        style={styles.preferenceRow}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                      >
                        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                          {selected && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <View style={styles.preferenceText}>
                          <Text style={styles.preferenceTitle}>{preference.title}</Text>
                          <Text style={styles.preferenceDescription}>{preference.description}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>

          {step === 2 && (
            <PrimaryButton label="Continue" onPress={continueOnboarding} />
          )}
          {step === 3 && (
            <PrimaryButton label="Continue" onPress={continueOnboarding} />
          )}
          {step === 4 && (
            <PrimaryButton label="Continue onboarding" onPress={finishOnboarding} />
          )}
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function ProgressIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  return (
    <View style={styles.progressRow} accessibilityLabel={`Step ${currentStep} of 3`}>
      {STEPS.map((label, index) => {
        const stepNumber = index + 1;
        const active = currentStep === stepNumber;
        return (
          <React.Fragment key={label}>
            <View
              style={[
                styles.progressDot,
                active && styles.progressDotActive,
              ]}
              accessibilityLabel={`${label}${active ? ', current step' : ''}`}
            />
            {index < STEPS.length - 1 && (
              <View
                style={[
                  styles.progressTrack,
                  currentStep > stepNumber && styles.progressTrackActive,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function privacyNoteForStep(stepNumber: 1 | 2) {
  if (stepNumber === 1) {
    return 'W.A.T.C.H. will only use your location to show alerts near you.';
  }
  return 'W.A.T.C.H. will only use your institution information to show alerts near you.';
}

function SuggestionList({
  suggestions,
  query,
  loading,
  error,
  emptyLabel,
  onSelect,
  onCustomSelect,
}: {
  suggestions: LocationSuggestion[];
  query: string;
  loading: boolean;
  error: string;
  emptyLabel: string;
  onSelect: (suggestion: LocationSuggestion) => void;
  onCustomSelect: (query: string) => void;
}) {
  return (
    <View style={styles.suggestionList}>
      <ScrollView
        style={styles.suggestionResults}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {loading && (
          <View style={styles.suggestionStatus}>
            <ActivityIndicator size="small" color="#7000B8" />
            <Text style={styles.suggestionStatusText}>Searching…</Text>
          </View>
        )}
        {!loading && error !== '' && (
          <Text style={styles.suggestionStatusText}>{error}</Text>
        )}
        {!loading && error === '' && suggestions.length === 0 && (
          <Text style={styles.suggestionStatusText}>{emptyLabel}</Text>
        )}
        {suggestions.map((suggestion, index) => (
          <Pressable
            key={`${suggestion.name}-${suggestion.detail}-${index}`}
            style={({ pressed, hovered }) => [
              styles.suggestionRow,
              (pressed || hovered) && styles.suggestionRowPressed,
            ]}
            onPress={() => onSelect(suggestion)}
            accessibilityRole="button"
          >
            <Image
              source={require('../../utilities/pin icon.png')}
              style={styles.suggestionPin}
              resizeMode="contain"
              accessibilityLabel="Location pin"
            />
            <View style={styles.suggestionText}>
              <Text style={styles.suggestionName} numberOfLines={1}>
                {suggestion.name}
              </Text>
              {suggestion.detail !== '' && (
                <Text style={styles.suggestionDetail} numberOfLines={1}>
                  {suggestion.detail}
                </Text>
              )}
            </View>
          </Pressable>
        ))}
        {!loading && query.trim() !== '' && (
          <Pressable
            style={({ pressed, hovered }) => [
              styles.customSuggestion,
              (pressed || hovered) && styles.suggestionRowPressed,
            ]}
            onPress={() => onCustomSelect(query.trim())}
            accessibilityRole="button"
          >
            <Text style={styles.customSuggestionText}>
              Can’t find it? Add custom: {query.trim()}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 460,
    minHeight: 560,
    alignSelf: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 26,
    paddingTop: 30,
    paddingBottom: 28,
    borderRadius: 28,
    backgroundColor: 'rgba(28, 13, 48, 0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'visible',
  },
  welcomeCard: {
    justifyContent: 'center',
  },
  locationPermissionCard: {
    justifyContent: 'center',
  },
  compactCard: {
    paddingTop: 22,
    paddingBottom: 20,
    borderRadius: 22,
  },
  mainContent: {
    alignItems: 'center',
    width: '100%',
  },
  logo: {
    width: 76,
    height: 76,
    marginBottom: 34,
    borderRadius: 18,
  },
  compactLogo: {
    width: 64,
    height: 64,
    marginBottom: 24,
  },
  scriptTitle: {
    color: '#F8F3FF',
    fontFamily: Platform.select({ ios: 'Snell Roundhand', android: 'cursive', default: 'cursive' }),
    fontSize: 26,
    textAlign: 'center',
    marginBottom: 4,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 26,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
  },
  compactHeading: {
    fontSize: 18,
    marginBottom: 16,
  },
  compactDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  description: {
    color: '#E4D9EF',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
  },
  locationIcon: {
    width: 38,
    height: 38,
  },
  locationIconCircle: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    marginVertical: 20,
  },
  button: {
    minHeight: 48,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 9,
    backgroundColor: '#7000B8',
    marginTop: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  textLink: {
    color: '#E5D6F4',
    fontSize: 14,
    marginTop: 18,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    color: '#221632',
    fontSize: 14,
  },
  suggestionList: {
    width: '100%',
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(112,0,184,0.16)',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    zIndex: 2,
    elevation: 4,
  },
  suggestionResults: {
    maxHeight: 220,
  },
  suggestionRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E9E3EF',
  },
  suggestionRowPressed: {
    backgroundColor: '#F1E7FA',
  },
  suggestionPin: {
    width: 18,
    height: 18,
  },
  suggestionText: {
    flex: 1,
  },
  suggestionName: {
    color: '#221632',
    fontSize: 12,
    fontWeight: '600',
  },
  suggestionDetail: {
    color: '#82798E',
    fontSize: 10,
    marginTop: 2,
  },
  suggestionStatus: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  suggestionStatusText: {
    color: '#82798E',
    fontSize: 11,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  customSuggestion: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#F8F3FC',
  },
  customSuggestionText: {
    color: '#7000B8',
    fontSize: 11,
    fontWeight: '600',
  },
  helperText: {
    width: '100%',
    color: '#D7C8E5',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  notice: {
    width: '100%',
    color: '#4C405B',
    backgroundColor: '#FFFFFF',
    fontSize: 11,
    lineHeight: 15,
    borderRadius: 9,
    padding: 12,
    marginTop: 32,
  },
  progressRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 26,
  },
  progressDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#C9B5DC',
  },
  progressDotActive: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#C8A5FF',
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#C9B5DC',
  },
  progressTrackActive: {
    backgroundColor: '#C8A5FF',
  },
  preferenceList: {
    width: '100%',
    gap: 14,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D9C6EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#7000B8',
    borderColor: '#A66DE0',
  },
  checkmark: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    lineHeight: 18,
  },
  preferenceText: {
    flex: 1,
  },
  preferenceTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  preferenceDescription: {
    color: '#D7C8E5',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
});
