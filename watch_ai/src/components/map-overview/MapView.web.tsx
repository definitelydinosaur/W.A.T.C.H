interface MapViewProps {
  latitude: number;
  longitude: number;
  label: string;
}

export default function MapView({ latitude, longitude, label }: MapViewProps) {
  const padding = 0.035;
  const mapUrl = new URL('https://www.openstreetmap.org/export/embed.html');
  mapUrl.search = new URLSearchParams({
    bbox: [
      longitude - padding,
      latitude - padding,
      longitude + padding,
      latitude + padding,
    ].join(','),
    layer: 'mapnik',
    marker: `${latitude},${longitude}`,
  }).toString();

  return (
    <iframe
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
