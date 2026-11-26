import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const STEPS = [
  {
    title: 'Weather Monitoring',
    description:
      'View weather conditions and forecasts for your area to help you plan ahead.',
    icon: 'weather',
  },
  {
    title: 'Hazard Detection',
    description:
      'See potential weather-related hazards and risks that may affect your community.',
    icon: 'hazard',
  },
  {
    title: 'Announcement Monitoring',
    description:
      'Keep up with public announcements and important updates from supported institutions.',
    icon: 'announcement',
  },
  {
    title: 'AI-Powered Summaries',
    description:
      'Get key information and safety context summarized to make updates easier to understand.',
    icon: 'summary',
  },
] as const;

function StepIcon({ name }: { name: (typeof STEPS)[number]['icon'] }) {
  const shared = {
    fill: 'none' as const,
    stroke: '#4B32B5',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
  };

  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      {name === 'weather' && (
        <>
          <Circle cx={15.5} cy={7} r={3.5} {...shared} />
          <Path d="M15.5 1.5v1.2M21 7h1.2M19.4 3.1l.8-.8M5 15h11a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6ZM3 12h8" {...shared} />
        </>
      )}
      {name === 'hazard' && (
        <>
          <Path d="M12 3 22 20H2L12 3Z" {...shared} />
          <Path d="M12 9v5M12 17.5v.1" {...shared} />
        </>
      )}
      {name === 'announcement' && (
        <>
          <Path d="M4 13V8a1 1 0 0 1 1-1h3l9-4v17l-9-4H5a1 1 0 0 1-1-1v-2ZM8 16l2 5h4l-2.2-4" {...shared} />
          <Path d="M20 8a5 5 0 0 1 0 5" {...shared} />
        </>
      )}
      {name === 'summary' && (
        <>
          <Rect x={4} y={3} width={16} height={18} rx={2} {...shared} />
          <Path d="M8 8h8M8 12h8M8 16h5" {...shared} />
          <Circle cx={18} cy={17} r={3} fill="#FAFAFD" stroke="#4B32B5" strokeWidth={1.8} />
          <Path d="m16.8 17  .8.8 1.6-1.7" {...shared} />
        </>
      )}
    </Svg>
  );
}

export default function HowWatchWorksScreen() {
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
            <Text style={styles.headerTitle}>How It Works</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.intro}>
              W.A.T.C.H. brings weather, hazard, and community updates together to help you stay
              informed and prepared.
            </Text>

            <View style={styles.steps}>
              {STEPS.map((step, index) => (
                <View key={step.title} style={styles.step}>
                  <View style={styles.timeline}>
                    <View style={styles.iconCircle}>
                      <StepIcon name={step.icon} />
                    </View>
                    {index < STEPS.length - 1 && <View style={styles.connector} />}
                  </View>
                  <View style={styles.stepCard}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepDescription}>{step.description}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.disclaimer}>
              W.A.T.C.H. is an informational aid. Always follow official warnings and
              instructions from emergency authorities.
            </Text>
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
  headerSpacer: { width: 48 },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 22,
  },
  intro: {
    color: '#342C46',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  steps: {
    gap: 8,
  },
  step: {
    minHeight: 83,
    flexDirection: 'row',
    gap: 12,
  },
  timeline: {
    width: 34,
    alignItems: 'center',
  },
  iconCircle: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#F0ECFA',
  },
  connector: {
    flex: 1,
    width: 1,
    marginVertical: 4,
    backgroundColor: '#D8D0EA',
  },
  stepCard: {
    flex: 1,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3E4EC',
    backgroundColor: '#FAFAFD',
    justifyContent: 'center',
    gap: 4,
  },
  stepTitle: {
    color: '#342C46',
    fontSize: 13,
    fontWeight: '700',
  },
  stepDescription: {
    color: '#6A6475',
    fontSize: 12,
    lineHeight: 17,
  },
  disclaimer: {
    color: '#6A6475',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
    paddingTop: 16,
  },
});
