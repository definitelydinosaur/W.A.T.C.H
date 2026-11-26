import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useProfilePicture } from '../../hooks/loadprofilepicture';
import supabase from '../../lib/supabase';
import { profileApi } from '../../lib/profile-api';
import { useAppTheme } from '../../theme/theme-context';

type ProfileDetails = {
  name: string | null;
  email: string | null;
  institution: string | null;
  homeLocation: string | null;
};

type ProfileResponse = {
  profile: {
    name: string | null;
    email: string | null;
    institution: {
      name: string;
      short_name: string | null;
    } | null;
    home_location: {
      address: string | null;
      city: string | null;
      province: string | null;
      barangay: string | null;
    } | null;
  };
};

function formatHomeLocation(
  location: ProfileResponse['profile']['home_location'],
) {
  if (!location) return null;
  return (
    location.address?.trim() ||
    [location.barangay, location.city, location.province]
      .filter(Boolean)
      .join(', ') ||
    null
  );
};

export default function ProfileScreen() {
  const router = useRouter();
  const { displayed } = useAppTheme();
  const { profilePictureUrl, loading: pictureLoading, loadProfilePicture } =
    useProfilePicture();
  const [profile, setProfile] = useState<ProfileDetails>({
    name: null,
    email: null,
    institution: null,
    homeLocation: null,
  });
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadProfile = async () => {
        setLoading(true);
        try {
          const {
            data: { user },
            error: userError,
          } = await supabase.auth.getUser();

          if (userError) throw userError;
          if (!isActive) return;
          if (!user) {
            setProfile({
              name: null,
              email: null,
              institution: null,
              homeLocation: null,
            });
            return;
          }

          const { profile: details } = await profileApi<ProfileResponse>(
            '/profile',
          );
          if (!isActive) return;

          const metadataName =
            user.user_metadata?.full_name ?? user.user_metadata?.name;
          setProfile({
            name:
              details.name ??
              (typeof metadataName === 'string' ? metadataName : null),
            email: details.email ?? user.email ?? null,
            institution:
              details.institution?.short_name?.trim() ||
              details.institution?.name?.trim() ||
              null,
            homeLocation: formatHomeLocation(details.home_location),
          });
        } finally {
          if (isActive) setLoading(false);
        }
      };

      void loadProfile().catch((error: unknown) => {
        if (isActive) {
          console.error('Profile details error:', error);
        }
      });
      void loadProfilePicture();

      return () => {
        isActive = false;
      };
    }, [loadProfilePicture]),
  );

  const displayName = profile.name?.trim() || 'Your profile';

  return (
    <LinearGradient
      colors={displayed.settingsGradient}
      style={styles.background}
    >
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Svg width={22} height={22} viewBox="0 0 24 24">
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
            <Text style={[styles.headerTitle, { color: displayed.text }]}>Profile</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={[styles.heroCard, { shadowColor: displayed.primaryDark }]}>
            <LinearGradient
              colors={[displayed.primary, displayed.primaryDark, displayed.gradient[2]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.avatar}>
              {pictureLoading && !profilePictureUrl ? (
                <ActivityIndicator color={displayed.onPrimary} />
              ) : profilePictureUrl ? (
                <Image
                  accessibilityLabel="Profile picture"
                  source={{ uri: profilePictureUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
              ) : (
                <Text style={[styles.avatarInitial, { color: displayed.onPrimary }]}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <Text style={[styles.name, { color: displayed.onPrimary }]}>{loading ? 'Loading profile…' : displayName}</Text>
            <Text style={styles.heroSubtitle}>W.A.T.C.H. member</Text>
          </View>

          <View style={styles.detailsCard}>
            <Text style={[styles.sectionTitle, { color: displayed.text }]}>Account details</Text>
            <ProfileDetail label="Full name" value={profile.name || 'Not provided'} labelColor={displayed.muted} valueColor={displayed.text} />
            <View style={styles.divider} />
            <ProfileDetail label="Email address" value={profile.email || 'Not available'} labelColor={displayed.muted} valueColor={displayed.text} />
            <View style={styles.divider} />
            <ProfileDetail label="Institution" value={profile.institution || 'Not provided'} labelColor={displayed.muted} valueColor={displayed.text} />
            <View style={styles.divider} />
            <ProfileDetail label="Home location" value={profile.homeLocation || 'Not provided'} labelColor={displayed.muted} valueColor={displayed.text} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function ProfileDetail({
  label,
  value,
  labelColor,
  valueColor,
}: {
  label: string;
  value: string;
  labelColor: string;
  valueColor: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingBottom: 36,
  },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  headerTitle: {
    color: '#342448',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 42,
  },
  heroCard: {
    minHeight: 245,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    shadowColor: '#362467',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.82)',
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '700',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    marginTop: 5,
  },
  detailsCard: {
    marginTop: 22,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  sectionTitle: {
    color: '#342448',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  detailRow: {
    minHeight: 68,
    justifyContent: 'center',
    gap: 5,
  },
  detailLabel: {
    color: '#777181',
    fontSize: 12,
    fontWeight: '600',
  },
  detailValue: {
    color: '#30283B',
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(74,61,91,0.16)',
  },
});