import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  canRenderNativeGoogleMap,
  coordinateToRegion,
  getGoogleMapsApiKey,
  normalizeCoordinate,
} from './mapUtils';

function getRestaurantCoordinate(order) {
  return normalizeCoordinate({
    latitude: order?.restaurant?.latitude,
    longitude: order?.restaurant?.longitude,
  });
}

function getDeliveryCoordinate(order) {
  return normalizeCoordinate({
    latitude: order?.delivery_lat,
    longitude: order?.delivery_lng,
  });
}

function getRiderCoordinate(order) {
  return normalizeCoordinate({
    latitude: order?.rider_lat,
    longitude: order?.rider_lng,
  });
}

export function getRiderRouteTarget(order) {
  const status = order?.status;

  if (status === 'ready_for_pickup') {
    return {
      label: order?.restaurant?.name || 'Restaurant pickup',
      address: order?.restaurant?.address || 'Pickup address unavailable',
      coordinate: getRestaurantCoordinate(order),
    };
  }

  return {
    label: 'Customer dropoff',
    address: order?.delivery_address || 'Delivery address unavailable',
    coordinate: getDeliveryCoordinate(order),
  };
}

export function RouteMapCard({
  order,
  title = 'Live route',
  pickupLabel,
  pickupAddress,
  dropoffLabel,
  dropoffAddress,
  compact = false,
}) {
  const apiKey = getGoogleMapsApiKey();
  const canRenderMap = canRenderNativeGoogleMap();
  const restaurantCoordinate = getRestaurantCoordinate(order);
  const deliveryCoordinate = getDeliveryCoordinate(order);
  const riderCoordinate = getRiderCoordinate(order);
  const target = getRiderRouteTarget(order);
  const fallbackCoordinate = target.coordinate || restaurantCoordinate || deliveryCoordinate || riderCoordinate;
  const routeCoordinates = [
    riderCoordinate,
    target.coordinate,
  ].filter(Boolean);

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.top}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.badge}>
          <Ionicons name={riderCoordinate ? 'radio' : 'map-outline'} size={12} color="#F8964F" />
          <Text style={styles.badgeText}>{riderCoordinate ? 'Live' : 'Map'}</Text>
        </View>
      </View>

      <View style={[styles.mapShell, compact && styles.mapShellCompact]}>
        {canRenderMap && fallbackCoordinate ? (
          <MapView
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            initialRegion={coordinateToRegion(fallbackCoordinate, 0.026)}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            {restaurantCoordinate ? (
              <Marker coordinate={restaurantCoordinate} title={order?.restaurant?.name || 'Restaurant'}>
                <View style={styles.markerPickup}>
                  <MaterialCommunityIcons name="storefront" size={15} color="#FFFFFF" />
                </View>
              </Marker>
            ) : null}
            {deliveryCoordinate ? (
              <Marker coordinate={deliveryCoordinate} title="Delivery">
                <View style={styles.markerDropoff}>
                  <Ionicons name="home" size={14} color="#FFFFFF" />
                </View>
              </Marker>
            ) : null}
            {riderCoordinate ? (
              <Marker coordinate={riderCoordinate} title="Rider">
                <View style={styles.markerRider}>
                  <MaterialCommunityIcons name="motorbike" size={16} color="#FFFFFF" />
                </View>
              </Marker>
            ) : null}
            {routeCoordinates.length === 2 ? (
              <Polyline coordinates={routeCoordinates} strokeColor="#F8964F" strokeWidth={4} />
            ) : null}
          </MapView>
        ) : (
          <View style={styles.fallback}>
            <Ionicons name="map-outline" size={18} color="#F8964F" />
            <Text style={styles.fallbackText}>
              {fallbackCoordinate
                ? (apiKey ? 'Map preview needs an Android Maps-enabled build.' : 'Map key missing.')
                : 'Coordinates will appear after address pinning.'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.routeText}>
        <View>
          <Text style={styles.routeLabel}>{pickupLabel || order?.restaurant?.name || 'Pickup'}</Text>
          <Text style={styles.routeAddress} numberOfLines={1}>
            {pickupAddress || order?.restaurant?.address || 'Restaurant pickup'}
          </Text>
        </View>
        <View>
          <Text style={styles.routeLabel}>{dropoffLabel || target.label}</Text>
          <Text style={styles.routeAddress} numberOfLines={2}>
            {dropoffAddress || target.address}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    padding: 10,
    gap: 9,
  },
  cardCompact: {
    marginTop: 0,
    marginBottom: 12,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
  badge: {
    minHeight: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFF4EC',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    color: '#F8964F',
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
  },
  mapShell: {
    height: 150,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFF4EC',
  },
  mapShellCompact: {
    height: 118,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
  },
  fallbackText: {
    color: '#6E6761',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    textAlign: 'center',
  },
  markerPickup: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E6B4F',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  markerDropoff: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E1E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  markerRider: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8964F',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  routeText: {
    gap: 8,
  },
  routeLabel: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  routeAddress: {
    marginTop: 1,
    color: '#6E6761',
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    lineHeight: 16,
  },
});
