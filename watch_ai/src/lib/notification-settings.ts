import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import supabase from './supabase';
import { profileApi } from './profile-api';

export const EAS_PROJECT_ID = '0f8597f6-574b-4514-9047-936c801fbb8d';

export const NOTIFICATION_PREFERENCE_DEFAULTS = {
  weather: true,
  safety: true,
  school: true,
  weather_sustained_minutes: 60,
} as const;

export type NotificationPreferenceKey = 'weather' | 'safety' | 'school';

export type NotificationPreferences = Record<string, unknown> &
  Record<NotificationPreferenceKey, boolean> & {
    weather_sustained_minutes: number;
  };
export type NotificationPreferenceUpdates = Partial<
  Record<NotificationPreferenceKey, boolean>
> & {
  weather_sustained_minutes?: number;
};

export const WEATHER_ALERT_SUSTAINED_MINUTES_MIN = 10;
export const WEATHER_ALERT_SUSTAINED_MINUTES_MAX = 180;

export type PushRegistrationResult =
  | {
      status: 'enabled';
      permissionStatus: string;
      tokenSaved: true;
    }
  | {
      status: 'denied' | 'unavailable';
      permissionStatus: string;
      tokenSaved: false;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePreferences(value: unknown): NotificationPreferences {
  const saved = isRecord(value) ? value : {};
  const savedDuration = saved.weather_sustained_minutes;
  return {
    ...NOTIFICATION_PREFERENCE_DEFAULTS,
    ...saved,
    weather:
      typeof saved.weather === 'boolean'
        ? saved.weather
        : NOTIFICATION_PREFERENCE_DEFAULTS.weather,
    safety:
      typeof saved.safety === 'boolean'
        ? saved.safety
        : typeof saved.announcements === 'boolean'
          ? saved.announcements
          : NOTIFICATION_PREFERENCE_DEFAULTS.safety,
    school:
      typeof saved.school === 'boolean'
        ? saved.school
        : typeof saved.announcements === 'boolean'
          ? saved.announcements
          : NOTIFICATION_PREFERENCE_DEFAULTS.school,
    weather_sustained_minutes:
      typeof savedDuration === 'number' &&
      Number.isSafeInteger(savedDuration) &&
      savedDuration >= WEATHER_ALERT_SUSTAINED_MINUTES_MIN &&
      savedDuration <= WEATHER_ALERT_SUSTAINED_MINUTES_MAX
        ? savedDuration
        : NOTIFICATION_PREFERENCE_DEFAULTS.weather_sustained_minutes,
  };
}

function logSupabaseFailure(action: string, error: unknown): Error {
  const databaseError = isRecord(error) ? error : {};
  const message =
    typeof databaseError.message === 'string'
      ? databaseError.message
      : error instanceof Error
        ? error.message
        : 'Unknown database error.';
  const code =
    typeof databaseError.code === 'string' ? databaseError.code : undefined;
  console.error(`[notifications] ${action} failed`, { message, code });
  return new Error(`${message}${code ? ` (code ${code})` : ''}`);
}

async function getSignedInUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(`Unable to verify your account: ${error.message}`);
  }
  if (!data.user) {
    throw new Error('Sign in before changing notification settings.');
  }
  return data.user.id;
}

export async function loadNotificationSettings(): Promise<{
  preferences: NotificationPreferences;
  tokenSaved: boolean;
}> {
  const userId = await getSignedInUserId();
  const { data, error } = await supabase
    .from('user_info')
    .select('expo_push_token,notification_prefs')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw logSupabaseFailure('Loading notification settings', error);
  if (!data) {
    throw new Error('Your profile could not be found in user_info.');
  }
  return {
    preferences: normalizePreferences(data.notification_prefs),
    tokenSaved:
      typeof data.expo_push_token === 'string' &&
      data.expo_push_token.length > 0,
  };
}

export async function saveNotificationPreferences(
  updates: NotificationPreferenceUpdates,
): Promise<NotificationPreferences> {
  const requestedDuration = updates.weather_sustained_minutes;
  if (
    requestedDuration !== undefined &&
    (!Number.isSafeInteger(requestedDuration) ||
      requestedDuration < WEATHER_ALERT_SUSTAINED_MINUTES_MIN ||
      requestedDuration > WEATHER_ALERT_SUSTAINED_MINUTES_MAX)
  ) {
    throw new Error(
      `Choose a whole number from ${WEATHER_ALERT_SUSTAINED_MINUTES_MIN} to ${WEATHER_ALERT_SUSTAINED_MINUTES_MAX} minutes.`,
    );
  }

  const userId = await getSignedInUserId();
  const { data: current, error: readError } = await supabase
    .from('user_info')
    .select('notification_prefs')
    .eq('id', userId)
    .maybeSingle();
  if (readError) {
    throw logSupabaseFailure('Reading notification preferences', readError);
  }
  if (!current) {
    throw new Error('Your profile could not be found in user_info.');
  }

  const merged = {
    ...(isRecord(current.notification_prefs) ? current.notification_prefs : {}),
    ...updates,
  };
  const { data, error } = await supabase
    .from('user_info')
    .update({ notification_prefs: merged })
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (error) {
    throw logSupabaseFailure('Saving notification preferences', error);
  }
  if (!data) {
    throw new Error(
      'No profile row was updated. Check the user_info UPDATE grant and own-row RLS policy.',
    );
  }
  return normalizePreferences(merged);
}

export async function saveExpoPushToken(token: string | null): Promise<void> {
  await profileApi('/profile/push-token', {
    method: token ? 'POST' : 'DELETE',
    ...(token ? { body: JSON.stringify({ token }) } : {}),
  });
}

async function registerCurrentDeviceToken() {
  if (Platform.OS === 'android') {
    const channelOptions = {
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8B5CF6',
    };
    await Notifications.setNotificationChannelAsync('default', {
      ...channelOptions,
      name: 'Notifications',
    });
    await Notifications.setNotificationChannelAsync('weather-alerts', {
      ...channelOptions,
      name: 'Weather alerts',
    });
  }

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: EAS_PROJECT_ID,
  });
  if (!token.data) {
    throw new Error('The device did not return an Expo push token.');
  }
  console.log(
    '[notifications] saving Expo token:',
    `${token.data.slice(0, 12)}...`,
  );
  await saveExpoPushToken(token.data);
}

export async function registerPushTokenIfGranted(): Promise<boolean> {
  const deviceAvailable =
    Platform.OS !== 'web' &&
    Device.isDevice &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
  if (!deviceAvailable) return false;

  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return false;
  await registerCurrentDeviceToken();
  return true;
}

export async function getPushPermissionStatus(): Promise<{
  permissionStatus: string;
  granted: boolean;
  deviceAvailable: boolean;
}> {
  const deviceAvailable =
    Platform.OS !== 'web' &&
    Device.isDevice &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
  if (!deviceAvailable) {
    return {
      permissionStatus:
        Platform.OS === 'web'
          ? 'unavailable on web'
          : Constants.executionEnvironment === ExecutionEnvironment.StoreClient
            ? 'unsupported in Expo Go'
            : 'physical device required',
      granted: false,
      deviceAvailable: false,
    };
  }

  const permission = await Notifications.getPermissionsAsync();
  console.log('[notifications] permission status:', permission.status);
  return {
    permissionStatus: permission.status,
    granted: permission.granted,
    deviceAvailable: true,
  };
}

export async function enablePushNotifications(): Promise<PushRegistrationResult> {
  try {
    const deviceAvailable =
      Platform.OS !== 'web' &&
      Device.isDevice &&
      Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
    if (!deviceAvailable) {
      return {
        status: 'unavailable',
        permissionStatus:
          Platform.OS === 'web'
            ? 'unavailable on web'
            : Constants.executionEnvironment ===
                ExecutionEnvironment.StoreClient
              ? 'unsupported in Expo Go'
              : 'physical device required',
        tokenSaved: false,
      };
    }

    let permission = await Notifications.getPermissionsAsync();
    console.log('[notifications] permission status:', permission.status);
    if (!permission.granted) {
      permission = await Notifications.requestPermissionsAsync();
      console.log(
        '[notifications] permission request result:',
        permission.status,
      );
    }
    if (!permission.granted) {
      return {
        status: 'denied',
        permissionStatus: permission.status,
        tokenSaved: false,
      };
    }

    await registerCurrentDeviceToken();
    return {
      status: 'enabled',
      permissionStatus: permission.status,
      tokenSaved: true,
    };
  } catch (error) {
    console.error('[notifications] push registration failed:', error);
    throw error instanceof Error
      ? error
      : new Error('Unable to register push notifications.');
  }
}
