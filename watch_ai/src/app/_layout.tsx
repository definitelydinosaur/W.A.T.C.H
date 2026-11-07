import { Stack, useRouter } from 'expo-router';
import { ThemeProvider } from '../theme/theme-context';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

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
      responseListener?.remove();
    };
  }, [router]);

  return (
    <ThemeProvider>
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
      <Stack.Screen name="settings_page/customize-theme" options={{ animation: 'fade' }} />
      <Stack.Screen name="alert_page/alert" options={{ animation: 'fade' }} />
      <Stack.Screen name="alert_page/announcement" options={{ animation: 'fade' }} />
    </Stack>
    </ThemeProvider>
  );
}