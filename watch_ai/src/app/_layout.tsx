import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import supabase from '../lib/supabase';
import { profileApi } from '../lib/profile-api';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let loggedExpoGoPushSkip = false;

if (Platform.OS !== 'web' && !isExpoGo) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (error) {
    console.warn('Notification handling is unavailable:', error);
  }
}

export const unstable_settings = {
  anchor: 'onboarding',
};

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let registering = false;

    if (__DEV__) {
      if (!API_URL) {
        console.warn('API health check skipped: set EXPO_PUBLIC_API_URL.');
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        void fetch(`${API_URL}/health`, { signal: controller.signal })
          .then((response) => {
            if (!response.ok) {
              console.warn(
                `API health check failed (HTTP ${response.status}); check that the configured URL serves this backend.`,
              );
            }
          })
          .catch((error: unknown) => {
            console.warn(
              'API is unreachable. Check EXPO_PUBLIC_API_URL, the backend, and your network.',
              error,
            );
          })
          .finally(() => clearTimeout(timeout));
      }
    }

    const registerNotifications = async () => {
      if (Platform.OS === 'web' || registering) return;
      if (isExpoGo) {
        if (!loggedExpoGoPushSkip) {
          console.log('Push notifications need a development build; skipped in Expo Go');
          loggedExpoGoPushSkip = true;
        }
        return;
      }
      if (!Device.isDevice) return;
      registering = true;
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('weather-alerts', {
            name: 'Weather and safety alerts',
            importance: AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#8B5CF6',
          });
        }
        let permission = await Notifications.getPermissionsAsync();
        if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
        if (!permission.granted) return;
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;
        if (!projectId) {
          console.warn('Push registration skipped: no EAS projectId is configured.');
          return;
        }
        const token = await Notifications.getExpoPushTokenAsync({ projectId });
        if (!token.data) return;
        if (!active) return;
        await profileApi('/profile/push-token', {
          method: 'POST',
          body: JSON.stringify({ token: token.data }),
        });
      } catch (error) {
        console.warn('Push notification registration failed:', error);
      } finally {
        registering = false;
      }
    };

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.warn('Unable to check notification session:', error);
          return;
        }
        if (data.session) void registerNotifications();
      })
      .catch((error: unknown) => {
        console.warn('Unable to check notification session:', error);
      });
    const authListener = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setTimeout(() => void registerNotifications(), 0);
    });
    const openFromNotification = (
      response: Notifications.NotificationResponse | null,
    ) => {
      if (!response) return;
      try {
        const data = response.notification.request.content.data as {
          type?: string;
          notificationId?: string;
          announcementId?: string;
          hazardId?: string;
        };
        if (data.type === 'hazard' && data.hazardId) {
          router.push({
            pathname: '/home',
            params: { hazardId: data.hazardId },
          });
        } else if (data.type === 'announcement' && data.notificationId) {
          router.push({
            pathname: '/alert_page/announcement',
            params: { notificationId: data.notificationId },
          });
        } else if (data.type === 'announcement' && data.announcementId) {
          router.push({
            pathname: '/alert_page/announcement',
            params: { id: data.announcementId },
          });
        } else {
          router.push('/alerts');
        }
      } catch (error) {
        console.warn('Unable to open the notification destination:', error);
      }
    };
    let responseListener: Notifications.EventSubscription | null = null;
    if (Platform.OS !== 'web' && !isExpoGo) {
      try {
        responseListener =
          Notifications.addNotificationResponseReceivedListener(
            openFromNotification,
          );
        void Notifications.getLastNotificationResponseAsync()
          .then(openFromNotification)
          .catch((error: unknown) => {
            console.warn('Unable to check the last notification response:', error);
          });
      } catch (error) {
        console.warn('Notification response listeners are unavailable:', error);
      }
    }

    return () => {
      active = false;
      authListener.data.subscription.unsubscribe();
      responseListener?.remove();
    };
  }, [router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="auth/login" options={{ animation: 'fade' }} />
      <Stack.Screen name="auth/register" options={{ animation: 'fade' }} />
      <Stack.Screen name="auth/loading_auth" options={{ animation: 'fade' }} />
      <Stack.Screen name="auth/confirm-email" options={{ animation: 'fade' }} />
      <Stack.Screen name="home" />
      <Stack.Screen name="alerts" options={{ animation: 'fade' }} />
      <Stack.Screen name="weather-watch" options={{ animation: 'fade' }} />
      <Stack.Screen name="map-overview" options={{ animation: 'fade' }} />
      <Stack.Screen name="alert_page/alert" options={{ animation: 'fade' }} />
      <Stack.Screen name="alert_page/announcement" options={{ animation: 'fade' }} />
    </Stack>
  );
}