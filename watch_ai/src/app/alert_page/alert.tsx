import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { profileApi } from '../../lib/profile-api';

interface AlertItem {
  id: string;
  announcement_id: string | null;
  hazard_id: string | null;
  title: string;
  body: string;
  status: string;
  created_at: string;
  announcement?: {
    ai_summary: string | null;
    source_name: string;
    posted_at: string;
  } | null;
  hazard?: {
    hazard_type: string;
    risk_level: string;
    safety_tips: string[];
    created_at: string;
  } | null;
}

export default function AlertsScreen() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await profileApi<{ alerts: AlertItem[] }>('/alerts');
      setAlerts(result.alerts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Alerts are unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAlerts();
    }, [loadAlerts]),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Local alerts</Text>
        <Pressable onPress={() => void loadAlerts()} accessibilityRole="button">
          <Text style={styles.refresh}>Refresh</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color="#C9A7FF" style={styles.loading} />
      ) : error ? (
        <Text accessibilityRole="alert" style={styles.message}>{error}</Text>
      ) : alerts.length === 0 ? (
        <Text style={styles.message}>No local alerts yet. Your location and institution help personalize announcements.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {alerts.map((alert) => (
            <Pressable
              key={alert.id}
              onPress={() => {
                if (alert.announcement_id) {
                  router.push({
                    pathname: '/alert_page/announcement',
                    params: { id: alert.announcement_id },
                  });
                }
              }}
              style={styles.card}
            >
              <Text style={styles.cardTitle}>{alert.title}</Text>
              <Text style={styles.timestamp}>
                {new Date(alert.created_at).toLocaleString()}
              </Text>
              {alert.announcement?.ai_summary ? (
                <Text style={styles.body}>{alert.announcement.ai_summary}</Text>
              ) : (
                <Text style={styles.body}>{alert.body}</Text>
              )}
              {alert.hazard?.safety_tips?.length ? (
                <View style={styles.tips}>
                  {alert.hazard.safety_tips.map((tip) => (
                    <Text key={tip} style={styles.tip}>• {tip}</Text>
                  ))}
                  <Text style={styles.disclaimer}>Follow official PAGASA/LGU advisories.</Text>
                </View>
              ) : null}
              {alert.announcement ? (
                <Text style={styles.detailLink}>View announcement details ›</Text>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#171022', paddingTop: 54 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 18 },
  back: { color: '#FFFFFF', fontSize: 34, width: 40 },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '700' },
  refresh: { color: '#D5B6FF', fontSize: 13 },
  loading: { marginTop: 32 },
  message: { color: '#D5CDE0', padding: 22, textAlign: 'center', lineHeight: 21 },
  list: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },
  card: { padding: 16, borderRadius: 18, backgroundColor: '#2A1D3D', borderWidth: 1, borderColor: '#49345F' },
  cardTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  timestamp: { color: '#A99BB9', fontSize: 11, marginTop: 5 },
  body: { color: '#EEE6F7', fontSize: 14, lineHeight: 20, marginTop: 12 },
  tips: { gap: 8, marginTop: 10 },
  tip: { color: '#E8DDF5', fontSize: 13, lineHeight: 19 },
  disclaimer: { color: '#C6B3D7', fontSize: 12, marginTop: 4 },
  detailLink: { color: '#D5B6FF', fontWeight: '600', marginTop: 12 },
});