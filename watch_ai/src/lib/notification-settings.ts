import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import supabase from './supabase';

export const EAS_PROJECT_ID = '0f8597f6-574b-4514-9047-936c801fbb8d';

export const NOTIFICATION_PREFERENCE_DEFAULTS = {
  weather: true,
  safety: true,
  school: true,
} as const;

export type NotificationPreferenceKey =
  keyof typeof NOTIFICATION_PREFERENCE_DEFAULTS;

export type NotificationPreferences = Record<string, unknown> &
  Record<NotificationPreferenceKey, boolean>;

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
  return new Error(
    `${message}${code ? ` (code ${code})` : ''}`,
  );
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
  updates: Partial<Record<NotificationPreferenceKey, boolean>>,
): Promise<NotificationPreferences> {
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
    ...(isRecord(current.notification_prefs)
      ? current.notification_prefs
      : {}),
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
  const userId = await getSignedInUserId();
  const { data, error } = await supabase
    .from('user_info')
    .update({ expo_push_token: token })
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (error) throw logSupabaseFailure('Saving the Expo push token', error);
  if (!data) {
    throw new Error(
      'No profile row was updated. Check the user_info UPDATE grant and own-row RLS policy.',
    );
  }
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
            : Constants.executionEnvironment === ExecutionEnvironment.StoreClient
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

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notifications',
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#8B5CF6',
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
