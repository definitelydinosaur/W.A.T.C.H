import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { extractColorsFromLogo } from "../../theme/extract-colors";
import { useAppTheme } from "../../theme/theme-context";
import { filterUniversities } from "../../theme/universities";

export default function CustomizeThemeScreen() {
  const router = useRouter();
  const { displayed, theme, applyUniversity, applyLogo, resetTheme } = useAppTheme();
  const [uploading, setUploading] = useState(false);
  const universities = filterUniversities("");

  const uploadLogo = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Allow photo access to use an institution logo.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]) return;
      setUploading(true);
      const extracted = await extractColorsFromLogo(result.assets[0].uri);
      applyLogo(extracted.colors, extracted.previewUri, "Custom institution");
    } catch (error) {
      Alert.alert(
        "Could not use that logo",
        error instanceof Error ? error.message : "Try a different image.",
      );
    } finally {
      setUploading(false);
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
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings_page/settings"))}
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
            <Text style={[styles.headerTitle, { color: displayed.text }]}>Customize Theme</Text>
            <View style={styles.backButton} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <LinearGradient colors={displayed.gradient} style={styles.preview}>
              {displayed.logoUri ? (
                <Image source={{ uri: displayed.logoUri }} style={styles.logo} contentFit="cover" />
              ) : (
                <View style={[styles.logoFallback, { backgroundColor: displayed.accent }]}>
                  <Text style={[styles.logoFallbackText, { color: displayed.onPrimary }]}>
                    {displayed.name.slice(0, 1)}
                  </Text>
                </View>
              )}
              <Text style={[styles.previewName, { color: displayed.onPrimary }]}>{displayed.name}</Text>
              <Text style={[styles.previewHint, { color: displayed.onPrimary }]}>
                Buttons, backgrounds, and menus follow this palette.
              </Text>
              <View style={styles.swatches}>
                {[displayed.primary, displayed.accent, displayed.primaryDark].map((color) => (
                  <View key={color} style={[styles.swatch, { backgroundColor: color }]} />
                ))}
              </View>
            </LinearGradient>

            <Text style={[styles.sectionTitle, { color: displayed.text }]}>Universities</Text>
            <View style={styles.card}>
              {universities.map((university) => {
                const selected = theme.universityId === university.id;
                return (
                  <Pressable
                    key={university.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => applyUniversity(university.id)}
                    style={[styles.row, selected && { backgroundColor: displayed.settingsGradient[1] }]}
                  >
                    <View style={[styles.dot, { backgroundColor: university.primary }]} />
                    <View style={styles.rowText}>
                      <Text style={[styles.rowTitle, { color: displayed.text }]}>{university.shortName}</Text>
                      <Text style={[styles.rowDetail, { color: displayed.muted }]}>{university.name}</Text>
                    </View>
                  </Pressable>
                );
              })}
              <Pressable accessibilityRole="button" onPress={resetTheme} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: displayed.primary }]} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: displayed.text }]}>My university is not listed</Text>
                  <Text style={[styles.rowDetail, { color: displayed.muted }]}>Keep the original W.A.T.C.H. theme</Text>
                </View>
              </Pressable>
            </View>

            <Text style={[styles.sectionTitle, { color: displayed.text }]}>Institution logo</Text>
            <Pressable
              accessibilityRole="button"
              disabled={uploading}
              onPress={uploadLogo}
              style={[styles.uploadButton, { backgroundColor: displayed.primary }]}
            >
              {uploading ? (
                <ActivityIndicator color={displayed.onPrimary} />
              ) : (
                <Text style={[styles.uploadLabel, { color: displayed.onPrimary }]}>Upload logo</Text>
              )}
            </Pressable>
            <Text style={[styles.helper, { color: displayed.muted }]}>
              Colors are taken from the logo, then adjusted so text stays readable.
            </Text>

            <Text style={[styles.sectionTitle, { color: displayed.text }]}>Contrast</Text>
            <View style={styles.card}>
              <Text style={[styles.contrastLine, { color: displayed.text }]}>
                Text on buttons: {theme.contrast.textOnPrimary.toFixed(1)}:1
              </Text>
              <Text style={[styles.contrastLine, { color: displayed.text }]}>
                Text on surfaces: {theme.contrast.textOnSurface.toFixed(1)}:1
              </Text>
              <Text style={[styles.contrastLine, { color: displayed.text }]}>
                {theme.contrast.passesAa ? "Passes WCAG AA for text and controls." : "Some pairs are below the AA target."}
              </Text>
              {theme.contrast.adjusted ? (
                <Text style={[styles.contrastLine, { color: displayed.muted }]}>
                  Colors were shifted so light text or dark text stays readable.
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 16, paddingVertical: 10 },
  panel: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 38,
    backgroundColor: "#FFFFFF",
  },
  header: { height: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: 18 },
  backButton: { width: 48, height: 48, justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: "700", textAlign: "center" },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  preview: { borderRadius: 28, padding: 22, minHeight: 180, justifyContent: "flex-end" },
  logo: { width: 64, height: 64, borderRadius: 16, marginBottom: 12 },
  logoFallback: { width: 64, height: 64, borderRadius: 16, marginBottom: 12, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { fontSize: 28, fontWeight: "700" },
  previewName: { fontSize: 24, fontWeight: "700" },
  previewHint: { marginTop: 4, fontSize: 14, opacity: 0.9 },
  swatches: { flexDirection: "row", gap: 8, marginTop: 14 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" },
  sectionTitle: { marginTop: 18, marginBottom: 8, marginLeft: 6, fontSize: 14, fontWeight: "700" },
  card: { borderRadius: 24, borderWidth: 1, borderColor: "#E3E4EC", backgroundColor: "#FAFAFD", overflow: "hidden" },
  row: { minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 12 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowDetail: { fontSize: 12, marginTop: 2 },
  uploadButton: { minHeight: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  uploadLabel: { fontSize: 16, fontWeight: "700" },
  helper: { marginTop: 8, marginHorizontal: 6, fontSize: 13, lineHeight: 18 },
  contrastLine: { fontSize: 14, lineHeight: 22, paddingHorizontal: 16, paddingVertical: 6 },
});