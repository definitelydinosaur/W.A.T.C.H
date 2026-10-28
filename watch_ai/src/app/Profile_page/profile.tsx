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

type ProfileDetails = {
  name: string | null;
  email: string | null;
};

export default function ProfileScreen() {
  const router = useRouter();
  const { profilePictureUrl, loading: pictureLoading, loadProfilePicture } =
    useProfilePicture();
  const [profile, setProfile] = useState<ProfileDetails>({
    name: null,
    email: null,
  });
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadProfile = async () => {
        setLoading(true);
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) {
          setProfile({ name: null, email: null });
          return;
        }

        const { data, error } = await supabase
          .from('user_info')
          .select('name, email')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;
        if (!isActive) return;

        const metadataName =
          user.user_metadata?.full_name ?? user.user_metadata?.name;
        setProfile({
          name:
            data?.name ??
            (typeof metadataName === 'string' ? metadataName : null),
          email: data?.email ?? user.email ?? null,
        });
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
      colors={['#F8F7FB', '#E7E1F3', '#CEC3E2']}
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
                  stroke="#342448"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Pressable>
            <Text style={styles.headerTitle}>Profile</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.heroCard}>
            <LinearGradient
              colors={['#6D45B8', '#49328D', '#302364']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.avatar}>
              {pictureLoading && !profilePictureUrl ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : profilePictureUrl ? (
                <Image
                  accessibilityLabel="Profile picture"
                  source={{ uri: profilePictureUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
              ) : (
                <Text style={styles.avatarInitial}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <Text style={styles.name}>{loading ? 'Loading profile…' : displayName}</Text>
            <Text style={styles.heroSubtitle}>W.A.T.C.H. member</Text>
          </View>

          <View style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>Account details</Text>
            <ProfileDetail label="Full name" value={profile.name || 'Not provided'} />
            <View style={styles.divider} />
            <ProfileDetail label="Email address" value={profile.email || 'Not available'} />
          </View>

          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Read-only profile</Text>
            <Text style={styles.noteText}>
              Your account information is shown here. To update your profile picture,
              use the Edit Profile option in Settings.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function ProfileDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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
  noteCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(109,69,184,0.1)',
  },
  noteTitle: {
    color: '#49328D',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  noteText: {
    color: '#5D5668',
    fontSize: 13,
    lineHeight: 19,
  },
});