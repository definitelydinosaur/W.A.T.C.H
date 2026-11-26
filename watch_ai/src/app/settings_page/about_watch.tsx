import { Image } from 'expo-image';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

const APP_VERSION = Constants.expoConfig?.version ?? '';
const DEVELOPED_BY = 'StratoDevs';
const INSTITUTION = 'Cebu Institute of Technology - University';

export default function AboutWatchScreen() {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings_page/help_support');
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
            <Text style={styles.headerTitle}>About W.A.T.C.H.</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brandSection}>
              <Image
                accessibilityLabel="W.A.T.C.H. app logo"
                source={require('../../../assets/images/authpage/Logo.png')}
                contentFit="contain"
                style={styles.logo}
              />
              <Text style={styles.appName}>Weather Alert Tracking and Community Hazard System</Text>
            </View>

            <Text style={styles.description}>
              W.A.T.C.H. is an AI-powered weather and safety information system designed to help
              students and community members stay informed about weather conditions, potential
              hazards, and important announcements based on their location.
            </Text>

            <View style={styles.infoCard}>
              <InfoRow label="App Version" value={APP_VERSION} />
              <View style={styles.divider} />
              <InfoRow label="Developed By" value={DEVELOPED_BY} />
              <View style={styles.divider} />
              <InfoRow label="Institution" value={INSTITUTION} />
            </View>

            <Text style={styles.footer}>© 2026 W.A.T.C.H. All rights reserved.</Text>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: { width: 48 },
  scrollView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 22,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 20,
    gap: 10,
  },
  logo: {
    width: 76,
    height: 76,
  },
  appName: {
    maxWidth: 280,
    color: '#342448',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
  },
  description: {
    color: '#6A6475',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 18,
  },
  infoCard: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3E4EC',
    backgroundColor: '#FAFAFD',
  },
  infoRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLabel: {
    color: '#342C46',
    fontSize: 13,
    fontWeight: '600',
  },
  infoValue: {
    flexShrink: 1,
    color: '#6A6475',
    fontSize: 13,
    textAlign: 'right',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3E4EC',
  },
  footer: {
    color: '#8B8594',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 'auto',
    paddingTop: 28,
  },
});
