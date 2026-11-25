import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { clusterHazards } from './cluster';
import { HAZARD_META, type Hazard } from './types';

interface Props {
  hazards: Hazard[];
  archived: boolean;
  selectedId: string | null;
  zoom: number;
  onSelect: (id: string) => void;
  onClusterPress: (latitude: number, longitude: number) => void;
}

/** Must be rendered as a child of react-native-maps' <MapView>. */
export default function HazardMarkers({
  hazards,
  archived,
  selectedId,
  zoom,
  onSelect,
  onClusterPress,
}: Props) {
  const opacity = archived ? 0.55 : 1;
  return (
    <>
      {clusterHazards(hazards, zoom).map((item) => {
        if (item.kind === 'cluster') {
          return (
            <Marker
              key={`c-${item.key}`}
              coordinate={{ latitude: item.latitude, longitude: item.longitude }}
              onPress={() => onClusterPress(item.latitude, item.longitude)}
            >
              <View style={[styles.cluster, { opacity: archived ? 0.7 : 1 }]}>
                <Text style={styles.clusterText}>{item.hazards.length}</Text>
              </View>
            </Marker>
          );
        }
        const h = item.hazard;
        const meta = HAZARD_META[h.type];
        const selected = h.id === selectedId;
        return (
          // key includes style inputs so the custom marker view re-renders
          <Marker
            key={`${h.id}-${archived}-${selected}`}
            coordinate={{ latitude: h.latitude, longitude: h.longitude }}
            onPress={(e) => {
              e.stopPropagation();
              onSelect(h.id);
            }}
          >
            <View
              style={[
                styles.pin,
                {
                  backgroundColor: meta.color,
                  opacity,
                  borderColor: selected ? '#111827' : '#fff',
                  transform: [{ scale: selected ? 1.25 : 1 }],
                },
              ]}
            >
              <Text style={styles.glyph}>{meta.glyph}</Text>
            </View>
          </Marker>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 16 },
  cluster: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F2937',
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

