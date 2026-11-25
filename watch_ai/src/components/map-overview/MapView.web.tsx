import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Map,
  Marker,
  NavigationControl,
  type MapLayerMouseEvent,
  type MapRef,
  type StyleSpecification,
} from 'react-map-gl/maplibre';
import HazardAreas from '../hazard-map/HazardAreas';
import HazardMarkers from '../hazard-map/HazardMarkers';
import {
  SEVERITY_COLOR,
  type MapStyleKey,
  type MapViewProps,
} from './types';

const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services';

const rasterStyle = (
  sources: StyleSpecification['sources'],
): StyleSpecification => ({
  version: 8,
  sources,
  layers: Object.keys(sources).map((id) => ({
    id,
    type: 'raster' as const,
    source: id,
  })),
});

// One full style per option, so switching mapStyle really swaps the tiles.
const STYLES: Record<MapStyleKey, StyleSpecification> = {
  streets: rasterStyle({
    base: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  }),
  dark: rasterStyle({
    base: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  }),
  satellite: rasterStyle({
    base: {
      type: 'raster',
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
  }),
  hybrid: rasterStyle({
    base: {
      type: 'raster',
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
    labels: {
      type: 'raster',
      tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
    },
  }),
};

const INITIAL_ZOOM = Math.log2(360 / 0.02) - 1;
const INTERACTIVE_HAZARD_LAYERS = ['hazard-area-fill', 'hazard-street-line'];

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
  const mapRef = useRef<MapRef>(null);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [hoveredHazardId, setHoveredHazardId] = useState<string | null>(null);
  const style = useMemo(() => STYLES[mapStyle] ?? STYLES.streets, [mapStyle]);

  useEffect(() => {
    if (!focus) return;
    const span = focus.span ?? 0.02;
    const target = Math.max(3, Math.min(20, Math.log2(360 / span) - 1));
    mapRef.current?.flyTo({
      center: [focus.longitude, focus.latitude],
      zoom: target,
      duration: 650,
    });
  }, [focus]);

  useEffect(() => {
    if (!boundsFocus) return;
    mapRef.current?.fitBounds(
      [
        [boundsFocus.minLon, boundsFocus.minLat],
        [boundsFocus.maxLon, boundsFocus.maxLat],
      ],
      {
        padding: { top: 130, bottom: 260, left: 48, right: 48 },
        duration: 750,
        maxZoom: 15,
      },
    );
  }, [boundsFocus]);

  const handleMouseMove = (e: MapLayerMouseEvent) => {
    const featureId = e.features?.[0]?.properties?.hazardId;
    setHoveredHazardId(typeof featureId === 'string' ? featureId : null);
  };

  const handleMapClick = (e: MapLayerMouseEvent) => {
    const featureId = e.features?.[0]?.properties?.hazardId;
    if (typeof featureId === 'string') {
      onHistorySelect?.(featureId);
      return;
    }
    onHistorySelect?.(null);
  };

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 300 }}>
      <Map
        ref={mapRef}
        initialViewState={{ latitude, longitude, zoom: INITIAL_ZOOM }}
        mapStyle={style}
        maxZoom={20}
        interactiveLayerIds={INTERACTIVE_HAZARD_LAYERS}
        cursor={hoveredHazardId ? 'pointer' : undefined}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredHazardId(null)}
        onZoomEnd={(e) => setZoom(e.viewState.zoom)}
        onClick={handleMapClick}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        <Marker latitude={latitude} longitude={longitude} anchor="bottom">
          <div
            title={label}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50% 50% 50% 0',
              transform: 'rotate(-45deg)',
              background: '#7C3AED',
              border: '2px solid #fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
            }}
          />
        </Marker>

        {showHazards &&
          hazards.map((hazard) => (
            <Marker
              key={hazard.id}
              latitude={hazard.latitude}
              longitude={hazard.longitude}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onHazardPress?.(hazard.id);
              }}
            >
              <div
                title={`${hazard.eventType.replace(/_/g, ' ')} (${hazard.severity})`}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50% 50% 50% 0',
                  transform: 'rotate(-45deg)',
                  background: SEVERITY_COLOR[hazard.severity],
                  border: '2px solid #fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                  cursor: 'pointer',
                }}
              />
            </Marker>
          ))}

        <HazardAreas
          hazards={historyHazards}
          archived={historyArchived}
          selectedId={selectedHistoryId}
          hoveredId={hoveredHazardId}
        />
        <HazardMarkers
          hazards={historyHazards}
          archived={historyArchived}
          selectedId={selectedHistoryId}
          zoom={zoom}
          onSelect={(id) => onHistorySelect?.(id)}
          onClusterPress={(lat, lon) =>
            mapRef.current?.flyTo({
              center: [lon, lat],
              zoom: Math.min(zoom + 2, 16),
              duration: 500,
            })
          }
        />
      </Map>
    </div>
  );
}
