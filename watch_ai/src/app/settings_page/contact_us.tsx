import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";

const SUPPORT_EMAIL = "";

export default function ContactUsScreen() {
  const router = useRouter();
  const [isCopying, setIsCopying] = useState(false);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/settings_page/help_support");
    }
  };

  const copyEmail = async () => {
    if (!SUPPORT_EMAIL || isCopying) return;

    setIsCopying(true);
    try {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(SUPPORT_EMAIL);
      Alert.alert("Copied", "The support email address has been copied.");
    } catch (error) {
      Alert.alert(
        "Unable to copy email",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setIsCopying(false);
    }
  };

  const openEmailApp = async () => {
    if (!SUPPORT_EMAIL) return;

    try {
      await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
    } catch (error) {
      Alert.alert(
        "Unable to open email",
        error instanceof Error
          ? error.message
          : "No email application is available.",
      );
    }
  };

  return (
    <LinearGradient
      colors={["#F8F7FB", "#E7E1F3", "#CEC3E2"]}
      style={styles.background}
    >
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
            <Text style={styles.headerTitle}>Contact Us</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.intro}>
              Have a question or need help? Reach out to the W.A.T.C.H. support
              team.
            </Text>

            <View style={styles.contactCard}>
              <View style={styles.cardHeading}>
                <View style={styles.iconCircle}>
                  <Svg width={21} height={21} viewBox="0 0 24 24">
                    <Rect
                      x={3}
                      y={5}
                      width={18}
                      height={14}
                      rx={2}
                      fill="none"
                      stroke="#4B32B5"
                      strokeWidth={1.8}
                    />
                    <Path
                      d="m4 7 8 6 8-6"
                      fill="none"
                      stroke="#4B32B5"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </View>
                <Text style={styles.cardTitle}>Email Support</Text>
              </View>

              <View style={styles.emailRow}>
                <Text style={styles.emailPlaceholder}>
                  {SUPPORT_EMAIL || "Email address will be added here"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Copy support email address"
                  accessibilityState={{ disabled: !SUPPORT_EMAIL || isCopying }}
                  disabled={!SUPPORT_EMAIL || isCopying}
                  onPress={() => void copyEmail()}
                  style={({ pressed }) => [
                    styles.copyButton,
                    pressed && styles.buttonPressed,
                    (!SUPPORT_EMAIL || isCopying) && styles.buttonDisabled,
                  ]}
                >
                  <Svg width={19} height={19} viewBox="0 0 24 24">
                    <Rect
                      x={8}
                      y={8}
                      width={12}
                      height={12}
                      rx={2}
                      fill="none"
                      stroke="#4B32B5"
                      strokeWidth={1.8}
                    />
                    <Path
                      d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"
                      fill="none"
                      stroke="#4B32B5"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open email application"
                accessibilityState={{ disabled: !SUPPORT_EMAIL }}
                disabled={!SUPPORT_EMAIL}
                onPress={() => void openEmailApp()}
                style={({ pressed }) => [
                  styles.emailButton,
                  pressed && styles.buttonPressed,
                  !SUPPORT_EMAIL && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.emailButtonText}>Email Support</Text>
              </Pressable>
            </View>

            <View style={styles.contactCard}>
              <View style={styles.cardHeading}>
                <View style={styles.iconCircle}>
                  <Svg width={21} height={21} viewBox="0 0 24 24">
                    <Path
                      d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
                      fill="none"
                      stroke="#4B32B5"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </View>
                <Text style={styles.cardTitle}>Development Team</Text>
              </View>
              <Text style={styles.placeholder}>
                Development team information will be added here.
              </Text>
            </View>
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
    overflow: "hidden",
    borderRadius: 38,
    backgroundColor: "#FFFFFF",
    shadowColor: "#4B32B5",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 8,
  },
  header: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerTitle: {
    flex: 1,
    color: "#342448",
    fontSize: 23,
    fontWeight: "700",
    textAlign: "center",
  },
  headerSpacer: { width: 48 },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 14,
  },
  intro: {
    color: "#342C46",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 4,
  },
  contactCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E3E4EC",
    backgroundColor: "#FAFAFD",
    gap: 12,
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#F0ECFA",
  },
  cardTitle: {
    color: "#342C46",
    fontSize: 14,
    fontWeight: "700",
  },
  emailRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingLeft: 2,
  },
  emailPlaceholder: {
    flex: 1,
    color: "#6A6475",
    fontSize: 13,
  },
  copyButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#F0ECFA",
  },
  emailButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#4B32B5",
  },
  emailButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  buttonPressed: { opacity: 0.7 },
  buttonDisabled: { opacity: 0.45 },
  placeholder: {
    color: "#6A6475",
    fontSize: 13,
    lineHeight: 19,
  },
});
