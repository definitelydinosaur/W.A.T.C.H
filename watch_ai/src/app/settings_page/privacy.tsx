import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import supabase from '../../lib/supabase';

export default function PrivacyScreen() {
  const router = useRouter();
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings_page/settings');
    }
  };

  const closeDeleteDialog = () => {
    setDeleteDialogVisible(false);
    setDeleteConfirmation('');
  };

 
const confirmAccountDeletion = async () => {
  if (deleteConfirmation !== 'delete-account' || isDeleting) {
    return;
  }

  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

  if (!apiUrl) {
    Alert.alert('Error', 'Backend URL is not configured.');
    return;
  }

  setIsDeleting(true);

  try {
   
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error('Your session has expired. Please log in again.');
    }

    const response = await fetch(`${apiUrl}/auth/delete-account`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message;

      throw new Error(message || 'Unable to delete your account.');
    }

    
    setDeleteDialogVisible(false);
    setDeleteConfirmation('');

  
    const { error: signOutError } = await supabase.auth.signOut({
      scope: 'local',
    });

    if (signOutError) {
      console.error('Sign-out error:', signOutError);
    }

    
    router.replace('/auth/login');

  } catch (error) {
    Alert.alert(
      'Account deletion failed',
      error instanceof Error
        ? error.message
        : 'Unable to connect to the server. Please try again.',
    );
  } finally {
    setIsDeleting(false);
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
            <Text style={styles.headerTitle}>Privacy</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Personal Information</Text>
              <View style={styles.sectionCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Manage personal information"
                  onPress={() => router.push('/settings_page/edit_profile')}
                  style={({ pressed }) => [
                    styles.actionRow,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.iconContainer}>
                    <Svg width={21} height={21} viewBox="0 0 24 24">
                      <Circle
                        cx={12}
                        cy={8}
                        r={3.5}
                        fill="none"
                        stroke="#4B32B5"
                        strokeWidth={1.8}
                      />
                      <Path
                        d="M4.5 21v-1a7.5 7.5 0 0 1 15 0v1"
                        fill="none"
                        stroke="#4B32B5"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                  <View style={styles.actionCopy}>
                    <Text style={styles.actionLabel}>Manage Personal Information</Text>
                    <Text style={styles.actionDescription}>
                      View and manage personal details associated with your account.
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.dangerCard}>
                <Text style={styles.dangerTitle}>Danger zone</Text>
                <Text style={styles.dangerDescription}>
                  Deleting your account is permanent. This action cannot be undone.
                </Text>
                <View style={styles.dangerDivider} />
                <View style={styles.deleteRow}>
                  <View style={styles.deleteCopy}>
                    <Text style={styles.deleteLabel}>Delete Account</Text>
                    <Text style={styles.actionDescription}>
                      Permanently remove your account and associated data.
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Delete account"
                    onPress={() => setDeleteDialogVisible(true)}
                    style={({ pressed }) => [
                      styles.deleteButton,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>

      <Modal
        visible={deleteDialogVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeDeleteDialog}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close delete account confirmation"
            onPress={closeDeleteDialog}
            style={styles.modalBackdrop}
          />
          <View style={styles.confirmationCard}>
            <Text style={styles.confirmationTitle}>Delete account</Text>
            <Text style={styles.confirmationDescription}>
              This action is permanent. Type{' '}
              <Text style={styles.confirmationPhrase}>delete-account</Text> to confirm.
            </Text>
            <TextInput
              accessibilityLabel="Type delete-account to confirm"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setDeleteConfirmation}
              placeholder="delete-account"
              placeholderTextColor="#928B98"
              style={styles.confirmationInput}
              value={deleteConfirmation}
            />
            <View style={styles.confirmationActions}>
              <Pressable
                accessibilityRole="button"
                onPress={closeDeleteDialog}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.rowPressed,
                ]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: deleteConfirmation !== 'delete-account' }}
                disabled={deleteConfirmation !== 'delete-account' || isDeleting}
                onPress={confirmAccountDeletion}
                style={({ pressed }) => [
                  styles.confirmDeleteButton,
                  deleteConfirmation !== 'delete-account' && styles.confirmDeleteDisabled,
                  pressed && styles.rowPressed,
                ]}
              >
                <Text style={styles.confirmDeleteText}>{isDeleting ? 'Deleting...' : 'Confirm delete'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  headerSpacer: { width: 48 },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 3,
    paddingBottom: 22,
  },
  section: { marginBottom: 12 },
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
  iconContainer: {
    width: 42,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  actionLabel: {
    color: '#342C46',
    fontSize: 14,
    fontWeight: '600',
  },
  actionDescription: {
    color: '#6A6475',
    fontSize: 12,
    lineHeight: 18,
  },
  actionRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  actionCopy: {
    flex: 1,
    gap: 4,
    paddingVertical: 10,
  },
  chevron: { color: '#817B8A', fontSize: 24, paddingLeft: 10 },
  dangerCard: {
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E7BFC2',
    backgroundColor: '#FFFAFA',
  },
  dangerTitle: {
    color: '#8F303B',
    fontSize: 15,
    fontWeight: '700',
  },
  dangerDescription: {
    color: '#6A6475',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  dangerDivider: {
    height: 1,
    backgroundColor: '#F0DEDF',
    marginVertical: 14,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteCopy: { flex: 1, gap: 4 },
  deleteLabel: {
    color: '#9A4652',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#A63D49',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  rowPressed: { opacity: 0.65 },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(27, 20, 45, 0.38)',
  },
  confirmationCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: 22,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  confirmationTitle: {
    color: '#342448',
    fontSize: 19,
    fontWeight: '700',
  },
  confirmationDescription: {
    color: '#6A6475',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  confirmationPhrase: {
    color: '#342C46',
    fontWeight: '700',
  },
  confirmationInput: {
    height: 46,
    marginTop: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DAD6E2',
    borderRadius: 12,
    color: '#342448',
    fontSize: 14,
  },
  confirmationActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  cancelButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F2F0F6',
  },
  cancelButtonText: {
    color: '#514A5D',
    fontSize: 13,
    fontWeight: '600',
  },
  confirmDeleteButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#A63D49',
  },
  confirmDeleteDisabled: {
    backgroundColor: '#C9B9BB',
  },
  confirmDeleteText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});