import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

interface MapViewProps {
  latitude: number;
  longitude: number;
  label: string;
}

export default function MapView({ latitude, longitude, label }: MapViewProps) {
  const openMap = () =>
    Linking.openURL(
      `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=12/${latitude}/${longitude}`,
    );

  return (
    <View style={styles.fallback}>
      <Text style={styles.pin}>⌖</Text>
      <Text style={styles.title}>{label}</Text>
      <Text style={styles.coordinates}>
        {latitude.toFixed(4)}, {longitude.toFixed(4)}
      </Text>
      <Pressable onPress={openMap} style={styles.button}>
        <Text style={styles.buttonText}>Open OpenStreetMap</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, minHeight: 300, justifyContent: 'center', alignItems: 'center', backgroundColor: '#183D5B', gap: 10 },
  pin: { color: '#FF4E9B', fontSize: 46 },
  title: { color: '#FFFFFF', fontWeight: '700', fontSize: 17 },
  coordinates: { color: '#C7D9EA', fontSize: 12 },
  button: { marginTop: 12, padding: 12, borderRadius: 18, backgroundColor: '#FFFFFF' },
  buttonText: { color: '#392259', fontWeight: '700' },
});
