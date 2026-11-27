import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";
import supabase from "../lib/supabase";

type AdminSection = "Manual" | "AI Announcements" | "System";
type AnnouncementCategory =
  "Extreme Heat" | "Unhealthy Air" | "Heavy Rain/Flood" | "PAGASA/Weather";
type SystemDraft = {
  id: string;
  raw_text: string;
  ai_json: {
    title: string;
    summary: string;
    body: string;
    key_points: string[];
    schedule_or_date: string | null;
    impact: string | null;
    action_needed: string | null;
    missing_info_note: string | null;
  };
  version_history: unknown[];
  status: string;
};
type AutomatedAnnouncement = {
  id: string;
  item_type:
    "announcement" | "hazard" | "pagasa" | "weather_event" | "template";
  template_key?: string;
  announcement_id: number | null;
  hazard_id: string | null;
  pagasa_id: number | null;
  title: string;
  content: string | null;
  ai_summary: string | null;
  source: string | null;
  source_name: string | null;
  source_url: string | null;
  published_at: string;
  category: string | null;
  city: string | null;
  province: string | null;
  place_name: string;
  safety_tips?: {
    do_list: string[];
    dont_list: string[];
    prepare_list: string[];
    emergency_note: string;
  } | null;
  affected_areas: string[];
  requires_area_review: boolean;
  audience_count: number;
  notification_counts: Record<string, number>;
};
type AnnouncementFeedDiagnostics = {
  template_count: number;
  templates_with_safety_tips: number;
  live_event_count: number;
  live_feed_error: string | null;
};
type ManualAnnouncementHistoryItem = {
  id: number;
  title: string;
  content: string | null;
  source_name: string | null;
  published_at: string;
  category: string | null;
  ai_scope: string | null;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
const SECTIONS: AdminSection[] = ["Manual", "AI Announcements", "System"];
const CATEGORIES: AnnouncementCategory[] = [
  "Extreme Heat",
  "Unhealthy Air",
  "Heavy Rain/Flood",
  "PAGASA/Weather",
];

async function adminRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!API_URL) throw new Error("Set EXPO_PUBLIC_API_URL to use admin tools.");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token)
    throw new Error("Your admin session has expired. Please log in again.");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const result = (await response.json()) as T & {
    message?: string | string[];
  };
  if (!response.ok) {
    const message = Array.isArray(result.message)
      ? result.message.join("\n")
      : (result.message ?? `Request failed (HTTP ${response.status}).`);
    throw new Error(message);
  }
  return result;
}

function categoryFor(item: AutomatedAnnouncement): AnnouncementCategory | null {
  if (item.item_type === "pagasa") return "PAGASA/Weather";
  if (
    item.category === "Extreme Heat" ||
    item.category === "Unhealthy Air" ||
    item.category === "Heavy Rain/Flood" ||
    item.category === "PAGASA/Weather"
  ) {
    return item.category;
  }
  return null;
}

function prettyError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function showAdminAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function confirmAdminAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
  confirmStyle: "default" | "destructive" = "default",
) {
  if (Platform.OS === "web") {
    if (
      typeof window !== "undefined" &&
      window.confirm(`${title}\n\n${message}`)
    ) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: confirmStyle, onPress: onConfirm },
  ]);
}

export default function AdminScreen() {
  const [section, setSection] = useState<AdminSection>("Manual");
  const [darkMode, setDarkMode] = useState(true);
  const styles = useMemo(() => createStyles(darkMode), [darkMode]);
  const [verified, setVerified] = useState(false);
  const [screenError, setScreenError] = useState("");
  const [loading, setLoading] = useState(true);

  const [notificationType, setNotificationType] = useState<
    "institution" | "local" | "weather" | "system"
  >("local");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [audience, setAudience] = useState<"all" | "institution">("all");
  const [institutions, setInstitutions] = useState<
    { id: string; name: string; short_name: string | null }[]
  >([]);
  const [institutionId, setInstitutionId] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");

  const [automated, setAutomated] = useState<AutomatedAnnouncement[]>([]);
  const [category, setCategory] = useState<AnnouncementCategory | "All">("All");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [pagasaAreaInputs, setPagasaAreaInputs] = useState<
    Record<string, string>
  >({});
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [automatedFeedStatus, setAutomatedFeedStatus] = useState<{
    kind: "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [manualHistory, setManualHistory] = useState<
    ManualAnnouncementHistoryItem[]
  >([]);
  const [manualHistoryPage, setManualHistoryPage] = useState(0);
  const [manualHistoryHasMore, setManualHistoryHasMore] = useState(false);
  const [manualHistoryLoading, setManualHistoryLoading] = useState(false);
  const [manualHistoryRefreshing, setManualHistoryRefreshing] = useState(false);

  const [rawText, setRawText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<SystemDraft | null>(null);
  const [formatting, setFormatting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedAnnouncements, setPublishedAnnouncements] = useState<
    {
      id: number;
      title: string;
      ai_summary: string | null;
      published_at: string;
    }[]
  >([]);
  const [systemResult, setSystemResult] = useState("");
  const [removingAnnouncementId, setRemovingAnnouncementId] = useState<
    number | null
  >(null);

  useEffect(() => {
    let active = true;
    const verify = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) {
          router.replace("/auth/login");
          return;
        }
        const profile = await adminRequest<{ role?: string }>("/auth/me");
        if (profile.role !== "admin") {
          router.replace("/home");
          return;
        }
        const institutionResult = await adminRequest<{
          institutions: {
            id: string;
            name: string;
            short_name: string | null;
          }[];
        }>("/admin/features/institutions");
        if (active) {
          setInstitutions(institutionResult.institutions);
          setVerified(true);
          setLoading(false);
        }
      } catch (error) {
        if (active) {
          setScreenError(prettyError(error));
          setLoading(false);
        }
      }
    };
    void verify();
    return () => {
      active = false;
    };
  }, []);

  const loadAutomated = useCallback(
    async (nextPage = 0, replace = true) => {
      setLoadingItems(true);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: "20",
          search: appliedSearch,
          category: category === "All" ? "" : category,
        });
        const response = await adminRequest<{
          items: AutomatedAnnouncement[];
          has_more: boolean;
          diagnostics?: AnnouncementFeedDiagnostics;
        }>(`/admin/features/announcements?${params.toString()}`);
        if (!Array.isArray(response.items)) {
          throw new Error(
            "The announcements endpoint returned an invalid response: expected an items array.",
          );
        }
        const templates = response.items.filter(
          (item) => item.item_type === "template",
        );
        const safetyTipTemplates = templates.filter(
          (item) =>
            item.safety_tips &&
            Array.isArray(item.safety_tips.do_list) &&
            Array.isArray(item.safety_tips.dont_list) &&
            Array.isArray(item.safety_tips.prepare_list),
        );
        if (response.diagnostics) {
          const feedError = response.diagnostics.live_feed_error;
          setAutomatedFeedStatus({
            kind: feedError ? "warning" : "success",
            message: feedError
              ? `Loaded ${response.diagnostics.template_count} default guides (${response.diagnostics.templates_with_safety_tips} with safety tips). Live announcements failed: ${feedError}`
              : `Feed loaded: ${response.diagnostics.template_count} default guides (${response.diagnostics.templates_with_safety_tips} with safety tips), ${response.diagnostics.live_event_count} live announcements. This response came from the updated backend.`,
          });
        } else {
          setAutomatedFeedStatus({
            kind: "warning",
            message: `Received ${templates.length} default guides (${safetyTipTemplates.length} with safety tips), but the backend returned no diagnostics. It may be running an older deployment.`,
          });
        }
        setAutomated((current) =>
          replace ? response.items : [...current, ...response.items],
        );
        setPage(nextPage);
        setHasMore(response.has_more);
      } catch (error) {
        setAutomatedFeedStatus({
          kind: "error",
          message: `Announcement feed request failed: ${prettyError(error)}`,
        });
      } finally {
        setLoadingItems(false);
        setRefreshing(false);
      }
    },
    [appliedSearch, category],
  );

  const loadManualHistory = useCallback(
    async (nextPage = 0, replace = true) => {
      setManualHistoryLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: "20",
        });
        const response = await adminRequest<{
          items: ManualAnnouncementHistoryItem[];
          has_more: boolean;
        }>(
          `/admin/features/notifications/manual-history?${params.toString()}`,
        );
        setManualHistory((current) =>
          replace ? response.items : [...current, ...response.items],
        );
        setManualHistoryPage(nextPage);
        setManualHistoryHasMore(response.has_more);
      } catch (error) {
        showAdminAlert(
          "Unable to load manual announcement history",
          prettyError(error),
        );
      } finally {
        setManualHistoryLoading(false);
        setManualHistoryRefreshing(false);
      }
    },
    [],
  );

  const loadSystemAnnouncements = useCallback(async () => {
    try {
      const response = await adminRequest<{
        announcements: {
          id: number;
          title: string;
          ai_summary: string | null;
          published_at: string;
        }[];
      }>("/admin/features/system-announcements");
      setPublishedAnnouncements(response.announcements);
    } catch (error) {
      showAdminAlert("Unable to load system announcements", prettyError(error));
    }
  }, []);

  const removeSystemAnnouncement = (
    item: (typeof publishedAnnouncements)[number],
  ) => {
    confirmAdminAction(
      "Remove system announcement?",
      `"${item.title}" will be removed from the past system announcements list.`,
      "Remove",
      () => {
        void (async () => {
          setRemovingAnnouncementId(item.id);
          try {
            await adminRequest(
              `/admin/features/system-announcements/${item.id}`,
              { method: "DELETE" },
            );
            setPublishedAnnouncements((current) =>
              current.filter((announcement) => announcement.id !== item.id),
            );
          } catch (error) {
            showAdminAlert("Unable to remove announcement", prettyError(error));
          } finally {
            setRemovingAnnouncementId(null);
          }
        })();
      },
      "destructive",
    );
  };

  const removeManualAnnouncement = (item: ManualAnnouncementHistoryItem) => {
    confirmAdminAction(
      "Remove manual announcement?",
      `"${item.title}" will be removed from manual announcement history.`,
      "Remove",
      () => {
        void (async () => {
          setRemovingAnnouncementId(item.id);
          try {
            await adminRequest(
              `/admin/features/notifications/manual-history/${item.id}`,
              { method: "DELETE" },
            );
            setManualHistory((current) =>
              current.filter((announcement) => announcement.id !== item.id),
            );
          } catch (error) {
            showAdminAlert(
              "Unable to remove manual announcement",
              prettyError(error),
            );
          } finally {
            setRemovingAnnouncementId(null);
          }
        })();
      },
      "destructive",
    );
  };

  useEffect(() => {
    if (!verified) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (section === "Manual") {
      timer = setTimeout(() => void loadManualHistory(), 0);
    }
    if (section === "AI Announcements") {
      timer = setTimeout(() => void loadAutomated(), 0);
    }
    if (section === "System") {
      timer = setTimeout(() => void loadSystemAnnouncements(), 0);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    loadAutomated,
    loadManualHistory,
    loadSystemAnnouncements,
    section,
    verified,
  ]);

  const sendManual = async (target: "all" | "institution") => {
    if (!title.trim() || !message.trim()) {
      showAdminAlert(
        "Missing details",
        "Enter a title and message before sending.",
      );
      return;
    }
    if (target === "institution" && !institutionId) {
      showAdminAlert(
        "Choose an institution",
        "Select an institution audience first.",
      );
      return;
    }
    setSending(true);
    setSendResult("");
    try {
      const result = await adminRequest<{
        sent: number;
        failed: number;
        no_token: number;
        audience_count: number;
        failure_details?: string[];
      }>("/admin/features/notifications/send", {
        method: "POST",
        body: JSON.stringify({
          type: notificationType,
          title: title.trim(),
          body: message.trim(),
          source_name: sourceName.trim() || undefined,
          source_url: sourceUrl.trim() || undefined,
          audience: target,
          institution_id: target === "institution" ? institutionId : undefined,
        }),
      });
      setSendResult(
        `Sent: ${result.sent} · Failed: ${result.failed} · No token: ${result.no_token}${result.failure_details?.length ? ` · ${result.failure_details.join("; ")}` : ""}`,
      );
      void loadManualHistory();
    } catch (error) {
      showAdminAlert("Send failed", prettyError(error));
    } finally {
      setSending(false);
    }
  };

  const formatDraft = async (value: string, draftId?: string) => {
    if (!value.trim()) {
      showAdminAlert(
        "Add announcement text",
        "Enter the announcement before formatting.",
      );
      return;
    }
    setFormatting(true);
    setSystemResult("");
    try {
      const response = await adminRequest<SystemDraft>(
        "/admin/features/system-drafts/format",
        {
          method: "POST",
          body: JSON.stringify({
            raw_text: value.trim(),
            ...(draftId ? { draft_id: draftId } : {}),
          }),
        },
      );
      setDraft(response);
      setRawText(response.raw_text);
    } catch (error) {
      showAdminAlert("AI formatting failed", prettyError(error));
    } finally {
      setFormatting(false);
    }
  };

  const reviseDraft = async () => {
    if (!draft || !instruction.trim()) {
      showAdminAlert("Add a revision instruction", "Tell AI what to change.");
      return;
    }
    setFormatting(true);
    try {
      const revised = await adminRequest<SystemDraft>(
        `/admin/features/system-drafts/${draft.id}/revise`,
        {
          method: "POST",
          body: JSON.stringify({ instruction: instruction.trim() }),
        },
      );
      setDraft(revised);
      setInstruction("");
    } catch (error) {
      showAdminAlert("Revision failed", prettyError(error));
    } finally {
      setFormatting(false);
    }
  };

  const publishDraft = () => {
    if (!draft) return;
    confirmAdminAction(
      "Publish system announcement?",
      "This will notify all users.",
      "Publish",
      () => {
        void (async () => {
          setPublishing(true);
          try {
            const result = await adminRequest<{
              sent: number;
              failed: number;
              no_token: number;
              announcement_id: number;
              failure_details?: string[];
            }>(`/admin/features/system-drafts/${draft.id}/publish`, {
              method: "POST",
            });
            setSystemResult(
              `Published · Sent: ${result.sent} · Failed: ${result.failed} · No token: ${result.no_token}${result.failure_details?.length ? ` · ${result.failure_details.join("; ")}` : ""}`,
            );
            setDraft(null);
            setRawText("");
            await loadSystemAnnouncements();
          } catch (error) {
            showAdminAlert("Publish failed", prettyError(error));
          } finally {
            setPublishing(false);
          }
        })();
      },
    );
  };

  const discardDraft = () => {
    if (!draft) {
      setRawText("");
      return;
    }
    confirmAdminAction(
      "Discard draft?",
      "This draft and its review history will be discarded.",
      "Discard",
      () => {
        void adminRequest(`/admin/features/system-drafts/${draft.id}`, {
          method: "DELETE",
        })
          .then(() => {
            setDraft(null);
            setRawText("");
            setInstruction("");
          })
          .catch((error: unknown) =>
            showAdminAlert("Unable to discard draft", prettyError(error)),
          );
      },
      "destructive",
    );
  };

  const resendToAllUsers = (item: AutomatedAnnouncement) => {
    if (item.item_type === "template" && !item.template_key) {
      showAdminAlert(
        "Unable to send guide",
        "The default guide is missing its template key.",
      );
      return;
    }
    const path =
      item.item_type === "template"
        ? `/admin/features/announcement-templates/${encodeURIComponent(item.template_key ?? "")}/resend-all`
        : item.item_type === "announcement"
          ? `/admin/features/announcements/${item.announcement_id}/resend-all`
          : item.item_type === "pagasa"
            ? `/admin/features/pagasa/${item.pagasa_id}/resend-all`
            : item.item_type === "weather_event"
              ? `/admin/features/weather-events/${encodeURIComponent(item.id.replace("weather-event-", ""))}/resend-all`
              : `/admin/features/hazards/${encodeURIComponent(item.hazard_id ?? "")}/resend-all`;
    confirmAdminAction(
      item.item_type === "template"
        ? "Send default guide to all users?"
        : "Re-send to all users?",
      item.item_type === "template"
        ? "This sends general safety guidance to every registered user. It does not mean this condition is currently detected."
        : item.item_type === "weather_event"
          ? `This sends the event only to users in ${item.place_name}.`
          : `This creates a test copy and sends it to every registered user, regardless of their saved location. ${item.place_name} may not apply to everyone.`,
      item.item_type === "template" ? "Send guide" : "Send to all",
      () => {
        void (async () => {
          try {
            const result = await adminRequest<{
              sent: number;
              failed: number;
              no_token: number;
              audience_count: number;
              failure_details?: string[];
            }>(path, { method: "POST" });
            showAdminAlert(
              "All-user resend result",
              `Audience: ${result.audience_count} · Sent: ${result.sent} · Failed: ${result.failed} · No token: ${result.no_token}${result.failure_details?.length ? `\n${result.failure_details.join("\n")}` : ""}`,
            );
          } catch (error) {
            showAdminAlert("All-user resend failed", prettyError(error));
          }
        })();
      },
    );
  };

  const assignPagasaAreas = async (item: AutomatedAnnouncement) => {
    if (item.pagasa_id === null) return;
    const areas = (pagasaAreaInputs[item.id] ?? "")
      .split(";")
      .map((area) => area.trim())
      .filter(Boolean);
    if (!areas.length) {
      showAdminAlert(
        "Select affected cities",
        "Enter one or more city names, optionally followed by the province, separated by semicolons.",
      );
      return;
    }
    try {
      const response = await adminRequest<{ audience_count?: number }>(
        `/admin/features/pagasa/${item.pagasa_id}/areas`,
        {
          method: "PATCH",
          body: JSON.stringify({ affected_areas: areas }),
        },
      );
      showAdminAlert(
        "PAGASA alert targeted",
        `The area selection was saved. ${response.audience_count ?? 0} users match those locations.`,
      );
      await loadAutomated(0);
    } catch (error) {
      showAdminAlert("Unable to assign PAGASA areas", prettyError(error));
    }
  };
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showAdminAlert("Unable to log out", error.message);
      return;
    }
    router.replace("/auth/login");
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color="#C9A7FF" />
      </View>
    );
  }
  if (!verified) {
    return (
      <View style={styles.screen}>
        <Text style={styles.stateText}>
          {screenError || "Admin access is unavailable."}
        </Text>
        <Pressable
          onPress={() => router.replace("/auth/login")}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Back to login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={
          darkMode
            ? ["#211344", "#171022", "#100D1D"]
            : ["#FAF8FD", "#F1ECF8", "#E9E3F1"]
        }
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>W.A.T.C.H. ADMIN</Text>
          <Text style={styles.headerTitle}>Control Center</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setDarkMode((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${darkMode ? "light" : "dark"} mode`}
            style={styles.themeButton}
          >
            <SymbolView
              name={
                darkMode
                  ? {
                      ios: "moon.fill",
                      android: "dark_mode",
                      web: "dark_mode",
                    }
                  : {
                      ios: "sun.max.fill",
                      android: "light_mode",
                      web: "light_mode",
                    }
              }
              tintColor={darkMode ? "#D5B6FF" : "#65359A"}
              size={20}
            />
          </Pressable>
          <Pressable onPress={signOut} accessibilityRole="button">
            <Text style={styles.logout}>Log out</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.horizontalScroller}
        contentContainerStyle={styles.sectionTabs}
      >
        {SECTIONS.map((value) => (
          <Pressable
            key={value}
            onPress={() => setSection(value)}
            style={[styles.chip, section === value && styles.activeChip]}
          >
            <Text
              style={[
                styles.chipText,
                section === value && styles.activeChipText,
              ]}
            >
              {value}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {section === "Manual" ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={manualHistoryRefreshing}
              tintColor="#D5B6FF"
              onRefresh={() => {
                setManualHistoryRefreshing(true);
                void loadManualHistory();
              }}
            />
          }
        >
          <GlassCard styles={styles} darkMode={darkMode}>
            <Text style={styles.cardTitle}>Send notification</Text>
            <Text style={styles.helper}>
              Test the notification tap and detail panel using your signed-in
              device.
            </Text>
            <Text style={styles.label}>Notification type</Text>
            <View style={styles.wrapRow}>
              {(["institution", "local", "weather", "system"] as const).map(
                (value) => (
                  <ChoiceChip
                    key={value}
                    label={value[0].toUpperCase() + value.slice(1)}
                    selected={notificationType === value}
                    onPress={() => setNotificationType(value)}
                    styles={styles}
                  />
                ),
              )}
            </View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor={darkMode ? "#A99BB9" : "#786D85"}
              style={styles.input}
              maxLength={80}
            />
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Message body"
              placeholderTextColor={darkMode ? "#A99BB9" : "#786D85"}
              style={[styles.input, styles.multiline]}
              multiline
              textAlignVertical="top"
              maxLength={5000}
            />
            <TextInput
              value={sourceName}
              onChangeText={setSourceName}
              placeholder="Source name (optional)"
              placeholderTextColor={darkMode ? "#A99BB9" : "#786D85"}
              style={styles.input}
            />
            <TextInput
              value={sourceUrl}
              onChangeText={setSourceUrl}
              placeholder="Source URL (optional)"
              placeholderTextColor={darkMode ? "#A99BB9" : "#786D85"}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text style={styles.label}>Audience</Text>
            <View style={styles.wrapRow}>
              <ChoiceChip
                label="All users"
                selected={audience === "all"}
                onPress={() => setAudience("all")}
                styles={styles}
              />
              {institutions.length > 0 ? (
                <ChoiceChip
                  label="By institution"
                  selected={audience === "institution"}
                  onPress={() => setAudience("institution")}
                  styles={styles}
                />
              ) : null}
            </View>
            {audience === "institution" ? (
              <View style={styles.wrapRow}>
                {institutions.map((item) => (
                  <ChoiceChip
                    key={item.id}
                    label={item.short_name || item.name}
                    selected={institutionId === item.id}
                    onPress={() => setInstitutionId(item.id)}
                    styles={styles}
                  />
                ))}
              </View>
            ) : null}
            <Pressable
              style={[styles.primaryButton, sending && styles.disabled]}
              disabled={sending}
              onPress={() => void sendManual(audience)}
            >
              <Text style={styles.primaryButtonText}>
                {sending ? "Sending…" : "Send notification"}
              </Text>
            </Pressable>
            {sendResult ? (
              <Text style={styles.result}>{sendResult}</Text>
            ) : null}
          </GlassCard>
          <Text style={styles.cardTitle}>Manual announcement history</Text>
          {manualHistoryLoading && manualHistory.length === 0 ? (
            <ActivityIndicator color="#C9A7FF" style={styles.loader} />
          ) : null}
          {manualHistory.map((item) => (
            <GlassCard
              key={item.id}
              styles={styles}
              darkMode={darkMode}
            >
              <View style={styles.cardHeadingRow}>
                <Text style={styles.badge}>
                  {item.category || item.ai_scope || "Manual"}
                </Text>
                <View style={styles.cardHeadingActions}>
                  <Text style={styles.date}>
                    {new Date(item.published_at).toLocaleString()}
                  </Text>
                  <Pressable
                    onPress={() => removeManualAnnouncement(item)}
                    disabled={removingAnnouncementId !== null}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.title}`}
                    style={styles.removeAnnouncementButton}
                  >
                    <Text style={styles.removeAnnouncementIcon}>
                      {removingAnnouncementId === item.id ? "…" : "×"}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.bodyText} numberOfLines={3}>
                {item.content || "No message content available."}
              </Text>
              <Text style={styles.helper}>
                {item.source_name || "W.A.T.C.H. Admin"}
              </Text>
            </GlassCard>
          ))}
          {!manualHistory.length && !manualHistoryLoading ? (
            <Text style={styles.stateText}>
              No published manual announcements yet.
            </Text>
          ) : null}
          {manualHistoryHasMore ? (
            <Pressable
              style={[
                styles.secondaryButton,
                manualHistoryLoading && styles.disabled,
              ]}
              disabled={manualHistoryLoading}
              onPress={() =>
                void loadManualHistory(manualHistoryPage + 1, false)
              }
            >
              <Text style={styles.secondaryButtonText}>
                {manualHistoryLoading ? "Loading…" : "Load more"}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}

      {section === "AI Announcements" ? (
        <View style={styles.flex}>
          <View style={styles.searchRow}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search announcements"
              placeholderTextColor={darkMode ? "#A99BB9" : "#786D85"}
              style={[styles.input, styles.searchInput]}
              returnKeyType="search"
              onSubmitEditing={() => {
                setAppliedSearch(search.trim());
                setAutomated([]);
              }}
            />
            <Pressable
              style={styles.searchButton}
              onPress={() => {
                setAppliedSearch(search.trim());
                setAutomated([]);
              }}
            >
              <Text style={styles.searchButtonText}>Search</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalScroller}
            contentContainerStyle={styles.categoryTabs}
          >
            {(["All", ...CATEGORIES] as const).map((value) => (
              <ChoiceChip
                key={value}
                label={value}
                selected={category === value}
                onPress={() => setCategory(value)}
                styles={styles}
              />
            ))}
          </ScrollView>
          {automatedFeedStatus ? (
            <Text
              style={[
                styles.feedStatus,
                automatedFeedStatus.kind === "error"
                  ? styles.feedStatusError
                  : automatedFeedStatus.kind === "warning"
                    ? styles.feedStatusWarning
                    : styles.feedStatusSuccess,
              ]}
            >
              {automatedFeedStatus.message}
            </Text>
          ) : null}
          {loadingItems && automated.length === 0 ? (
            <ActivityIndicator color="#C9A7FF" style={styles.loader} />
          ) : (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.content}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  tintColor="#D5B6FF"
                  onRefresh={() => {
                    setRefreshing(true);
                    void loadAutomated(0);
                  }}
                />
              }
            >
              {automated.map((item) => (
                <GlassCard key={item.id} styles={styles} darkMode={darkMode}>
                  <View style={styles.cardHeadingRow}>
                    {categoryFor(item) ? (
                      <Text style={styles.badge}>{categoryFor(item)}</Text>
                    ) : null}
                    <Text style={styles.date}>
                      {item.item_type === "template"
                        ? "Reusable default guide"
                        : new Date(item.published_at).toLocaleString()}
                    </Text>
                  </View>
                  {item.item_type === "template" ? (
                    <View>
                      <Text style={styles.helper}>
                        Built-in guide, not a live weather detection.
                      </Text>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.bodyText}>
                        {item.ai_summary || item.content}
                      </Text>
                      {item.safety_tips ? (
                        <View style={styles.review}>
                          <Text style={styles.sectionTitle}>What to do</Text>
                          {item.safety_tips.do_list.map((tip, index) => (
                            <Text key={`do-${index}`} style={styles.bodyText}>
                              • {tip}
                            </Text>
                          ))}
                          <Text style={styles.sectionTitle}>What to avoid</Text>
                          {item.safety_tips.dont_list.map((tip, index) => (
                            <Text
                              key={`avoid-${index}`}
                              style={styles.bodyText}
                            >
                              • {tip}
                            </Text>
                          ))}
                          <Text style={styles.sectionTitle}>
                            What to prepare
                          </Text>
                          {item.safety_tips.prepare_list.map((tip, index) => (
                            <Text
                              key={`prepare-${index}`}
                              style={styles.bodyText}
                            >
                              • {tip}
                            </Text>
                          ))}
                          <Text style={styles.warningNote}>
                            {item.safety_tips.emergency_note}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        const params = item.announcement_id
                          ? { announcementId: String(item.announcement_id) }
                          : item.hazard_id
                            ? { hazardId: item.hazard_id }
                            : { pagasaId: String(item.pagasa_id) };
                        router.push({
                          pathname: "/alert_page/announcement",
                          params,
                        });
                      }}
                    >
                      <Text style={styles.cardTitle}>
                        {item.title || "Announcement"}
                      </Text>
                      <Text style={styles.bodyText} numberOfLines={3}>
                        {item.ai_summary ||
                          item.content ||
                          "No summary available."}
                      </Text>
                      <Text style={styles.helper}>
                        {item.source_name || "W.A.T.C.H."}
                        {" · "}
                        {item.place_name}
                        {" · Sent "}
                        {item.notification_counts.Sent ?? 0}
                        {" · Delivered "}
                        {item.notification_counts.Delivered ?? 0}
                        {" · Read "}
                        {item.notification_counts.Read ?? 0}
                      </Text>
                    </Pressable>
                  )}
                  {item.requires_area_review ? (
                    <View style={styles.review}>
                      <Text style={styles.warningNote}>
                        Area not identified. This PAGASA alert is queued and
                        will not be sent until you select its affected city or
                        cities.
                      </Text>
                      <TextInput
                        value={pagasaAreaInputs[item.id] ?? ""}
                        onChangeText={(value) =>
                          setPagasaAreaInputs((current) => ({
                            ...current,
                            [item.id]: value,
                          }))
                        }
                        placeholder="City, Province; another city, Province"
                        placeholderTextColor={darkMode ? "#A99BB9" : "#786D85"}
                        style={styles.input}
                      />
                      <Pressable
                        onPress={() => void assignPagasaAreas(item)}
                        style={styles.secondaryButton}
                      >
                        <Text style={styles.secondaryButtonText}>
                          Assign area and notify matching users
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => resendToAllUsers(item)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {item.item_type === "template"
                        ? "Send default guide to all users"
                        : "Re-send to all users"}
                    </Text>
                  </Pressable>
                </GlassCard>
              ))}
              {!automated.length && !loadingItems ? (
                <Text style={styles.stateText}>
                  No announcements in this category.
                </Text>
              ) : null}
              {hasMore ? (
                <Pressable
                  onPress={() => void loadAutomated(page + 1, false)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>
                    {loadingItems ? "Loading…" : "Load more"}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          )}
        </View>
      ) : null}

      {section === "System" ? (
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <GlassCard styles={styles} darkMode={darkMode}>
            <Text style={styles.cardTitle}>System announcement</Text>
            <Text style={styles.helper}>
              Draft, format, review, revise, then publish to all users.
            </Text>
            <TextInput
              value={rawText}
              onChangeText={setRawText}
              placeholder="Write the announcement facts and details"
              placeholderTextColor={darkMode ? "#A99BB9" : "#786D85"}
              style={[styles.input, styles.largeMultiline]}
              multiline
              textAlignVertical="top"
              editable={!formatting && !publishing}
            />
            <Pressable
              style={[
                styles.primaryButton,
                (formatting || publishing) && styles.disabled,
              ]}
              disabled={formatting || publishing}
              onPress={() => void formatDraft(rawText, draft?.id)}
            >
              <Text style={styles.primaryButtonText}>
                {formatting ? "Formatting…" : "Format with AI"}
              </Text>
            </Pressable>
            {draft ? (
              <View style={styles.review}>
                <Text style={styles.badge}>SYSTEM · REVIEW</Text>
                <Text style={styles.previewTitle}>{draft.ai_json.title}</Text>
                <Text style={styles.helper}>{draft.ai_json.summary}</Text>
                <Text style={styles.sectionTitle}>Full details</Text>
                <Text style={styles.bodyText}>{draft.ai_json.body}</Text>
                {draft.ai_json.key_points.map((point, index) => (
                  <Text key={`${index}-${point}`} style={styles.bodyText}>
                    • {point}
                  </Text>
                ))}
                {draft.ai_json.schedule_or_date ? (
                  <InfoLine
                    label="Schedule / date"
                    value={draft.ai_json.schedule_or_date}
                    styles={styles}
                  />
                ) : null}
                {draft.ai_json.impact ? (
                  <InfoLine
                    label="Impact"
                    value={draft.ai_json.impact}
                    styles={styles}
                  />
                ) : null}
                {draft.ai_json.action_needed ? (
                  <InfoLine
                    label="Action needed"
                    value={draft.ai_json.action_needed}
                    styles={styles}
                  />
                ) : null}
                {draft.ai_json.missing_info_note ? (
                  <Text style={styles.warningNote}>
                    Missing information to review:{" "}
                    {draft.ai_json.missing_info_note}
                  </Text>
                ) : null}
                <Text style={styles.helper}>
                  Version history: {draft.version_history.length} version(s)
                </Text>
                <TextInput
                  value={instruction}
                  onChangeText={setInstruction}
                  placeholder="Ask AI to revise (e.g. make it shorter)"
                  placeholderTextColor={darkMode ? "#A99BB9" : "#786D85"}
                  style={styles.input}
                  editable={!formatting && !publishing}
                />
                <Pressable
                  onPress={() => void reviseDraft()}
                  disabled={formatting || publishing}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>
                    Ask AI to revise
                  </Text>
                </Pressable>
                <Text style={styles.label}>Edit yourself from</Text>
                <View style={styles.wrapRow}>
                  <ChoiceChip
                    label="Original text"
                    selected={false}
                    onPress={() => setRawText(draft.raw_text)}
                    styles={styles}
                  />
                  <ChoiceChip
                    label="AI version"
                    selected={false}
                    onPress={() => setRawText(draft.ai_json.body)}
                    styles={styles}
                  />
                </View>
                <Pressable
                  onPress={publishDraft}
                  disabled={publishing || formatting}
                  style={[
                    styles.primaryButton,
                    (publishing || formatting) && styles.disabled,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>
                    {publishing ? "Publishing…" : "Publish"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={discardDraft}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Discard draft</Text>
                </Pressable>
              </View>
            ) : null}
            {systemResult ? (
              <Text style={styles.result}>{systemResult}</Text>
            ) : null}
          </GlassCard>
          <Text style={styles.sectionTitle}>Past system announcements</Text>
          {publishedAnnouncements.map((item) => (
            <GlassCard key={item.id} styles={styles} darkMode={darkMode}>
              <View style={styles.cardHeadingRow}>
                <Text style={styles.badge}>SYSTEM</Text>
                <Pressable
                  onPress={() => removeSystemAnnouncement(item)}
                  disabled={removingAnnouncementId !== null}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.title}`}
                  style={styles.removeAnnouncementButton}
                >
                  <Text style={styles.removeAnnouncementIcon}>
                    {removingAnnouncementId === item.id ? "…" : "×"}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.bodyText}>{item.ai_summary}</Text>
              <Text style={styles.date}>
                {new Date(item.published_at).toLocaleString()}
              </Text>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/alert_page/announcement",
                    params: { announcementId: String(item.id) },
                  })
                }
              >
                <Text style={styles.linkText}>Open details</Text>
              </Pressable>
            </GlassCard>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

type AdminStyles = ReturnType<typeof createStyles>;

function GlassCard({
  children,
  styles,
  darkMode,
}: {
  children: React.ReactNode;
  styles: AdminStyles;
  darkMode: boolean;
}) {
  return (
    <View style={styles.card}>
      <BlurView
        intensity={38}
        tint={darkMode ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={
          darkMode
            ? ["rgba(41, 28, 72, 0.88)", "rgba(20, 17, 40, 0.94)"]
            : ["rgba(255, 255, 255, 0.94)", "rgba(247, 243, 252, 0.96)"]
        }
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.cardContent}>{children}</View>
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  styles: AdminStyles;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.activeChip]}
    >
      <Text style={[styles.chipText, selected && styles.activeChipText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function InfoLine({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: AdminStyles;
}) {
  return (
    <Text style={styles.bodyText}>
      <Text style={styles.infoLabel}>{label}: </Text>
      {value}
    </Text>
  );
}

function createStyles(darkMode: boolean) {
  const colors = darkMode
    ? {
        text: "#FFFFFF",
        muted: "#A99BB9",
        softText: "#BEB2CB",
        accentText: "#D5B6FF",
        label: "#E8DDF5",
        body: "#EEE6F7",
        border: "rgba(215, 193, 255, 0.22)",
        chipBorder: "rgba(220, 204, 255, 0.24)",
        chipActiveBorder: "rgba(220, 204, 255, 0.62)",
        chipBackground: "rgba(255,255,255,0.06)",
        chipActive: "rgba(117, 75, 208, 0.52)",
        card: "#201733",
        input: "rgba(255,255,255,0.06)",
        button: "#5D3BA5",
        badge: "#C9A7FF",
        state: "#D0C5DE",
      }
    : {
        text: "#241B32",
        muted: "#6E647B",
        softText: "#5D526B",
        accentText: "#5A2A8D",
        label: "#39284F",
        body: "#30263D",
        border: "rgba(83, 55, 116, 0.20)",
        chipBorder: "rgba(83, 55, 116, 0.22)",
        chipActiveBorder: "rgba(99, 48, 150, 0.55)",
        chipBackground: "rgba(73, 48, 104, 0.06)",
        chipActive: "rgba(148, 105, 196, 0.22)",
        card: "#FDFBFF",
        input: "rgba(73, 48, 104, 0.05)",
        button: "#6935A6",
        badge: "#65359A",
        state: "#5D526B",
      };

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: darkMode ? "#171022" : "#F6F3FA",
      paddingTop: 54,
    },
    flex: { flex: 1, minHeight: 0 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    themeButton: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 17,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.chipBackground,
    },
    eyebrow: {
      color: darkMode ? "#C9A7FF" : "#65359A",
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1,
    },
    headerTitle: {
      color: colors.text,
      fontSize: 23,
      fontWeight: "700",
      marginTop: 3,
    },
    logout: { color: colors.accentText, fontSize: 13, fontWeight: "700" },
    horizontalScroller: { flexGrow: 0 },
    sectionTabs: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    categoryTabs: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    chip: {
      borderWidth: 1,
      borderColor: colors.chipBorder,
      backgroundColor: colors.chipBackground,
      borderRadius: 18,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    activeChip: {
      backgroundColor: colors.chipActive,
      borderColor: colors.chipActiveBorder,
    },
    chipText: { color: colors.softText, fontSize: 12, fontWeight: "600" },
    activeChipText: { color: colors.text },
    content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
    card: {
      overflow: "hidden",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    cardContent: { padding: 17, gap: 11 },
    cardTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
    helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
    feedStatus: { fontSize: 12, lineHeight: 18, paddingHorizontal: 16 },
    feedStatusError: { color: darkMode ? "#FF9A9A" : "#B42318" },
    feedStatusWarning: { color: darkMode ? "#FFD18A" : "#9A6700" },
    feedStatusSuccess: { color: darkMode ? "#A7E7C3" : "#26734D" },
    label: {
      color: colors.label,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 4,
    },
    input: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.input,
      color: colors.text,
      paddingHorizontal: 13,
      paddingVertical: 11,
      minHeight: 44,
    },
    multiline: { minHeight: 100 },
    largeMultiline: { minHeight: 150 },
    wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    primaryButton: {
      borderRadius: 16,
      paddingVertical: 13,
      alignItems: "center",
      backgroundColor: colors.button,
      borderWidth: 1,
      borderColor: colors.chipActiveBorder,
      marginTop: 4,
    },
    primaryButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
    secondaryButton: {
      borderRadius: 14,
      paddingVertical: 11,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.chipBackground,
      marginTop: 4,
    },
    secondaryButtonText: {
      color: colors.accentText,
      fontWeight: "700",
      fontSize: 13,
    },
    disabled: { opacity: 0.55 },
    result: {
      color: darkMode ? "#A7E7C3" : "#26734D",
      fontSize: 13,
      fontWeight: "700",
      marginTop: 10,
    },
    searchRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
    searchInput: { flex: 1, minWidth: 0 },
    searchButton: {
      borderRadius: 14,
      paddingHorizontal: 16,
      justifyContent: "center",
      backgroundColor: colors.button,
    },
    searchButtonText: { color: "#FFFFFF", fontWeight: "700" },
    loader: { marginTop: 30 },
    cardHeadingRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    cardHeadingActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    removeAnnouncementButton: {
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: colors.chipBackground,
    },
    removeAnnouncementIcon: {
      color: colors.muted,
      fontSize: 22,
      lineHeight: 25,
    },
    badge: {
      color: colors.badge,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.5,
    },
    date: { color: colors.muted, fontSize: 11 },
    bodyText: { color: colors.body, fontSize: 14, lineHeight: 21 },
    review: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 16,
      gap: 10,
    },
    previewTitle: { color: colors.text, fontSize: 21, fontWeight: "800" },
    sectionTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "700",
      marginTop: 12,
    },
    warningNote: {
      color: darkMode ? "#FFD18D" : "#875000",
      lineHeight: 20,
      fontWeight: "600",
    },
    infoLabel: { color: colors.accentText, fontWeight: "800" },
    linkText: { color: colors.accentText, fontWeight: "700", marginTop: 8 },
    stateText: { color: colors.state, textAlign: "center", padding: 26 },
  });
}
