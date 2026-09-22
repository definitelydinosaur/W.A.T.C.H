import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleRegister = () => {
    if (!email.includes('@')) {
      alert('Please enter a valid email address!');
      return;
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match!');
      return;
    }

    console.log('Registering with', email, password, confirmPassword);
  };

  return (
    <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.centerWrap}
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
            <Text style={styles.title}>W.A.T.C.H.</Text>

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
              style={styles.button}
              activeOpacity={0.85}
              onPress={handleRegister}
            >
              <Text style={styles.buttonText}>Register</Text>
            </TouchableOpacity>

            <Text style={styles.loginPrompt}>
              Already have an account?{' '}
              <Text style={styles.loginLink} onPress={() => router.push('/login')}>
                Log in
              </Text>
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
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
