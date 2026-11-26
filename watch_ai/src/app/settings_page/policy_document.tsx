import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useAppTheme } from '../../theme/theme-context';

const DOCUMENTS = {
  terms: {
    title: 'Terms of Service',
    sections: [
      {
        title: 'Acceptance of Terms',
        body:
          'By accessing or using W.A.T.C.H., you agree to these terms. If you do not agree, please stop using the app.',
      },
      {
        title: 'Purpose of W.A.T.C.H.',
        body:
          'W.A.T.C.H. provides weather information, hazard updates, public and institutional announcements, and AI-assisted summaries to help users stay informed. It is an informational tool and is not an emergency-response service.',
      },
      {
        title: 'User Responsibilities',
        body:
          'Use the app lawfully and provide accurate information when requested. Review important announcements at their original source, protect your account credentials, and follow instructions from relevant authorities.',
      },
      {
        title: 'Weather Information Disclaimer',
        body:
          'Weather conditions and hazard information can change quickly and may be incomplete, delayed, or inaccurate. W.A.T.C.H. does not replace official forecasts, warnings, or emergency instructions.',
      },
      {
        title: 'Service Availability',
        body:
          'Features may change, be temporarily unavailable, or depend on internet access, device permissions, and third-party data providers. We do not guarantee uninterrupted or error-free service.',
      },
      {
        title: 'Limitations of Liability',
        body:
          'To the extent permitted by applicable law, W.A.T.C.H. and its developers are not liable for decisions or actions taken based on app information, interruptions in service, or inaccuracies in third-party data. Always use your judgment and consult official sources.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        title: 'Information We Collect',
        body:
          'Depending on the features you use, W.A.T.C.H. may process account details such as your name and email, profile information you provide, selected institution and home location, and technical or notification information needed to operate the service.',
      },
      {
        title: 'How We Use Your Information',
        body:
          'Information is used to provide and maintain app features, personalize local weather and announcements, manage your account, deliver requested notifications, and troubleshoot or improve the service.',
      },
      {
        title: 'Location Data',
        body:
          'If you grant location permission or enter a home location, that location may be used to provide relevant local weather, hazards, and announcements. You can manage device location permissions in your device settings and update saved profile details in the app.',
      },
      {
        title: 'Account Information',
        body:
          'Account authentication is provided through Supabase. Profile details you provide are used for app features such as displaying your profile and matching relevant local or institutional information.',
      },
      {
        title: 'Third-Party Services',
        body:
          'W.A.T.C.H. relies on third-party providers for services such as authentication, data storage, weather information, notifications, and AI features. Those providers may process information as needed to provide their services and are also governed by their own privacy terms.',
      },
      {
        title: 'Data Storage and Security',
        body:
          'App information is stored and processed using service providers and reasonable safeguards intended to protect it. No method of transmission or storage can be guaranteed completely secure.',
      },
      {
        title: 'Data Retention and Deletion',
        body:
          'Information is retained as needed to provide the service and meet operational or legal requirements. To ask about access, correction, or deletion of account information, contact the W.A.T.C.H. team through the Contact Us section.',
      },
    ],
  },
  sources: {
    title: 'Data Sources & Disclaimer',
    sections: [
      {
        title: 'Weather Data Sources',
        body:
          'Weather information is obtained from external weather data providers and may be affected by provider coverage, update frequency, or outages. Check official meteorological sources for current forecasts and warnings.',
      },
      {
        title: 'Official Announcements',
        body:
          'Announcements may be gathered from configured public sources, including official institutional pages, websites, or feeds. Source content may change or be unavailable. Confirm important notices with the organization that issued them.',
      },
      {
        title: 'AI-Generated Summaries',
        body:
          'AI may be used to summarize or classify announcement content. AI output can omit context, misunderstand a message, or be incorrect. It is provided for convenience and is not an official announcement or a substitute for reading and verifying the original source.',
      },
      {
        title: 'Hazard Classifications',
        body:
          'Hazard labels and risk levels are generated from available weather information and configured criteria. They are estimates to support awareness, not definitive assessments of local conditions or personal safety.',
      },
      {
        title: 'Information Accuracy and Limitations',
        body:
          'Information may be delayed, incomplete, or inaccurate, and availability is not guaranteed. W.A.T.C.H. is not a replacement for official warnings, emergency services, or instructions from government authorities. In an emergency, follow local authorities and consult the original sources.',
      },
    ],
  },
} as const;

type DocumentId = keyof typeof DOCUMENTS;

function isDocumentId(value: string | string[] | undefined): value is DocumentId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(DOCUMENTS, value)
  );
}

export default function PolicyDocumentScreen() {
  const router = useRouter();
  const { displayed } = useAppTheme();
  const { document } = useLocalSearchParams<{ document?: string | string[] }>();
  const selectedDocument = isDocumentId(document) ? DOCUMENTS[document] : null;

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings_page/Terms_policy');
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
            <Text style={styles.headerTitle}>{selectedDocument?.title ?? 'Policy Document'}</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {selectedDocument ? (
              selectedDocument.sections.map((section) => (
                <View key={section.title} style={styles.documentSection}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionBody}>{section.body}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.sectionBody}>
                This policy document is unavailable. Return to Terms and Policies and select a
                document from the list.
              </Text>
            )}
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
    minHeight: 72,
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
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: { width: 48 },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 28,
  },
  documentSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#342448',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 7,
  },
  sectionBody: {
    color: '#5F5969',
    fontSize: 13,
    lineHeight: 20,
  },
});
