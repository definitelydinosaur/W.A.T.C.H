import React, { useLayoutEffect, useState } from 'react';
import {
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
import { router } from 'expo-router';

const STEPS = ['Home location', 'Institution', 'Preferences'];
const PREFERENCES = [
  { id: 'weather', title: 'Severe weather alerts', description: 'Warnings for dangerous weather near you' },
  { id: 'safety', title: 'Community safety updates', description: 'Important hazards and local announcements' },
  { id: 'school', title: 'School announcements', description: 'Closures and updates from your institution' },
];

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const horizontalGutter = Math.min(24, Math.max(16, width * 0.055));
  const verticalGutter = Math.min(36, Math.max(24, height * 0.045));
  const compactLayout = height < 680 || width < 360;
  const [step, setStep] = useState(0);
  const [homeLocation, setHomeLocation] = useState('');
  const [institution, setInstitution] = useState('');
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([
    'weather',
    'safety',
    'school',
  ]);
  const [pageOffset] = useState(() => new Animated.Value(0));

  const continueOnboarding = () => setStep((current) => Math.min(current + 1, 5));
  const finishOnboarding = () => router.replace('/auth/register');

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
      colors={
        step === 5
          ? ['#F5F6FC', '#F5F6FC']
          : ['#351356', '#511079', '#17152D']
      }
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
            (step === 0 || step === 5) && styles.welcomeCard,
            step === 5 && styles.completeCard,
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
            <View style={styles.progressRow}>
              {STEPS.map((label, index) => {
                const active = step - 2 >= index;
                return (
                  <React.Fragment key={label}>
                    <View style={[styles.progressDot, active && styles.progressDotActive]} />
                    {index < STEPS.length - 1 && (
                      <View
                        style={[
                          styles.progressTrack,
                          step - 2 > index && styles.progressTrackActive,
                        ]}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          )}

          <View style={styles.mainContent}>
            {(step === 0 || step === 5) && (
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
                <PrimaryButton label="Get started" onPress={continueOnboarding} />
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
                  value={homeLocation}
                  onChangeText={setHomeLocation}
                  autoCapitalize="words"
                  returnKeyType="next"
                  accessibilityLabel="Home location"
                />
                <Text style={styles.helperText}>
                  Add a city or neighborhood to get local alerts.
                </Text>
                <Text style={styles.notice}>
                  W.A.T.C.H. will only use your location to show alerts near you.
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
                  value={institution}
                  onChangeText={setInstitution}
                  autoCapitalize="words"
                  returnKeyType="done"
                  accessibilityLabel="Institution name"
                />
                <Text style={styles.helperText}>
                  Add your school or institution for relevant announcements.
                </Text>
                <Text style={styles.notice}>
                  W.A.T.C.H. will only use your institution to show relevant alerts.
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

            {step === 5 && (
              <>
                <Text style={styles.completeScriptTitle}>Welcome to</Text>
                <Text style={styles.completeBrand}>W.A.T.C.H.</Text>
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
            <PrimaryButton label="Continue onboarding" onPress={continueOnboarding} />
          )}
          {step === 5 && (
            <PrimaryButton label="Continue" onPress={finishOnboarding} />
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
  },
  welcomeCard: {
    justifyContent: 'center',
  },
  compactCard: {
    paddingTop: 22,
    paddingBottom: 20,
    borderRadius: 22,
  },
  completeCard: {
    backgroundColor: '#F5F6FC',
    borderColor: 'rgba(43, 29, 70, 0.08)',
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
  completeScriptTitle: {
    color: '#15121B',
    fontFamily: Platform.select({ ios: 'Snell Roundhand', android: 'cursive', default: 'cursive' }),
    fontSize: 28,
    textAlign: 'center',
    marginBottom: 4,
  },
  completeBrand: {
    color: '#111111',
    fontSize: 17,
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
