export interface HazardAreaLocation {
  city: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
}

const COORDINATE_MATCH_RADIUS_KM = 25;

export function normalizeAreaName(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/^city\s+of\s+/, '')
    .replace(/^province\s+of\s+/, '')
    .replace(/\s+(city|province)$/, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAreaKey(
  location: HazardAreaLocation,
  fallbackCoordinates = true,
) {
  const city = normalizeAreaName(location.city);
  const province = normalizeAreaName(location.province);
  if (city) return `city:${city}|province:${province}`;
  if (
    fallbackCoordinates &&
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number'
  ) {
    return `coords:${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
  }
  return '';
}

export function areasMatch(
  hazard: HazardAreaLocation,
  userLocation: HazardAreaLocation,
) {
  const hazardCity = normalizeAreaName(hazard.city);
  const userCity = normalizeAreaName(userLocation.city);
  if (hazardCity && userCity) {
    if (hazardCity !== userCity) return false;
    const hazardProvince = normalizeAreaName(hazard.province);
    const userProvince = normalizeAreaName(userLocation.province);
    return !hazardProvince || !userProvince || hazardProvince === userProvince;
  }

  if (
    typeof hazard.latitude !== 'number' ||
    typeof hazard.longitude !== 'number' ||
    typeof userLocation.latitude !== 'number' ||
    typeof userLocation.longitude !== 'number'
  ) {
    return false;
  }
  return (
    distanceKm(
      hazard.latitude,
      hazard.longitude,
      userLocation.latitude,
      userLocation.longitude,
    ) <= COORDINATE_MATCH_RADIUS_KM
  );
}

export function distanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const value =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function placeName(location: HazardAreaLocation) {
  const city = location.city?.trim();
  if (city) return city;
  const province = location.province?.trim();
  if (province) return province;
  return 'your area';
}

export function extractAreaMentions(
  text: string,
  locations: HazardAreaLocation[],
) {
  const normalizedText = normalizeAreaName(text);
  const provinceByCity = new Map<string, Set<string>>();
  for (const location of locations) {
    const city = normalizeAreaName(location.city);
    if (!city) continue;
    const provinces = provinceByCity.get(city) ?? new Set<string>();
    provinces.add(normalizeAreaName(location.province));
    provinceByCity.set(city, provinces);
  }
  const matches = new Map<string, HazardAreaLocation>();
  for (const location of locations) {
    const city = normalizeAreaName(location.city);
    if (!city || !normalizedText.includes(city)) continue;
    const province = normalizeAreaName(location.province);
    const provinces = provinceByCity.get(city);
    if (
      provinces?.size &&
      provinces.size > 1 &&
      province &&
      !normalizedText.includes(province)
    ) {
      continue;
    }
    matches.set(normalizeAreaKey(location), {
      city: location.city,
      province: location.province,
      latitude: location.latitude,
      longitude: location.longitude,
    });
  }
  return [...matches.values()];
}
