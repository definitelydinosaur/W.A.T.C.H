import { Marker } from 'react-map-gl/maplibre';
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

/** Must be rendered as a child of react-map-gl's <Map>. */
export default function HazardMarkers({
  hazards,
  archived,
  selectedId,
  zoom,
  onSelect,
  onClusterPress,
}: Props) {
  return (
    <>
      {clusterHazards(hazards, zoom).map((item) => {
        if (item.kind === 'cluster') {
          return (
            <Marker
              key={`c-${item.key}`}
              latitude={item.latitude}
              longitude={item.longitude}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onClusterPress(item.latitude, item.longitude);
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  background: '#1F2937',
                  color: '#fff',
                  border: '3px solid #fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  opacity: archived ? 0.7 : 1,
                  boxShadow: '0 1px 5px rgba(0,0,0,0.5)',
                }}
              >
                {item.hazards.length}
              </div>
            </Marker>
          );
        }
        const h = item.hazard;
        const meta = HAZARD_META[h.type];
        const selected = h.id === selectedId;
        return (
          <Marker
            key={h.id}
            latitude={h.latitude}
            longitude={h.longitude}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelect(h.id);
            }}
          >
            <div
              title={`${meta.label}: ${h.title}`}
              style={{
                width: selected ? 40 : 32,
                height: selected ? 40 : 32,
                borderRadius: '50%',
                background: meta.color,
                border: `3px solid ${selected ? '#111827' : '#fff'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: selected ? 20 : 16,
                cursor: 'pointer',
                opacity: archived ? 0.55 : 1,
                filter: archived ? 'grayscale(0.4)' : undefined,
                boxShadow: '0 1px 5px rgba(0,0,0,0.5)',
              }}
            >
              {meta.glyph}
            </div>
          </Marker>
        );
      })}
    </>
  );
}

