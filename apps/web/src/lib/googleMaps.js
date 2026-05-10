// ===== Google Maps JS SDK loader =====

let googleMapsPromise;

export function getGoogleMapsApiKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_PUBLIC_GOOGLE_MAPS_API_KEY || '';
}

export function normalizeCoordinate(value = {}) {
  const source = value?.coordinates || value?.location || value?.coords || value;
  const lat = Number(source?.lat ?? source?.latitude);
  const lng = Number(source?.lng ?? source?.longitude ?? source?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
}

export function toLatLngLiteral(value) {
  return normalizeCoordinate(value) || { lat: 27.7103, lng: 85.3222 };
}

export function loadGoogleMaps() {
  const apiKey = getGoogleMapsApiKey();

  if (!apiKey) {
    return Promise.reject(new Error('Missing Google Maps API key.'));
  }

  if (window.google?.maps?.Map && window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-google-maps-loader="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.google));
      existingScript.addEventListener('error', () => reject(new Error('Google Maps failed to load.')));
      return;
    }

    const script = document.createElement('script');
    const params = new URLSearchParams({
      key: apiKey,
      libraries: 'places',
      callback: '__googleMapsInitCallback',
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsLoader = 'true';

    window.__googleMapsInitCallback = () => {
      delete window.__googleMapsInitCallback;
      resolve(window.google);
    };

    script.onerror = () => {
      delete window.__googleMapsInitCallback;
      googleMapsPromise = null;
      reject(new Error('Google Maps failed to load.'));
    };

    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

// ===== Places Autocomplete via JS SDK =====

let autocompleteService = null;
let placesLibraryPromise = null;

async function getPlacesLibrary() {
  if (placesLibraryPromise) {
    return placesLibraryPromise;
  }

  placesLibraryPromise = loadGoogleMaps().then((google) => {
    if (google.maps.importLibrary) {
      return google.maps.importLibrary('places');
    }

    return google.maps.places || {};
  });

  return placesLibraryPromise;
}

async function getAutocompleteService() {
  if (autocompleteService) {
    return autocompleteService;
  }

  const google = await loadGoogleMaps();
  autocompleteService = new google.maps.places.AutocompleteService();
  return autocompleteService;
}

export async function fetchPlacePredictions(input, options = {}) {
  const query = String(input || '').trim();

  if (query.length < 3) {
    return [];
  }

  const country = options.country || 'np';
  const radius = options.radius || 55000;
  const kathmandu = { lat: 27.7103, lng: 85.3222 };
  let skipGoogleFallbacks = false;

  if (!getGoogleMapsApiKey()) {
    return fetchOpenStreetMapPredictions(query, { country });
  }

  try {
    const { AutocompleteSessionToken, AutocompleteSuggestion } = await getPlacesLibrary();

    if (AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
      const token = AutocompleteSessionToken ? new AutocompleteSessionToken() : undefined;
      const { suggestions = [] } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        includedRegionCodes: [country],
        locationBias: {
          center: kathmandu,
          radius,
        },
        origin: kathmandu,
        region: country,
        sessionToken: token,
      });

      const newResults = suggestions
        .map((suggestion) => {
          const prediction = suggestion.placePrediction;
          if (!prediction) {
            return null;
          }

          const mainText = prediction.mainText?.text || prediction.text?.text || prediction.text?.toString?.() || '';
          const secondaryText = prediction.secondaryText?.text || '';
          const description = prediction.text?.toString?.() || [mainText, secondaryText].filter(Boolean).join(', ');

          return {
            placeId: prediction.placeId || '',
            description,
            mainText: mainText || description,
            secondaryText,
            placePrediction: prediction,
          };
        })
        .filter(Boolean);

      if (newResults.length) {
        return newResults;
      }
    }
  } catch (_error) {
    skipGoogleFallbacks = true;
  }

  if (!skipGoogleFallbacks) {
    try {
      const service = await getAutocompleteService();
      const google = window.google;

      const request = {
        input: query,
        componentRestrictions: { country },
        locationBias: {
          center: kathmandu,
          radius,
        },
      };

      if (google.maps.LatLng) {
        request.location = new google.maps.LatLng(kathmandu.lat, kathmandu.lng);
        request.radius = radius;
      }

      const legacyResults = await new Promise((resolve) => {
        service.getPlacePredictions(request, (predictions, status) => {
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !predictions
          ) {
            resolve([]);
            return;
          }

          resolve(
            predictions.map((p) => ({
              placeId: p.place_id,
              description: p.description,
              mainText:
                p.structured_formatting?.main_text || p.description,
              secondaryText:
                p.structured_formatting?.secondary_text || '',
            })),
          );
        });
      });

      if (legacyResults.length) {
        return legacyResults;
      }
    } catch {
      skipGoogleFallbacks = true;
    }
  }

  const geocodeResults = skipGoogleFallbacks
    ? []
    : await fetchGeocodePredictions(query, {
      country,
      location: kathmandu,
    });

  if (geocodeResults.length) {
    return geocodeResults;
  }

  return fetchOpenStreetMapPredictions(query, { country });
}

// ===== Place Details via JS SDK =====

let placesServiceElement = null;
let placesService = null;

async function getPlacesService() {
  if (placesService) {
    return placesService;
  }

  const google = await loadGoogleMaps();

  if (!placesServiceElement) {
    placesServiceElement = document.createElement('div');
    placesServiceElement.style.display = 'none';
    document.body.appendChild(placesServiceElement);
  }

  placesService = new google.maps.places.PlacesService(placesServiceElement);
  return placesService;
}

export async function fetchPlaceDetails(placeId) {
  if (placeId?.coordinates || placeId?.formattedAddress || placeId?.formatted_address) {
    return {
      address: placeId.address || placeId.description || placeId.formattedAddress || placeId.formatted_address || '',
      formattedAddress: placeId.formattedAddress || placeId.formatted_address || placeId.description || placeId.address || '',
      placeId: placeId.placeId || placeId.place_id || '',
      coordinates: placeId.coordinates || null,
    };
  }

  if (placeId?.toPlace) {
    try {
      const place = placeId.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      });

      const lat = place.location?.lat?.();
      const lng = place.location?.lng?.();
      const coordinate =
        Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng }
          : null;

      return {
        address: place.displayName || place.formattedAddress || '',
        formattedAddress: place.formattedAddress || '',
        placeId: place.id || '',
        coordinates: coordinate
          ? { latitude: coordinate.lat, longitude: coordinate.lng }
          : null,
      };
    } catch (error) {
      console.warn('Google Places details failed:', error);
      return null;
    }
  }

  const normalizedPlaceId = String(placeId || '').trim();

  if (!getGoogleMapsApiKey() || !normalizedPlaceId) {
    return null;
  }

  try {
    const service = await getPlacesService();
    const google = window.google;

    return new Promise((resolve) => {
      service.getDetails(
        {
          placeId: normalizedPlaceId,
          fields: ['place_id', 'formatted_address', 'geometry', 'name'],
        },
        (result, status) => {
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !result
          ) {
            resolve(null);
            return;
          }

          const location = result.geometry?.location;
          const lat = location?.lat?.();
          const lng = location?.lng?.();
          const coordinate =
            Number.isFinite(lat) && Number.isFinite(lng)
              ? { lat, lng }
              : null;

          resolve({
            address: result.name || result.formatted_address || '',
            formattedAddress: result.formatted_address || '',
            placeId: result.place_id || normalizedPlaceId,
            coordinates: coordinate
              ? { latitude: coordinate.lat, longitude: coordinate.lng }
              : null,
          });
        },
      );
    });
  } catch (error) {
    if (!isLegacyPlacesNotEnabledError(error)) {
      console.warn('Google Places legacy details failed:', error);
    }
    return null;
  }
}

function isLegacyPlacesNotEnabledError(error) {
  return String(error?.message || error || '').includes('LegacyApiNotActivatedMapError');
}

async function fetchGeocodePredictions(input, options = {}) {
  const query = String(input || '').trim();

  if (!query) {
    return [];
  }

  try {
    const geocoder = await getGeocoder();
    const location = toLatLngLiteral(options.location);
    const google = window.google;

    return new Promise((resolve) => {
      geocoder.geocode(
        {
          address: query,
          componentRestrictions: { country: options.country || 'NP' },
          bounds: google?.maps?.LatLngBounds
            ? new google.maps.LatLngBounds(
              { lat: location.lat - 0.35, lng: location.lng - 0.35 },
              { lat: location.lat + 0.35, lng: location.lng + 0.35 },
            )
            : undefined,
        },
        (results, status) => {
          if (status !== 'OK' || !results?.length) {
            resolve([]);
            return;
          }

          resolve(
            results.slice(0, 5).map((result) => {
              const lat = result.geometry?.location?.lat?.();
              const lng = result.geometry?.location?.lng?.();
              const coordinates =
                Number.isFinite(lat) && Number.isFinite(lng)
                  ? { latitude: lat, longitude: lng }
                  : null;
              const [mainText, ...rest] = String(result.formatted_address || query)
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean);

              return {
                placeId: result.place_id || '',
                description: result.formatted_address || query,
                formattedAddress: result.formatted_address || query,
                address: mainText || result.formatted_address || query,
                mainText: mainText || result.formatted_address || query,
                secondaryText: rest.join(', '),
                coordinates,
              };
            }),
          );
        },
      );
    });
  } catch (error) {
    console.warn('Google geocoder suggestions failed:', error);
    return [];
  }
}

async function fetchOpenStreetMapPredictions(input, options = {}) {
  const query = String(input || '').trim();

  if (!query || typeof fetch !== 'function') {
    return [];
  }

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
      countrycodes: String(options.country || 'np').toLowerCase(),
      'accept-language': 'en',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);

    if (!response.ok) {
      return [];
    }

    const results = await response.json();

    if (!Array.isArray(results)) {
      return [];
    }

    return results.map((result) => {
      const lat = Number(result.lat);
      const lng = Number(result.lon);
      const coordinates =
        Number.isFinite(lat) && Number.isFinite(lng)
          ? { latitude: lat, longitude: lng }
          : null;
      const description = result.display_name || query;
      const address = result.address || {};

      // Use result.name (e.g. "Herald College Kathmandu") as the primary text
      // NOT the suburb/neighbourhood which gives area names instead of the place name
      const mainText =
        result.name ||
        description.split(',')[0]?.trim() ||
        query;

      // Secondary text is everything after the first part
      const secondaryParts = description
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(1);

      // Prefer address components for secondary text to avoid duplicating the main text
      const secondaryText =
        [address.road, address.suburb || address.neighbourhood, address.city || address.town || address.village]
          .filter(Boolean)
          .join(', ') || secondaryParts.join(', ');

      return {
        placeId: [result.osm_type, result.osm_id].filter(Boolean).join(':'),
        description: mainText ? `${mainText}, ${secondaryParts.join(', ')}`.replace(/,\s*$/, '') : description,
        formattedAddress: description,
        address: mainText,
        mainText,
        secondaryText,
        coordinates,
      };
    });
  } catch (error) {
    console.warn('OpenStreetMap address suggestions failed:', error);
    return [];
  }
}

// ===== Reverse Geocoding via JS SDK =====

let geocoder = null;

async function getGeocoder() {
  if (geocoder) {
    return geocoder;
  }

  const google = await loadGoogleMaps();
  geocoder = new google.maps.Geocoder();
  return geocoder;
}

export async function reverseGeocode(coordinate) {
  const normalized = normalizeCoordinate(coordinate);

  if (!normalized) {
    return null;
  }

  if (!getGoogleMapsApiKey()) {
    return fetchOpenStreetMapReverseGeocode(normalized);
  }

  try {
    const gc = await getGeocoder();

    return new Promise((resolve) => {
      gc.geocode({ location: normalized }, async (results, status) => {
        if (status !== 'OK' || !results?.length) {
          resolve(await fetchOpenStreetMapReverseGeocode(normalized));
          return;
        }

        const result = results[0];
        const display = getGoogleReverseDisplay(result, normalized);
        resolve({
          address: display.address,
          formattedAddress: display.formattedAddress,
          placeId: result.place_id || '',
          coordinates: {
            latitude: normalized.lat,
            longitude: normalized.lng,
          },
        });
      });
    });
  } catch {
    return fetchOpenStreetMapReverseGeocode(normalized);
  }
}

function getCoordinateLabel(coordinate) {
  return `${coordinate.lat.toFixed(5)}, ${coordinate.lng.toFixed(5)}`;
}

function getGoogleReverseDisplay(result = {}, coordinate) {
  const coordinateLabel = getCoordinateLabel(coordinate);
  const formattedAddress = result.formatted_address || '';
  const components = Array.isArray(result.address_components)
    ? result.address_components
    : [];
  const preferredTypes = [
    'neighborhood',
    'sublocality',
    'sublocality_level_1',
    'locality',
    'administrative_area_level_3',
    'route',
  ];
  const preferred = components.find((component) => (
    preferredTypes.some((type) => component.types?.includes(type))
  ));
  const isPlusCode = result.types?.includes('plus_code') || /^[A-Z0-9]{4,}\+/i.test(formattedAddress);
  const firstLine = formattedAddress
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)[0];
  const address = preferred?.long_name || (!isPlusCode ? firstLine : '') || coordinateLabel;

  return {
    address,
    formattedAddress: formattedAddress || address,
  };
}

async function fetchOpenStreetMapReverseGeocode(coordinate) {
  if (typeof fetch !== 'function') {
    return {
      address: getCoordinateLabel(coordinate),
      formattedAddress: '',
      placeId: '',
      coordinates: {
        latitude: coordinate.lat,
        longitude: coordinate.lng,
      },
    };
  }

  try {
    const params = new URLSearchParams({
      lat: String(coordinate.lat),
      lon: String(coordinate.lng),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '18',
      'accept-language': 'en',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);

    if (!response.ok) {
      throw new Error('Reverse geocode request failed.');
    }

    const result = await response.json();
    const address = result?.address || {};
    const displayName = result?.display_name || '';
    const readableName =
      result?.name ||
      address.amenity ||
      address.shop ||
      address.tourism ||
      address.leisure ||
      address.office ||
      address.suburb ||
      address.neighbourhood ||
      address.city_district ||
      address.road ||
      address.city ||
      address.town ||
      address.village ||
      displayName.split(',')[0]?.trim() ||
      getCoordinateLabel(coordinate);

    return {
      address: readableName,
      formattedAddress: displayName || readableName,
      placeId: [result?.osm_type, result?.osm_id].filter(Boolean).join(':'),
      coordinates: {
        latitude: coordinate.lat,
        longitude: coordinate.lng,
      },
    };
  } catch {
    return {
      address: getCoordinateLabel(coordinate),
      formattedAddress: '',
      placeId: '',
      coordinates: {
        latitude: coordinate.lat,
        longitude: coordinate.lng,
      },
    };
  }
}
