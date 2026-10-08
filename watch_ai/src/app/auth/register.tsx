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
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import LoadingAuth from '../../components/loading-auth';

const SLOW_LOADING_DELAY_MS = 600;

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [showSlowLoading, setShowSlowLoading] = useState(false);
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
    <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.centerWrap}
      >
        <View>
          <View style={styles.cardWrap}>
            <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={['rgba(60,60,90,0.35)', 'rgba(150,150,170,0.25)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.cardContent}>
              <Text style={styles.title}>W.A.T.C.H.</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your full name"
                  placeholderTextColor="#5a5a65"
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
                  placeholderTextColor="#5a5a65"
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
                  placeholderTextColor="#5a5a65"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm password"
                  placeholderTextColor="#5a5a65"
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

              <Text style={styles.loginPrompt}>
                Already have an account?{' '}
                <Text style={styles.loginLink} onPress={() => router.push('/auth/login')}>
                  Log in
                </Text>
              </Text>
            </View>
          </View>
        </View>
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
    paddingHorizontal: 20,
  },
  cardWrap: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  cardContent: {
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: '600',
    color: '#f2f2f5',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 36,
  },
  fieldGroup: {
    marginBottom: 22,
  },
  label: {
    fontSize: 14,
    color: '#e5e5ea',
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 15,
    color: '#2b2b3a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 4,
  },
  button: {
    backgroundColor: 'rgba(35,35,66,0.85)',
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
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
    fontSize: 18,
    fontWeight: '600',
  },
  loginPrompt: {
    marginTop: 18,
    textAlign: 'center',
    color: '#e5e5ea',
    fontSize: 14,
  },
  loginLink: {
    color: '#ffffff',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
