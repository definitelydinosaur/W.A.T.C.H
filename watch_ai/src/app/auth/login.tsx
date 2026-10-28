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
import supabase from '../../lib/supabase';
import LoadingAuth from '../../components/loading-auth';
import useAuthCardTransition from '../../hooks/use-auth-card-transition';

const SLOW_LOADING_DELAY_MS = 600;

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showSlowLoading, setShowSlowLoading] = useState(false);
  const { AnimatedView, animatedStyle, isTransitioning } = useAuthCardTransition();

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

    if (!trimmedEmail.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    if (!password) {
      Alert.alert('Invalid password', 'Please enter your password.');
      return;
    }

    if (!apiUrl) {
      Alert.alert('Login unavailable', 'Set EXPO_PUBLIC_API_URL to your backend URL.');
      return;
    }

    setIsLoggingIn(true);
    const loadingTimeout = setTimeout(
      () => setShowSlowLoading(true),
      SLOW_LOADING_DELAY_MS,
    );
    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });
      const result: {
        message?: string | string[];
        accessToken?: string;
        refreshToken?: string;
        user?: { name?: string };
      } = await response.json();

      if (!response.ok) {
        const message = Array.isArray(result.message)
          ? result.message.join('\n')
          : result.message ?? 'Please check your credentials and try again.';
        throw new Error(message);
      }

      if (!result.accessToken || !result.refreshToken) {
        throw new Error('The server did not return a valid login session.');
      }

      const { error } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });

      if (error) {
        throw new Error(error.message);
      }

      const welcomeName = result.user?.name?.trim() || trimmedEmail.split('@')[0];
      router.replace({ pathname: '/home', params: { welcomeName } });
    } catch (error) {
      Alert.alert(
        'Login failed',
        error instanceof Error ? error.message : 'Unable to connect to the server. Please try again.',
      );
    } finally {
      clearTimeout(loadingTimeout);
      setIsLoggingIn(false);
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
          style={[styles.animatedContainer, animatedStyle]}
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
                  <Text
                    style={styles.forgotPasswordText}
                    onPress={() => alert('Temporary: forgot password screen not ready yet')}
                  >
                    Forgot Password?
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.button, isLoggingIn && styles.buttonDisabled]}
                  activeOpacity={0.85}
                  onPress={handleLogin}
                  disabled={isLoggingIn}
                >
                  <Text style={styles.buttonText}>
                    {isLoggingIn ? 'Logging in...' : 'Log-in'}
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

              <Text style={styles.createAccountPrompt}>
                New to W.A.T.C.H.?{' '}
                <Text
                  style={styles.createAccountText}
                  onPress={() =>
                    router.replace({
                      pathname: '/onboarding',
                      params: { startRegistration: 'true' },
                    })
                  }
                >
                  Create Account
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
  animatedContainer: {
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
    paddingTop: 32,
    paddingBottom: 26,
    paddingHorizontal: 32,
  },
  logo: {
    width: 80,
    height: 80,
    alignSelf: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '600',
    color: '#f2f2f5',
    textAlign: 'center',
    letterSpacing: 4,
    marginTop: 18,
  },
  form: {
    marginTop: 68,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 20,
    color: '#f4f4f8',
    marginBottom: 6,
    marginLeft: 9,
  },
  input: {
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderRadius: 24,
    paddingHorizontal: 16,
    fontSize: 20,
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
    height: 56,
    justifyContent: 'center',
    backgroundColor: 'rgba(40,45,94,0.9)',
    borderRadius: 24,
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
    opacity: 0.6,
  },
  buttonText: {
    color: '#f2f2f5',
    fontSize: 25,
    fontWeight: '500',
  },
  forgotPasswordText: {
    color: '#f3f3f7',
    fontSize: 16,
    marginTop: 18,
    marginRight: 4,
    alignSelf: 'flex-end',
  },
  connectDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  connectText: {
    color: '#f4f4f8',
    fontSize: 15,
    marginHorizontal: 11,
  },
  googleLogo: {
    width: 36,
    height: 36,
    alignSelf: 'center',
    marginTop: 12,
  },
  createAccountPrompt: {
    textAlign: 'center',
    marginTop: 'auto',
    color: '#ffffff',
    fontSize: 15,
  },
  createAccountText: {
    color: '#b7d0ff',
  },
});