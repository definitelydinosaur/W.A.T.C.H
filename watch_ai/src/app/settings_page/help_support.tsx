import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../../theme/theme-context';

const FAQ_ITEMS = [
  {
    question: 'What is W.A.T.C.H.?',
    answer:
      'W.A.T.C.H. (Weather Alert Tracking and Community Hazard System) brings weather information, hazard updates, official announcements, and safety guidance together to help you stay informed.',
  },
  {
    question: 'How do I get weather and location-based alerts?',
    answer:
      'Allow location access when prompted and keep notifications enabled on your device. You can also set a home location in your profile to help receive information relevant to your community.',
  },
  {
    question: 'Where do announcements and suspension updates come from?',
    answer:
      'W.A.T.C.H. gathers public announcements from official sources and configured institutions. Check the original source for confirmation and the latest details.',
  },
  {
    question: 'Can I rely on W.A.T.C.H. during an emergency?',
    answer:
      'W.A.T.C.H. is an informational aid, not a replacement for official warnings or instructions. Follow local authorities and emergency services during an emergency.',
  },
];

export default function HelpSupportScreen() {
  const router = useRouter();
  const { displayed } = useAppTheme();
  const [faqsExpanded, setFaqsExpanded] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);

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
            <Text style={styles.headerTitle}>Help &amp; Support</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Support</Text>
              <View style={styles.sectionCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="FAQs"
                  accessibilityState={{ expanded: faqsExpanded }}
                  onPress={() => {
                    setFaqsExpanded((expanded) => !expanded);
                    setExpandedQuestion(null);
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    pressed && styles.optionRowPressed,
                  ]}
                >
                  <Text style={styles.optionLabel}>FAQs</Text>
                  <Text style={[styles.chevron, { color: displayed.primary }]}>
                    {faqsExpanded ? '−' : '+'}
                  </Text>
                </Pressable>

                {faqsExpanded && (
                  <View style={styles.faqList}>
                    {FAQ_ITEMS.map((item, index) => {
                      const expanded = expandedQuestion === index;
                      return (
                        <View key={item.question} style={styles.faqItem}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={item.question}
                            accessibilityState={{ expanded }}
                            onPress={() =>
                              setExpandedQuestion(expanded ? null : index)
                            }
                            style={({ pressed }) => [
                              styles.questionRow,
                              pressed && styles.optionRowPressed,
                            ]}
                          >
                            <Text style={styles.questionText}>{item.question}</Text>
                            <Text style={[styles.chevron, { color: displayed.primary }]}>
                              {expanded ? '−' : '+'}
                            </Text>
                          </Pressable>
                          {expanded && (
                            <Text style={styles.answerText}>{item.answer}</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/settings_page/how_watch_works')}
                  style={({ pressed }) => [
                    styles.optionRow,
                    pressed && styles.optionRowPressed,
                  ]}
                >
                  <Text style={styles.optionLabel}>How W.A.T.C.H. Works</Text>
                  <Text style={[styles.chevron, { color: displayed.primary }]}>
                    ›
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/settings_page/contact_us')}
                  style={({ pressed }) => [
                    styles.optionRow,
                    pressed && styles.optionRowPressed,
                  ]}
                >
                  <Text style={styles.optionLabel}>Contact us</Text>
                  <Text style={[styles.chevron, { color: displayed.primary }]}>
                    ›
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/settings_page/about_watch')}
                  style={({ pressed }) => [
                    styles.optionRow,
                    pressed && styles.optionRowPressed,
                  ]}
                >
                  <Text style={styles.optionLabel}>About W.A.T.C.H.</Text>
                  <Text style={[styles.chevron, { color: displayed.primary }]}>
                    ›
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
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
  optionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  optionRowPressed: { opacity: 0.65 },
  optionLabel: {
    color: '#342C46',
    fontSize: 14,
    fontWeight: '600',
  },
  chevron: {
    color: '#4B32B5',
    fontSize: 22,
    fontWeight: '500',
    paddingHorizontal: 4,
  },
  faqList: {
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  faqItem: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E3E4EC',
  },
  questionRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 4,
  },
  questionText: {
    flex: 1,
    color: '#342C46',
    fontSize: 13,
    fontWeight: '500',
  },
  answerText: {
    color: '#6A6475',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
});
