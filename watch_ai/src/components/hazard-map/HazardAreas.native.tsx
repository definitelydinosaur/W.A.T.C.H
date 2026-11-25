import React from 'react';
import { Circle, Polygon, Polyline } from 'react-native-maps';
import { defaultRadiusM, hazardShape, toLatLngObject } from './geometry';
import type { Hazard } from './types';

interface Props {
  hazards: Hazard[];
  archived: boolean;
  selectedId: string | null;
  hoveredId?: string | null;
  onSelect?: (id: string) => void;
}

const alpha = (a: number) =>
  Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0');

/** Shaded multi-ring polygons (flood/caution) and road-snapped streets (closures). Child of <MapView>. */
export default function HazardAreas({
  hazards,
  archived,
  selectedId,
  onSelect,
}: Props) {
  const dim = archived ? 0.72 : 1;
  return (
    <>
      {hazards.map((h) => {
        const s = hazardShape(h);
        const color = s.color;
        const selected = h.id === selectedId;
        const hasPolygon = Boolean(h.polygon && h.polygon.length > 0 && s.rings.length > 0);

        return (
          <React.Fragment key={`a-${h.id}`}>
            {hasPolygon ? (
              s.rings.map((ring, ringIndex) => (
                <Polygon
                  key={`p-${h.id}-${ringIndex}-${selected}-${archived}`}
                  coordinates={ring.map(toLatLngObject)}
                  fillColor={`${color}${alpha((selected ? 0.44 : 0.24) * dim)}`}
                  strokeColor={`${color}${alpha(0.94 * dim)}`}
                  strokeWidth={selected ? 3.5 : 2.2}
                  tappable
                  onPress={() => onSelect?.(h.id)}
                />
              ))
            ) : (
              s.ring && (
                <Circle
                  center={{ latitude: h.latitude, longitude: h.longitude }}
                  radius={defaultRadiusM(h)}
                  fillColor={`${color}${alpha((selected ? 0.44 : 0.24) * dim)}`}
                  strokeColor={`${color}${alpha(0.94 * dim)}`}
                  strokeWidth={selected ? 3.5 : 2.2}
                />
              )
            )}

            {s.line && (
              <>
                {s.rings.length === 0 && (
                  <Polyline
                    coordinates={s.line.map(toLatLngObject)}
                    strokeColor={`#FFFFFF${alpha(0.88 * dim)}`}
                    strokeWidth={selected ? 13 : 11}
                    lineCap="round"
                    lineJoin="round"
                    tappable
                    onPress={() => onSelect?.(h.id)}
                  />
                )}
                <Polyline
                  coordinates={s.line.map(toLatLngObject)}
                  strokeColor={`${color}${alpha((s.rings.length > 0 ? 0.88 : 1) * dim)}`}
                  strokeWidth={
                    s.rings.length > 0 ? (selected ? 5 : 3.5) : selected ? 9 : 6
                  }
                  lineCap="round"
                  lineJoin="round"
                  tappable
                  onPress={() => onSelect?.(h.id)}
                />
              </>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}
