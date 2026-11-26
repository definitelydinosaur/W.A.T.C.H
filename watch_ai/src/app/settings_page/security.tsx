import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import supabase from '../../lib/supabase';

export default function SecurityScreen() {
  const router = useRouter();
  const [isSendingReset, setIsSendingReset] = useState(false);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings_page/settings');
    }
  };

  const sendPasswordReset = async () => {
    if (isSendingReset) return;

    setIsSendingReset(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user?.email) {
        throw new Error('An email address is unavailable for this account.');
      }

      const { error } = await supabase.auth.resetPasswordForEmail(user.email);
      if (error) throw error;

      Alert.alert('Check your email', 'A secure password reset link has been sent.');
    } catch (error) {
      Alert.alert(
        'Password reset failed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <View style={styles.background}>
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
                  stroke="#342448"
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
              <Text style={styles.sectionTitle}>Account Security</Text>
              <View style={styles.sectionCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change Password"
                  accessibilityState={{ disabled: isSendingReset }}
                  disabled={isSendingReset}
                  onPress={() => void sendPasswordReset()}
                  style={({ pressed }) => [
                    styles.actionRow,
                    pressed && styles.actionRowPressed,
                    isSendingReset && styles.actionRowDisabled,
                  ]}
                >
                  <View style={styles.iconContainer}>
                    <Svg width={25} height={25} viewBox="0 0 24 24">
                      <Rect
                        x={4}
                        y={10}
                        width={16}
                        height={11}
                        rx={2}
                        fill="none"
                        stroke="#4B32B5"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <Path
                        d="M8 10V7a4 4 0 0 1 8 0v3"
                        fill="none"
                        stroke="#4B32B5"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <Circle cx={12} cy={15} r={1} fill="#4B32B5" />
                    </Svg>
                  </View>
                  <View style={styles.actionCopy}>
                    <Text style={styles.actionLabel}>
                      {isSendingReset ? 'Sending reset link...' : 'Change Password'}
                    </Text>
                    <Text style={styles.actionDescription}>
                      Receive a secure link by email to reset your password.
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
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
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E3E4EC',
    backgroundColor: '#FAFAFD',
  },
  actionRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  actionRowPressed: {
    opacity: 0.65,
  },
  actionRowDisabled: {
    opacity: 0.6,
  },
  iconContainer: {
    width: 62,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  actionCopy: {
    flex: 1,
    gap: 3,
    paddingVertical: 8,
  },
  actionLabel: {
    color: '#342C46',
    fontSize: 14,
    fontWeight: '600',
  },
  actionDescription: {
    color: '#6A6475',
    fontSize: 12,
  },
});
