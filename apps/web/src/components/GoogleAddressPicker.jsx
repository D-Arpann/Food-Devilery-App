import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getGoogleMapsApiKey,
  fetchPlacePredictions,
  fetchPlaceDetails,
  normalizeCoordinate,
  reverseGeocode,
  loadGoogleMaps,
  toLatLngLiteral,
} from '../lib/googleMaps';

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function toMapPosition(coordinate) {
  if (!coordinate) {
    return null;
  }

  const lat = Number(coordinate.latitude ?? coordinate.lat);
  const lng = Number(coordinate.longitude ?? coordinate.lng ?? coordinate.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function getOpenStreetMapEmbedUrl(coordinate) {
  const position = toMapPosition(coordinate);

  if (!position) {
    return '';
  }

  const offset = 0.006;
  const params = new URLSearchParams({
    bbox: [
      position.lng - offset,
      position.lat - offset,
      position.lng + offset,
      position.lat + offset,
    ].join(','),
    layer: 'mapnik',
    marker: `${position.lat},${position.lng}`,
  });

  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}

export default function GoogleAddressPicker({
  label = 'Address',
  value = '',
  coordinates = null,
  placeholder = 'Search address',
  onChange,
  className = '',
}) {
  const inputRef = useRef(null);
  const mapRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const isTypingRef = useRef(false);
  const lastTypedValueRef = useRef(value);
  const [query, setQuery] = useState(value);
  const [predictions, setPredictions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingPredictions, setLoadingPredictions] = useState(false);
  const [previewingId, setPreviewingId] = useState(null);
  const [mapPreviewOpen, setMapPreviewOpen] = useState(false);
  const [mapPreview, setMapPreview] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapStatus, setMapStatus] = useState('');
  const mapPreviewRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const hasKey = Boolean(getGoogleMapsApiKey());
  const debouncedQuery = useDebounce(query, 400);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    mapPreviewRef.current = mapPreview;
  }, [mapPreview]);

  useEffect(() => {
    if (value === lastTypedValueRef.current && isTypingRef.current) {
      setQuery(value);
      return;
    }

    isTypingRef.current = false;
    setQuery(value);
  }, [value]);

  const updateMapPreview = useCallback((nextCoordinates, zoom = 16) => {
    const position = toMapPosition(nextCoordinates);

    if (!position || !mapInstanceRef.current || !markerRef.current) {
      return;
    }

    markerRef.current.setPosition(position);
    mapInstanceRef.current.panTo(position);
    mapInstanceRef.current.setZoom(zoom);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function search() {
      if (!isTypingRef.current) {
        return;
      }

      if (!debouncedQuery || debouncedQuery.length < 3) {
        setPredictions([]);
        setShowDropdown(false);
        return;
      }

      setLoadingPredictions(true);

      try {
        const results = await fetchPlacePredictions(debouncedQuery);

        if (!cancelled) {
          setPredictions(results);
          setShowDropdown(results.length > 0 && isTypingRef.current);
        }
      } catch {
        if (!cancelled) {
          setPredictions([]);
          setShowDropdown(false);
        }
      } finally {
        if (!cancelled) {
          setLoadingPredictions(false);
        }
      }
    }

    search();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const resolveMapLocation = useCallback(async (location) => {
    const lat = location?.lat?.();
    const lng = location?.lng?.();

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const coordinates = { latitude: lat, longitude: lng };
    setMapStatus('');

    try {
      const geo = await reverseGeocode({ lat, lng });
      const displayAddress = geo?.formattedAddress || geo?.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

      setMapPreview((current) => ({
        ...(current || {}),
        address: geo?.address || displayAddress,
        formattedAddress: displayAddress,
        placeId: geo?.placeId || current?.placeId || '',
        coordinates: geo?.coordinates || coordinates,
      }));
    } catch {
      setMapPreview((current) => ({
        ...(current || {}),
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        formattedAddress: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        coordinates,
      }));
    }
  }, []);

  useEffect(() => {
    if (!mapPreviewOpen || !hasKey || !mapRef.current) {
      return;
    }

    let cancelled = false;
    setMapLoaded(false);
    setMapStatus('');

    async function setupMap() {
      try {
        await loadGoogleMaps();

        if (cancelled || !mapRef.current) {
          return;
        }

        const google = window.google;
        if (!google?.maps?.Map) {
          return;
        }

        const previewCoordinates = mapPreviewRef.current?.coordinates;
        const initialPosition = toLatLngLiteral(previewCoordinates || coordinates);
        const map = new google.maps.Map(mapRef.current, {
          center: initialPosition,
          zoom: normalizeCoordinate(previewCoordinates || coordinates) ? 16 : 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });

        const marker = new google.maps.Marker({
          map,
          position: initialPosition,
          draggable: true,
          clickable: false,
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
        setMapLoaded(true);

        map.addListener('click', async (event) => {
          const location = event.latLng;
          marker.setPosition(location);
          map.panTo(location);
          await resolveMapLocation(location);
        });

        marker.addListener('dragend', async () => {
          const location = marker.getPosition();
          map.panTo(location);
          await resolveMapLocation(location);
        });
      } catch (error) {
        if (!cancelled) {
          setMapStatus(error.message || 'Map could not be loaded.');
        }
      }
    }

    setupMap();

    return () => {
      cancelled = true;
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, [coordinates, hasKey, mapPreviewOpen, resolveMapLocation]);

  useEffect(() => {
    if (mapPreviewOpen) {
      updateMapPreview(mapPreview?.coordinates || coordinates, 16);
    }
  }, [coordinates, mapPreview?.coordinates, mapPreviewOpen, updateMapPreview]);

  const handleInputChange = useCallback((event) => {
    const nextValue = event.target.value;
    isTypingRef.current = true;
    lastTypedValueRef.current = nextValue;
    setQuery(nextValue);

    if (!nextValue || nextValue.length < 3) {
      setShowDropdown(false);
      setPredictions([]);
    }

    // Notify parent with the raw typed value immediately
    onChangeRef.current?.({
      address: nextValue,
      formattedAddress: nextValue,
      placeId: '',
      coordinates,
    });
  }, [coordinates]);

  const handleSelectPrediction = useCallback(async (prediction) => {
    // Use prediction.description — the full place name as shown in the list
    // NOT details.formattedAddress which resolves to the neighbourhood/locality
    const displayName = prediction.description || prediction.mainText || '';

    isTypingRef.current = false;
    setShowDropdown(false);
    setPredictions([]);
    setQuery(displayName);
    setPreviewingId(null);
    setLoadingPredictions(true);

    try {
      // Pass placeId string for Google results, or the coordinates if from OSM
      const detailArg = prediction.placePrediction || prediction.placeId || prediction.coordinates;
      const details = await fetchPlaceDetails(detailArg);

      if (details) {
        updateMapPreview(details.coordinates, 16);
        onChangeRef.current?.({
          address: displayName,
          formattedAddress: details.formattedAddress || displayName,
          placeId: details.placeId || prediction.placeId || '',
          coordinates: details.coordinates,
        });
      } else {
        // Fallback: use whatever coordinates came with the prediction
        updateMapPreview(prediction.coordinates, 16);
        onChangeRef.current?.({
          address: displayName,
          formattedAddress: prediction.formattedAddress || displayName,
          placeId: prediction.placeId || '',
          coordinates: prediction.coordinates || null,
        });
      }
    } catch {
      updateMapPreview(prediction.coordinates, 16);
      onChangeRef.current?.({
        address: displayName,
        formattedAddress: prediction.formattedAddress || displayName,
        placeId: prediction.placeId || '',
        coordinates: prediction.coordinates || null,
      });
    } finally {
      setLoadingPredictions(false);
    }
  }, [updateMapPreview]);

  const handleViewOnMap = useCallback(async (prediction, event) => {
    event.stopPropagation();

    const predId = prediction.placeId || prediction.description;
    setPreviewingId(predId);
    setMapPreviewOpen(true);
    setShowDropdown(false);
    setMapStatus('');

    try {
      const detailArg = prediction.placePrediction || (hasKey ? prediction.placeId : prediction.coordinates) || prediction.coordinates;
      const details = await fetchPlaceDetails(detailArg);
      const displayName = prediction.description || prediction.mainText || '';

      if (details?.coordinates) {
        setMapPreview({
          address: displayName,
          formattedAddress: details.formattedAddress || displayName,
          placeId: details.placeId || prediction.placeId || '',
          coordinates: details.coordinates,
        });
        updateMapPreview(details.coordinates, 16);
      } else if (prediction.coordinates) {
        setMapPreview({
          address: displayName,
          formattedAddress: prediction.formattedAddress || displayName,
          placeId: prediction.placeId || '',
          coordinates: prediction.coordinates,
        });
        updateMapPreview(prediction.coordinates, 16);
      } else {
        setMapStatus('Could not find map coordinates for this suggestion.');
      }
    } catch {
      if (prediction.coordinates) {
        setMapPreview({
          address: prediction.description || prediction.mainText || '',
          formattedAddress: prediction.formattedAddress || prediction.description || prediction.mainText || '',
          placeId: prediction.placeId || '',
          coordinates: prediction.coordinates,
        });
        updateMapPreview(prediction.coordinates, 16);
      } else {
        setMapStatus('Could not load this location on the map.');
      }
    } finally {
      setPreviewingId(null);
    }
  }, [hasKey, updateMapPreview]);

  const handleUseMapPreview = useCallback(() => {
    if (!mapPreview?.coordinates) {
      setMapStatus('Move the pin to a valid location before using it.');
      return;
    }

    const displayAddress = mapPreview.address || mapPreview.formattedAddress || query;
    isTypingRef.current = false;
    lastTypedValueRef.current = displayAddress;
    setQuery(displayAddress);
    setShowDropdown(false);
    setPredictions([]);
    setMapPreviewOpen(false);
    onChangeRef.current?.({
      address: displayAddress,
      formattedAddress: mapPreview.formattedAddress || displayAddress,
      placeId: mapPreview.placeId || '',
      coordinates: mapPreview.coordinates,
    });
  }, [mapPreview, query]);

  const handleBlur = useCallback(() => {
    // Delay so clicks on dropdown items register before hiding
    setTimeout(() => {
      setShowDropdown(false);
    }, 200);
  }, []);

  const handleFocus = useCallback(() => {
    // Only reopen dropdown if user was actively typing and results are ready
    if (isTypingRef.current && predictions.length > 0) {
      setShowDropdown(true);
    }
  }, [predictions.length]);

  const openStreetMapEmbedUrl = getOpenStreetMapEmbedUrl(mapPreview?.coordinates);

  return (
    <div className={`google-address-picker ${className}`}>
      <label>
        <span>{label}</span>
        <div className="google-address-input-wrap">
          <input
            ref={inputRef}
            value={query}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            autoComplete="off"
          />
          {loadingPredictions ? (
            <span className="google-address-loading">Searching...</span>
          ) : null}

          {showDropdown && predictions.length > 0 ? (
            <ul className="google-address-predictions">
              {predictions.map((prediction) => {
                const predId = prediction.placeId || prediction.description;
                const isPreviewing = previewingId === predId;

                return (
                  <li key={predId}>
                    <div className="google-address-prediction-row">
                      <button
                        type="button"
                        className="google-address-prediction-main"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSelectPrediction(prediction)}
                      >
                        <strong>{prediction.mainText || prediction.description}</strong>
                        {prediction.secondaryText ? (
                          <span>{prediction.secondaryText}</span>
                        ) : null}
                      </button>

                      <button
                        type="button"
                        className="google-address-view-map-btn"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(e) => handleViewOnMap(prediction, e)}
                        aria-label={`View ${prediction.mainText || prediction.description} on map`}
                        title="View on map"
                      >
                        {isPreviewing ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </label>

      {mapPreviewOpen ? (
        <div className="google-address-map-preview" aria-label="Precise map picker">
          <div className="google-address-map-preview-head">
            <div>
              <strong>{mapPreview?.address || 'Map preview'}</strong>
              {mapPreview?.formattedAddress ? <span>{mapPreview.formattedAddress}</span> : null}
            </div>
            <button type="button" onClick={() => setMapPreviewOpen(false)} aria-label="Close map preview">
              &times;
            </button>
          </div>

          {hasKey ? (
            <div className="google-address-map-wrap">
              <div className="google-address-map" ref={mapRef} />
              {!mapLoaded && !mapStatus ? (
                <span className="google-address-map-message">Loading map...</span>
              ) : null}
            </div>
          ) : openStreetMapEmbedUrl ? (
            <iframe
              className="google-address-map-embed"
              src={openStreetMapEmbedUrl}
              title="Address map preview"
              loading="lazy"
            />
          ) : null}

          {mapStatus ? <p className="google-address-status">{mapStatus}</p> : null}

          <button
            type="button"
            className="google-address-use-map-btn"
            onClick={handleUseMapPreview}
            disabled={!mapPreview?.coordinates}
          >
            Use this location
          </button>
        </div>
      ) : null}
    </div>
  );
}
