import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import supabase from '../../lib/supabase';
import { useAppTheme } from '../../theme/theme-context';

export default function SecurityScreen() {
  const router = useRouter();
  const { displayed } = useAppTheme();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const redirectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimeout.current) clearTimeout(redirectTimeout.current);
    },
    [],
  );

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings_page/settings');
    }
  };

  const updatePassword = async () => {
    if (isUpdating) return;

    setErrorMessage('');
    if (!currentPassword) {
      setErrorMessage('Enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMessage('Your new password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Your new passwords do not match.');
      return;
    }

    setIsUpdating(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user?.email) {
        throw new Error('An email address is unavailable for this account.');
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) {
        if (signInError.code === 'invalid_credentials') {
          throw new Error('Your current password is incorrect.');
        }
        throw signInError;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsRedirecting(true);
      redirectTimeout.current = setTimeout(() => {
        redirectTimeout.current = null;
        router.replace('/auth/login');
      }, 2000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to update your password. Please try again.',
      );
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <LinearGradient colors={displayed.settingsGradient} style={styles.background}>
      <StatusBar barStyle="dark-content" />
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
            <Text style={styles.headerTitle}>Security</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Reset Password</Text>
              <View style={styles.sectionCard}>
                <Text style={styles.formDescription}>
                  Choose a new password for your account.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Current Password</Text>
                  <TextInput
                    accessibilityLabel="Current password"
                    autoCapitalize="none"
                    autoComplete="current-password"
                    editable={!isUpdating}
                    onChangeText={(value) => {
                      setCurrentPassword(value);
                      setErrorMessage('');
                    }}
                    placeholder="Enter current password"
                    placeholderTextColor="#8D879B"
                    secureTextEntry
                    style={styles.input}
                    textContentType="password"
                    value={currentPassword}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>New Password</Text>
                  <TextInput
                    accessibilityLabel="New password"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    editable={!isUpdating}
                    onChangeText={(value) => {
                      setNewPassword(value);
                      setErrorMessage('');
                    }}
                    placeholder="Enter new password"
                    placeholderTextColor="#8D879B"
                    secureTextEntry
                    style={styles.input}
                    textContentType="newPassword"
                    value={newPassword}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Confirm New Password</Text>
                  <TextInput
                    accessibilityLabel="Confirm new password"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    editable={!isUpdating}
                    onChangeText={(value) => {
                      setConfirmPassword(value);
                      setErrorMessage('');
                    }}
                    placeholder="Re-enter new password"
                    placeholderTextColor="#8D879B"
                    secureTextEntry
                    style={styles.input}
                    textContentType="newPassword"
                    value={confirmPassword}
                  />
                </View>

                {errorMessage ? (
                  <Text accessibilityRole="alert" style={styles.errorText}>
                    {errorMessage}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isUpdating }}
                  disabled={isUpdating}
                  onPress={() => void updatePassword()}
                  style={({ pressed }) => [
                    styles.updateButton,
                    { backgroundColor: displayed.primary },
                    pressed && styles.updateButtonPressed,
                    isUpdating && styles.updateButtonDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.updateButtonText,
                      { color: displayed.onPrimary },
                    ]}
                  >
                    {isUpdating ? 'Updating Password...' : 'Update Password'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
      <Modal
        animationType="fade"
        onRequestClose={() => undefined}
        statusBarTranslucent
        transparent
        visible={isRedirecting}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.redirectModal}>
            <ActivityIndicator size="large" color={displayed.primary} />
            <Text style={[styles.modalTitle, { color: displayed.text }]}>
              Password Updated
            </Text>
            <Text style={[styles.modalMessage, { color: displayed.muted }]}>
              You are being redirected to login...
            </Text>
          </View>
        </View>
      </Modal>
    </LinearGradient>
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
    color: '#342448',
    fontSize: 23,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 48,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 3,
    paddingBottom: 22,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#342448',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 8,
  },
  sectionCard: {
    gap: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E3E4EC',
    backgroundColor: '#FAFAFD',
  },
  formDescription: {
    color: '#342C46',
    fontSize: 14,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: 7,
  },
  fieldLabel: {
    marginLeft: 4,
    color: '#342448',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#D8D4E3',
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    color: '#342448',
    fontSize: 15,
  },
  updateButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    borderRadius: 16,
    backgroundColor: '#4B32B5',
  },
  updateButtonPressed: {
    opacity: 0.8,
  },
  updateButtonDisabled: {
    opacity: 0.55,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#B42318',
    fontSize: 13,
    lineHeight: 19,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(25, 18, 40, 0.55)',
  },
  redirectModal: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    color: '#342448',
    fontSize: 18,
    fontWeight: '700',
  },
  modalMessage: {
    color: '#6A6475',
    fontSize: 14,
    textAlign: 'center',
  },
});
