import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import Constants from 'expo-constants';
import supabase from '../lib/supabase';
import { profileApi } from '../lib/profile-api';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export const unstable_settings = {
  anchor: 'onboarding',
};

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let registering = false;
    const registerNotifications = async () => {
      if (Platform.OS === 'web' || !Device.isDevice || registering) return;
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
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
          Constants.easConfig?.projectId ??
          Constants.expoConfig?.extra?.eas?.projectId;
        const token = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (!active) return;
        await profileApi('/profile/push-token', {
          method: 'POST',
          body: JSON.stringify({ token: token.data }),
        });
      } catch (error) {
        console.error('Push notification registration failed:', error);
      } finally {
        registering = false;
      }
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('Unable to check notification session:', error);
        return;
      }
      if (data.session) void registerNotifications();
    });
    const authListener = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setTimeout(() => void registerNotifications(), 0);
    });
    const openFromNotification = (
      response: Notifications.NotificationResponse | null,
    ) => {
      if (!response) return;
      const data = response.notification.request.content.data as {
        type?: string;
        announcementId?: string;
      };
      if (data.type === 'announcement' && data.announcementId) {
        router.push({
          pathname: '/alert_page/announcement',
          params: { id: data.announcementId },
        });
      } else {
        router.push('/alert_page/alert');
      }
    };
    const responseListener =
      Platform.OS === 'web'
        ? null
        : Notifications.addNotificationResponseReceivedListener(
            openFromNotification,
          );
    if (Platform.OS !== 'web') {
      void Notifications.getLastNotificationResponseAsync().then(
        openFromNotification,
      );
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
      <Stack.Screen name="weather-watch" options={{ animation: 'fade' }} />
      <Stack.Screen name="map-overview" options={{ animation: 'fade' }} />
      <Stack.Screen name="alert_page/alert" options={{ animation: 'fade' }} />
      <Stack.Screen name="alert_page/announcement" options={{ animation: 'fade' }} />
    </Stack>
  );
}