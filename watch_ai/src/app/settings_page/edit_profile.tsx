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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAppTheme } from '../../theme/theme-context';
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
import { AVATAR_ARTIST_CREDIT, CUSTOM_AVATARS, type CustomAvatar } from '../../lib/custom-avatars';

type PickerField = 'Country/Region';

const PICKER_OPTIONS: Record<PickerField, string[]> = {
  'Country/Region': ['Philippines', 'United States', 'Canada', 'Japan', 'Australia'],
};

type ProfileSnapshot = {
  name: string;
  birthdate: string;
  country: string;
  homeLocation: string;
  institution: string;
};

function birthdateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function homeLocationValue(location: HomeLocationInput | null) {
  if (!location) return '';
  return (
    JSON.stringify([
      location.address,
      location.latitude,
      location.longitude,
      location.city,
      location.province,
      location.barangay,
    ]) ?? ''
  );
}

function institutionValue(institution: InstitutionOption | null) {
  if (!institution) return '';
  return (
    JSON.stringify([
      institution.id,
      institution.name,
      institution.facebook_page_url,
    ]) ?? ''
  );
}

function profileSnapshot(
  name: string,
  dateOfBirth: Date,
  country: string,
  homeLocation: HomeLocationInput | null,
  institution: InstitutionOption | null,
): ProfileSnapshot {
  return {
    name,
    birthdate: birthdateValue(dateOfBirth),
    country,
    homeLocation: homeLocationValue(homeLocation),
    institution: institutionValue(institution),
  };
}

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
  const { displayed } = useAppTheme();
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
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [homeLocation, setHomeLocation] = useState<HomeLocationInput | null>(null);
  const [institution, setInstitution] = useState<InstitutionOption | null>(null);
  const [selectionPicker, setSelectionPicker] =
    useState<'location' | 'institution' | null>(null);
  const [savedProfileSnapshot, setSavedProfileSnapshot] =
    useState<ProfileSnapshot | null>(null);

  const hasUnsavedChanges =
    savedProfileSnapshot !== null &&
    (name !== savedProfileSnapshot.name ||
      birthdateValue(dateOfBirth) !== savedProfileSnapshot.birthdate ||
      country !== savedProfileSnapshot.country ||
      homeLocationValue(homeLocation) !==
        savedProfileSnapshot.homeLocation ||
      institutionValue(institution) !==
        savedProfileSnapshot.institution);


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
    const loadedName = profile.name ?? '';
    const loadedEmail = profile.email ?? '';
    const loadedCountry = profile.country ?? 'Philippines';
    const loadedHomeLocation = profile.home_location
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
      : null;
    const loadedInstitution = profile.institution;
    const loadedDateOfBirth =
      parseBirthdate(profile.birthdate) ?? new Date(1995, 4, 23);

    setSavedProfileSnapshot(profileSnapshot(
      loadedName,
      loadedDateOfBirth,
      loadedCountry,
      loadedHomeLocation,
      loadedInstitution,
    ));
    setName(loadedName);
    setEmail(loadedEmail);
    setCountry(loadedCountry);
    setHomeLocation(loadedHomeLocation);
    setInstitution(loadedInstitution);
    setDateOfBirth(loadedDateOfBirth);
    setDatePickerDraft(loadedDateOfBirth);
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
  const savedProfile = savedProfileSnapshot;
  if (isSaving || !savedProfile || !hasUnsavedChanges) return;
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

    const homeLocationChanged =
      homeLocationValue(homeLocation) !== savedProfile.homeLocation;
    const institutionChanged =
      institutionValue(institution) !== savedProfile.institution;
    const profileFieldsChanged =
      name !== savedProfile.name ||
      birthdateValue(dateOfBirth) !== savedProfile.birthdate ||
      country !== savedProfile.country;

    if (homeLocationChanged && homeLocation) {
      await profileApi('/profile/home-location', {
        method: 'POST',
        body: JSON.stringify({
          full_address: homeLocation.address,
          latitude: homeLocation.latitude,
          longitude: homeLocation.longitude,
          city: homeLocation.city,
          province: homeLocation.province,
          barangay: homeLocation.barangay,
        }),
      });
    }

    let savedInstitution = institution;
    if (institutionChanged) {
      const institutionBody = institution
        ? institution.id
          ? { institutionId: institution.id }
          : {
              name: institution.name,
              facebookPageUrl: institution.facebook_page_url,
            }
        : { institutionId: null };
      const result = await profileApi<{
        institution: InstitutionOption | null;
      }>('/profile/institution', {
        method: 'PUT',
        body: JSON.stringify(institutionBody),
      });
      savedInstitution = result.institution;
      setInstitution(savedInstitution);
    }

    const savedName = name.trim();
    const savedCountry = country.trim();
    if (profileFieldsChanged) {
      const { data: updatedProfile, error: updateError } = await supabase
        .from('user_info')
        .update({
          name: savedName,
          birthdate: birthdateValue(dateOfBirth),
          country: savedCountry,
        })
        .eq('id', user.id)
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updatedProfile) {
        throw new Error('No profile was found for the signed-in user.');
      }
      setName(savedName);
      setCountry(savedCountry);
    }

    setSavedProfileSnapshot(profileSnapshot(
      profileFieldsChanged ? savedName : name,
      dateOfBirth,
      profileFieldsChanged ? savedCountry : country,
      homeLocation,
      savedInstitution,
    ));
    if (profileFieldsChanged) {
      setName(savedName);
      setCountry(savedCountry);
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

const stageHomeLocation = (location: HomeLocationInput) => {
  setHomeLocation(location);
  setSelectionPicker(null);
};

const stageInstitution = (selected: InstitutionOption | null) => {
  setInstitution(selected);
  setSelectionPicker(null);
};

const uploadProfileImage = async (uri: string, mimeType: string) => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
    if (!apiUrl) {
      throw new Error(
        'Backend URL is missing. Check your EXPO_PUBLIC_API_URL environment variable.',
      );
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw new Error(error.message);
    }
    if (!data.session) {
      throw new Error('Please sign in before uploading a profile picture.');
    }

    setIsUploadingPicture(true);
    setLocalProfilePicture(uri);
    setProfilePicture(uri);

    const response = await FileSystem.uploadAsync(
      `${apiUrl}/profile/picture`,
      uri,
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

    const cacheBustedImageUrl = `${responseBody.profile_pic}${
      responseBody.profile_pic.includes('?') ? '&' : '?'
    }t=${Date.now()}`;
    setProfilePicture(cacheBustedImageUrl);
  };

  const changeProfilePicture = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to change your profile picture.',
        );
        return;
      }

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

      setSelectedAvatarId(null);
      await uploadProfileImage(asset.uri, mimeType);
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

  const chooseAvatar = async (avatar: CustomAvatar) => {
    try {
      const resolved = Image.resolveAssetSource(avatar.source);
      if (!resolved?.uri) {
        throw new Error('This avatar file could not be opened.');
      }

      let uri = resolved.uri;
      const lowerUri = uri.toLowerCase();
      const mimeType = lowerUri.includes('.jpg') || lowerUri.includes('.jpeg')
        ? 'image/jpeg'
        : lowerUri.includes('.webp')
          ? 'image/webp'
          : 'image/png';
      const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
      if (!uri.startsWith('file:')) {
        const folder = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
        if (!folder) {
          throw new Error('This avatar could not be saved on the device.');
        }
        const downloaded = await FileSystem.downloadAsync(
          uri,
          `${folder}avatar-${avatar.id}.${extension}`,
        );
        uri = downloaded.uri;
      }

      setSelectedAvatarId(avatar.id);
      await uploadProfileImage(uri, mimeType);
      Alert.alert('Avatar Updated', 'Your profile picture now uses this avatar.');
    } catch (error) {
      setSelectedAvatarId(null);
      Alert.alert(
        'Avatar Failed',
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while setting this avatar.',
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
  const selectedAvatar = CUSTOM_AVATARS.find((avatar) => avatar.id === selectedAvatarId);
  const artistCredit = selectedAvatar?.credit.trim() || AVATAR_ARTIST_CREDIT.trim();
  const avatarInitial = name.trim().charAt(0).toUpperCase() || 'W';

  return (
    <View style={styles.background}>
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
                      stroke={displayed.text}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </Pressable>
                <Text style={[styles.headerTitle, { color: displayed.text }]}>Edit Profile</Text>
              </View>

              <View style={styles.avatarSection}>
                <View style={styles.avatarStage}>
                  <View style={[styles.avatarRing, { backgroundColor: displayed.primary }]}>
                    <View style={styles.avatar}>
                      {displayedProfilePicture ? (
                        <Image
                          accessibilityLabel="Selected profile picture"
                          source={{ uri: displayedProfilePicture }}
                          style={styles.avatarImage}
                          resizeMode="cover"
                          onError={() => {
                            if (localProfilePicture && profilePicture !== localProfilePicture) {
                              setProfilePicture(localProfilePicture);
                            }
                          }}
                        />
                      ) : (
                        <Text style={[styles.avatarInitial, { color: displayed.primary }]}>
                          {avatarInitial}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Change profile photo"
                    accessibilityState={{ disabled: isUploadingPicture }}
                    disabled={isUploadingPicture}
                    onPress={() => void changeProfilePicture()}
                    style={styles.cameraButton}
                  >
                    {isUploadingPicture ? (
                      <ActivityIndicator color={displayed.primary} size="small" />
                    ) : (
                      <Svg width={18} height={18} viewBox="0 0 24 24">
                        <Path
                          d="M8.2 7.2 9.4 5.6h5.2l1.2 1.6H19a1.6 1.6 0 0 1 1.6 1.6v8.2A1.6 1.6 0 0 1 19 18.6H5a1.6 1.6 0 0 1-1.6-1.6V8.8A1.6 1.6 0 0 1 5 7.2h3.2Z"
                          fill="none"
                          stroke={displayed.primary}
                          strokeWidth={1.8}
                          strokeLinejoin="round"
                        />
                        <Circle
                          cx={12}
                          cy={12.6}
                          r={2.7}
                          fill="none"
                          stroke={displayed.primary}
                          strokeWidth={1.8}
                        />
                      </Svg>
                    )}
                  </Pressable>
                </View>
                {artistCredit ? (
                  <Text style={styles.artistCredit}>Art by {artistCredit}</Text>
                ) : null}
                <Text style={styles.avatarHeading}>Avatars</Text>
                {CUSTOM_AVATARS.length === 0 ? (
                  <Text style={styles.avatarHint}>
                    Add images to assets/avatars, then list each file in src/lib/custom-avatars.ts.
                  </Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.avatarRow}
                  >
                    {CUSTOM_AVATARS.map((avatar) => {
                      const selected = avatar.id === selectedAvatarId;
                      return (
                        <Pressable
                          key={avatar.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Use the ${avatar.id} avatar`}
                          accessibilityState={{ selected, disabled: isUploadingPicture }}
                          disabled={isUploadingPicture}
                          onPress={() => void chooseAvatar(avatar)}
                          style={[
                            styles.avatarChoice,
                            selected && { borderColor: displayed.primary },
                          ]}
                        >
                          <Image source={avatar.source} style={styles.avatarChoiceImage} />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
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
                      if (!isSaving) setSelectionPicker('location');
                    }}
                    value={homeLocation?.address ?? 'Choose home location'}
                  />
                </ProfileField>

                <ProfileField label="Institution">
                  <PickerButton
                    accessibilityLabel="Change institution"
                    onPress={() => {
                      if (!isSaving) setSelectionPicker('institution');
                    }}
                    value={institution?.name ?? 'Choose institution (optional)'}
                  />
                </ProfileField>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: !hasUnsavedChanges || isSaving,
                }}
                disabled={!hasUnsavedChanges || isSaving}
                onPress={saveChanges}
                style={({ pressed }) => [
                  styles.saveButton,
                  { backgroundColor: displayed.primary },
                  !hasUnsavedChanges && styles.saveButtonDisabled,
                  isSaving && styles.saveButtonPressed,
                  pressed && styles.saveButtonPressed,
                ]}
              >
                <Text style={[styles.saveButtonText, { color: displayed.onPrimary }]}>
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
        onSelectLocation={stageHomeLocation}
      />
      <ProfileSelectionModal
        visible={selectionPicker === 'institution'}
        kind="institution"
        onClose={() => setSelectionPicker(null)}
        onSelectInstitution={stageInstitution}
        onClearInstitution={() => stageInstitution(null)}
      />
    </View>
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
  const { displayed } = useAppTheme();

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
          stroke={displayed.text}
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
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  panel: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    marginTop: 12,
    marginBottom: 18,
  },
  avatarStage: {
    width: 156,
    height: 156,
    marginBottom: 8,
  },
  avatarRing: {
    width: 148,
    height: 148,
    borderRadius: 74,
    padding: 4,
    shadowColor: '#2A2148',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  avatar: {
    flex: 1,
    borderRadius: 70,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F2FA',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    fontSize: 48,
    fontWeight: '700',
  },
  cameraButton: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#F4F2FA',
    shadowColor: '#2A2148',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 4,
  },
  artistCredit: {
    marginTop: 2,
    marginBottom: 10,
    color: '#7A7386',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  avatarHeading: {
    alignSelf: 'flex-start',
    marginTop: 6,
    marginBottom: 8,
    color: '#111111',
    fontSize: 13,
    fontWeight: '700',
  },
  avatarHint: {
    alignSelf: 'stretch',
    color: '#7A7386',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  avatarRow: {
    gap: 10,
    paddingVertical: 2,
    paddingRight: 8,
  },
  avatarChoice: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E4E0EE',
    backgroundColor: '#F4F2FA',
  },
  avatarChoiceImage: {
    width: '100%',
    height: '100%',
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
  saveButtonDisabled: {
    opacity: 0.5,
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