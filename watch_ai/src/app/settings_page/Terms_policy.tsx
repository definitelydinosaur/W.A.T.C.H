import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useAppTheme } from '../../theme/theme-context';


const POLICY_CARDS = [
  {
    title: 'Terms of Service',
    description: 'Review the terms for using W.A.T.C.H.',
    document: 'terms',
  },
  {
    title: 'Privacy Policy',
    description: 'Learn how information is handled when you use the app.',
    document: 'privacy',
  },
  {
    title: 'Data Sources & Disclaimer',
    description: 'Understand the sources and limitations of app information.',
    document: 'sources',
  },
] as const;

export default function TermsPolicyScreen() {
  const router = useRouter();
  const { displayed } = useAppTheme();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings_page/settings');
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
            <Text style={styles.headerTitle}>Terms and Policies</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.subtitle}>
              Learn about the terms and policies governing your use of W.A.T.C.H.
            </Text>

            {POLICY_CARDS.map((card) => (
              <Pressable
                key={card.document}
                accessibilityRole="button"
                accessibilityLabel={card.title}
                onPress={() =>
                  router.push({
                    pathname: '/settings_page/policy_document',
                    params: { document: card.document },
                  })
                }
                style={({ pressed }) => [
                  styles.policyCard,
                  pressed && styles.policyCardPressed,
                ]}
              >
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardDescription}>{card.description}</Text>
                </View>
                <Text style={[styles.chevron, { color: displayed.primary }]}>
                  ›
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
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
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: { width: 48 },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 12,
  },
  subtitle: {
    color: '#6A6475',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 6,
  },
  policyCard: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3E4EC',
    backgroundColor: '#FAFAFD',
  },
  policyCardPressed: { opacity: 0.65 },
  cardCopy: {
    flex: 1,
    gap: 5,
  },
  cardTitle: {
    color: '#342C46',
    fontSize: 14,
    fontWeight: '700',
  },
  cardDescription: {
    color: '#6A6475',
    fontSize: 12,
    lineHeight: 17,
  },
  chevron: {
    color: '#4B32B5',
    fontSize: 25,
    paddingLeft: 12,
  },
});
