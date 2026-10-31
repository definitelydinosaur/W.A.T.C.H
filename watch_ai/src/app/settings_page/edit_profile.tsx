import { useCallback, useState, type ReactNode } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useProfilePicture } from '../../hooks/loadprofilepicture';
import supabase from '../../lib/supabase';
import ProfileSelectionModal, {
  HomeLocationInput,
  InstitutionOption,
} from '../../components/profile-selection-modal';
import { profileApi } from '../../lib/profile-api';

type PickerField = 'Country/Region';

const PICKER_OPTIONS: Record<PickerField, string[]> = {
  'Country/Region': ['Philippines', 'United States', 'Canada', 'Japan', 'Australia'],
};

function parseBirthdate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));

  if (
    parsedDate.getFullYear() !== Number(year) ||
    parsedDate.getMonth() !== Number(month) - 1 ||
    parsedDate.getDate() !== Number(day)
  ) {
    return null;
  }

  return parsedDate;
}

export default function EditProfileScreen() {
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const { profilePictureUrl: routeProfilePictureUrl } = useLocalSearchParams<{
    profilePictureUrl?: string | string[];
  }>();
  const initialProfilePictureUrl =
    typeof routeProfilePictureUrl === 'string' && routeProfilePictureUrl
      ? routeProfilePictureUrl
      : null;
  const { profilePictureUrl, loadProfilePicture } = useProfilePicture();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState(new Date(1995, 4, 23));
  const [datePickerDraft, setDatePickerDraft] = useState(dateOfBirth);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [country, setCountry] = useState('Philippines');
  const [activePicker, setActivePicker] = useState<PickerField | null>(null);
  const [profilePicture, setProfilePicture] = useState<string | null>(
    initialProfilePictureUrl,
  );
  const [localProfilePicture, setLocalProfilePicture] = useState<string | null>(null);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [homeLocation, setHomeLocation] = useState<HomeLocationInput | null>(null);
  const [institution, setInstitution] = useState<InstitutionOption | null>(null);
  const [selectionPicker, setSelectionPicker] =
    useState<'location' | 'institution' | null>(null);
  const [isSavingSelection, setIsSavingSelection] = useState(false);


const loadProfile = useCallback(async () => {
  try {
    const { profile } = await profileApi<{
      profile: {
        name: string | null;
        email: string | null;
        birthdate: string | null;
        country: string | null;
        home_location:
          | (Omit<HomeLocationInput, 'name' | 'detail'> & { label?: string })
          | null;
        institution: InstitutionOption | null;
      };
    }>('/profile');
    setName(profile.name ?? '');
    setEmail(profile.email ?? '');
    setCountry(profile.country ?? 'Philippines');
    setHomeLocation(
      profile.home_location
        ? {
            ...profile.home_location,
            name:
              profile.home_location.city ??
              profile.home_location.barangay ??
              profile.home_location.address.split(',')[0],
            detail: [
              profile.home_location.city,
              profile.home_location.province,
            ]
              .filter(Boolean)
              .join(', '),
          }
        : null,
    );
    setInstitution(profile.institution);

    const birthdate = parseBirthdate(profile.birthdate);
    if (birthdate) {
      setDateOfBirth(birthdate);
      setDatePickerDraft(birthdate);
    }
  } catch (error) {
    console.error('Load profile error:', error);
    Alert.alert(
      'Error',
      error instanceof Error ? error.message : 'Failed to load profile.',
    );
  }
}, []);


useFocusEffect(
  useCallback(() => {
    void loadProfile();
    void loadProfilePicture();
  }, [loadProfile, loadProfilePicture]),
);



  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings_page/settings');
    }
  };

const saveChanges = async () => {
  if (name.trim().length < 3) {
    Alert.alert('Invalid name', 'Please enter a name with at least 3 characters.');
    return;
  }
  if (!country.trim()) {
    Alert.alert('Invalid country', 'Please select a country or region.');
    return;
  }
  if (dateOfBirth > new Date()) {
    Alert.alert('Invalid date', 'Date of birth cannot be in the future.');
    return;
  }
  setIsSaving(true);

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;

    if (!user) {
      Alert.alert('Session expired', 'Please log in again.');
      return;
    }

    const year = dateOfBirth.getFullYear();
    const month = String(dateOfBirth.getMonth() + 1).padStart(2, '0');
    const day = String(dateOfBirth.getDate()).padStart(2, '0');
    const birthdate = `${year}-${month}-${day}`;

    const { data: updatedProfile, error: updateError } = await supabase
      .from('user_info')
      .update({
        name: name.trim(),
        birthdate,
        country: country.trim(),
      })
      .eq('id', user.id)
      .select('id')
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updatedProfile) {
      throw new Error('No profile was found for the signed-in user.');
    }

    Alert.alert('Success', 'Your profile has been updated.');
  } catch (error) {
    console.error('Update profile error:', error);
    Alert.alert(
      'Update failed',
      error instanceof Error ? error.message : 'Something went wrong.',
    );
  } finally {
    setIsSaving(false);
  }
};

const saveHomeLocation = async (location: HomeLocationInput) => {
  if (isSavingSelection) return;
  setIsSavingSelection(true);
  try {
    await profileApi('/profile/home-location', {
      method: 'POST',
      body: JSON.stringify({
        full_address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
        city: location.city,
        province: location.province,
        barangay: location.barangay,
      }),
    });
    setHomeLocation(location);
    setSelectionPicker(null);
    Alert.alert('Success', 'Your home location has been updated.');
  } catch (error) {
    Alert.alert(
      'Update failed',
      error instanceof Error ? error.message : 'Unable to save home location.',
    );
  } finally {
    setIsSavingSelection(false);
  }
};

const saveInstitution = async (selected: InstitutionOption | null) => {
  if (isSavingSelection) return;
  setIsSavingSelection(true);
  try {
    const body = selected
      ? selected.id
        ? { institutionId: selected.id }
        : {
            name: selected.name,
            facebookPageUrl: selected.facebook_page_url,
          }
      : { institutionId: null };
    const result = await profileApi<{ institution: InstitutionOption | null }>(
      '/profile/institution',
      { method: 'PUT', body: JSON.stringify(body) },
    );
    setInstitution(result.institution);
    setSelectionPicker(null);
    Alert.alert('Success', 'Your institution has been updated.');
  } catch (error) {
    Alert.alert(
      'Update failed',
      error instanceof Error ? error.message : 'Unable to save institution.',
    );
  } finally {
    setIsSavingSelection(false);
  }
};

const sendPasswordReset = async () => {
  if (!email.trim()) {
    Alert.alert('Email unavailable', 'A password reset email cannot be sent for this account.');
    return;
  }
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
    Alert.alert('Check your email', 'A secure password reset link has been sent.');
  } catch (error) {
    Alert.alert(
      'Password reset failed',
      error instanceof Error ? error.message : 'Please try again.',
    );
  }
};

const changeProfilePicture = async () => {
  try {
    // 1. Request gallery permission
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permission Required',
        'Please allow access to your photo library to change your profile picture.',
      );
      return;
    }

    // 2. Open the image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled) return;

    const asset = result.assets[0];

    if (!asset) {
      throw new Error('No image was selected.');
    }

    // 3. Get the backend URL
    const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

    if (!apiUrl) {
      throw new Error(
        'Backend URL is missing. Check your EXPO_PUBLIC_API_URL environment variable.',
      );
    }

    // 4. Get the signed-in user's access token
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw new Error(error.message);
    }

    if (!data.session) {
      throw new Error('Please sign in before uploading a profile picture.');
    }

    // 5. Show loading state
    setIsUploadingPicture(true);
    setLocalProfilePicture(asset.uri);
    setProfilePicture(asset.uri);

    // 6. Determine the selected image's MIME type
    const extension =
      asset.fileName?.split('.').pop()?.toLowerCase() ||
      (asset.mimeType === 'image/png'
        ? 'png'
        : asset.mimeType === 'image/webp'
          ? 'webp'
          : 'jpg');

    const mimeType =
      asset.mimeType ||
      (extension === 'png'
        ? 'image/png'
        : extension === 'webp'
          ? 'image/webp'
          : 'image/jpeg');

    // Use Expo's native multipart uploader instead of React Native FormData.
    const response = await FileSystem.uploadAsync(
      `${apiUrl}/profile/picture`,
      asset.uri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType,
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      },
    );

    // 8. Read the backend response
    let responseBody: {
      message?: string | string[];
      profile_pic?: string;
    };
    try {
      responseBody = JSON.parse(response.body);
    } catch {
      throw new Error(
        `The server returned an invalid response (HTTP ${response.status}).`,
      );
    }

    if (response.status < 200 || response.status >= 300) {
      const message = Array.isArray(responseBody.message)
        ? responseBody.message.join(', ')
        : responseBody.message;

      throw new Error(message || `Image upload failed (HTTP ${response.status}).`);
    }

    if (!responseBody.profile_pic) {
      throw new Error(
        'The server did not return the uploaded profile picture URL.',
      );
    }

    // Force a fresh image after replacing the same storage object.
    const cacheBustedImageUrl = `${responseBody.profile_pic}${
      responseBody.profile_pic.includes('?') ? '&' : '?'
    }t=${Date.now()}`;
    setProfilePicture(cacheBustedImageUrl);

    Alert.alert(
      'Profile Picture Updated',
      'Your profile picture was uploaded successfully.',
    );
  } catch (error) {
    Alert.alert(
      'Upload Failed',
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while uploading your profile picture.',
    );
  } finally {
    setIsUploadingPicture(false);
  }
};


  const selectOption = (option: string) => {
    if (activePicker === 'Country/Region') setCountry(option);
    setActivePicker(null);
  };

  const openDatePicker = () => {
    setDatePickerDraft(dateOfBirth);
    setShowDatePicker(true);
  };

  const handleDateChange = (
    event: { type: string },
    selectedDate?: Date,
  ) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) {
        setDateOfBirth(selectedDate);
      }
      return;
    }

    if (selectedDate) {
      setDatePickerDraft(selectedDate);
    }
  };

  const formatDate = (date: Date) =>
    `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

  const displayedProfilePicture =
    localProfilePicture ??
    profilePictureUrl ??
    profilePicture ??
    initialProfilePictureUrl;

  return (
    <LinearGradient colors={['#F8F7FB', '#E7E1F3', '#CEC3E2']} style={styles.background}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.panel}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.header}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  onPress={goBack}
                  hitSlop={10}
                  style={styles.backButton}
                >
                  <Svg width={24} height={24} viewBox="0 0 24 24">
                    <Path
                      d="m15 4-8 8 8 8"
                      fill="none"
                      stroke="#111111"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </Pressable>
                <Text style={styles.headerTitle}>Edit Profile</Text>
              </View>

              <View style={styles.avatarSection}>
                <View style={styles.avatar}>
                  {displayedProfilePicture && (
                    <Image
                      accessibilityLabel="Selected profile picture"
                      source={{
                        uri: displayedProfilePicture,
                      }}
                      style={styles.avatarImage}
                      resizeMode="cover"
                      onError={() => {
                        if (localProfilePicture && profilePicture !== localProfilePicture) {
                          setProfilePicture(localProfilePicture);
                        }
                      }}
                    />
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Change profile photo"
                    accessibilityState={{ disabled: isUploadingPicture }}
                    disabled={isUploadingPicture}
                    onPress={changeProfilePicture}
                    style={styles.cameraButton}
                  >
                    {isUploadingPicture ? (
                      <ActivityIndicator color="#45466F" />
                    ) : (
                      <Svg width={23} height={23} viewBox="0 0 24 24">
                        <Path
                          d="M4 7.5h3l1.5-2h7l1.5 2h3A1.5 1.5 0 0 1 21.5 9v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z"
                          fill="#45466F"
                        />
                        <Circle
                          cx={12}
                          cy={13.5}
                          r={3.5}
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth={1.8}
                        />
                        <Circle cx={18.2} cy={9.7} r={0.9} fill="#FFFFFF" />
                      </Svg>
                    )}
                  </Pressable>
                </View>
              </View>

              <View style={styles.form}>
                <ProfileField label="Name">
                  <TextInput
                    accessibilityLabel="Name"
                    autoCapitalize="words"
                    onChangeText={setName}
                    placeholder="W.A.T.C.H."
                    placeholderTextColor="#55515A"
                    returnKeyType="next"
                    style={styles.input}
                    value={name}
                  />
                </ProfileField>

                <ProfileField label="Email">
                  <TextInput
                    accessibilityLabel="Email"
                    editable={false}
                    placeholder="watch@gmail.com"
                    placeholderTextColor="#55515A"
                    selectTextOnFocus={false}
                    style={[styles.input, styles.readOnlyInput]}
                    value={email}
                  />
                </ProfileField>

                <ProfileField label="Password">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Send secure password reset link"
                    onPress={() => void sendPasswordReset()}
                    style={({ pressed }) => [
                      styles.input,
                      styles.passwordResetButton,
                      pressed && styles.pickerPressed,
                    ]}
                  >
                    <Text style={styles.passwordResetText}>Send secure reset link</Text>
                  </Pressable>
                </ProfileField>

                <ProfileField label="Date of Birth">
                  <PickerButton
                    accessibilityLabel="Select date of birth"
                    onPress={openDatePicker}
                    value={formatDate(dateOfBirth)}
                  />
                </ProfileField>

                <ProfileField label="Country/Region">
                  <PickerButton
                    accessibilityLabel="Select country or region"
                    onPress={() => setActivePicker('Country/Region')}
                    value={country}
                  />
                </ProfileField>

                <ProfileField label="Home location">
                  <PickerButton
                    accessibilityLabel="Change home location"
                    onPress={() => {
                      if (!isSavingSelection) setSelectionPicker('location');
                    }}
                    value={
                      isSavingSelection
                        ? 'Saving...'
                        : homeLocation?.address ?? 'Choose home location'
                    }
                  />
                </ProfileField>

                <ProfileField label="Institution">
                  <PickerButton
                    accessibilityLabel="Change institution"
                    onPress={() => {
                      if (!isSavingSelection) setSelectionPicker('institution');
                    }}
                    value={
                      isSavingSelection
                        ? 'Saving...'
                        : institution?.name ?? 'Choose institution (optional)'
                    }
                  />
                </ProfileField>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={saveChanges}
                style={({ pressed }) => [
                  styles.saveButton,
                  isSaving && styles.saveButtonPressed,
                  pressed && styles.saveButtonPressed,
                ]}
              >
                <Text style={styles.saveButtonText}>
                  {isSaving ? 'Saving...' : 'Save changes'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        animationType="fade"
        transparent
        visible={activePicker === 'Country/Region'}
        onRequestClose={() => setActivePicker(null)}
      >
        <View style={styles.pickerOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close options"
            onPress={() => setActivePicker(null)}
            style={styles.pickerBackdrop}
          />
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{activePicker}</Text>
            {activePicker &&
              PICKER_OPTIONS[activePicker].map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  onPress={() => selectOption(option)}
                  style={({ pressed }) => [
                    styles.pickerOption,
                    pressed && styles.pickerOptionPressed,
                  ]}
                >
                  <Text style={styles.pickerOptionText}>{option}</Text>
                </Pressable>
              ))}
          </View>
        </View>
      </Modal>

      {showDatePicker &&
        (Platform.OS === 'ios' ? (
          <Modal
            animationType="fade"
            transparent
            visible
            onRequestClose={() => setShowDatePicker(false)}
          >
            <View style={styles.pickerOverlay}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close date picker"
                onPress={() => setShowDatePicker(false)}
                style={styles.pickerBackdrop}
              />
              <View style={styles.pickerCard}>
                <Text style={styles.pickerTitle}>Date of Birth</Text>
                <DateTimePicker
                  maximumDate={new Date()}
                  mode="date"
                  onChange={handleDateChange}
                  value={datePickerDraft}
                />
                <View style={styles.datePickerActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowDatePicker(false)}
                    style={styles.datePickerAction}
                  >
                    <Text style={styles.datePickerActionText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setDateOfBirth(datePickerDraft);
                      setShowDatePicker(false);
                    }}
                    style={styles.datePickerAction}
                  >
                    <Text style={styles.datePickerActionText}>Done</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            maximumDate={new Date()}
            mode="date"
            onChange={handleDateChange}
            value={dateOfBirth}
          />
        ))}
      <ProfileSelectionModal
        visible={selectionPicker === 'location'}
        kind="location"
        includeCurrentLocation
        onClose={() => setSelectionPicker(null)}
        onSelectLocation={(location) => void saveHomeLocation(location)}
      />
      <ProfileSelectionModal
        visible={selectionPicker === 'institution'}
        kind="institution"
        onClose={() => setSelectionPicker(null)}
        onSelectInstitution={(selected) => void saveInstitution(selected)}
        onClearInstitution={() => void saveInstitution(null)}
      />
    </LinearGradient>
  );
}

function ProfileField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function PickerButton({
  accessibilityLabel,
  onPress,
  value,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  value: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.input, styles.pickerButton, pressed && styles.pickerPressed]}
    >
      <Text style={styles.pickerValue} numberOfLines={1}>
        {value}
      </Text>
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path
          d="m5 9 7 7 7-7"
          fill="none"
          stroke="#111111"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 38,
    paddingVertical: 8,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  panel: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 36,
    backgroundColor: 'rgba(250, 251, 255, 0.94)',
    shadowColor: '#4B32B5',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 26,
    elevation: 8,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  header: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 34,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 7,
    marginBottom: 17,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#A6A2BA',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  avatarImage: {
    ...StyleSheet.absoluteFill,
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  cameraButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -2,
    marginBottom: 1,
  },
  form: {
    gap: 12,
  },
  field: {
    gap: 5,
  },
  fieldLabel: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    height: 39,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#9696A8',
    borderRadius: 14,
    color: '#37343D',
    fontSize: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  readOnlyInput: {
    opacity: 0.7,
  },
  passwordResetButton: {
    justifyContent: 'center',
  },
  passwordResetText: {
    color: '#37343D',
    fontSize: 12,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerValue: {
    color: '#4C4851',
    fontSize: 12,
  },
  pickerPressed: {
    opacity: 0.7,
  },
  saveButton: {
    height: 42,
    width: '68%',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 23,
    borderRadius: 9,
    backgroundColor: '#292A67',
  },
  saveButtonPressed: {
    opacity: 0.8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  pickerOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(25, 22, 44, 0.34)',
  },
  pickerCard: {
    width: '100%',
    overflow: 'hidden',
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#18152B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 10,
  },
  pickerTitle: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    color: '#342448',
    fontSize: 15,
    fontWeight: '700',
  },
  pickerOption: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  pickerOptionPressed: {
    backgroundColor: '#F1EDFA',
  },
  pickerOptionText: {
    color: '#342C46',
    fontSize: 14,
  },
  datePickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#E8E4EF',
  },
  datePickerAction: {
    minWidth: 72,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  datePickerActionText: {
    color: '#342448',
    fontSize: 14,
    fontWeight: '600',
  },
});