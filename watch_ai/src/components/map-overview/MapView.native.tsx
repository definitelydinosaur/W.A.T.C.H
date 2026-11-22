import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type RNMapViewType from 'react-native-maps';
import type { MapType, Region } from 'react-native-maps';
import {
  MapStyleKey,
  MapViewProps,
  SEVERITY_COLOR,
  SEVERITY_RADIUS_M,
} from './types';

const DEFAULT_SPAN = 0.02; // ~2 km across; pinch to zoom down to street/property level

const MAP_TYPE: Record<MapStyleKey, MapType> = {
  streets: 'standard',
  dark: 'standard',
  satellite: 'satellite',
  hybrid: 'hybrid',
};

// Dark vector style JSON for Google Maps (Android); iOS uses userInterfaceStyle="dark"
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1b2234' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9aa7c2' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1b2234' }] },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#2c3752' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#3b4a6b' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0d1526' }],
  },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export default function MapView(props: MapViewProps) {
  if (isExpoGo) {
    return (
      <View style={[styles.container, styles.unavailable]}>
        <Text style={styles.unavailableText}>
          Map Overview requires the W.A.T.C.H. development build. Install it
          and reopen this screen to view the map.
        </Text>
      </View>
    );
  }

  return <NativeMapView {...props} />;
}

function NativeMapView({
  latitude,
  longitude,
  label,
  mapStyle = 'streets',
  focus,
  hazards = [],
  showHazards = true,
  onHazardPress,
}: MapViewProps) {
  const [maps, setMaps] = useState<typeof import('react-native-maps') | null>(
    null,
  );
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const ref = useRef<React.ElementRef<typeof RNMapViewType>>(null);

  useEffect(() => {
    let active = true;
    void import('react-native-maps')
      .then((module) => {
        if (active) setMaps(module);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error('[map] unable to load native map module:', error);
        setMapLoadError(
          error instanceof Error ? error.message : 'Unknown native map error.',
        );
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!focus) return;
    const span = focus.span ?? DEFAULT_SPAN;
    const region: Region = {
      latitude: focus.latitude,
      longitude: focus.longitude,
      latitudeDelta: span,
      longitudeDelta: span,
    };
    ref.current?.animateToRegion(region, 650);
  }, [focus, maps]);

  if (mapLoadError) {
    return (
      <View style={[styles.container, styles.unavailable]}>
        <Text style={styles.unavailableText}>
          The native map module is unavailable. Install a fresh W.A.T.C.H.
          development build, then restart the app.
        </Text>
      </View>
    );
  }

  if (!maps) {
    return (
      <View style={[styles.container, styles.unavailable]}>
        <Text style={styles.unavailableText}>Loading map...</Text>
      </View>
    );
  }

  const { default: RNMapView, Circle, Marker } = maps;

  return (
    <View style={styles.container}>
      <RNMapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: DEFAULT_SPAN,
          longitudeDelta: DEFAULT_SPAN,
        }}
        mapType={MAP_TYPE[mapStyle]}
        userInterfaceStyle={mapStyle === 'dark' ? 'dark' : 'light'}
        customMapStyle={mapStyle === 'dark' ? DARK_MAP_STYLE : undefined}
        maxZoomLevel={20}
        showsScale
        showsCompass={false}
        toolbarEnabled={false}
      >
        {/* Selected Location Pin */}
        <Marker
          coordinate={{ latitude, longitude }}
          title={label}
          description={`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}
          pinColor="#7C3AED"
        />

        {/* Hazard Outer Warning Radius + Inner Heatmap Core + Pin Markers */}
        {showHazards &&
          hazards.map((hazard) => {
            const color = SEVERITY_COLOR[hazard.severity];
            const radius = SEVERITY_RADIUS_M[hazard.severity];
            return (
              <React.Fragment key={hazard.id}>
                <Circle
                  center={{
                    latitude: hazard.latitude,
                    longitude: hazard.longitude,
                  }}
                  radius={radius}
                  fillColor={`${color}24`}
                  strokeColor={color}
                  strokeWidth={2}
                />
                <Circle
                  center={{
                    latitude: hazard.latitude,
                    longitude: hazard.longitude,
                  }}
                  radius={Math.round(radius * 0.45)}
                  fillColor={`${color}48`}
                  strokeColor="transparent"
                  strokeWidth={0}
                />
                <Marker
                  coordinate={{
                    latitude: hazard.latitude,
                    longitude: hazard.longitude,
                  }}
                  pinColor={color}
                  title={hazard.eventType.replace(/_/g, ' ')}
                  description={`${hazard.severity}: ${hazard.description}`}
                  onPress={() => onHazardPress?.(hazard.id)}
                />
              </React.Fragment>
            );
          })}
      </RNMapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  unavailable: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  unavailableText: { color: '#fff', textAlign: 'center' },
});
