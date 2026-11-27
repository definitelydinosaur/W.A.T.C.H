import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { clusterHazards } from '../hazard-map/cluster';
import { defaultRadiusM, hazardShape } from '../hazard-map/geometry';
import { HAZARD_META } from '../hazard-map/types';
import { LEAFLET_MAP_HTML } from './leafletHtml';
import {
  MapViewProps,
  SEVERITY_COLOR,
  SEVERITY_RADIUS_M,
} from './types';

const DEFAULT_SPAN = 0.02;
const INITIAL_ZOOM = Math.log2(360 / DEFAULT_SPAN) - 1;
const WEBVIEW_SOURCE = {
  html: LEAFLET_MAP_HTML,
  baseUrl: 'https://watch.stratodevs.app/',
};

type WebViewBridgeMessage =
  | { type: 'ready' }
  | { type: 'zoom'; zoom: number }
  | { type: 'hazardPress'; id: string }
  | { type: 'historySelect'; id: string | null }
  | { type: 'error'; message: string };

function serializeJsArg(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export default function MapView({
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
  const webViewRef = useRef<WebView<object>>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);

  const onHazardPressRef = useRef(onHazardPress);
  const onHistorySelectRef = useRef(onHistorySelect);
  const lastFocusTokenRef = useRef<number | null>(null);
  const lastBoundsTokenRef = useRef<number | null>(null);

  useEffect(() => {
    onHazardPressRef.current = onHazardPress;
    onHistorySelectRef.current = onHistorySelect;
  }, [onHazardPress, onHistorySelect]);

  const payload = useMemo(() => {
    const weatherHazards = showHazards
      ? hazards.map((hazard) => ({
          id: hazard.id,
          latitude: hazard.latitude,
          longitude: hazard.longitude,
          color: SEVERITY_COLOR[hazard.severity],
          radius: SEVERITY_RADIUS_M[hazard.severity],
        }))
      : [];

    const areas = historyHazards.map((h) => {
      const shape = hazardShape(h);
      return {
        id: h.id,
        color: shape.color,
        selected: h.id === selectedHistoryId,
        latitude: h.latitude,
        longitude: h.longitude,
        rings: shape.rings.map((ring) =>
          ring.map(([lon, lat]) => [lat, lon] as [number, number]),
        ),
        circleRadius:
          shape.rings.length === 0 && h.type !== 'closure'
            ? defaultRadiusM(h)
            : null,
        line: shape.line
          ? shape.line.map(([lon, lat]) => [lat, lon] as [number, number])
          : null,
      };
    });

    const markers = clusterHazards(historyHazards, zoom).map((item) => {
      if (item.kind === 'cluster') {
        return {
          kind: 'cluster' as const,
          latitude: item.latitude,
          longitude: item.longitude,
          count: item.hazards.length,
        };
      }
      const h = item.hazard;
      const meta = HAZARD_META[h.type];
      return {
        kind: 'hazard' as const,
        id: h.id,
        latitude: h.latitude,
        longitude: h.longitude,
        color: meta.color,
        glyph: meta.glyph,
        selected: h.id === selectedHistoryId,
      };
    });

    return {
      mapStyle,
      center: { latitude, longitude, label },
      weatherHazards,
      historyArchived,
      areas,
      markers,
    };
  }, [
    hazards,
    historyArchived,
    historyHazards,
    label,
    latitude,
    longitude,
    mapStyle,
    selectedHistoryId,
    showHazards,
    zoom,
  ]);

  useEffect(() => {
    if (!mapReady) return;
    webViewRef.current?.injectJavaScript(
      `window.__WATCH_UPDATE__(${serializeJsArg(payload)}); true;`,
    );
  }, [mapReady, payload]);

  useEffect(() => {
    if (!mapReady || !focus) return;
    if (lastFocusTokenRef.current === focus.token) return;
    lastFocusTokenRef.current = focus.token;
    const span = focus.span ?? DEFAULT_SPAN;
    const targetZoom = Math.max(3, Math.min(20, Math.log2(360 / span) - 1));
    webViewRef.current?.injectJavaScript(
      `window.__WATCH_FLY_TO__(${focus.latitude}, ${focus.longitude}, ${targetZoom}); true;`,
    );
  }, [focus, mapReady]);

  useEffect(() => {
    if (!mapReady || !boundsFocus) return;
    if (lastBoundsTokenRef.current === boundsFocus.token) return;
    lastBoundsTokenRef.current = boundsFocus.token;
    webViewRef.current?.injectJavaScript(
      `window.__WATCH_FIT_BOUNDS__(${boundsFocus.minLat}, ${boundsFocus.minLon}, ${boundsFocus.maxLat}, ${boundsFocus.maxLon}); true;`,
    );
  }, [boundsFocus, mapReady]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let msg: WebViewBridgeMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data) as WebViewBridgeMessage;
    } catch {
      return;
    }

    if (msg.type === 'ready') {
      setLoadError(null);
      setMapReady(true);
    } else if (msg.type === 'zoom' && Number.isFinite(msg.zoom)) {
      setZoom(msg.zoom);
    } else if (msg.type === 'hazardPress') {
      onHazardPressRef.current?.(msg.id);
    } else if (msg.type === 'historySelect') {
      onHistorySelectRef.current?.(msg.id);
    } else if (msg.type === 'error') {
      setLoadError(msg.message);
    }
  }, []);

  if (loadError) {
    return (
      <View style={[styles.container, styles.unavailable]}>
        <Text style={styles.unavailableText}>{loadError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView<object>
        ref={webViewRef}
        source={WEBVIEW_SOURCE}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        mixedContentMode="compatibility"
        androidLayerType="hardware"
        style={styles.webview}
        onMessage={handleMessage}
        onError={() =>
          setLoadError('Unable to load the OpenStreetMap view. Check your connection.')
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  webview: { flex: 1, backgroundColor: '#111827' },
  unavailable: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  unavailableText: { color: '#fff', textAlign: 'center' },
});
