import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import RNMapView, {
  Circle,
  Marker,
  type MapType,
  type Region,
} from 'react-native-maps';
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

export default function MapView({
  latitude,
  longitude,
  label,
  mapStyle = 'streets',
  focus,
  hazards = [],
  showHazards = true,
  onHazardPress,
}: MapViewProps) {
  const ref = useRef<RNMapView>(null);

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
  }, [focus]);

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
});
