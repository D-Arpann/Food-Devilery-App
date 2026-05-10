export const DEFAULT_MAP_REGION = {
  latitude: 27.7103,
  longitude: 85.3222,
  latitudeDelta: 0.045,
  longitudeDelta: 0.045,
};

export function getGoogleMapsApiKey() {
  return process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
}

export function canRenderNativeGoogleMap() {
  const flag = String(
    process.env.EXPO_PUBLIC_ENABLE_NATIVE_GOOGLE_MAPS ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_NATIVE_ENABLED ||
    '',
  ).trim().toLowerCase();

  if (['0', 'false', 'no', 'off'].includes(flag)) {
    return false;
  }

  return Boolean(getGoogleMapsApiKey());
}

export function normalizeCoordinate(value = {}) {
  const source = value?.coordinates || value?.location || value?.coords || value;
  const latitude = Number(source?.latitude ?? source?.lat);
  const longitude = Number(source?.longitude ?? source?.lng ?? source?.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

export function coordinateToRegion(coordinate, delta = 0.018) {
  const normalized = normalizeCoordinate(coordinate) || DEFAULT_MAP_REGION;
  return {
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

function buildPlacesUrl(path, params) {
  const url = new URL(`https://maps.googleapis.com/maps/api/place/${path}/json`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && typeof value !== 'undefined' && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

export async function fetchPlacePredictions(input, options = {}) {
  const query = String(input || '').trim();
  const key = getGoogleMapsApiKey();

  if (!key || query.length < 3) {
    return [];
  }

  const response = await fetch(buildPlacesUrl('autocomplete', {
    input: query,
    key,
    components: options.components || 'country:np',
    location: options.location || '27.7103,85.3222',
    radius: options.radius || 55000,
  }));
  const payload = await response.json();

  if (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    throw new Error(payload.error_message || 'Could not load address suggestions.');
  }

  return (payload.predictions || []).map((prediction) => ({
    placeId: prediction.place_id,
    description: prediction.description,
    mainText: prediction.structured_formatting?.main_text || prediction.description,
    secondaryText: prediction.structured_formatting?.secondary_text || '',
  }));
}

export async function fetchPlaceDetails(placeId) {
  const key = getGoogleMapsApiKey();
  const normalizedPlaceId = String(placeId || '').trim();

  if (!key || !normalizedPlaceId) {
    return null;
  }

  const response = await fetch(buildPlacesUrl('details', {
    place_id: normalizedPlaceId,
    key,
    fields: 'place_id,formatted_address,geometry,name',
  }));
  const payload = await response.json();

  if (payload.status !== 'OK') {
    throw new Error(payload.error_message || 'Could not load place details.');
  }

  const result = payload.result || {};
  const location = result.geometry?.location || {};
  const coordinate = normalizeCoordinate(location);

  return {
    address: result.formatted_address || result.name || '',
    formattedAddress: result.formatted_address || '',
    placeId: result.place_id || normalizedPlaceId,
    coordinates: coordinate,
  };
}

export async function reverseGeocodeCoordinate(coordinate) {
  const key = getGoogleMapsApiKey();
  const normalized = normalizeCoordinate(coordinate);

  if (!key || !normalized) {
    return null;
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${normalized.latitude},${normalized.longitude}`);
  url.searchParams.set('key', key);

  const response = await fetch(url.toString());
  const payload = await response.json();

  if (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    throw new Error(payload.error_message || 'Could not resolve this map pin.');
  }

  const result = payload.results?.[0];
  if (!result) {
    return {
      address: `${normalized.latitude.toFixed(5)}, ${normalized.longitude.toFixed(5)}`,
      formattedAddress: '',
      placeId: '',
      coordinates: normalized,
    };
  }

  return {
    address: result.formatted_address || `${normalized.latitude.toFixed(5)}, ${normalized.longitude.toFixed(5)}`,
    formattedAddress: result.formatted_address || '',
    placeId: result.place_id || '',
    coordinates: normalized,
  };
}
