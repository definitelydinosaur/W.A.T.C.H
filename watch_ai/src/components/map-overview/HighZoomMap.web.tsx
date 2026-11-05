// Street/property-level map for the web build (Expo Router + react-native-web).
// Not yet wired into any screen. Setup:
//   npm i maplibre-gl react-map-gl --prefix watch_ai
//   EXPO_PUBLIC_MAP_STYLE_URL=<vector style JSON URL, e.g. MapTiler/Protomaps "streets">
//
// Key idea: the *map* may zoom to 22, but each raster *source* declares the
// highest zoom it really has tiles for (`maxzoom`). MapLibre then over-zooms
// (stretches) that last level instead of requesting missing tiles, which is what
// causes blank/grey squares. Vector layers stay sharp at any zoom.
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Map,
  Marker,
  NavigationControl,
  ScaleControl,
  type MapRef,
  type StyleSpecification,
  type ViewStateChangeEvent,
} from 'react-map-gl/maplibre';

export interface MapHazardPin {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  severity: 'Advisory' | 'Warning' | 'Severe' | 'Extreme';
}

export interface ViewportChange {
  zoom: number;
  /** [west, south, east, north] - use this to fetch only visible pins. */
  bounds: [number, number, number, number];
}

interface HighZoomMapProps {
  latitude: number;
  longitude: number;
  pins?: MapHazardPin[];
  initialZoom?: number;
  /** Debounced; fires after the user stops moving the map. */
  onViewportChange?: (viewport: ViewportChange) => void;
}

const MAX_ZOOM = 22; // ~0.04 m/px at the equator; 5 m scale bar is ~120 px wide
const SATELLITE_NATIVE_MAX_ZOOM = 19; // real Esri tiles stop here in most places
const DEBOUNCE_MS = 300;

const SEVERITY_COLOR: Record<MapHazardPin['severity'], string> = {
  Advisory: '#F2C94C',
  Warning: '#F2994A',
  Severe: '#EB5757',
  Extreme: '#9B1C31',
};

const STREET_STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL;

// Raster satellite fallback. Esri World Imagery needs an ArcGIS API key and
// attribution for production use - check their current terms.
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    imagery: {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: SATELLITE_NATIVE_MAX_ZOOM,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'imagery', type: 'raster', source: 'imagery' }],
};

export default function HighZoomMap({
  latitude,
  longitude,
  pins = [],
  initialZoom = 15,
  onViewportChange,
}: HighZoomMapProps) {
  const mapRef = useRef<MapRef>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [zoom, setZoom] = useState(initialZoom);

  const mapStyle = useMemo<string | StyleSpecification>(
    () => (satellite || !STREET_STYLE_URL ? SATELLITE_STYLE : STREET_STYLE_URL),
    [satellite],
  );

  const handleMoveEnd = useCallback(
    (event: ViewStateChangeEvent) => {
      setZoom(event.viewState.zoom);
      if (!onViewportChange) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const bounds = mapRef.current?.getBounds();
        if (!bounds) return;
        onViewportChange({
          zoom: event.viewState.zoom,
          bounds: [
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth(),
          ],
        });
      }, DEBOUNCE_MS);
    },
    [onViewportChange],
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 300 }}>
      <Map
        ref={mapRef}
        initialViewState={{ latitude, longitude, zoom: initialZoom }}
        mapStyle={mapStyle}
        maxZoom={MAX_ZOOM}
        minZoom={3}
        onMoveEnd={handleMoveEnd}
        // Tile/perf settings
        maxTileCacheSize={200}
        fadeDuration={0}
        refreshExpiredTiles={false}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="bottom-left" unit="metric" maxWidth={120} />

        {pins.map((pin) => (
          <Marker
            key={pin.id}
            latitude={pin.latitude}
            longitude={pin.longitude}
            anchor="bottom"
          >
            <div
              title={`${pin.label} (${pin.severity})`}
              role="img"
              aria-label={`${pin.label}, ${pin.severity}`}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50% 50% 50% 0',
                transform: 'rotate(-45deg)',
                background: SEVERITY_COLOR[pin.severity],
                border: '2px solid #fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              }}
            />
          </Marker>
        ))}
      </Map>

      <button
        type="button"
        onClick={() => setSatellite((value) => !value)}
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          padding: '6px 10px',
          borderRadius: 8,
          border: 0,
          cursor: 'pointer',
        }}
      >
        {satellite || !STREET_STYLE_URL ? 'Streets' : 'Satellite'}
      </button>

      {satellite && zoom > SATELLITE_NATIVE_MAX_ZOOM && (
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            left: 10,
            padding: '4px 8px',
            borderRadius: 6,
            background: 'rgba(0,0,0,0.65)',
            color: '#fff',
            fontSize: 11,
          }}
        >
          Beyond native imagery resolution - image is magnified
        </div>
      )}
    </div>
  );
}

