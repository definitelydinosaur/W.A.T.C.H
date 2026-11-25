import { Layer, Source } from 'react-map-gl/maplibre';
import { hazardShape } from './geometry';
import type { Hazard } from './types';

interface Props {
  hazards: Hazard[];
  archived: boolean;
  selectedId: string | null;
  hoveredId?: string | null;
  onSelect?: (id: string) => void;
}

/** Shaded multi-ring flood/caution polygons and road-snapped streets. Child of <Map>. */
export default function HazardAreas({
  hazards,
  archived,
  selectedId,
  hoveredId = null,
}: Props) {
  const features = hazards.flatMap((h) => {
    const s = hazardShape(h);
    const selected = h.id === selectedId ? 1 : 0;
    const hovered = h.id === hoveredId ? 1 : 0;
    const hasRing = s.rings.length > 0 ? 1 : 0;

    const out: {
      type: 'Feature';
      properties: {
        hazardId: string;
        color: string;
        selected: number;
        hovered: number;
        hasRing: number;
      };
      geometry:
      | { type: 'Polygon'; coordinates: [number, number][][] }
      | { type: 'LineString'; coordinates: [number, number][] };
    }[] = [];

    for (const ring of s.rings) {
      out.push({
        type: 'Feature',
        properties: {
          hazardId: h.id,
          color: s.color,
          selected,
          hovered,
          hasRing: 1,
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }

    if (s.line) {
      out.push({
        type: 'Feature',
        properties: {
          hazardId: h.id,
          color: s.color,
          selected,
          hovered,
          hasRing,
        },
        geometry: { type: 'LineString', coordinates: s.line },
      });
    }

    return out;
  });

  const dim = archived ? 0.72 : 1;

  return (
    <Source
      id="hazard-areas"
      type="geojson"
      data={{ type: 'FeatureCollection', features }}
    >
      <Layer
        id="hazard-area-fill"
        type="fill"
        filter={['==', ['geometry-type'], 'Polygon']}
        paint={{
          'fill-color': ['get', 'color'],
          'fill-opacity': [
            'case',
            ['==', ['get', 'selected'], 1],
            0.44 * dim,
            ['==', ['get', 'hovered'], 1],
            0.34 * dim,
            0.22 * dim,
          ],
        }}
      />
      <Layer
        id="hazard-area-selected-halo"
        type="line"
        filter={[
          'all',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['get', 'selected'], 1],
        ]}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': '#FFFFFF',
          'line-width': 6,
          'line-opacity': 0.85,
        }}
      />
      <Layer
        id="hazard-area-outline"
        type="line"
        filter={['==', ['geometry-type'], 'Polygon']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': ['get', 'color'],
          'line-width': [
            'case',
            ['==', ['get', 'selected'], 1],
            3.5,
            ['==', ['get', 'hovered'], 1],
            3,
            2.2,
          ],
          'line-opacity': 0.94 * dim,
        }}
      />
      <Layer
        id="hazard-street-casing"
        type="line"
        filter={[
          'all',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'hasRing'], 0],
        ]}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': '#ffffff',
          'line-width': ['case', ['==', ['get', 'selected'], 1], 13, 11],
          'line-opacity': 0.88 * dim,
        }}
      />
      <Layer
        id="hazard-street-line"
        type="line"
        filter={['==', ['geometry-type'], 'LineString']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': ['get', 'color'],
          'line-width': [
            'case',
            ['==', ['get', 'hasRing'], 1],
            ['case', ['==', ['get', 'selected'], 1], 5, 3.5],
            ['case', ['==', ['get', 'selected'], 1], 9, 6],
          ],
          'line-opacity': [
            'case',
            ['==', ['get', 'hasRing'], 1],
            0.88 * dim,
            dim,
          ],
        }}
      />
    </Source>
  );
}
