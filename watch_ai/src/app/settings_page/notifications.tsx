import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useAppTheme } from '../../theme/theme-context';
import {
  enablePushNotifications,
  getPushPermissionStatus,
  loadNotificationSettings,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  NotificationPreferenceKey,
  NotificationPreferences,
  saveExpoPushToken,
  saveNotificationPreferences,
  WEATHER_ALERT_SUSTAINED_MINUTES_MAX,
  WEATHER_ALERT_SUSTAINED_MINUTES_MIN,
} from '../../lib/notification-settings';

const PREFERENCES: {
  key: NotificationPreferenceKey;
  title: string;
  description: string;
}[] = [
  {
    key: 'weather',
    title: 'Severe weather alerts',
    description: 'Warnings for dangerous weather near you',
  },
  {
    key: 'safety',
    title: 'Community safety updates',
    description: 'Important hazards and local announcements',
  },
  {
    key: 'school',
    title: 'School announcements',
    description: 'Closures and updates from your institution',
  },
];

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { displayed } = useAppTheme();
  const [enabled, setEnabled] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    ...NOTIFICATION_PREFERENCE_DEFAULTS,
  });
  const [permissionStatus, setPermissionStatus] = useState('checking');
  const [deviceAvailable, setDeviceAvailable] = useState(true);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTogglingMaster, setIsTogglingMaster] = useState(false);
  const [savingPreference, setSavingPreference] =
    useState<NotificationPreferenceKey | null>(null);
  const [weatherDurationText, setWeatherDurationText] = useState('60');
  const [savingWeatherDuration, setSavingWeatherDuration] = useState(false);
  const [lastError, setLastError] = useState('');

  const refreshSettings = useCallback(async () => {
    try {
      const [permission, saved] = await Promise.all([
        getPushPermissionStatus(),
        loadNotificationSettings(),
      ]);
      setPermissionStatus(permission.permissionStatus);
      setDeviceAvailable(permission.deviceAvailable);
      setPreferences(saved.preferences);
      setWeatherDurationText(
        String(saved.preferences.weather_sustained_minutes),
      );
      setTokenSaved(saved.tokenSaved);
      setEnabled(permission.granted && saved.tokenSaved);
      setLastError('');

      if (!permission.granted && saved.tokenSaved) {
        try {
          await saveExpoPushToken(null);
          setTokenSaved(false);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Unable to disable the saved push token.';
          console.error(
            '[notifications] unable to clear inactive token:',
            error,
          );
          setLastError(message);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to load notification settings.';
      console.error('[notifications] settings load failed:', error);
      setLastError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      void refreshSettings();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void refreshSettings();
      });
      return () => subscription.remove();
    }, [refreshSettings]),
  );

  const toggleMaster = async (nextEnabled: boolean) => {
    setLastError('');
    setIsTogglingMaster(true);
    try {
      if (!nextEnabled) {
        await saveExpoPushToken(null);
        setTokenSaved(false);
        setEnabled(false);
        return;
      }

      const result = await enablePushNotifications();
      setPermissionStatus(result.permissionStatus);
      setDeviceAvailable(result.status !== 'unavailable');
      setTokenSaved(result.tokenSaved);
      setEnabled(result.status === 'enabled');
      if (result.status !== 'enabled') {
        setLastError(
          result.status === 'denied'
            ? 'Notification permission is off. Enable it in system settings, then try again.'
            : `Push notifications are unavailable: ${result.permissionStatus}.`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to enable push notifications.';
      console.error('[notifications] could not enable push:', error);
      setEnabled(false);
      setTokenSaved(false);
      setLastError(message);
    } finally {
      setIsTogglingMaster(false);
    }
  };

  const togglePreference = async (
    key: NotificationPreferenceKey,
    nextValue: boolean,
  ) => {
    const previous = preferences;
    const next = { ...previous, [key]: nextValue };
    setPreferences(next);
    setSavingPreference(key);
    setLastError('');
    try {
      const saved = await saveNotificationPreferences(next);
      setPreferences(saved);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to save this notification preference.';
      console.error(`[notifications] could not save ${key} preference:`, error);
      setPreferences(previous);
      setLastError(message);
    } finally {
      setSavingPreference(null);
    }
  };

  const saveWeatherDuration = async () => {
    const trimmed = weatherDurationText.trim();
    const minutes = Number(trimmed);
    if (
      !/^\d+$/.test(trimmed) ||
      !Number.isSafeInteger(minutes) ||
      minutes < WEATHER_ALERT_SUSTAINED_MINUTES_MIN ||
      minutes > WEATHER_ALERT_SUSTAINED_MINUTES_MAX
    ) {
      setLastError(
        `Enter a whole number from ${WEATHER_ALERT_SUSTAINED_MINUTES_MIN} to ${WEATHER_ALERT_SUSTAINED_MINUTES_MAX} minutes.`,
      );
      return;
    }

    setSavingWeatherDuration(true);
    setLastError('');
    try {
      const saved = await saveNotificationPreferences({
        weather_sustained_minutes: minutes,
      });
      setPreferences(saved);
      setWeatherDurationText(String(saved.weather_sustained_minutes));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to save the weather alert delay.';
      console.error(
        '[notifications] could not save weather alert delay:',
        error,
      );
      setLastError(message);
    } finally {
      setSavingWeatherDuration(false);
    }
  };

  const openSystemSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to open your device settings.';
      console.error('[notifications] could not open system settings:', error);
      setLastError(message);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings_page/settings');
  };

  const permissionDenied =
    permissionStatus === 'denied' || permissionStatus === 'blocked';

  return (
    <View style={styles.background}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={goBack}
              style={styles.backButton}
              hitSlop={8}
            >
              <Svg width={24} height={24} viewBox="0 0 24 24">
                <Path
                  d="m15 4-8 8 8 8"
                  fill="none"
                  stroke={displayed.text}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Pressable>
            <Text style={[styles.headerTitle, { color: displayed.text }]}>
              Notifications
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <View style={styles.preferenceRow}>
                <View style={styles.preferenceCopy}>
                  <Text style={styles.title}>Allow notifications</Text>
                  <Text style={styles.description}>
                    Receive push alerts on this device.
                  </Text>
                </View>
                {isLoading || isTogglingMaster ? (
                  <ActivityIndicator color={displayed.primary} />
                ) : (
                  <Switch
                    accessibilityLabel="Allow notifications"
                    value={enabled}
                    onValueChange={(value) => void toggleMaster(value)}
                    trackColor={{
                      false: '#C9C4D1',
                      true: displayed.primary,
                    }}
                    thumbColor="#FFFFFF"
                  />
                )}
              </View>

              {!deviceAvailable ? (
                <Text style={styles.notice}>
                  Push notifications require the installed development build on
                  a physical iOS or Android device. {permissionStatus}.
                </Text>
              ) : null}
              {permissionDenied ? (
                <View style={styles.permissionNotice}>
                  <Text style={styles.notice}>
                    Notifications are blocked by your device. Open system
                    settings to allow them, then return here.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void openSystemSettings()}
                    style={[
                      styles.settingsButton,
                      { backgroundColor: displayed.primary },
                    ]}
                  >
                    <Text style={styles.settingsButtonText}>
                      Open system settings
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {enabled ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Choose your alerts</Text>
                {PREFERENCES.map((preference, index) => (
                  <View
                    key={preference.key}
                    style={[
                      styles.preferenceRow,
                      index > 0 && styles.preferenceDivider,
                    ]}
                  >
                    <View style={styles.preferenceCopy}>
                      <Text style={styles.title}>{preference.title}</Text>
                      <Text style={styles.description}>
                        {preference.description}
                      </Text>
                    </View>
                    {savingPreference === preference.key ? (
                      <ActivityIndicator color={displayed.primary} />
                    ) : (
                      <Switch
                        accessibilityLabel={preference.title}
                        value={preferences[preference.key]}
                        disabled={
                          !enabled ||
                          savingPreference !== null ||
                          savingWeatherDuration
                        }
                        onValueChange={(value) =>
                          void togglePreference(preference.key, value)
                        }
                        trackColor={{
                          false: '#C9C4D1',
                          true: displayed.primary,
                        }}
                        thumbColor="#FFFFFF"
                      />
                    )}
                  </View>
                ))}
                <View style={styles.durationSection}>
                  <Text style={styles.title}>
                    Automated weather alert delay
                  </Text>
                  <Text style={styles.description}>
                    Send detected extreme heat, unhealthy air, or heavy rain
                    alerts after the condition has lasted this many minutes.
                    Default: 60 minutes.
                  </Text>
                  <View style={styles.durationRow}>
                    <TextInput
                      accessibilityLabel="Automated weather alert delay in minutes"
                      value={weatherDurationText}
                      onChangeText={setWeatherDurationText}
                      keyboardType="number-pad"
                      maxLength={3}
                      returnKeyType="done"
                      onSubmitEditing={() => void saveWeatherDuration()}
                      style={styles.durationInput}
                    />
                    <Text style={styles.durationUnit}>minutes</Text>
                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        savingWeatherDuration || savingPreference !== null
                      }
                      onPress={() => void saveWeatherDuration()}
                      style={[
                        styles.durationSaveButton,
                        { backgroundColor: displayed.primary },
                        (savingWeatherDuration || savingPreference !== null) &&
                          styles.disabledButton,
                      ]}
                    >
                      <Text style={styles.durationSaveText}>
                        {savingWeatherDuration ? 'Saving…' : 'Save'}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.durationHint}>
                    Choose {WEATHER_ALERT_SUSTAINED_MINUTES_MIN}–
                    {WEATHER_ALERT_SUSTAINED_MINUTES_MAX} minutes.
                  </Text>
                </View>
              </View>
            ) : null}

            {lastError ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {lastError}
              </Text>
            ) : null}

            {__DEV__ ? (
              <Text style={styles.debugText}>
                Permission: {permissionStatus} · Token saved:{' '}
                {tokenSaved ? 'yes' : 'no'} · Last error: {lastError || 'none'}
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#FFFFFF' },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  panel: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    fontSize: 23,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: { width: 48 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 14,
  },
  card: {
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F8F7FC',
  },
  preferenceRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  preferenceDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DAD6E2',
  },
  preferenceCopy: { flex: 1 },
  title: { color: '#342448', fontSize: 15, fontWeight: '700' },
  description: { color: '#746C7D', fontSize: 12, lineHeight: 17, marginTop: 4 },
  sectionTitle: {
    color: '#342448',
    fontSize: 16,
    fontWeight: '700',
    paddingTop: 16,
  },
  durationSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DAD6E2',
    paddingTop: 16,
    paddingBottom: 16,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  durationInput: {
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#342448',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DAD6E2',
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
  },
  durationUnit: { color: '#746C7D', fontSize: 13 },
  durationSaveButton: {
    marginLeft: 'auto',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  durationSaveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  disabledButton: { opacity: 0.6 },
  durationHint: { color: '#746C7D', fontSize: 11, marginTop: 6 },
  notice: { color: '#62576F', fontSize: 12, lineHeight: 18, paddingBottom: 14 },
  permissionNotice: { paddingTop: 8 },
  settingsButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 14,
    borderRadius: 12,
  },
  settingsButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  error: {
    color: '#9F1239',
    backgroundColor: '#FFF1F2',
    padding: 12,
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  debugText: { color: '#81798A', fontSize: 10, lineHeight: 15 },
});
