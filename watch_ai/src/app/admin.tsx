import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import supabase from '../lib/supabase';

type AdminSection = 'Manual' | 'AI Announcements' | 'System';
type AnnouncementCategory =
  | 'Extreme Heat'
  | 'Unhealthy Air'
  | 'Heavy Rain/Flood'
  | 'Class Suspensions'
  | 'Local (LGU/Mayor)'
  | 'Institution'
  | 'PAGASA/Weather'
  | 'Safety Tips'
  | 'Other';
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
  item_type: 'announcement' | 'hazard' | 'safety_tip' | 'pagasa';
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
  ai_scope: string | null;
  is_class_suspension: boolean;
  suspension_reason: string | null;
  notification_counts: Record<string, number>;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const SECTIONS: AdminSection[] = ['Manual', 'AI Announcements', 'System'];
const CATEGORIES: AnnouncementCategory[] = [
  'Extreme Heat',
  'Unhealthy Air',
  'Heavy Rain/Flood',
  'Class Suspensions',
  'Local (LGU/Mayor)',
  'Institution',
  'PAGASA/Weather',
  'Safety Tips',
  'Other',
];

async function adminRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!API_URL) throw new Error('Set EXPO_PUBLIC_API_URL to use admin tools.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token)
    throw new Error('Your admin session has expired. Please log in again.');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const result = (await response.json()) as T & {
    message?: string | string[];
  };
  if (!response.ok) {
    const message = Array.isArray(result.message)
      ? result.message.join('\n')
      : (result.message ?? `Request failed (HTTP ${response.status}).`);
    throw new Error(message);
  }
  return result;
}

function categoryFor(item: AutomatedAnnouncement): AnnouncementCategory {
  if (item.item_type === 'safety_tip') return 'Safety Tips';
  if (item.item_type === 'pagasa') return 'PAGASA/Weather';
  const text =
    `${item.title ?? ''} ${item.category ?? ''} ${item.ai_summary ?? ''} ${item.suspension_reason ?? ''}`.toLowerCase();
  if (item.is_class_suspension) return 'Class Suspensions';
  if (/heat|heat index/.test(text)) return 'Extreme Heat';
  if (/air quality|aqi|smoke|unhealthy air/.test(text)) return 'Unhealthy Air';
  if (/flood|heavy rain|rainfall/.test(text)) return 'Heavy Rain/Flood';
  if (/safety tip/.test(text)) return 'Safety Tips';
  if (item.ai_scope === 'local') return 'Local (LGU/Mayor)';
  if (item.ai_scope === 'institution') return 'Institution';
  if (item.ai_scope === 'weather') return 'PAGASA/Weather';
  return 'Other';
}

function prettyError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export default function AdminScreen() {
  const [section, setSection] = useState<AdminSection>('Manual');
  const [verified, setVerified] = useState(false);
  const [screenError, setScreenError] = useState('');
  const [loading, setLoading] = useState(true);

  const [notificationType, setNotificationType] = useState<
    'institution' | 'local' | 'weather' | 'system'
  >('local');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [audience, setAudience] = useState<'all' | 'me' | 'institution'>('me');
  const [institutions, setInstitutions] = useState<
    { id: string; name: string; short_name: string | null }[]
  >([]);
  const [institutionId, setInstitutionId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');

  const [automated, setAutomated] = useState<AutomatedAnnouncement[]>([]);
  const [category, setCategory] = useState<AnnouncementCategory | 'All'>('All');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [rawText, setRawText] = useState('');
  const [instruction, setInstruction] = useState('');
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
  const [systemResult, setSystemResult] = useState('');

  useEffect(() => {
    let active = true;
    const verify = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) {
          router.replace('/auth/login');
          return;
        }
        const profile = await adminRequest<{ role?: string }>('/auth/me');
        if (profile.role !== 'admin') {
          router.replace('/home');
          return;
        }
        const institutionResult = await adminRequest<{
          institutions: {
            id: string;
            name: string;
            short_name: string | null;
          }[];
        }>('/admin/features/institutions');
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
        const response = await adminRequest<{
          items: AutomatedAnnouncement[];
          has_more: boolean;
        }>(
          `/admin/features/announcements?page=${nextPage}&limit=20&search=${encodeURIComponent(appliedSearch)}`,
        );
        setAutomated((current) =>
          replace ? response.items : [...current, ...response.items],
        );
        setPage(nextPage);
        setHasMore(response.has_more);
      } catch (error) {
        Alert.alert('Unable to load announcements', prettyError(error));
      } finally {
        setLoadingItems(false);
        setRefreshing(false);
      }
    },
    [appliedSearch],
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
      }>('/admin/features/system-announcements');
      setPublishedAnnouncements(response.announcements);
    } catch (error) {
      Alert.alert('Unable to load system announcements', prettyError(error));
    }
  }, []);

  useEffect(() => {
    if (!verified) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (section === 'AI Announcements') {
      timer = setTimeout(() => void loadAutomated(), 0);
    }
    if (section === 'System') {
      timer = setTimeout(() => void loadSystemAnnouncements(), 0);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loadAutomated, loadSystemAnnouncements, section, verified]);

  const filteredAnnouncements = useMemo(
    () =>
      category === 'All'
        ? automated
        : automated.filter((item) => categoryFor(item) === category),
    [automated, category],
  );

  const sendManual = async (target: 'all' | 'me' | 'institution') => {
    if (!title.trim() || !message.trim()) {
      Alert.alert(
        'Missing details',
        'Enter a title and message before sending.',
      );
      return;
    }
    if (target === 'institution' && !institutionId) {
      Alert.alert(
        'Choose an institution',
        'Select an institution audience first.',
      );
      return;
    }
    setSending(true);
    setSendResult('');
    try {
      const result = await adminRequest<{
        sent: number;
        failed: number;
        no_token: number;
        audience_count: number;
      }>('/admin/features/notifications/send', {
        method: 'POST',
        body: JSON.stringify({
          type: notificationType,
          title: title.trim(),
          body: message.trim(),
          source_name: sourceName.trim() || undefined,
          source_url: sourceUrl.trim() || undefined,
          audience: target,
          institution_id: target === 'institution' ? institutionId : undefined,
        }),
      });
      setSendResult(
        `Sent: ${result.sent} · Failed: ${result.failed} · No token: ${result.no_token}`,
      );
    } catch (error) {
      Alert.alert('Send failed', prettyError(error));
    } finally {
      setSending(false);
    }
  };

  const formatDraft = async (value: string, draftId?: string) => {
    if (!value.trim()) {
      Alert.alert(
        'Add announcement text',
        'Enter the announcement before formatting.',
      );
      return;
    }
    setFormatting(true);
    setSystemResult('');
    try {
      const response = await adminRequest<SystemDraft>(
        '/admin/features/system-drafts/format',
        {
          method: 'POST',
          body: JSON.stringify({
            raw_text: value.trim(),
            ...(draftId ? { draft_id: draftId } : {}),
          }),
        },
      );
      setDraft(response);
      setRawText(response.raw_text);
    } catch (error) {
      Alert.alert('AI formatting failed', prettyError(error));
    } finally {
      setFormatting(false);
    }
  };

  const reviseDraft = async () => {
    if (!draft || !instruction.trim()) {
      Alert.alert('Add a revision instruction', 'Tell AI what to change.');
      return;
    }
    setFormatting(true);
    try {
      const revised = await adminRequest<SystemDraft>(
        `/admin/features/system-drafts/${draft.id}/revise`,
        {
          method: 'POST',
          body: JSON.stringify({ instruction: instruction.trim() }),
        },
      );
      setDraft(revised);
      setInstruction('');
    } catch (error) {
      Alert.alert('Revision failed', prettyError(error));
    } finally {
      setFormatting(false);
    }
  };

  const publishDraft = () => {
    if (!draft) return;
    Alert.alert('Publish system announcement?', 'This will notify all users.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Publish',
        onPress: () => {
          void (async () => {
            setPublishing(true);
            try {
              const result = await adminRequest<{
                sent: number;
                failed: number;
                no_token: number;
                announcement_id: number;
              }>(`/admin/features/system-drafts/${draft.id}/publish`, {
                method: 'POST',
              });
              setSystemResult(
                `Published · Sent: ${result.sent} · Failed: ${result.failed} · No token: ${result.no_token}`,
              );
              setDraft(null);
              setRawText('');
              await loadSystemAnnouncements();
            } catch (error) {
              Alert.alert('Publish failed', prettyError(error));
            } finally {
              setPublishing(false);
            }
          })();
        },
      },
    ]);
  };

  const discardDraft = () => {
    if (!draft) {
      setRawText('');
      return;
    }
    Alert.alert(
      'Discard draft?',
      'This draft and its review history will be discarded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            void adminRequest(`/admin/features/system-drafts/${draft.id}`, {
              method: 'DELETE',
            })
              .then(() => {
                setDraft(null);
                setRawText('');
                setInstruction('');
              })
              .catch((error: unknown) =>
                Alert.alert('Unable to discard draft', prettyError(error)),
              );
          },
        },
      ],
    );
  };

  const resendAsTest = async (item: AutomatedAnnouncement) => {
    const path =
      item.item_type === 'pagasa'
        ? `/admin/features/pagasa/${item.pagasa_id}/resend-test`
        : item.item_type === 'safety_tip'
          ? `/admin/features/safety-tips/${encodeURIComponent(item.hazard_id ?? '')}/resend-test`
          : item.item_type === 'hazard'
            ? `/admin/features/hazards/${encodeURIComponent(item.hazard_id ?? '')}/resend-test`
            : `/admin/features/announcements/${item.announcement_id}/resend-test`;
    try {
      const result = await adminRequest<{
        sent: number;
        failed: number;
        no_token: number;
      }>(path, {
        method: 'POST',
      });
      Alert.alert(
        'Test push result',
        `Sent: ${result.sent} · Failed: ${result.failed} · No token: ${result.no_token}`,
      );
    } catch (error) {
      Alert.alert('Test push failed', prettyError(error));
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Unable to log out', error.message);
      return;
    }
    router.replace('/auth/login');
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
          {screenError || 'Admin access is unavailable.'}
        </Text>
        <Pressable
          onPress={() => router.replace('/auth/login')}
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
        colors={['#211344', '#171022', '#100D1D']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>W.A.T.C.H. ADMIN</Text>
          <Text style={styles.headerTitle}>Control Center</Text>
        </View>
        <Pressable onPress={signOut} accessibilityRole="button">
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
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

      {section === 'Manual' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <GlassCard>
            <Text style={styles.cardTitle}>Send notification</Text>
            <Text style={styles.helper}>
              Test the notification tap and detail panel using your signed-in
              device.
            </Text>
            <Text style={styles.label}>Notification type</Text>
            <View style={styles.wrapRow}>
              {(['institution', 'local', 'weather', 'system'] as const).map(
                (value) => (
                  <ChoiceChip
                    key={value}
                    label={value[0].toUpperCase() + value.slice(1)}
                    selected={notificationType === value}
                    onPress={() => setNotificationType(value)}
                  />
                ),
              )}
            </View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor="#A99BB9"
              style={styles.input}
              maxLength={80}
            />
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Message body"
              placeholderTextColor="#A99BB9"
              style={[styles.input, styles.multiline]}
              multiline
              textAlignVertical="top"
              maxLength={5000}
            />
            <TextInput
              value={sourceName}
              onChangeText={setSourceName}
              placeholder="Source name (optional)"
              placeholderTextColor="#A99BB9"
              style={styles.input}
            />
            <TextInput
              value={sourceUrl}
              onChangeText={setSourceUrl}
              placeholder="Source URL (optional)"
              placeholderTextColor="#A99BB9"
              style={styles.input}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text style={styles.label}>Audience</Text>
            <View style={styles.wrapRow}>
              <ChoiceChip
                label="Send to me only (test)"
                selected={audience === 'me'}
                onPress={() => setAudience('me')}
              />
              <ChoiceChip
                label="All users"
                selected={audience === 'all'}
                onPress={() => setAudience('all')}
              />
              {institutions.length > 0 ? (
                <ChoiceChip
                  label="By institution"
                  selected={audience === 'institution'}
                  onPress={() => setAudience('institution')}
                />
              ) : null}
            </View>
            {audience === 'institution' ? (
              <View style={styles.wrapRow}>
                {institutions.map((item) => (
                  <ChoiceChip
                    key={item.id}
                    label={item.short_name || item.name}
                    selected={institutionId === item.id}
                    onPress={() => setInstitutionId(item.id)}
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
                {sending ? 'Sending…' : 'Send notification'}
              </Text>
            </Pressable>
            {sendResult ? (
              <Text style={styles.result}>{sendResult}</Text>
            ) : null}
          </GlassCard>
        </ScrollView>
      ) : null}

      {section === 'AI Announcements' ? (
        <View style={styles.flex}>
          <View style={styles.searchRow}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search announcements"
              placeholderTextColor="#A99BB9"
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
            contentContainerStyle={styles.categoryTabs}
          >
            {(['All', ...CATEGORIES] as const).map((value) => (
              <ChoiceChip
                key={value}
                label={value}
                selected={category === value}
                onPress={() => setCategory(value)}
              />
            ))}
          </ScrollView>
          {loadingItems && automated.length === 0 ? (
            <ActivityIndicator color="#C9A7FF" style={styles.loader} />
          ) : (
            <ScrollView
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
              {filteredAnnouncements.map((item) => (
                <GlassCard key={item.id}>
                  <View style={styles.cardHeadingRow}>
                    <Text style={styles.badge}>{categoryFor(item)}</Text>
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
                        pathname: '/alert_page/announcement',
                        params,
                      });
                    }}
                  >
                    <Text style={styles.cardTitle}>
                      {item.title || 'Announcement'}
                    </Text>
                    <Text style={styles.bodyText} numberOfLines={3}>
                      {item.ai_summary ||
                        item.content ||
                        'No summary available.'}
                    </Text>
                    <Text style={styles.helper}>
                      {item.source_name || item.source || 'W.A.T.C.H.'}
                      {' · Sent '}
                      {item.notification_counts.Sent ?? 0}
                      {' · Delivered '}
                      {item.notification_counts.Delivered ?? 0}
                      {' · Read '}
                      {item.notification_counts.Read ?? 0}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void resendAsTest(item)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      Re-send as test to me
                    </Text>
                  </Pressable>
                </GlassCard>
              ))}
              {!filteredAnnouncements.length && !loadingItems ? (
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
                    {loadingItems ? 'Loading…' : 'Load more'}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          )}
        </View>
      ) : null}

      {section === 'System' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <GlassCard>
            <Text style={styles.cardTitle}>System announcement</Text>
            <Text style={styles.helper}>
              Draft, format, review, revise, then publish to all users.
            </Text>
            <TextInput
              value={rawText}
              onChangeText={setRawText}
              placeholder="Write the announcement facts and details"
              placeholderTextColor="#A99BB9"
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
                {formatting ? 'Formatting…' : 'Format with AI'}
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
                  />
                ) : null}
                {draft.ai_json.impact ? (
                  <InfoLine label="Impact" value={draft.ai_json.impact} />
                ) : null}
                {draft.ai_json.action_needed ? (
                  <InfoLine
                    label="Action needed"
                    value={draft.ai_json.action_needed}
                  />
                ) : null}
                {draft.ai_json.missing_info_note ? (
                  <Text style={styles.warningNote}>
                    Missing information to review:{' '}
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
                  placeholderTextColor="#A99BB9"
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
                  />
                  <ChoiceChip
                    label="AI version"
                    selected={false}
                    onPress={() => setRawText(draft.ai_json.body)}
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
                    {publishing ? 'Publishing…' : 'Publish'}
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
            <GlassCard key={item.id}>
              <Text style={styles.badge}>SYSTEM</Text>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.bodyText}>{item.ai_summary}</Text>
              <Text style={styles.date}>
                {new Date(item.published_at).toLocaleString()}
              </Text>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/alert_page/announcement',
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

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(41, 28, 72, 0.88)', 'rgba(20, 17, 40, 0.94)']}
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
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.bodyText}>
      <Text style={styles.infoLabel}>{label}: </Text>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#171022', paddingTop: 54 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  eyebrow: {
    color: '#C9A7FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '700',
    marginTop: 3,
  },
  logout: { color: '#D5B6FF', fontSize: 13, fontWeight: '700' },
  sectionTabs: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  categoryTabs: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(220, 204, 255, 0.24)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  activeChip: {
    backgroundColor: 'rgba(117, 75, 208, 0.52)',
    borderColor: 'rgba(220, 204, 255, 0.62)',
  },
  chipText: { color: '#BEB2CB', fontSize: 12, fontWeight: '600' },
  activeChipText: { color: '#FFFFFF' },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  card: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(215, 193, 255, 0.20)',
    backgroundColor: '#201733',
  },
  cardContent: { padding: 17, gap: 11 },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  helper: { color: '#A99BB9', fontSize: 12, lineHeight: 18 },
  label: { color: '#E8DDF5', fontSize: 13, fontWeight: '700', marginTop: 4 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(215, 193, 255, 0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 11,
    minHeight: 44,
  },
  multiline: { minHeight: 100 },
  largeMultiline: { minHeight: 150 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#5D3BA5',
    borderWidth: 1,
    borderColor: 'rgba(220, 204, 255, 0.4)',
    marginTop: 4,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(215, 193, 255, 0.25)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 4,
  },
  secondaryButtonText: { color: '#D5B6FF', fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.55 },
  result: { color: '#A7E7C3', fontSize: 13, fontWeight: '700', marginTop: 10 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  searchInput: { flex: 1 },
  searchButton: {
    borderRadius: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: '#5D3BA5',
  },
  searchButtonText: { color: '#FFFFFF', fontWeight: '700' },
  loader: { marginTop: 30 },
  cardHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    color: '#C9A7FF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  date: { color: '#A99BB9', fontSize: 11 },
  bodyText: { color: '#EEE6F7', fontSize: 14, lineHeight: 21 },
  review: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(215,193,255,0.2)',
    paddingTop: 16,
    gap: 10,
  },
  previewTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '800' },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
  },
  warningNote: { color: '#FFD18D', lineHeight: 20, fontWeight: '600' },
  infoLabel: { color: '#D5B6FF', fontWeight: '800' },
  linkText: { color: '#D5B6FF', fontWeight: '700', marginTop: 8 },
  stateText: { color: '#D0C5DE', textAlign: 'center', padding: 26 },
});
