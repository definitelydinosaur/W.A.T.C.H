import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
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
  item_type: "hazard" | "pagasa";
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
  affected_areas: string[];
  requires_area_review: boolean;
  audience_count: number;
  notification_counts: Record<string, number>;
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
  const [audience, setAudience] = useState<"all" | "me" | "institution">("me");
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
        }>(`/admin/features/announcements?${params.toString()}`);
        setAutomated((current) =>
          replace ? response.items : [...current, ...response.items],
        );
        setPage(nextPage);
        setHasMore(response.has_more);
      } catch (error) {
        showAdminAlert("Unable to load announcements", prettyError(error));
      } finally {
        setLoadingItems(false);
        setRefreshing(false);
      }
    },
    [appliedSearch, category],
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

  useEffect(() => {
    if (!verified) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (section === "AI Announcements") {
      timer = setTimeout(() => void loadAutomated(), 0);
    }
    if (section === "System") {
      timer = setTimeout(() => void loadSystemAnnouncements(), 0);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loadAutomated, loadSystemAnnouncements, section, verified]);

  const sendManual = async (target: "all" | "me" | "institution") => {
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
            }>(`/admin/features/system-drafts/${draft.id}/publish`, {
              method: "POST",
            });
            setSystemResult(
              `Published · Sent: ${result.sent} · Failed: ${result.failed} · No token: ${result.no_token}`,
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

  const resendToMe = (item: AutomatedAnnouncement) => {
    const path =
      item.item_type === "pagasa"
        ? `/admin/features/pagasa/${item.pagasa_id}/resend-test`
        : `/admin/features/hazards/${encodeURIComponent(item.hazard_id ?? "")}/resend-test`;
    confirmAdminAction(
      "Re-send as test to me?",
      "This sends a test copy only to your admin account.",
      "Re-send",
      () => {
        void (async () => {
          try {
            const result = await adminRequest<{
              sent: number;
              failed: number;
              no_token: number;
              failure_details?: string[];
            }>(path, { method: "POST" });
            showAdminAlert(
              "Admin test resend result",
              `Sent: ${result.sent} · Failed: ${result.failed} · No token: ${result.no_token}${result.failure_details?.length ? `\n${result.failure_details.join("\n")}` : ""}`,
            );
          } catch (error) {
            showAdminAlert("Admin test resend failed", prettyError(error));
          }
        })();
      },
    );
  };

  const resendToAllUsers = (item: AutomatedAnnouncement) => {
    const path =
      item.item_type === "pagasa"
        ? `/admin/features/pagasa/${item.pagasa_id}/resend-all`
        : `/admin/features/hazards/${encodeURIComponent(item.hazard_id ?? "")}/resend-all`;
    confirmAdminAction(
      "Re-send to all users?",
      `This creates a test copy and sends it to every registered user, regardless of their saved location. ${item.place_name} may not apply to everyone.`,
      "Send to all",
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
          <Text style={styles.modeLabel}>{darkMode ? "Dark" : "Light"}</Text>
          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
            accessibilityRole="switch"
            accessibilityLabel="Dark mode"
            trackColor={{ false: "#B9ACC9", true: "#8E53C8" }}
            thumbColor={darkMode ? "#FFFFFF" : "#F7F2FC"}
          />
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
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
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
                label="Send to me only (test)"
                selected={audience === "me"}
                onPress={() => setAudience("me")}
                styles={styles}
              />
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
                      {new Date(item.published_at).toLocaleString()}
                    </Text>
                  </View>
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
                    onPress={() => resendToMe(item)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      Re-send as test to me
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => resendToAllUsers(item)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      Re-send to all users
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
              <Text style={styles.badge}>SYSTEM</Text>
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
    modeLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
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
      gap: 8,
      flexWrap: "wrap",
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
