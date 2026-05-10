import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import {
  canRenderNativeGoogleMap,
  coordinateToRegion,
  fetchPlaceDetails,
  fetchPlacePredictions,
  getGoogleMapsApiKey,
  normalizeCoordinate,
  reverseGeocodeCoordinate,
} from './mapUtils';

export function MapAddressPicker({
  label = 'Address',
  placeholder = 'Search an address',
  value = '',
  coordinates = null,
  placeId = '',
  onChange,
  compact = false,
}) {
  const mapRef = useRef(null);
  const [query, setQuery] = useState(value);
  const [pin, setPin] = useState(() => normalizeCoordinate(coordinates));
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showMap, setShowMap] = useState(false);
  const apiKey = getGoogleMapsApiKey();
  const canRenderMap = canRenderNativeGoogleMap();
  const region = useMemo(() => coordinateToRegion(pin), [pin]);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    setPin(normalizeCoordinate(coordinates));
  }, [coordinates]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (!apiKey || query.trim().length < 3 || query.trim() === value.trim()) {
        setSuggestions([]);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const results = await fetchPlacePredictions(query);
        if (active) {
          setSuggestions(results.slice(0, 4));
        }
      } catch (suggestionError) {
        if (active) {
          setError(suggestionError.message || 'Address suggestions are unavailable.');
          setSuggestions([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 320);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [apiKey, query, value]);

  const commitAddress = (next) => {
    const nextPin = normalizeCoordinate(next?.coordinates);
    setPin(nextPin);
    setQuery(next?.address || '');
    setSuggestions([]);
    onChange?.({
      address: next?.address || '',
      formattedAddress: next?.formattedAddress || next?.address || '',
      placeId: next?.placeId || placeId || '',
      coordinates: nextPin,
    });

    if (nextPin && canRenderMap) {
      mapRef.current?.animateToRegion(coordinateToRegion(nextPin, 0.012), 260);
    }
  };

  const handleSelectSuggestion = async (suggestion, openMap = false) => {
    setLoading(true);
    setError('');

    try {
      const details = await fetchPlaceDetails(suggestion.placeId);
      commitAddress(details || {
        address: suggestion.description,
        placeId: suggestion.placeId,
        coordinates: null,
      });
      setShowMap(openMap);
    } catch (detailsError) {
      setError(detailsError.message || 'Could not open this address.');
    } finally {
      setLoading(false);
    }
  };

  const handleMapPress = async (event) => {
    const coordinate = normalizeCoordinate(event.nativeEvent.coordinate);
    if (!coordinate) {
      return;
    }

    setPin(coordinate);
    setError('');

    try {
      const resolved = await reverseGeocodeCoordinate(coordinate);
      commitAddress(resolved || {
        address: `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
        coordinates: coordinate,
      });
    } catch {
      commitAddress({
        address: `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
        coordinates: coordinate,
      });
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputShell}>
        <Ionicons name="search-outline" size={16} color="#5E5E5E" />
        <TextInput
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setShowMap(false);
            onChange?.({
              address: text,
              formattedAddress: text,
              placeId: '',
              coordinates: pin,
            });
          }}
          placeholder={placeholder}
          placeholderTextColor="#8E8781"
          style={styles.input}
        />
        {loading ? <ActivityIndicator size="small" color="#F8964F" /> : null}
      </View>

      {!!suggestions.length && (
        <View style={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.placeId}
              style={styles.suggestion}
              onPress={() => handleSelectSuggestion(suggestion)}
            >
              <View style={styles.suggestionCopy}>
                <Text style={styles.suggestionMain}>{suggestion.mainText}</Text>
                <Text style={styles.suggestionSub} numberOfLines={1}>
                  {suggestion.secondaryText || suggestion.description}
                </Text>
              </View>
              <Pressable
                style={styles.suggestionDetailsButton}
                onPress={(event) => {
                  event?.stopPropagation?.();
                  handleSelectSuggestion(suggestion, true);
                }}
              >
                <Text style={styles.suggestionDetailsText}>Details</Text>
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

      {showMap ? (
        <View style={[styles.mapShell, compact && styles.mapShellCompact]}>
          {canRenderMap ? (
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              region={pin ? region : undefined}
              onPress={handleMapPress}
            >
              {pin ? (
                <Marker
                  coordinate={pin}
                  draggable
                  onDragEnd={handleMapPress}
                  pinColor="#F8964F"
                />
              ) : null}
            </MapView>
          ) : (
            <View style={styles.mapFallback}>
              <Ionicons name="map-outline" size={18} color="#F8964F" />
              <Text style={styles.mapFallbackText}>Map details unavailable in this build.</Text>
            </View>
          )}
        </View>
      ) : null}

      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
  },
  inputShell: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    color: '#1E1E1E',
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    paddingVertical: 8,
  },
  suggestions: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F7EFE8',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  suggestionCopy: {
    flex: 1,
    minWidth: 0,
  },
  suggestionMain: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
  },
  suggestionSub: {
    marginTop: 2,
    color: '#6E6761',
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
  },
  suggestionDetailsButton: {
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: '#FFF4EC',
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionDetailsText: {
    color: '#D66018',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
  },
  mapShell: {
    height: 176,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
    overflow: 'hidden',
    backgroundColor: '#FFF4EC',
  },
  mapShellCompact: {
    height: 138,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 8,
  },
  mapFallbackText: {
    color: '#6E6761',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  error: {
    color: '#C12626',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
  },
});
