import type { MapViewProps } from './types';

export default function MapView({
  latitude,
  longitude,
  label,
  focus,
}: MapViewProps) {
  const lat = focus?.latitude ?? latitude;
  const lon = focus?.longitude ?? longitude;
  const padding = (focus?.span ?? 0.04) / 2;
  const mapUrl = new URL('https://www.openstreetmap.org/export/embed.html');
  mapUrl.search = new URLSearchParams({
    bbox: [lon - padding, lat - padding, lon + padding, lat + padding].join(','),
    layer: 'mapnik',
    marker: `${lat},${lon}`,
  }).toString();

  return (
    <iframe
      key={`${lat.toFixed(5)},${lon.toFixed(5)},${padding.toFixed(4)}`}
      title={`Map showing ${label}`}
      src={mapUrl.toString()}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 300,
        border: 0,
      }}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}
