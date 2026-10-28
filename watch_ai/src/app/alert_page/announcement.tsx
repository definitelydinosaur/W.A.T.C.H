import { useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { profileApi } from '../../lib/profile-api';

interface Announcement {
  source_name: string;
  source_url: string | null;
  original_text: string;
  posted_at: string;
  category: string;
  ai_summary: string | null;
}

export default function AnnouncementScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const announcementId = Array.isArray(id) ? id[0] : id;
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [disclaimer, setDisclaimer] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const openSource = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (linkError) {
      console.error('Unable to open the official announcement:', linkError);
      Alert.alert('Link unavailable', 'The official post could not be opened.');
    }
  };

  useEffect(() => {
    if (!announcementId) return;
    let active = true;
    void profileApi<{ announcement: Announcement; disclaimer: string }>(
      `/alerts/announcements/${encodeURIComponent(announcementId)}`,
    )
      .then((result) => {
        if (!active) return;
        setAnnouncement(result.announcement);
        setDisclaimer(result.disclaimer);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Announcement is unavailable.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [announcementId]);

  return (
    <View style={styles.screen}>
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.back}>‹  Alerts</Text>
      </Pressable>
      {!announcementId ? (
        <Text accessibilityRole="alert" style={styles.error}>Announcement was not found.</Text>
      ) : loading ? (
        <ActivityIndicator color="#C9A7FF" style={styles.loading} />
      ) : error ? (
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      ) : announcement ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.category}>{announcement.category.replace(/_/g, ' ').toUpperCase()}</Text>
          <Text style={styles.title}>{announcement.source_name}</Text>
          <Text style={styles.timestamp}>{new Date(announcement.posted_at).toLocaleString()}</Text>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.summary}>{announcement.ai_summary}</Text>
          <Text style={styles.sectionTitle}>Original announcement</Text>
          <Text style={styles.original}>{announcement.original_text}</Text>
          {announcement.source_url ? (
            <Pressable onPress={() => void openSource(announcement.source_url!)}>
              <Text style={styles.link}>Open official post</Text>
            </Pressable>
          ) : null}
          <Text style={styles.disclaimer}>{disclaimer}</Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#171022', paddingTop: 54, paddingHorizontal: 20 },
  back: { color: '#D5B6FF', fontSize: 16, fontWeight: '600' },
  loading: { marginTop: 36 },
  error: { color: '#FFB4B4', padding: 20 },
  content: { paddingTop: 24, paddingBottom: 32 },
  category: { color: '#C9A7FF', fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 8 },
  timestamp: { color: '#A99BB9', fontSize: 12, marginTop: 7 },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 9 },
  summary: { color: '#EEE6F7', fontSize: 16, lineHeight: 24 },
  original: { color: '#D1C8DD', fontSize: 14, lineHeight: 21 },
  link: { color: '#D5B6FF', fontWeight: '700', marginTop: 18 },
  disclaimer: { color: '#A99BB9', fontSize: 12, lineHeight: 18, marginTop: 26 },
});
