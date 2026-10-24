import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import supabase from '../../lib/supabase';

type IconName =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'privacy'
  | 'subscription'
  | 'help'
  | 'terms'
  | 'space'
  | 'saver'
  | 'report'
  | 'account'
  | 'logout';

interface SettingItem {
  label: string;
  icon: IconName;
}

const SECTIONS: { title: string; items: SettingItem[] }[] = [
  {
    title: 'Account',
    items: [
      { label: 'Edit profile', icon: 'profile' },
      { label: 'Security', icon: 'security' },
      { label: 'Notifications', icon: 'notifications' },
      { label: 'Privacy', icon: 'privacy' },
    ],
  },
  {
    title: 'Support & About',
    items: [
      { label: 'My Subscription', icon: 'subscription' },
      { label: 'Help & Support', icon: 'help' },
      { label: 'Terms and Policies', icon: 'terms' },
    ],
  },
  {
    title: 'Cache & cellular',
    items: [
      { label: 'Free up space', icon: 'space' },
      { label: 'Data Saver', icon: 'saver' },
    ],
  },
  {
    title: 'Actions',
    items: [
      { label: 'Report a problem', icon: 'report' },
      { label: 'Add account', icon: 'account' },
      { label: 'Log out', icon: 'logout' },
    ],
  },
];

const NAVIGATION_ITEMS = [
  { label: 'Home', href: '/home' as const },
];

function SettingIcon({ name }: { name: IconName }) {
  const shared = {
    fill: 'none' as const,
    stroke: '#4B32B5',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
  };

  return (
    <Svg width={25} height={25} viewBox="0 0 24 24">
      {name === 'profile' && (
        <>
          <Circle cx={12} cy={7} r={3.5} {...shared} />
          <Path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1z" {...shared} />
        </>
      )}
      {name === 'security' && (
        <>
          <Path d="M12 2.5 20 5v6c0 5-3.4 8.4-8 10.5C7.4 19.4 4 16 4 11V5z" {...shared} />
          <Path d="M12 8v4" {...shared} />
          <Circle cx={12} cy={15.5} r={0.7} fill="#4B32B5" stroke="none" />
        </>
      )}
      {name === 'notifications' && (
        <>
          <Path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" {...shared} />
          <Path d="M10 21h4" {...shared} />
        </>
      )}
      {name === 'privacy' && (
        <>
          <Rect x={4} y={10} width={16} height={11} rx={2} {...shared} />
          <Path d="M8 10V7a4 4 0 0 1 8 0v3" {...shared} />
          <Circle cx={12} cy={15} r={1} {...shared} />
        </>
      )}
      {name === 'subscription' && (
        <>
          <Rect x={2.5} y={5} width={19} height={14} rx={1.5} {...shared} />
          <Line x1={3} y1={9} x2={21} y2={9} {...shared} />
        </>
      )}
      {name === 'help' && (
        <>
          <Circle cx={12} cy={12} r={9} {...shared} />
          <Path d="M9.7 9a2.4 2.4 0 1 1 4.1 1.7c-1.2 1.1-1.8 1.4-1.8 3" {...shared} />
          <Circle cx={12} cy={17} r={0.7} fill="#4B32B5" stroke="none" />
        </>
      )}
      {name === 'terms' && (
        <>
          <Circle cx={12} cy={12} r={9} {...shared} />
          <Path d="M12 7v6" {...shared} />
          <Circle cx={12} cy={17} r={0.7} fill="#4B32B5" stroke="none" />
        </>
      )}
      {name === 'space' && (
        <>
          <Path d="M4 7h16M9 4h6M6 7l1 14h10l1-14M10 11v6M14 11v6" {...shared} />
        </>
      )}
      {name === 'saver' && (
        <>
          <Circle cx={11} cy={13} r={8} {...shared} />
          <Path d="M11 8v5l3 2M17 3h4v4M21 3l-4 4" {...shared} />
        </>
      )}
      {name === 'report' && (
        <Path d="M5 21V4m0 1h13l-2 4 2 4H5" {...shared} />
      )}
      {name === 'account' && (
        <>
          <Circle cx={9} cy={8} r={3} {...shared} />
          <Path d="M3 20v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 5.5 3.6M16 7a3 3 0 0 1 0 6M17 16h5M19.5 13.5v5" {...shared} />
        </>
      )}
      {name === 'logout' && (
        <>
          <Path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h10" {...shared} />
        </>
      )}
    </Svg>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { profilePictureUrl: routeProfilePictureUrl } = useLocalSearchParams<{
    profilePictureUrl?: string | string[];
  }>();
  const profilePictureUrl =
    typeof routeProfilePictureUrl === 'string' ? routeProfilePictureUrl : '';
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/auth/login');
    } catch (error) {
      Alert.alert(
        'Log out failed',
        error instanceof Error ? error.message : 'Unable to log out. Please try again.',
      );
    } finally {
      setIsLoggingOut(false);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

  return (
    <LinearGradient colors={['#F8F7FB', '#E7E1F3', '#CEC3E2']} style={styles.background}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
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
            <Text style={styles.headerTitle}>Settings</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open navigation"
              accessibilityState={{ expanded: navigationOpen }}
              onPress={() => setNavigationOpen(true)}
              style={styles.navigationButton}
              hitSlop={6}
            >
              <LinearGradient
                colors={['#6738C7', '#382493']}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.navigationButtonGradient}
              >
                <Image
                  source={require('../../../assets/images/homepage/3dots.png')}
                  style={styles.navigationDots}
                  contentFit="contain"
                />
              </LinearGradient>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {SECTIONS.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.sectionCard}>
                  {section.items.map((item) => (
                    item.icon === 'logout' ? (
                      <Pressable
                        key={item.label}
                        accessibilityRole="button"
                        accessibilityLabel="Log out"
                        onPress={handleLogout}
                        disabled={isLoggingOut}
                        style={({ pressed }) => [
                          styles.settingRow,
                          pressed && styles.settingRowPressed,
                          isLoggingOut && styles.settingRowDisabled,
                        ]}
                      >
                        <View style={styles.iconContainer}>
                          <SettingIcon name={item.icon} />
                        </View>
                        <Text style={styles.settingLabel}>
                          {isLoggingOut ? 'Logging out...' : item.label}
                        </Text>
                      </Pressable>
                    ) : item.icon === 'profile' ? (
                      <Pressable
                        key={item.label}
                        accessibilityRole="button"
                        accessibilityLabel={item.label}
                        onPress={() =>
                          router.push({
                            pathname: '/settings_page/edit_profile',
                            params: { profilePictureUrl },
                          })
                        }
                        style={({ pressed }) => [
                          styles.settingRow,
                          pressed && styles.settingRowPressed,
                        ]}
                      >
                        <View style={styles.iconContainer}>
                          <SettingIcon name={item.icon} />
                        </View>
                        <Text style={styles.settingLabel}>{item.label}</Text>
                      </Pressable>
                    ) : (
                      <View key={item.label} style={styles.settingRow}>
                        <View style={styles.iconContainer}>
                          <SettingIcon name={item.icon} />
                        </View>
                        <Text style={styles.settingLabel}>{item.label}</Text>
                      </View>
                    )
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>

      <Modal
        visible={navigationOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setNavigationOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close navigation"
            onPress={() => setNavigationOpen(false)}
            style={styles.modalBackdrop}
          />
          <View style={styles.navigationMenu}>
            {NAVIGATION_ITEMS.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                onPress={() => {
                  setNavigationOpen(false);
                  router.push(item.href);
                }}
                style={({ pressed }) => [
                  styles.navigationMenuItem,
                  pressed && styles.navigationMenuItemPressed,
                ]}
              >
                <Text style={styles.navigationMenuLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  panel: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 38,
    backgroundColor: '#FFFFFF',
    shadowColor: '#4B32B5',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 8,
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
  navigationButton: {
    width: 60,
    height: 48,
    borderRadius: 25,
    shadowColor: '#342080',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  navigationButtonGradient: {
    flex: 1,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navigationDots: {
    width: 7,
    height: 22,
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
  settingRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  settingRowPressed: {
    opacity: 0.65,
  },
  settingRowDisabled: {
    opacity: 0.6,
  },
  iconContainer: {
    width: 62,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  settingLabel: {
    color: '#342C46',
    fontSize: 14,
    fontWeight: '600',
  },
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(27, 20, 45, 0.18)',
  },
  navigationMenu: {
    position: 'absolute',
    top: 112,
    right: 26,
    minWidth: 160,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#241944',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  navigationMenuItem: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  navigationMenuItemPressed: {
    backgroundColor: '#F1EDFA',
  },
  navigationMenuLabel: {
    color: '#342448',
    fontSize: 15,
    fontWeight: '500',
  },
});