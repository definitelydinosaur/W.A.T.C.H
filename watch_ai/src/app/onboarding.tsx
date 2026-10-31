import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import ProfileSelectionModal, {
  HomeLocationInput,
  InstitutionOption,
} from '../components/profile-selection-modal';
import { profileApi } from '../lib/profile-api';

const STEPS = ['Home location', 'Institution', 'Preferences'];
const PREFERENCES = [
  { id: 'weather', title: 'Severe weather alerts', description: 'Warnings for dangerous weather near you' },
  { id: 'safety', title: 'Community safety updates', description: 'Important hazards and local announcements' },
  { id: 'school', title: 'School announcements', description: 'Closures and updates from your institution' },
];

export default function OnboardingScreen() {
  const { registrationFlow, startRegistration, promptOnly } = useLocalSearchParams<{
    registrationFlow?: string;
    startRegistration?: string;
    promptOnly?: string;
  }>();
  const { width, height } = useWindowDimensions();
  const horizontalGutter = Math.min(24, Math.max(16, width * 0.055));
  const verticalGutter = Math.min(36, Math.max(24, height * 0.045));
  const compactLayout = height < 680 || width < 360;
  const [step, setStep] = useState(
    registrationFlow === 'true' || startRegistration === 'true' ? 1 : 0,
  );
  const [registrationRequested, setRegistrationRequested] = useState(
    registrationFlow === 'true',
  );
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [institutionModalVisible, setInstitutionModalVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<HomeLocationInput | null>(null);
  const [selectedInstitution, setSelectedInstitution] =
    useState<InstitutionOption | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const permissionTransitionStarted = useRef(false);
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([
    'weather',
    'safety',
    'school',
  ]);
  const [pageOffset] = useState(() => new Animated.Value(0));

  const continueOnboarding = () => setStep((current) => Math.min(current + 1, 4));
  const chooseRegistration = () => {
    setRegistrationRequested(true);
    setStep(1);
  };
  const chooseLogin = () => router.replace('/auth/login');
  const finishOnboarding = () => {
    if (registrationRequested && promptOnly !== 'true') {
      router.replace({
        pathname: '/auth/register',
        params: { onboardingComplete: 'true' },
      });
      return;
    }

    router.replace('/home');
  };

  const completePermissionStep = useCallback(async () => {
    if (permissionTransitionStarted.current) return;
    permissionTransitionStarted.current = true;
    try {
      await profileApi('/profile/location-prompt', {
        method: 'PATCH',
        body: JSON.stringify({ dismissedAt: null }),
      });
      setPermissionError('');
      if (promptOnly === 'true') {
        router.replace('/home');
      } else {
        setStep(2);
      }
    } catch (error) {
      permissionTransitionStarted.current = false;
      setPermissionError(
        error instanceof Error ? error.message : 'Unable to update your location settings.',
      );
    }
  }, [promptOnly]);

  const requestLocationPermission = async () => {
    setPermissionError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      setPermissionBlocked(!permission.granted && !permission.canAskAgain);
      if (permission.granted) {
        await completePermissionStep();
      } else {
        setPermissionError(
          permission.canAskAgain
            ? 'Location access was not granted. You can try again or continue later.'
            : 'Location access is blocked. Open device settings to allow it.',
        );
      }
    } catch (error) {
      setPermissionError(
        error instanceof Error ? error.message : 'Unable to request location access.',
      );
    }
  };

  const remindLater = async () => {
    setIsSaving(true);
    try {
      await profileApi('/profile/location-prompt', {
        method: 'PATCH',
        body: JSON.stringify({ dismissedAt: new Date().toISOString() }),
      });
      if (promptOnly === 'true') {
        router.replace('/home');
      } else {
        setStep(2);
      }
    } catch (error) {
      setPermissionError(
        error instanceof Error ? error.message : 'Unable to save this preference.',
      );
    } finally {
      setIsSaving(false);
    }
  };

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

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(
        'Unable to open settings',
        'Please enable location access in your device settings.',
      );
    }
  };

  useEffect(() => {
    if (
      step !== 1 ||
      (registrationFlow !== 'true' && startRegistration !== 'true')
    ) return;
    let active = true;

    const checkPermission = async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!active) return;
        setPermissionBlocked(!permission.granted && !permission.canAskAgain);
        if (permission.granted) await completePermissionStep();
      } catch (error) {
        if (active) {
          setPermissionError(
            error instanceof Error
              ? error.message
              : 'Unable to check location permission.',
          );
        }
      }
    };

    void checkPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkPermission();
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [completePermissionStep, registrationFlow, startRegistration, step]);

  const saveHomeLocation = async () => {
    if (!selectedLocation) return;
    setIsSaving(true);
    try {
      await profileApi('/profile/home-location', {
        method: 'POST',
        body: JSON.stringify({
          address: selectedLocation.address,
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          city: selectedLocation.city,
          province: selectedLocation.province,
          barangay: selectedLocation.barangay,
        }),
      });
      continueOnboarding();
    } catch (error) {
      Alert.alert(
        'Could not save home location',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const saveInstitution = async () => {
    if (!selectedInstitution) {
      continueOnboarding();
      return;
    }

    setIsSaving(true);
    try {
      const body = selectedInstitution.id
        ? { institutionId: selectedInstitution.id }
        : {
            name: selectedInstitution.name,
            facebookPageUrl: selectedInstitution.facebook_page_url,
          };
      await profileApi('/profile/institution', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      continueOnboarding();
    } catch (error) {
      Alert.alert(
        'Could not save institution',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setIsSaving(false);
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
                  Allow location access for weather and safety alerts near your home. Approximate-only access is supported; alerts may cover a wider area.
                </Text>
                <PrimaryButton
                  label="Enable precise location"
                  onPress={() => void requestLocationPermission()}
                  disabled={isSaving}
                />
                {permissionBlocked && !permissionError && (
                  <Text style={styles.permissionError}>
                    Location permission is blocked. Enable it in device settings to use current-location features.
                  </Text>
                )}
                {permissionError ? (
                  <Text accessibilityRole="alert" style={styles.permissionError}>
                    {permissionError}
                  </Text>
                ) : null}
                <PrimaryButton label="Open settings" onPress={() => void openSettings()} />
                <Pressable
                  disabled={isSaving}
                  onPress={() => void remindLater()}
                  hitSlop={10}
                >
                  <Text style={styles.textLink}>
                    {isSaving ? 'Saving...' : 'Remind me later'}
                  </Text>
                </Pressable>
              </>
            )}

            {step === 2 && (
              <>
                <Text style={[styles.heading, compactLayout && styles.compactHeading]}>Add home location</Text>
                <Text style={styles.helperText}>
                  Your home location is used for local weather and community alerts.
                </Text>
                {selectedLocation ? (
                  <View style={styles.selectedCard}>
                    <Text style={styles.selectedTitle}>{selectedLocation.name}</Text>
                    <Text style={styles.selectedDetail}>{selectedLocation.address}</Text>
                  </View>
                ) : (
                  <Text style={styles.notice}>Choose a place or use your current location.</Text>
                )}
                <PrimaryButton
                  label={selectedLocation ? 'Change home location' : 'Search home location'}
                  onPress={() => setLocationModalVisible(true)}
                />
              </>
            )}

            {step === 3 && (
              <>
                <Text style={[styles.heading, compactLayout && styles.compactHeading]}>Add your institution</Text>
                <Text style={styles.helperText}>
                  Class-suspension alerts are matched to your selected institution.
                </Text>
                {selectedInstitution ? (
                  <View style={styles.selectedCard}>
                    <Text style={styles.selectedTitle}>{selectedInstitution.name}</Text>
                    <Text style={styles.selectedDetail}>
                      {selectedInstitution.is_verified === false
                        ? 'Pending admin review'
                        : [selectedInstitution.city, selectedInstitution.province]
                            .filter(Boolean)
                            .join(', ')}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.notice}>This step is optional.</Text>
                )}
                <PrimaryButton
                  label={selectedInstitution ? 'Change institution' : 'Search institutions'}
                  onPress={() => setInstitutionModalVisible(true)}
                />
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
            <PrimaryButton
              label={isSaving ? 'Saving...' : 'Save home location'}
              onPress={() => void saveHomeLocation()}
              disabled={!selectedLocation || isSaving}
            />
          )}
          {step === 3 && (
            <PrimaryButton
              label={isSaving ? 'Saving...' : selectedInstitution ? 'Save and continue' : 'Skip institution'}
              onPress={() => void saveInstitution()}
              disabled={isSaving}
            />
          )}
          {step === 4 && (
            <PrimaryButton label="Continue onboarding" onPress={finishOnboarding} />
          )}
        </Animated.View>
      </ScrollView>
      <ProfileSelectionModal
        visible={locationModalVisible}
        kind="location"
        includeCurrentLocation
        onClose={() => setLocationModalVisible(false)}
        onSelectLocation={(location) => {
          setSelectedLocation(location);
          setLocationModalVisible(false);
        }}
      />
      <ProfileSelectionModal
        visible={institutionModalVisible}
        kind="institution"
        onClose={() => setInstitutionModalVisible(false)}
        onSelectInstitution={(institution) => {
          setSelectedInstitution(institution);
          setInstitutionModalVisible(false);
        }}
      />
    </LinearGradient>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
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
  buttonDisabled: {
    opacity: 0.45,
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
  permissionError: {
    width: '100%',
    color: '#FFD4DF',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
    textAlign: 'center',
  },
  selectedCard: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
    marginTop: 12,
  },
  selectedTitle: {
    color: '#221632',
    fontSize: 15,
    fontWeight: '700',
  },
  selectedDetail: {
    color: '#62576F',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
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
