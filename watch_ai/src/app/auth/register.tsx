import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import LoadingAuth from '../../components/loading-auth';
import useAuthCardTransition from '../../hooks/use-auth-card-transition';

const SLOW_LOADING_DELAY_MS = 600;

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [showSlowLoading, setShowSlowLoading] = useState(false);
  const { AnimatedView, animatedStyle, navigateTo, isTransitioning } = useAuthCardTransition();
  const handleRegister = async () => {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

    if (trimmedName.length < 3) {
      Alert.alert('Invalid name', 'Please enter a name with at least 3 characters.');
      return;
    }

    if (!trimmedEmail.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Invalid password', 'Your password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please make sure both passwords are the same.');
      return;
    }

    if (!apiUrl) {
      Alert.alert('Registration unavailable', 'Set EXPO_PUBLIC_API_URL to your backend URL.');
      return;
    }

    setIsRegistering(true);
    const loadingTimeout = setTimeout(
      () => setShowSlowLoading(true),
      SLOW_LOADING_DELAY_MS,
    );
    try {
      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: trimmedName,
          email: trimmedEmail,
          password,
        }),
      });
      const result: { message?: string | string[] } = await response.json();

      if (!response.ok) {
        const message = Array.isArray(result.message)
          ? result.message.join('\n')
          : result.message ?? 'Please try again.';
        throw new Error(message);
      }

      router.replace({
        pathname: '/auth/confirm-email',
        params: { email: trimmedEmail },
      });
    } catch (error) {
      Alert.alert(
        'Registration failed',
        error instanceof Error ? error.message : 'Unable to connect to the server. Please try again.',
      );
    } finally {
      clearTimeout(loadingTimeout);
      setIsRegistering(false);
      setShowSlowLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#351356', '#511079', '#17152D']}
      locations={[0, 0.48, 1]}
      style={styles.screen}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.centerWrap}
      >
        <AnimatedView
          pointerEvents={isTransitioning ? 'none' : 'auto'}
          style={[styles.cardContainer, animatedStyle]}
        >
          <View style={styles.cardWrap}>
            <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={['rgba(60,60,90,0.35)', 'rgba(150,150,170,0.25)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.cardContent}>
              <Image
                source={require('../../../assets/images/authpage/Logo.png')}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="W.A.T.C.H. logo"
              />
              <Text style={styles.title}>W.A.T.C.H.</Text>

              <View style={styles.form}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Full Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your full name"
                    placeholderTextColor="rgba(255,255,255,0.9)"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    autoComplete="name"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter email"
                    placeholderTextColor="rgba(255,255,255,0.9)"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter password"
                    placeholderTextColor="rgba(255,255,255,0.9)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter password"
                    placeholderTextColor="rgba(255,255,255,0.9)"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                  />
                </View>

                <TouchableOpacity
                  style={[styles.button, isRegistering && styles.buttonDisabled]}
                  activeOpacity={0.85}
                  onPress={handleRegister}
                  disabled={isRegistering}
                >
                  <Text style={styles.buttonText}>
                    {isRegistering ? 'Registering...' : 'Register'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.connectDivider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.connectText}>OR CONNECT VIA</Text>
                  <View style={styles.dividerLine} />
                </View>
                <Image
                  source={require('../../../assets/images/authpage/google.png')}
                  style={styles.googleLogo}
                  resizeMode="contain"
                  accessibilityLabel="Google"
                />
              </View>

              <Text style={styles.loginPrompt}>
                Already have W.A.T.C.H.?{' '}
                <Text style={styles.loginLink} onPress={() => navigateTo('/auth/login')}>
                  Sign in!
                </Text>
              </Text>
          </View>
        </View>
        </AnimatedView>
      </KeyboardAvoidingView>
      {showSlowLoading && (
        <View style={StyleSheet.absoluteFill}>
          <LoadingAuth />
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  cardContainer: {
    height: '82%',
    width: '100%',
  },
  cardWrap: {
    flex: 1,
    borderRadius: 48,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(185,195,255,0.75)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  cardContent: {
    flex: 1,
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 24,
  },
  logo: {
    width: 68,
    height: 68,
    alignSelf: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '600',
    color: '#f2f2f5',
    textAlign: 'center',
    letterSpacing: 3.5,
    marginTop: 16,
  },
  form: {
    marginTop: 18,
  },
  fieldGroup: {
    marginBottom: 9,
  },
  label: {
    fontSize: 14,
    color: '#f4f4f8',
    marginBottom: 6,
    marginLeft: 9,
  },
  input: {
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderRadius: 20,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 4,
  },
  button: {
    height: 44,
    justifyContent: 'center',
    backgroundColor: 'rgba(40,45,94,0.9)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(90,115,255,0.6)',
    alignItems: 'center',
    marginTop: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#f2f2f5',
    fontSize: 19,
    fontWeight: '500',
  },
  connectDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  connectText: {
    color: '#f4f4f8',
    fontSize: 12,
    marginHorizontal: 9,
  },
  googleLogo: {
    width: 36,
    height: 36,
    alignSelf: 'center',
    marginTop: 10,
  },
  loginPrompt: {
    marginTop: 'auto',
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 12,
  },
  loginLink: {
    color: '#e8b7ff',
  },
});
