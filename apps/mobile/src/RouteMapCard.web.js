import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function getRestaurantCoordinate(order) {
  if (typeof order?.restaurant?.latitude !== 'number' || typeof order?.restaurant?.longitude !== 'number') {
    return null;
  }

  return {
    latitude: order.restaurant.latitude,
    longitude: order.restaurant.longitude,
  };
}

function getDeliveryCoordinate(order) {
  if (typeof order?.delivery_lat !== 'number' || typeof order?.delivery_lng !== 'number') {
    return null;
  }

  return {
    latitude: order.delivery_lat,
    longitude: order.delivery_lng,
  };
}

export function getRiderRouteTarget(order) {
  if (order?.status === 'ready_for_pickup') {
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
  const target = getRiderRouteTarget(order);

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.top}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.badge}>
          <Ionicons name="map-outline" size={12} color="#F8964F" />
          <Text style={styles.badgeText}>Route</Text>
        </View>
      </View>

      <View style={[styles.mapShell, compact && styles.mapShellCompact]}>
        <Ionicons name="navigate-circle-outline" size={28} color="#F8964F" />
        <Text style={styles.fallbackText}>Native map preview appears in Android builds.</Text>
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
    backgroundColor: '#FFF4EC',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 14,
  },
  mapShellCompact: {
    height: 118,
  },
  fallbackText: {
    color: '#6E6761',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    textAlign: 'center',
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
