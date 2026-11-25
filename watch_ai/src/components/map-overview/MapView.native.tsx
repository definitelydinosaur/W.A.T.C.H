import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type RNMapViewType from 'react-native-maps';
import type { MapType, Region } from 'react-native-maps';
import { zoomFromLongitudeDelta } from '../hazard-map/cluster';
import {
  MapStyleKey,
  MapViewProps,
  SEVERITY_COLOR,
  SEVERITY_RADIUS_M,
} from './types';

const DEFAULT_SPAN = 0.02;

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

interface NativeMapModules {
  maps: typeof import('react-native-maps');
  HazardAreas: typeof import('../hazard-map/HazardAreas').default;
  HazardMarkers: typeof import('../hazard-map/HazardMarkers').default;
}

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
  boundsFocus = null,
  hazards = [],
  showHazards = true,
  onHazardPress,
  historyHazards = [],
  historyArchived = false,
  selectedHistoryId = null,
  onHistorySelect,
}: MapViewProps) {
  const [nativeModules, setNativeModules] = useState<NativeMapModules | null>(
    null,
  );
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(zoomFromLongitudeDelta(DEFAULT_SPAN));
  const ref = useRef<React.ElementRef<typeof RNMapViewType>>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      import('react-native-maps'),
      import('../hazard-map/HazardAreas'),
      import('../hazard-map/HazardMarkers'),
    ])
      .then(([maps, areasMod, markersMod]) => {
        if (active) {
          setNativeModules({
            maps,
            HazardAreas: areasMod.default,
            HazardMarkers: markersMod.default,
          });
        }
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
    if (!focus || !nativeModules) return;
    const span = focus.span ?? DEFAULT_SPAN;
    const region: Region = {
      latitude: focus.latitude,
      longitude: focus.longitude,
      latitudeDelta: span,
      longitudeDelta: span,
    };
    ref.current?.animateToRegion(region, 650);
  }, [focus, nativeModules]);

  useEffect(() => {
    if (!boundsFocus || !nativeModules) return;
    ref.current?.fitToCoordinates(
      [
        { latitude: boundsFocus.minLat, longitude: boundsFocus.minLon },
        { latitude: boundsFocus.maxLat, longitude: boundsFocus.maxLon },
      ],
      {
        edgePadding: { top: 130, right: 48, bottom: 260, left: 48 },
        animated: true,
      },
    );
  }, [boundsFocus, nativeModules]);

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

  if (!nativeModules) {
    return (
      <View style={[styles.container, styles.unavailable]}>
        <Text style={styles.unavailableText}>Loading map...</Text>
      </View>
    );
  }

  const {
    maps: { default: RNMapView, Circle, Marker },
    HazardAreas,
    HazardMarkers,
  } = nativeModules;

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
        onRegionChangeComplete={(r: Region) =>
          setZoom(zoomFromLongitudeDelta(r.longitudeDelta))
        }
        onPress={() => onHistorySelect?.(null)}
      >
        {/* Selected Location Pin */}
        <Marker
          coordinate={{ latitude, longitude }}
          title={label}
          description={`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}
          pinColor="#7C3AED"
        />

        {/* Non-spatial general weather alerts (radius circles + pins) */}
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

        <HazardAreas
          hazards={historyHazards}
          archived={historyArchived}
          selectedId={selectedHistoryId}
          onSelect={(id) => onHistorySelect?.(id)}
        />
        <HazardMarkers
          hazards={historyHazards}
          archived={historyArchived}
          selectedId={selectedHistoryId}
          zoom={zoom}
          onSelect={(id) => onHistorySelect?.(id)}
          onClusterPress={(lat, lon) => {
            const delta = 360 / Math.pow(2, Math.min(zoom + 2, 16));
            ref.current?.animateToRegion(
              {
                latitude: lat,
                longitude: lon,
                latitudeDelta: delta,
                longitudeDelta: delta,
              },
              500,
            );
          }}
        />
      </RNMapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  unavailable: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  unavailableText: { color: '#fff', textAlign: 'center' },
});
