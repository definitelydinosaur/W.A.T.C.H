import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import supabase from '../lib/supabase';

export default function Index() {
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const restoreRoute = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const session = data.session;
        if (!session) {
          if (active) router.replace('/onboarding');
          return;
        }
        const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
        if (!apiUrl)
          throw new Error('Set EXPO_PUBLIC_API_URL to restore your account.');
        const response = await fetch(`${apiUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const profile: { role?: string; message?: string | string[] } =
          await response.json();
        if (!response.ok) {
          throw new Error(
            Array.isArray(profile.message)
              ? profile.message.join('\n')
              : (profile.message ?? 'Your account role could not be loaded.'),
          );
        }
        if (active) {
          if (profile.role === 'admin') router.replace('/admin');
          else router.replace('/home');
        }
      } catch (routeError) {
        if (active) {
          setError(
            routeError instanceof Error
              ? routeError.message
              : 'Unable to restore your account.',
          );
        }
      }
    };
    void restoreRoute();
    return () => {
      active = false;
    };
  }, [attempt]);

  if (!error) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color="#D5B6FF" />
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <Text style={styles.message}>{error}</Text>
      <Pressable
        onPress={() => {
          setError('');
          setAttempt((value) => value + 1);
        }}
      >
        <Text style={styles.retry}>Retry</Text>
      </Pressable>
      <Pressable onPress={() => router.replace('/auth/login')}>
        <Text style={styles.retry}>Log in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#171022',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 18,
  },
  message: { color: '#EEE6F7', textAlign: 'center', lineHeight: 22 },
  retry: { color: '#D5B6FF', fontSize: 16, fontWeight: '700' },
});
