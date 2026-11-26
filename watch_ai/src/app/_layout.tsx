import { Stack, useRouter } from 'expo-router';
import { ThemeProvider } from '../theme/theme-context';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import supabase from '../lib/supabase';
import { registerPushTokenIfGranted } from '../lib/notification-settings';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

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
  anchor: 'index',
};

export default function RootLayout() {
  const router = useRouter();
  const handledResponses = useRef(new Set<string>());
  const presentedNotifications = useRef(new Set<string>());
  const pendingNotification = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    let pushTokenSyncInProgress = false;
    let syncedPushTokenUserId: string | null = null;
    const syncPushToken = (userId: string) => {
      if (pushTokenSyncInProgress || syncedPushTokenUserId === userId) return;
      pushTokenSyncInProgress = true;
      void registerPushTokenIfGranted()
        .then((saved) => {
          if (saved) syncedPushTokenUserId = userId;
        })
        .catch((error: unknown) => {
          console.warn('Push token could not be refreshed:', error);
        })
        .finally(() => {
          pushTokenSyncInProgress = false;
        });
    };

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

    const showPendingNotification = () => {
      const data = pendingNotification.current;
      if (!data) return;
      const notificationId =
        readDataString(data.notification_id) ??
        readDataString(data.notificationId);
      const announcementId =
        readDataString(data.announcement_id) ??
        readDataString(data.announcementId);
      const hazardId =
        readDataString(data.hazard_id) ?? readDataString(data.hazardId);
      const key = notificationId ?? `${announcementId ?? ''}:${hazardId ?? ''}`;
      if (presentedNotifications.current.has(key)) {
        pendingNotification.current = null;
        return;
      }
      if (notificationId) {
        router.push({
          pathname: '/alert_page/announcement',
          params: { notificationId },
        });
      } else if (announcementId) {
        router.push({
          pathname: '/alert_page/announcement',
          params: { announcementId },
        });
      } else if (hazardId) {
        router.push({
          pathname: '/alert_page/announcement',
          params: { hazardId },
        });
      } else {
        router.push('/alerts');
      }
      presentedNotifications.current.add(key);
      pendingNotification.current = null;
    };

    const waitForAuthentication = () => {
      void supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (error) {
            console.warn(
              'Notification tap could not check the session:',
              error,
            );
            return;
          }
          if (data.session) {
            showPendingNotification();
          } else {
            router.push('/auth/login');
          }
        })
        .catch((error: unknown) => {
          console.warn('Notification tap could not check the session:', error);
        });
    };

    const openFromNotification = (
      response: Notifications.NotificationResponse | null,
    ) => {
      if (!response) return;
      try {
        const data = response.notification.request.content.data as Record<
          string,
          unknown
        >;
        const key =
          response.notification.request.identifier ||
          readDataString(data.notification_id) ||
          readDataString(data.notificationId);
        if (key && handledResponses.current.has(key)) return;
        if (key) handledResponses.current.add(key);
        pendingNotification.current = data;
        void Notifications.clearLastNotificationResponseAsync().catch(
          (error: unknown) => {
            console.warn(
              'Unable to clear the last notification response:',
              error,
            );
          },
        );
        waitForAuthentication();
      } catch (error) {
        console.warn('Unable to open the notification destination:', error);
      }
    };
    let responseListener: Notifications.EventSubscription | null = null;
    if (Platform.OS !== 'web' && !isExpoGo) {
      try {
        const { data: authListener } = supabase.auth.onAuthStateChange(
          (_event, session) => {
            if (session) {
              setTimeout(() => syncPushToken(session.user.id), 0);
            } else {
              syncedPushTokenUserId = null;
            }
            if (session && pendingNotification.current) {
              showPendingNotification();
            }
          },
        );
        void supabase.auth
          .getSession()
          .then(({ data, error }) => {
            if (error) {
              console.warn('Push token refresh could not check the session:', error);
            } else if (data.session) {
              syncPushToken(data.session.user.id);
            }
          })
          .catch((error: unknown) => {
            console.warn('Push token refresh could not check the session:', error);
          });
        responseListener =
          Notifications.addNotificationResponseReceivedListener(
            openFromNotification,
          );
        void Notifications.getLastNotificationResponseAsync()
          .then((response) => {
            openFromNotification(response);
          })
          .catch((error: unknown) => {
            console.warn(
              'Unable to check the last notification response:',
              error,
            );
          });
        return () => {
          responseListener?.remove();
          authListener.subscription.unsubscribe();
        };
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
        <Stack.Screen
          name="auth/loading_auth"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="auth/confirm-email"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen name="home" />
        <Stack.Screen name="alerts" options={{ animation: 'fade' }} />
        <Stack.Screen name="admin" options={{ animation: 'fade' }} />
        <Stack.Screen name="weather-watch" options={{ animation: 'fade' }} />
        <Stack.Screen
          name="map-overview"
          options={{ animation: 'slide_from_left' }}
        />
        <Stack.Screen
          name="settings_page/customize-theme"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen name="alert_page/alert" options={{ animation: 'fade' }} />
        <Stack.Screen
          name="alert_page/announcement"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
    </ThemeProvider>
  );
}

function readDataString(value: unknown) {
  return typeof value === 'string' && value.length ? value : null;
}
