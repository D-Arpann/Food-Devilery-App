import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { WebView } from 'react-native-webview';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import {
  buildEsewaPaymentRequest,
  createCheckoutOrder,
  createEsewaTransactionUuid,
  decodeEsewaResponseData,
  fetchCustomerOrders,
  fetchCustomerSettings,
  fetchRestaurantFeed,
  logout,
  mapEsewaStatusToPaymentStatus,
  subscribeToCustomerOrders,
  subscribeToRestaurantFeed,
  updateCustomerSettings,
  updateOrderPaymentStatus,
  uploadAvatar,
  verifyEsewaResponseSignature,
} from '@repo/api';
import { Logo, useCart } from '@repo/ui';
import {
  filterMenuItems,
  filterRestaurantFeed,
  formatNpr,
  getDeliveryFee,
  getDefaultSavedAddress,
  getRestaurantBannerUrl,
  getRestaurantProfileImageUrl,
  getRestaurantRating,
  getShortAddress,
  getCurrentOrders,
  getPastOrders,
  isValidNepalPhoneNumber,
  isValidDeliveryAddress,
  mergeOrderRecords,
  normalizeOrderRecord,
  normalizeDeliveryAddress,
  normalizeSavedAddresses,
  ORDER_STATUS,
  resolveDefaultSavedAddressId,
} from '@repo/utils';
import { MapAddressPicker } from './MapAddressPicker';
import { reverseGeocodeCoordinate } from './mapUtils';
import { RouteMapCard } from './RouteMapCard';

const TAB_HOME = 'home';
const TAB_FAVORITES = 'favorites';
const TAB_ORDERS = 'orders';
const TAB_CART = 'cart';
const TAB_PROFILE = 'profile';
const ORDER_VIEW_CURRENT = 'current';
const ORDER_VIEW_PAST = 'past';
const PAYMENT_METHOD_CASH = 'cash';
const PAYMENT_METHOD_ESEWA = 'esewa';
const ESEWA_SUCCESS_HOST = 'chito-mitho.local';
const ESEWA_SUCCESS_PATH = '/payments/esewa/success';
const ESEWA_FAILURE_PATH = '/payments/esewa/failure';

const tabs = [
  { key: TAB_HOME, label: 'Home' },
  { key: TAB_FAVORITES, label: 'Favorites' },
  { key: TAB_ORDERS, label: 'Orders' },
];

const COLORS = {
  orange: '#F8964F',
  orangeHot: '#F8964F',
  ink: '#1E1E1E',
  text: '#333232',
  muted: '#5E5E5E',
  line: '#ECECEC',
  warmLine: '#F0E6DD',
  soft: '#FFF4EC',
  bg: '#FFFFFF',
  surfaceMuted: '#FAFAFA',
  white: '#FFFFFF',
};

const FOOD_PATTERN_GLYPHS = [
  { key: 'pizza', name: 'pizza-outline', top: 6, left: 12, rotate: '-12deg' },
  { key: 'burger', name: 'fast-food-outline', top: 10, right: 18, rotate: '9deg' },
  { key: 'drink', name: 'cafe-outline', top: 58, left: 102, rotate: '-11deg' },
  { key: 'ice', name: 'ice-cream-outline', top: 70, right: 90, rotate: '13deg' },
  { key: 'utensils', name: 'restaurant-outline', top: 114, left: 30, rotate: '-18deg' },
  { key: 'beer', name: 'beer-outline', top: 126, right: 26, rotate: '10deg' },
  { key: 'wine', name: 'wine-outline', bottom: 14, left: 70, rotate: '-8deg' },
  { key: 'meal', name: 'nutrition-outline', bottom: 16, right: 116, rotate: '6deg' },
];

function FoodPatternLayer({ color = 'rgba(214, 96, 24, 0.28)' }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {FOOD_PATTERN_GLYPHS.map((glyph) => (
        <Ionicons
          key={glyph.key}
          name={glyph.name}
          size={34}
          color={color}
          style={[
            styles.foodPatternIcon,
            {
              top: glyph.top,
              left: glyph.left,
              right: glyph.right,
              bottom: glyph.bottom,
              transform: [{ rotate: glyph.rotate }],
            },
          ]}
        />
      ))}
    </View>
  );
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEsewaAutoPostHtml(paymentUrl, fields = {}) {
  const inputs = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`)
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        min-height: 100%;
        margin: 0;
        background: #ffffff;
        color: #1e1e1e;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      p {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <form id="esewa-form" action="${escapeHtml(paymentUrl)}" method="POST">
      ${inputs}
    </form>
    <p>Opening eSewa sandbox...</p>
    <script>document.getElementById('esewa-form').submit();</script>
  </body>
</html>`;
}

function SearchBar({ value, onChangeText, placeholder = 'Search restaurants, dishes...', menu = false }) {
  return (
    <View style={[styles.searchBar, menu && styles.searchBarMenu]}>
      <Ionicons name="search-outline" size={20} color="#5C5962" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={menu ? '#8E8882' : '#8E8882'}
        style={[styles.searchInput, menu && styles.searchInputMenu]}
      />
      {value ? (
        <Pressable style={styles.searchFilterButton} onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={18} color="#8E8882" />
        </Pressable>
      ) : null}
    </View>
  );
}

function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MenuQuantityControl({ quantity, onIncrease, onDecrease }) {
  return (
    <View style={styles.menuQtyControl}>
      <Pressable style={styles.menuQtyAction} onPress={onDecrease}>
        <Ionicons name="remove" size={16} color="#FFFFFF" />
      </Pressable>
      <Text style={styles.menuQtyValue}>{quantity}</Text>
      <Pressable style={styles.menuQtyAction} onPress={onIncrease}>
        <Ionicons name="add" size={16} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function CartInlineStepper({ quantity, onIncrease, onDecrease }) {
  return (
    <View style={styles.cartInlineStepper}>
      <Pressable style={styles.cartInlineAction} onPress={onDecrease}>
        <Ionicons name="remove" size={16} color="#1E1E1E" />
      </Pressable>
      <Text style={styles.cartInlineValue}>{quantity}</Text>
      <Pressable style={styles.cartInlineAction} onPress={onIncrease}>
        <Ionicons name="add" size={16} color="#1E1E1E" />
      </Pressable>
    </View>
  );
}

function TopLogoMark() {
  return (
    <Image source={Logo} resizeMode="contain" style={styles.topLogoImage} />
  );
}

function FoodImage({ uri, style, fallbackIcon = 'food' }) {
  if (uri) {
    return <Image source={{ uri }} style={style} />;
  }

  return (
    <View style={[style, styles.foodImageFallback]}>
      <MaterialCommunityIcons name={fallbackIcon} size={28} color={COLORS.orange} />
    </View>
  );
}

const RESTAURANT_IMAGE_FALLBACKS = [
  'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
];

function getRestaurantImageUrl(restaurant = {}) {
  const bannerUrl = getRestaurantBannerUrl(restaurant);
  if (bannerUrl) {
    return bannerUrl;
  }

  const seed = String(restaurant.id || restaurant.name || '')
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return RESTAURANT_IMAGE_FALLBACKS[seed % RESTAURANT_IMAGE_FALLBACKS.length];
}

function RestaurantCard({ restaurant, onPress }) {
  const imageUrl = getRestaurantImageUrl(restaurant);
  const profileImageUrl = getRestaurantProfileImageUrl(restaurant) || imageUrl;

  return (
    <Pressable style={styles.restaurantCard} onPress={onPress}>
      <View style={styles.restaurantCardCover}>
        <Image source={{ uri: imageUrl }} style={styles.restaurantCoverImage} />
        <Image source={{ uri: profileImageUrl }} style={styles.restaurantProfileThumb} />
      </View>

      <View style={styles.restaurantCardBody}>
        <Text style={styles.restaurantName} numberOfLines={2}>{restaurant.name}</Text>
        <Text style={styles.restaurantAddress} numberOfLines={2}>
          {getShortAddress(restaurant.address || restaurant.formatted_address || restaurant.description || 'Kathmandu Valley')}
        </Text>

        <View style={styles.restaurantMetaRow}>
          <View style={styles.metaPair}>
            <MaterialCommunityIcons name="star" size={14} color={COLORS.orange} />
            <Text style={styles.metaText}>{getRestaurantRating(restaurant.id)}</Text>
          </View>
          <View style={styles.metaDot} />
          <View style={styles.metaPair}>
            <MaterialCommunityIcons name="motorbike" size={15} color="#6E6761" />
            <Text style={styles.metaText}>{formatNpr(getDeliveryFee(restaurant.id))}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function FastDeliveryCard({ restaurant, onPress, minutes }) {
  return (
    <Pressable style={styles.fastDeliveryCard} onPress={onPress}>
      <FoodImage uri={getRestaurantImageUrl(restaurant)} style={styles.fastDeliveryImage} fallbackIcon="storefront" />
      <View style={styles.fastDeliveryTime}>
        <Text style={styles.fastDeliveryTimeText}>{minutes} MIN</Text>
      </View>
      <Text style={styles.fastDeliveryName} numberOfLines={1}>{restaurant.name}</Text>
    </Pressable>
  );
}

function NonFeaturedCard({ restaurant, onPress }) {
  const imageUrl = getRestaurantImageUrl(restaurant);

  return (
    <Pressable style={styles.nonFeaturedCard} onPress={onPress}>
      <View style={styles.nonFeaturedImageWrap}>
        <Image source={{ uri: imageUrl }} style={styles.nonFeaturedImage} />
      </View>

      <View style={styles.nonFeaturedBody}>
        <View style={styles.nonFeaturedTopRow}>
          <Text style={styles.nonFeaturedName} numberOfLines={1}>
            {restaurant.name}
          </Text>
        </View>

        <Text style={styles.nonFeaturedAddress} numberOfLines={1}>
          {getShortAddress(restaurant.address || restaurant.formatted_address || 'Kathmandu')}
        </Text>

        <View style={styles.nonFeaturedChips}>
          <View style={styles.nonFeaturedChip}>
            <MaterialCommunityIcons name="star" size={13} color="#111" />
            <Text style={styles.nonFeaturedChipText}>{getRestaurantRating(restaurant.id)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function MenuItemRow({ item, active = false, onPress }) {
  return (
    <Pressable style={[styles.menuItemRow, active && styles.menuItemRowActive]} onPress={onPress}>
      <View style={styles.menuItemRowText}>
        <Text style={[styles.menuItemName, active && styles.menuItemNameActive]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.menuItemPrice, active && styles.menuItemPriceActive]}>
          {formatNpr(item.price)}
        </Text>
      </View>
      <View style={[styles.menuItemIndicator, active && styles.menuItemIndicatorActive]}>
        <Ionicons name={active ? 'checkmark' : 'add'} size={14} color={active ? '#FFFFFF' : '#F8964F'} />
      </View>
    </Pressable>
  );
}

function MenuFoodCard({ item, quantity = 0, disabled = false, onAdd, onIncrease, onDecrease }) {
  return (
    <View style={styles.menuFoodCard}>
      <View style={styles.menuFoodText}>
        <View style={styles.menuFoodTitleRow}>
          <Text style={styles.menuFoodName} numberOfLines={1}>{item.name}</Text>
        </View>
        <Text style={styles.menuFoodDescription} numberOfLines={2}>
          {item.description || 'Freshly prepared with house spices.'}
        </Text>
        <Text style={styles.menuFoodPrice}>{formatNpr(item.price)}</Text>
      </View>

      <View style={styles.menuFoodActionWrap}>
        {quantity > 0 ? (
          <View style={styles.inlineStepperStatic}>
            <Pressable style={styles.inlineStepperAction} onPress={onDecrease}>
              <Ionicons name="remove" size={15} color={COLORS.ink} />
            </Pressable>
            <Text style={styles.inlineStepperValue}>{quantity}</Text>
            <Pressable style={styles.inlineStepperAction} onPress={onIncrease}>
              <Ionicons name="add" size={15} color={COLORS.ink} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.menuFoodAddButton, disabled && styles.menuFoodAddButtonDisabled]}
            onPress={onAdd}
            disabled={disabled}
            accessibilityLabel={`Add ${item.name}`}
          >
            <Ionicons name="add" size={18} color={COLORS.white} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function CartItemCard({ item, restaurantName, onIncrease, onDecrease }) {
  const deletesItem = Number(item.quantity || 0) <= 1;

  return (
    <View style={styles.cartItemCard}>
      <View style={styles.cartItemTextWrap}>
        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.cartItemRestaurantChip}>
          <Ionicons name="storefront" size={12} color={COLORS.orange} />
          <Text style={styles.cartItemRestaurant} numberOfLines={1}>{restaurantName}</Text>
        </View>
        <Text style={styles.cartItemPrice}>{formatNpr(item.price)}</Text>
      </View>
      <View style={styles.inlineStepperStatic}>
        <Pressable
          style={styles.inlineStepperAction}
          onPress={onDecrease}
          accessibilityLabel={deletesItem ? `Remove ${item.name}` : `Decrease ${item.name}`}
        >
          <Ionicons
            name="remove"
            size={15}
            color={COLORS.ink}
          />
        </Pressable>
        <Text style={styles.inlineStepperValue}>{item.quantity}</Text>
        <Pressable style={styles.inlineStepperAction} onPress={onIncrease}>
          <Ionicons name="add" size={15} color={COLORS.ink} />
        </Pressable>
      </View>
    </View>
  );
}

function BottomNav({ activeTab, onChange, bottomInset, cartCount = 0 }) {
  const getTabIcon = (tabKey, active) => {
    if (tabKey === TAB_HOME) {
      return (
        <MaterialIcons
          name="home"
          size={21}
          color={active ? '#F8964F' : '#9E9E9E'}
        />
      );
    }

    if (tabKey === TAB_PROFILE) {
      return (
        <MaterialIcons
          name="account-circle"
          size={22}
          color={active ? '#F8964F' : '#9E9E9E'}
        />
      );
    }

    if (tabKey === TAB_FAVORITES) {
      return (
        <MaterialIcons
          name={active ? 'favorite' : 'favorite-border'}
          size={21}
          color={active ? COLORS.orange : '#62606A'}
        />
      );
    }

    return (
      <MaterialIcons
        name="receipt-long"
        size={21}
        color={active ? COLORS.orange : '#62606A'}
      />
    );
  };

  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(bottomInset, 10) }]}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        const isOrdersTab = tab.key === TAB_ORDERS;

        return (
          <Pressable
            key={tab.key}
            style={styles.bottomNavItem}
            onPress={() => onChange(tab.key)}
          >
            <View style={styles.bottomNavIconWrap}>
              {getTabIcon(tab.key, active)}
              {isOrdersTab && cartCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.bottomNavLabel, active && styles.bottomNavLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function formatOrderDate(value) {
  if (!value) {
    return '--/--/----';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return '--/--/----';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsedDate);
}

function formatOrderTime(value) {
  if (!value) {
    return '--:--';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return '--:--';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(parsedDate);
}

function getOrderDisplayId(orderId) {
  if (!orderId) {
    return '------';
  }

  const compact = String(orderId).replace(/[^a-zA-Z0-9]/g, '');
  return compact.slice(0, 6);
}

function getOrderStatusLabel(order) {
  if (order?.status_label) {
    return order.status_label;
  }

  switch (order?.status) {
    case 'accepted':
      return 'Restaurant accepted';
    case 'cooking':
      return 'Cooking';
    case 'ready_for_pickup':
      return 'Ready for pickup';
    case 'picked_up':
      return 'On the way';
    case 'arrived':
      return 'Arrived';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    case 'placed':
    default:
      return 'Order placed';
  }
}

function hasAssignedRider(order) {
  return Boolean(
    order?.rider_id ||
    order?.riderId ||
    order?.rider?.id ||
    order?.assigned_rider_id ||
    order?.assignedRiderId,
  );
}

function getOrderEtaLabel(order) {
  if (!hasAssignedRider(order)) {
    return '';
  }

  if (order?.eta_label) {
    return order.eta_label;
  }

  const eta = Number(order?.estimated_arrival_minutes ?? order?.estimatedArrivalMinutes);
  if (['picked_up', 'arrived'].includes(order?.status) && Number.isFinite(eta) && eta > 0) {
    return `${eta} min`;
  }

  switch (order?.status) {
    case 'delivered':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
    default:
      return '';
  }
}

function createOptimisticOrderRecord({
  orderId,
  restaurant,
  items,
  subtotal,
  deliveryFee,
  totalAmount,
  createdAt,
  deliveryAddress,
  deliveryLocation,
  paymentStatus = 'pending',
  paymentMethod = PAYMENT_METHOD_CASH,
}) {
  return {
    id: orderId,
    restaurant_id: restaurant?.id || null,
    subtotal,
    delivery_fee: deliveryFee,
    total_amount: totalAmount,
    status: 'placed',
    status_label: 'Order placed',
    payment_status: paymentStatus,
    payment_method: paymentMethod,
    created_at: createdAt,
    delivery_address: deliveryAddress || '',
    delivery_place_id: deliveryLocation?.placeId || '',
    delivery_lat: deliveryLocation?.coordinates?.latitude ?? null,
    delivery_lng: deliveryLocation?.coordinates?.longitude ?? null,
    restaurant: restaurant
      ? {
        id: restaurant.id,
        name: restaurant.name,
        address: restaurant.address,
        image_url: restaurant.image_url,
      }
      : null,
    lineItems: (items || []).map((item) => ({
      id: `${orderId}-${item.id}`,
      item_name: item.name,
      item_price: item.price,
      quantity: item.quantity,
    })),
  };
}

function OrderHistoryCard({ order, large = false }) {
  const restaurantName = order?.restaurant?.name || 'Restaurant';
  const itemLines = order?.lineItems || [];
  const previewItem = itemLines[0];
  const etaLabel = getOrderEtaLabel(order);
  const showRoute = hasAssignedRider(order);

  return (
    <View style={[styles.orderHistoryCard, large && styles.orderHistoryCardLarge]}>
      <View style={styles.orderHistoryTopRow}>
        <FoodImage uri={order?.restaurant?.image_url} style={styles.orderHistoryImage} fallbackIcon="storefront" />

        <View style={styles.orderHistoryMeta}>
          <Text style={styles.orderHistoryRestaurant} numberOfLines={1}>
            {restaurantName}
          </Text>
          <Text style={styles.orderHistoryMetaText} numberOfLines={1}>
            {previewItem?.item_name || 'Food order'} x {previewItem?.quantity || itemLines.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}
          </Text>
          <View style={styles.orderHistoryDateRow}>
            <Text style={styles.orderHistoryStatusLine}>{getOrderStatusLabel(order)}</Text>
            {etaLabel ? <Text style={styles.orderHistoryTime}>{etaLabel}</Text> : null}
          </View>
        </View>
      </View>

      <View style={styles.orderHistorySummaryShell}>
        <View style={styles.orderHistorySummaryCard}>
          {itemLines.map((item) => (
            <Text key={item.id || `${item.item_name}-${item.quantity}`} style={styles.orderHistoryItemLine}>
              {item.item_name} x {item.quantity}
            </Text>
          ))}
          <Text style={styles.orderHistoryTotal}>Total: {formatNpr(order?.total_amount || 0)}</Text>
        </View>

        {showRoute ? (
          <RouteMapCard
            compact
            title="Route"
            order={order}
            pickupLabel={restaurantName}
            pickupAddress={order?.restaurant?.address || 'Restaurant pickup'}
            dropoffLabel="Your address"
            dropoffAddress={order?.delivery_address || 'Saved checkout address'}
          />
        ) : null}

        <View style={styles.orderHistoryFooter}>
          <Text style={styles.orderHistoryMetaText}>
            #{getOrderDisplayId(order?.id)} . {formatOrderDate(order?.created_at)} . {formatOrderTime(order?.created_at)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function buildSessionCustomerSettings(session) {
  const user = session?.user || {};
  const metadata = user.user_metadata || {};
  const phone = metadata.phone || user.phone || '';
  const fullName = metadata.full_name || phone || 'User';
  const addresses = normalizeSavedAddresses(
    metadata.saved_addresses,
    metadata.address || 'Naxal, Kathmandu',
  );
  const defaultAddressId = resolveDefaultSavedAddressId(addresses, metadata.default_address_id);
  const defaultAddress = getDefaultSavedAddress(
    addresses,
    defaultAddressId,
    metadata.address || 'Naxal, Kathmandu',
  );

  return {
    id: user.id || null,
    fullName,
    username: metadata.username || '',
    phone,
    avatarUrl: metadata.avatar_url || '',
    email: metadata.email || user.email || '',
    role: metadata.role || 'customer',
    addresses,
    defaultAddressId,
    defaultAddress,
  };
}

function createAddressDraft(address) {
  return {
    label: address?.label || '',
    address: address?.address || '',
    formattedAddress: address?.formattedAddress || address?.formatted_address || address?.address || '',
    coordinates: address?.coordinates || null,
    placeId: address?.placeId || '',
  };
}

function createLocalAddressId() {
  return `address-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function formatNativeGeocodeAddress(place = {}) {
  const parts = [
    place.name,
    place.street,
    place.district || place.city || place.subregion,
    place.region,
    place.country,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean);

  return [...new Set(parts)].join(', ');
}

async function getCurrentPositionWithFallback() {
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Could not get current GPS yet. Try again or open location settings.')), 8000);
      }),
    ]);
  } catch (positionError) {
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 5 * 60 * 1000,
      requiredAccuracy: 2000,
    });

    if (lastKnown?.coords) {
      return lastKnown;
    }

    throw positionError;
  }
}

function ProfileAddressCard({
  address,
  isDefault,
  onSetDefault,
  onEdit,
  onDelete,
  canDelete,
}) {
  const hasCoordinates = Number.isFinite(Number(address?.coordinates?.latitude))
    && Number.isFinite(Number(address?.coordinates?.longitude));

  return (
    <View style={[styles.profileAddressCard, isDefault && styles.profileAddressCardActive]}>
      <View style={styles.profileAddressCardHead}>
        <View style={styles.profileAddressCardTitleWrap}>
          <Text style={styles.profileAddressCardTitle}>{address.label}</Text>
          {isDefault ? (
            <View style={styles.profileDefaultBadge}>
              <Ionicons name="checkmark-circle" size={13} color="#F8964F" />
              <Text style={styles.profileDefaultBadgeText}>Default</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.profileAddressCardActions}>
          {!isDefault ? (
            <Pressable style={styles.profileAddressAction} onPress={onSetDefault}>
              <Ionicons name="radio-button-on-outline" size={18} color="#F8964F" />
            </Pressable>
          ) : null}
          <Pressable style={styles.profileAddressAction} onPress={onEdit}>
            <Ionicons name="create-outline" size={18} color="#1E1E1E" />
          </Pressable>
          {canDelete ? (
            <Pressable style={styles.profileAddressAction} onPress={onDelete}>
              <Ionicons name="trash-outline" size={18} color={COLORS.orange} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.profileAddressLine}>
        <Ionicons name="location" size={15} color="#8C6B56" />
        <Text style={styles.profileAddressText}>{getShortAddress(address.address)}</Text>
      </View>

    </View>
  );
}

export function DiscoveryScreen({
  session,
  supabase,
  topInset = 0,
  bottomInset = 0,
  onTemporaryLogout,
}) {
  const { height: windowHeight } = useWindowDimensions();
  const sessionCustomerSettings = useMemo(
    () => buildSessionCustomerSettings(session),
    [session],
  );
  const initialAddress = sessionCustomerSettings.defaultAddress || 'Naxal, Kathmandu';
  const [feed, setFeed] = useState([]);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(TAB_HOME);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(null);
  const [menuSelection, setMenuSelection] = useState({ itemId: null, quantity: 0 });
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHOD_CASH);
  const [esewaPayment, setEsewaPayment] = useState(null);
  const [esewaProcessing, setEsewaProcessing] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState(initialAddress);
  const [deliveryLocation, setDeliveryLocation] = useState(null);
  const [deliveryAddressMode, setDeliveryAddressMode] = useState(
    sessionCustomerSettings.addresses.length ? 'saved' : 'search',
  );
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [orderView, setOrderView] = useState(ORDER_VIEW_CURRENT);
  const [remoteOrders, setRemoteOrders] = useState([]);
  const [localOrders, setLocalOrders] = useState([]);
  const [favoriteRestaurantIds, setFavoriteRestaurantIds] = useState([]);
  const [profileSettings, setProfileSettings] = useState(sessionCustomerSettings);
  const [profileForm, setProfileForm] = useState({
    fullName: sessionCustomerSettings.fullName,
    username: sessionCustomerSettings.username || '',
    phone: sessionCustomerSettings.phone,
    avatarUrl: sessionCustomerSettings.avatarUrl || '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [addressDraft, setAddressDraft] = useState(createAddressDraft());
  const [editingAddressId, setEditingAddressId] = useState('');
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [locationSetupAddress, setLocationSetupAddress] = useState(null);
  const [locationSetupSaving, setLocationSetupSaving] = useState(false);
  const [locationSetupCompleted, setLocationSetupCompleted] = useState(false);

  const {
    restaurant: cartRestaurant,
    items: cartItems,
    groups: cartGroups,
    notice: cartNotice,
    itemCount,
    incrementItem,
    decrementItem,
    clearCart,
    dismissNotice,
    getSummary,
  } = useCart();

  useEffect(() => {
    let mounted = true;

    const loadFeed = async () => {
      setLoading(true);
      setError('');
      const { data, error: feedError } = await fetchRestaurantFeed(supabase, { limit: 60 });

      if (!mounted) {
        return;
      }

      if (feedError) {
        setError('Could not load restaurants. Please try again.');
        setFeed([]);
      } else {
        const nextFeed = data || [];
        setFeed(nextFeed);
        setSelectedRestaurantId((current) => (
          current && nextFeed.some((place) => place.id === current)
            ? current
            : null
        ));
      }
      setLoading(false);
    };

    loadFeed();
    return () => {
      mounted = false;
    };
  }, [feedRefreshKey, supabase]);

  useEffect(() => {
    return subscribeToRestaurantFeed(
      supabase,
      () => setFeedRefreshKey((current) => current + 1),
      () => {},
    );
  }, [supabase]);

  useEffect(() => {
    if (!cartNotice) {
      return undefined;
    }

    const timer = setTimeout(() => {
      dismissNotice();
    }, 2800);

    return () => clearTimeout(timer);
  }, [cartNotice, dismissNotice]);

  useEffect(() => {
    setProfileSettings(sessionCustomerSettings);
    setProfileForm({
      fullName: sessionCustomerSettings.fullName,
      username: sessionCustomerSettings.username || '',
      phone: sessionCustomerSettings.phone,
      avatarUrl: sessionCustomerSettings.avatarUrl || '',
    });
    setDeliveryAddress(sessionCustomerSettings.defaultAddress || 'Naxal, Kathmandu');
    setDeliveryLocation(
      sessionCustomerSettings.addresses.find((entry) => entry.id === sessionCustomerSettings.defaultAddressId) || null,
    );
    setDeliveryAddressMode(sessionCustomerSettings.addresses.length ? 'saved' : 'search');
  }, [sessionCustomerSettings]);

  useEffect(() => {
    let mounted = true;

    const loadProfileSettings = async () => {
      if (session?.isTemporaryAuth || !session?.user?.id) {
        return;
      }

      setProfileLoading(true);
      setProfileError('');

      const { data, error: customerSettingsError } = await fetchCustomerSettings(supabase, session.user.id);

      if (!mounted) {
        return;
      }

      if (customerSettingsError) {
        setProfileError('Could not load your profile settings right now.');
      } else if (data) {
        setProfileSettings(data);
        setProfileForm({
          fullName: data.fullName || '',
          username: data.username || '',
          phone: data.phone || '',
          avatarUrl: data.avatarUrl || '',
        });
        setDeliveryAddress(data.defaultAddress || 'Naxal, Kathmandu');
        setDeliveryLocation(data.addresses.find((entry) => entry.id === data.defaultAddressId) || null);
        setDeliveryAddressMode(data.addresses?.length ? 'saved' : 'search');
      }

      setProfileLoading(false);
    };

    loadProfileSettings();

    return () => {
      mounted = false;
    };
  }, [session?.isTemporaryAuth, session?.user?.id, supabase]);

  useEffect(() => {
    let mounted = true;

    const loadOrders = async () => {
      if (session?.isTemporaryAuth || !session?.user?.id) {
        setRemoteOrders([]);
        setOrdersLoading(false);
        setOrdersError('');
        return;
      }

      setOrdersLoading(true);
      setOrdersError('');

      const { data, error: customerOrdersError } = await fetchCustomerOrders(supabase, session.user.id, { limit: 30 });

      if (!mounted) {
        return;
      }

      if (customerOrdersError) {
        setRemoteOrders([]);
        setOrdersError(customerOrdersError.message || 'Could not load your orders right now.');
      } else {
        setRemoteOrders((data || []).map(normalizeOrderRecord).filter(Boolean));
      }

      setOrdersLoading(false);
    };

    loadOrders();

    return () => {
      mounted = false;
    };
  }, [session?.isTemporaryAuth, session?.user?.id, supabase]);

  useEffect(() => {
    if (session?.isTemporaryAuth || !session?.user?.id || !supabase) {
      return undefined;
    }

    return subscribeToCustomerOrders(supabase, session.user.id, (payload) => {
      const updated = normalizeOrderRecord(payload.new);
      if (!updated?.id) {
        return;
      }

      setRemoteOrders((current) => mergeOrderRecords(current, [updated]));
      setLocalOrders((current) => mergeOrderRecords(current, [updated]));
    });
  }, [session?.isTemporaryAuth, session?.user?.id, supabase]);

  const userMetadata = session?.user?.user_metadata || {};
  const hasStoredAddressMetadata = Boolean(
    userMetadata.default_address_id ||
    (Array.isArray(userMetadata.saved_addresses) && userMetadata.saved_addresses.length) ||
    (userMetadata.address && userMetadata.address !== 'Naxal, Kathmandu'),
  );
  const userName = profileSettings.username || profileSettings.fullName || session?.user?.phone || 'User';
  const firstName = userName.split(' ')[0] || userName;
  const homeLocationText = getShortAddress(profileSettings.defaultAddress || deliveryAddress || initialAddress || 'Kathmandu');
  const mergedOrders = useMemo(
    () => mergeOrderRecords(localOrders, remoteOrders),
    [localOrders, remoteOrders],
  );
  const currentOrders = useMemo(
    () => getCurrentOrders(mergedOrders),
    [mergedOrders],
  );
  const currentOrderPreview = currentOrders[0] || null;
  const pastOrders = useMemo(
    () => getPastOrders(mergedOrders),
    [mergedOrders],
  );
  const visibleOrders = useMemo(
    () => (orderView === ORDER_VIEW_PAST ? pastOrders : currentOrders),
    [currentOrders, orderView, pastOrders],
  );

  useEffect(() => {
    if (session?.isTemporaryAuth || !session?.user?.id || !currentOrders.length) {
      return undefined;
    }

    const timer = setInterval(async () => {
      const { data, error: customerOrdersError } = await fetchCustomerOrders(supabase, session.user.id, { limit: 30 });
      if (!customerOrdersError) {
        setRemoteOrders((current) => mergeOrderRecords(current, (data || []).map(normalizeOrderRecord).filter(Boolean)));
      }
    }, 15000);

    return () => clearInterval(timer);
  }, [currentOrders.length, session?.isTemporaryAuth, session?.user?.id, supabase]);

  const filteredRestaurants = useMemo(
    () => filterRestaurantFeed(feed, searchQuery),
    [feed, searchQuery],
  );

  useEffect(() => {
    if (!filteredRestaurants.length) {
      setSelectedRestaurantId(null);
      return;
    }

    if (selectedRestaurantId) {
      const exists = filteredRestaurants.some((place) => place.id === selectedRestaurantId);
      if (!exists) {
        setSelectedRestaurantId(null);
      }
    }
  }, [filteredRestaurants, selectedRestaurantId]);

  const selectedRestaurant = useMemo(
    () => filteredRestaurants.find((place) => place.id === selectedRestaurantId) || null,
    [filteredRestaurants, selectedRestaurantId],
  );

  const selectedMenuItems = useMemo(
    () => filterMenuItems(selectedRestaurant?.menuItems || [], searchQuery),
    [selectedRestaurant, searchQuery],
  );
  const homeFeaturedRestaurants = useMemo(
    () => filteredRestaurants.slice(0, 5),
    [filteredRestaurants],
  );
  const nonFeaturedRestaurants = useMemo(
    () => filteredRestaurants.slice(homeFeaturedRestaurants.length),
    [filteredRestaurants, homeFeaturedRestaurants.length],
  );
  const favoriteRestaurantIdSet = useMemo(
    () => new Set(favoriteRestaurantIds),
    [favoriteRestaurantIds],
  );
  const favoriteRestaurants = useMemo(
    () => feed.filter((restaurant) => favoriteRestaurantIdSet.has(restaurant.id)),
    [favoriteRestaurantIdSet, feed],
  );

  const featuredMenuItems = useMemo(
    () => selectedMenuItems.slice(0, 2),
    [selectedMenuItems],
  );
  const regularMenuItems = useMemo(
    () => selectedMenuItems.slice(2, 6),
    [selectedMenuItems],
  );
  const selectedMenuItem = useMemo(
    () => selectedMenuItems.find((item) => item.id === menuSelection.itemId) || null,
    [selectedMenuItems, menuSelection.itemId],
  );
  const selectedMenuQuantity = selectedMenuItem
    ? menuSelection.quantity
    : 0;
  const canAddFromSelectedRestaurant = true;
  const defaultAddressEntry = useMemo(
    () => profileSettings.addresses.find((entry) => entry.id === profileSettings.defaultAddressId) || null,
    [profileSettings.addresses, profileSettings.defaultAddressId],
  );
  const selectedDeliveryAddressId = useMemo(() => {
    const selected = profileSettings.addresses.find((entry) => (
      entry.address === deliveryAddress ||
      entry.formattedAddress === deliveryAddress ||
      entry.id === deliveryLocation?.id
    ));
    return selected?.id || '';
  }, [deliveryAddress, deliveryLocation?.id, profileSettings.addresses]);
  const hasSavedDeliveryAddresses = profileSettings.addresses.length > 0;
  const hasValidAddress = isValidDeliveryAddress(deliveryAddress);
  const addressHelperText = hasValidAddress
    ? 'Delivery address ready.'
    : 'Choose a saved address or search for a complete delivery address.';
  const needsFirstLocationSetup = !locationSetupCompleted && !hasStoredAddressMetadata;

  useEffect(() => {
    if (menuSelection.itemId && !selectedMenuItem) {
      setMenuSelection({ itemId: null, quantity: 0 });
    }
  }, [selectedMenuItem, menuSelection.itemId]);

  const openRestaurant = (restaurantId) => {
    setActiveTab(TAB_HOME);
    setSelectedRestaurantId(restaurantId);
    setSearchQuery('');
    setMenuSelection({ itemId: null, quantity: 0 });
  };

  const handleToggleFavoriteRestaurant = (restaurant) => {
    if (!restaurant?.id) {
      return;
    }

    setFavoriteRestaurantIds((current) => (
      current.includes(restaurant.id)
        ? current.filter((id) => id !== restaurant.id)
        : [...current, restaurant.id]
    ));
  };

  const handleSelectMenuItem = (item) => {
    if (!item) {
      return;
    }

    setMenuSelection((current) => {
      if (current.itemId === item.id && current.quantity > 0) {
        return current;
      }
      return { itemId: item.id, quantity: 1 };
    });
  };

  const handleMenuQuantityIncrease = () => {
    if (!selectedMenuItem) {
      return;
    }

    setMenuSelection((current) => {
      const currentQty = current.itemId === selectedMenuItem.id ? current.quantity : 0;
      return { itemId: selectedMenuItem.id, quantity: Math.min(currentQty + 1, 99) };
    });
  };

  const handleMenuQuantityDecrease = () => {
    if (!selectedMenuItem) {
      return;
    }

    setMenuSelection((current) => {
      const currentQty = current.itemId === selectedMenuItem.id ? current.quantity : 0;
      const nextQty = Math.max(currentQty - 1, 0);
      if (nextQty === 0) {
        return { itemId: null, quantity: 0 };
      }
      return { itemId: selectedMenuItem.id, quantity: nextQty };
    });
  };

  const handleMenuAddToCart = () => {
    if (!selectedMenuItem || !selectedRestaurant || selectedMenuQuantity < 1 || !canAddFromSelectedRestaurant) {
      return;
    }

    for (let index = 0; index < selectedMenuQuantity; index += 1) {
      incrementItem(selectedRestaurant, selectedMenuItem);
    }

    setMenuSelection({ itemId: null, quantity: 0 });
  };

  const handleLogout = async () => {
    if (session?.isTemporaryAuth) {
      onTemporaryLogout?.();
      return;
    }

    setLogoutLoading(true);
    try {
      await logout(supabase);
    } finally {
      setLogoutLoading(false);
    }
  };

  const commitProfileSettings = async (nextSettings) => {
    const resolvedAddresses = normalizeSavedAddresses(
      nextSettings.addresses,
      nextSettings.defaultAddress || deliveryAddress || initialAddress,
    );
    const resolvedDefaultAddressId = resolveDefaultSavedAddressId(
      resolvedAddresses,
      nextSettings.defaultAddressId,
    );
    const resolvedDefaultAddress = getDefaultSavedAddress(
      resolvedAddresses,
      resolvedDefaultAddressId,
      nextSettings.defaultAddress || deliveryAddress || initialAddress,
    );

    const normalizedSettings = {
      ...nextSettings,
      fullName: String(nextSettings.fullName || '').trim(),
      username: String(nextSettings.username || '').trim(),
      phone: String(nextSettings.phone || '').trim(),
      avatarUrl: String(nextSettings.avatarUrl || '').trim(),
      addresses: resolvedAddresses,
      defaultAddressId: resolvedDefaultAddressId,
      defaultAddress: resolvedDefaultAddress,
    };

    if (session?.isTemporaryAuth) {
      setProfileSettings(normalizedSettings);
      setDeliveryAddress(resolvedDefaultAddress);
      setDeliveryLocation(normalizedSettings.addresses.find((entry) => entry.id === resolvedDefaultAddressId) || null);
      return { data: normalizedSettings, error: null, temporary: true };
    }

    const { data, error: updateError } = await updateCustomerSettings(supabase, {
      fullName: normalizedSettings.fullName,
      username: normalizedSettings.username,
      phone: normalizedSettings.phone,
      avatarUrl: normalizedSettings.avatarUrl,
      addresses: normalizedSettings.addresses,
      defaultAddressId: normalizedSettings.defaultAddressId,
    });

    if (updateError) {
      return { data: null, error: updateError, temporary: false };
    }

    const updatedSettings = {
      ...normalizedSettings,
      ...data,
    };

    setProfileSettings(updatedSettings);
    const nextDefaultEntry = updatedSettings.addresses.find((entry) => entry.id === updatedSettings.defaultAddressId) || null;
    setDeliveryAddress(updatedSettings.defaultAddress || resolvedDefaultAddress);
    setDeliveryLocation(nextDefaultEntry);

    return { data: updatedSettings, error: null, temporary: false };
  };

  const handleSaveProfileDetails = async () => {
    const nextFullName = String(profileForm.fullName || '').trim();
    const nextUsername = String(profileForm.username || '').trim();
    const nextPhone = String(profileForm.phone || '').trim();
    const nextAvatarUrl = String(profileForm.avatarUrl || '').trim();

    if (!nextFullName) {
      setProfileError('Enter your full name.');
      setProfileMessage('');
      return;
    }

    if (!isValidNepalPhoneNumber(nextPhone)) {
      setProfileError('Enter a 10 digit mobile number.');
      setProfileMessage('');
      return;
    }

    setProfileSaving(true);
    setProfileError('');
    setProfileMessage('');

    const { error: saveError, temporary } = await commitProfileSettings(
      {
        ...profileSettings,
        fullName: nextFullName,
        username: nextUsername,
        phone: nextPhone,
        avatarUrl: nextAvatarUrl,
      },
    );

    if (saveError) {
      setProfileError(saveError.message || 'Could not save your details right now.');
    } else {
      setProfileForm((current) => ({
        ...current,
        fullName: nextFullName,
        username: nextUsername,
        phone: nextPhone,
        avatarUrl: nextAvatarUrl,
      }));
      setProfileMessage(
        temporary
          ? 'Temporary login mode: profile changes are saved only for this session.'
          : 'Your profile details are up to date.',
      );
    }

    setProfileSaving(false);
  };

  const handlePickProfileImage = async () => {
    setProfileError('');
    setProfileMessage('');

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setProfileError('Allow photo access to choose a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      const nextUri = asset?.uri;
      if (nextUri) {
        setProfileSaving(true);
        const imageFile = {
          uri: nextUri,
          name: asset.fileName || `avatar-${session?.user?.id || 'user'}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        };
        const { data, error: uploadError } = await uploadAvatar(supabase, session?.user?.id, imageFile);
        if (uploadError || !data?.url) {
          throw uploadError || new Error('Could not upload profile picture.');
        }

        const nextAvatarUrl = data.url;
        setProfileForm((current) => ({ ...current, avatarUrl: nextAvatarUrl }));
        setProfileSettings((current) => ({ ...current, avatarUrl: nextAvatarUrl }));
        await commitProfileSettings({
          ...profileSettings,
          avatarUrl: nextAvatarUrl,
        });
        setProfileMessage('Profile picture updated.');
      }
    } catch (pickerError) {
      setProfileError(pickerError.message || 'Could not open photos.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveAddressDraft = async () => {
    const nextLabel = String(addressDraft.label || '').trim();
    const nextAddress = normalizeDeliveryAddress(addressDraft.address, '');

    if (!nextLabel) {
      setAddressError('Add a short label for this address.');
      return;
    }

    if (!isValidDeliveryAddress(nextAddress)) {
      setAddressError('Enter a complete delivery address.');
      return;
    }

    setAddressSaving(true);
    setAddressError('');
    setProfileError('');
    setProfileMessage('');

    const baseAddresses = editingAddressId
      ? profileSettings.addresses.map((entry) => (
        entry.id === editingAddressId
          ? {
            ...entry,
            label: nextLabel,
            address: nextAddress,
            formattedAddress: addressDraft.formattedAddress || nextAddress,
            coordinates: addressDraft.coordinates || entry.coordinates || null,
            placeId: addressDraft.placeId || entry.placeId || '',
          }
          : entry
      ))
      : [
        ...profileSettings.addresses,
        {
          id: createLocalAddressId(),
          label: nextLabel,
          address: nextAddress,
          formattedAddress: addressDraft.formattedAddress || nextAddress,
          coordinates: addressDraft.coordinates || null,
          placeId: addressDraft.placeId || '',
        },
      ];

    const nextDefaultAddressId = profileSettings.defaultAddressId || baseAddresses[0]?.id || '';
    const { error: saveError, temporary } = await commitProfileSettings({
      ...profileSettings,
      addresses: baseAddresses,
      defaultAddressId: nextDefaultAddressId,
    });

    if (saveError) {
      setAddressError(saveError.message || 'Could not save this address.');
    } else {
      setAddressDraft(createAddressDraft());
      setEditingAddressId('');
      setProfileMessage(
        temporary
          ? 'Temporary login mode: address changes are saved only for this session.'
          : editingAddressId
            ? 'Address updated.'
            : 'Address added.',
      );
      const savedAddress = baseAddresses.find((entry) => entry.id === nextDefaultAddressId) || baseAddresses[0] || null;
      if (savedAddress) {
        setDeliveryAddress(savedAddress.address);
        setDeliveryLocation(savedAddress);
      }
    }

    setAddressSaving(false);
  };

  const handleEditAddress = (address) => {
    setEditingAddressId(address.id);
    setAddressDraft(createAddressDraft(address));
    setAddressError('');
    setProfileMessage('');
  };

  const handleCancelAddressEdit = () => {
    setEditingAddressId('');
    setAddressDraft(createAddressDraft());
    setAddressError('');
  };

  const handleSetDefaultAddress = async (addressId) => {
    if (!addressId || addressId === profileSettings.defaultAddressId) {
      return;
    }

    setAddressSaving(true);
    setAddressError('');
    setProfileError('');
    setProfileMessage('');

    const { error: saveError, temporary } = await commitProfileSettings({
      ...profileSettings,
      defaultAddressId: addressId,
    });

    if (saveError) {
      setAddressError(saveError.message || 'Could not update your default address.');
    } else {
      const nextDefaultEntry = profileSettings.addresses.find((entry) => entry.id === addressId) || null;
      if (nextDefaultEntry) {
        setDeliveryAddress(nextDefaultEntry.address);
        setDeliveryLocation(nextDefaultEntry);
      }
      setProfileMessage(
        temporary
          ? 'Temporary login mode: default address changed for this session.'
          : 'Default address updated.',
      );
    }

    setAddressSaving(false);
  };

  const handleDeleteAddress = async (addressId) => {
    const nextAddresses = profileSettings.addresses.filter((entry) => entry.id !== addressId);
    if (!nextAddresses.length) {
      setAddressError('Keep at least one saved address for checkout.');
      return;
    }

    setAddressSaving(true);
    setAddressError('');
    setProfileError('');
    setProfileMessage('');

    const nextDefaultAddressId = resolveDefaultSavedAddressId(
      nextAddresses,
      profileSettings.defaultAddressId === addressId ? '' : profileSettings.defaultAddressId,
    );

    const { error: saveError, temporary } = await commitProfileSettings({
      ...profileSettings,
      addresses: nextAddresses,
      defaultAddressId: nextDefaultAddressId,
    });

    if (saveError) {
      setAddressError(saveError.message || 'Could not remove this address.');
    } else {
      if (editingAddressId === addressId) {
        setEditingAddressId('');
        setAddressDraft(createAddressDraft());
      }
      setProfileMessage(
        temporary
          ? 'Temporary login mode: address removed for this session.'
          : 'Address removed.',
      );
    }

    setAddressSaving(false);
  };

  const handleSelectDeliveryAddress = (address) => {
    const nextAddress = normalizeDeliveryAddress(address?.address || address?.formattedAddress || '', '');
    setDeliveryAddress(nextAddress);
    setDeliveryLocation(address || null);

    if (checkoutMessage) {
      setCheckoutMessage('');
    }
  };

  const handleDeliveryAddressModeChange = (mode) => {
    setDeliveryAddressMode(mode);

    if (mode === 'saved' && hasSavedDeliveryAddresses && !selectedDeliveryAddressId) {
      handleSelectDeliveryAddress(defaultAddressEntry || profileSettings.addresses[0]);
    }
  };

  const checkLocationAccess = async () => {
    try {
      const [servicesEnabled, permission] = await Promise.all([
        Location.hasServicesEnabledAsync(),
        Location.getForegroundPermissionsAsync(),
      ]);

      const granted = permission.status === 'granted';
      const active = servicesEnabled && granted;
      const message = !servicesEnabled
        ? 'Turn on device location to keep delivery and checkout accurate.'
        : !granted
          ? 'Allow location access to keep delivery and checkout accurate.'
          : '';

      return { active, servicesEnabled, granted, message };
    } catch (accessError) {
      const message = accessError.message || 'Could not check location access.';
      return { active: false, servicesEnabled: false, granted: false, message };
    }
  };

  const resolveCurrentLocationAddress = async (label = 'Current location') => {
    let access = await checkLocationAccess();
    if (!access.servicesEnabled && Platform.OS === 'android' && Location.enableNetworkProviderAsync) {
      try {
        await Location.enableNetworkProviderAsync();
        access = await checkLocationAccess();
      } catch {
        throw new Error('Turn on device location to use your current address.');
      }
    }

    if (!access.servicesEnabled) {
      throw new Error('Turn on device location to use your current address.');
    }

    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error('Location permission is needed to use your current address.');
    }

    const position = await getCurrentPositionWithFallback();
    const coordinates = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    const fallbackAddress = `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;

    let resolvedAddress = null;
    try {
      resolvedAddress = await reverseGeocodeCoordinate(coordinates);
    } catch {
      resolvedAddress = null;
    }

    if (!resolvedAddress?.address) {
      try {
        const nativePlaces = await Location.reverseGeocodeAsync(coordinates);
        const nativeAddress = formatNativeGeocodeAddress(nativePlaces?.[0]);
        resolvedAddress = {
          address: nativeAddress || fallbackAddress,
          formattedAddress: nativeAddress || fallbackAddress,
          placeId: '',
          coordinates,
        };
      } catch {
        resolvedAddress = {
          address: fallbackAddress,
          formattedAddress: fallbackAddress,
          placeId: '',
          coordinates,
        };
      }
    }

    const address = normalizeDeliveryAddress(resolvedAddress.address || fallbackAddress, fallbackAddress);

    return {
      id: 'current-location',
      label,
      address,
      formattedAddress: resolvedAddress.formattedAddress || address,
      placeId: resolvedAddress.placeId || '',
      coordinates,
    };
  };

  const handleUseCurrentDeliveryLocation = async () => {
    if (locationLoading) {
      return;
    }

    setLocationLoading(true);
    setLocationError('');

    try {
      const currentLocation = await resolveCurrentLocationAddress('Current location');
      handleSelectDeliveryAddress(currentLocation);
      setDeliveryAddressMode('search');
    } catch (locationFailure) {
      const message = locationFailure.message || 'Could not access your current location.';
      setLocationError(message);
      if (activeTab === TAB_CART) {
        setCheckoutMessage(message);
      }
    } finally {
      setLocationLoading(false);
    }
  };

  const handleUseCurrentDraftLocation = async () => {
    if (locationLoading) {
      return;
    }

    setLocationLoading(true);
    setLocationError('');
    setAddressError('');

    try {
      const currentLocation = await resolveCurrentLocationAddress('Current location');
      setAddressDraft((current) => ({
        ...current,
        label: current.label || 'Current location',
        address: currentLocation.address,
        formattedAddress: currentLocation.formattedAddress,
        coordinates: currentLocation.coordinates,
        placeId: currentLocation.placeId,
      }));
    } catch (locationFailure) {
      const message = locationFailure.message || 'Could not access your current location.';
      setLocationError(message);
      setAddressError(message);
    } finally {
      setLocationLoading(false);
    }
  };

  const handleLocationSetupUseCurrent = async () => {
    if (locationLoading) {
      return;
    }

    setLocationLoading(true);
    setLocationError('');

    try {
      const currentLocation = await resolveCurrentLocationAddress('Current location');
      setDeliveryAddress(currentLocation.address);
      setDeliveryLocation(currentLocation);
      setDeliveryAddressMode('search');
      await handleConfirmDefaultLocation(currentLocation);
    } catch (locationFailure) {
      const message = locationFailure.message || 'Could not access your current location.';
      setLocationError(message);
    } finally {
      setLocationLoading(false);
    }
  };

  const handleConfirmDefaultLocation = async (addressOverride = null) => {
    const resolvedAddress = addressOverride || locationSetupAddress;
    const nextAddress = normalizeDeliveryAddress(resolvedAddress?.address || resolvedAddress?.formattedAddress || '', '');

    if (!resolvedAddress || !isValidDeliveryAddress(nextAddress)) {
      setLocationError('Choose a complete location before setting it as default.');
      return;
    }

    setLocationSetupSaving(true);
    setLocationError('');

    const nextDefaultAddress = {
      id: createLocalAddressId(),
      label: resolvedAddress.label || 'Current location',
      address: nextAddress,
      formattedAddress: resolvedAddress.formattedAddress || nextAddress,
      coordinates: resolvedAddress.coordinates || null,
      placeId: resolvedAddress.placeId || '',
    };

    const baseAddresses = hasStoredAddressMetadata
      ? [
        nextDefaultAddress,
        ...profileSettings.addresses.filter((entry) => entry.id !== nextDefaultAddress.id),
      ]
      : [nextDefaultAddress];

    const { error: saveError } = await commitProfileSettings({
      ...profileSettings,
      addresses: baseAddresses,
      defaultAddressId: nextDefaultAddress.id,
      defaultAddress: nextDefaultAddress.address,
    });

    if (saveError) {
      setLocationError(saveError.message || 'Could not save this default location.');
    } else {
      setDeliveryAddress(nextDefaultAddress.address);
      setDeliveryLocation(nextDefaultAddress);
      setDeliveryAddressMode('saved');
      setLocationSetupCompleted(true);
      setLocationSetupAddress(null);
      setProfileMessage('Default address set.');
    }

    setLocationSetupSaving(false);
  };

  const handleManualLocationSetup = () => {
    setLocationSetupCompleted(true);
    setLocationError('');
    setActiveTab(TAB_PROFILE);
    setEditingAddressId('');
    setAddressDraft(createAddressDraft());
  };

  useEffect(() => {
    let cancelled = false;

    async function syncLocationPrompt() {
      if (!needsFirstLocationSetup || locationLoading) {
        return;
      }

      await handleLocationSetupUseCurrent();
    }

    syncLocationPrompt();

    return () => {
      cancelled = true;
    };
  }, [needsFirstLocationSetup, session?.user?.id]);

  const openEsewaPayment = ({
    orderId,
    transactionUuid,
    summary,
    deliveryFee,
    optimisticOrder,
    temporary = false,
  }) => {
    const request = buildEsewaPaymentRequest({
      subtotal: summary.subtotal,
      deliveryFee,
      totalAmount: summary.total,
      transactionUuid,
      successUrl: `https://${ESEWA_SUCCESS_HOST}${ESEWA_SUCCESS_PATH}`,
      failureUrl: `https://${ESEWA_SUCCESS_HOST}${ESEWA_FAILURE_PATH}`,
    });

    setEsewaProcessing(false);
    setEsewaPayment({
      orderId,
      transactionUuid,
      temporary,
      optimisticOrder,
      request,
      html: buildEsewaAutoPostHtml(request.paymentUrl, request.fields),
    });
  };

  const finalizeSuccessfulOrder = (optimisticOrder, message) => {
    if (optimisticOrder) {
      setLocalOrders((current) => mergeOrderRecords([optimisticOrder], current));
    }
    setCheckoutMessage(message);
    clearCart();
    setOrderView(ORDER_VIEW_CURRENT);
    setActiveTab(TAB_ORDERS);
  };

  const handleEsewaFailure = async (message = 'Payment was not completed.') => {
    const currentPayment = esewaPayment;
    setEsewaPayment(null);
    setEsewaProcessing(false);

    if (currentPayment?.orderId && !currentPayment.temporary) {
      await updateOrderPaymentStatus(supabase, {
        orderId: currentPayment.orderId,
        paymentStatus: 'failed',
        paymentMethod: PAYMENT_METHOD_ESEWA,
        paymentProvider: 'esewa',
        paymentReference: currentPayment.transactionUuid,
        paymentIntentId: currentPayment.transactionUuid,
      });
    }

    setCheckoutMessage(message);
  };

  const handleEsewaSuccess = async (encodedData) => {
    const currentPayment = esewaPayment;
    if (!currentPayment || esewaProcessing) {
      return;
    }

    setEsewaProcessing(true);

    try {
      const response = decodeEsewaResponseData(encodedData);
      if (!response || !verifyEsewaResponseSignature(response)) {
        throw new Error('Could not verify eSewa payment signature.');
      }

      const paymentStatus = mapEsewaStatusToPaymentStatus(response.status);
      if (currentPayment.orderId && !currentPayment.temporary) {
        const { error: paymentError } = await updateOrderPaymentStatus(supabase, {
          orderId: currentPayment.orderId,
          paymentStatus,
          paymentMethod: PAYMENT_METHOD_ESEWA,
          paymentProvider: 'esewa',
          paymentReference: response.transaction_code || response.refId || response.ref_id || currentPayment.transactionUuid,
          paymentIntentId: response.transaction_uuid || currentPayment.transactionUuid,
          paymentAmount: response.total_amount,
          paymentCurrency: 'NPR',
          paymentMetadata: response,
        });

        if (paymentError) {
          throw paymentError;
        }
      }

      setEsewaPayment(null);
      setEsewaProcessing(false);

      if (paymentStatus === 'paid') {
        finalizeSuccessfulOrder(
          currentPayment.optimisticOrder
            ? {
              ...currentPayment.optimisticOrder,
              payment_status: 'paid',
              payment_method: PAYMENT_METHOD_ESEWA,
            }
            : null,
          'Order placed.',
        );
        return;
      }

      setCheckoutMessage('Payment was not completed. Please try again.');
    } catch (paymentError) {
      setEsewaPayment(null);
      setEsewaProcessing(false);
      setCheckoutMessage('Payment could not be verified.');
    }
  };

  const handleEsewaNavigation = (request) => {
    const nextUrl = request?.url || '';
    if (!nextUrl || esewaProcessing) {
      return true;
    }

    try {
      const parsedUrl = new URL(nextUrl);
      const isAppPaymentUrl = parsedUrl.hostname === ESEWA_SUCCESS_HOST;

      if (!isAppPaymentUrl) {
        return true;
      }

      if (parsedUrl.pathname === ESEWA_SUCCESS_PATH) {
        const encodedData = parsedUrl.searchParams.get('data');
        if (encodedData) {
          handleEsewaSuccess(encodedData);
        } else {
          handleEsewaFailure('Payment could not be verified.');
        }
        return false;
      }

      if (parsedUrl.pathname === ESEWA_FAILURE_PATH) {
        handleEsewaFailure('Payment was not completed.');
        return false;
      }
    } catch {
      return true;
    }

    return true;
  };

  const handleCheckout = async () => {
    if (!cartItems.length || !cartGroups.length || checkoutLoading) {
      return;
    }

    if (!hasValidAddress) {
      setCheckoutMessage('Please enter a complete delivery address.');
      return;
    }

    const normalizedAddress = normalizeDeliveryAddress(deliveryAddress);
    setCheckoutLoading(true);
    setCheckoutMessage('');
    const deliveryFee = cartGroups.reduce((sum, group) => sum + group.deliveryFee, 0);
    const summary = getSummary(deliveryFee);
    const isMultiRestaurantCart = cartGroups.length > 1;
    const transactionUuid = createEsewaTransactionUuid(cartGroups[0]?.restaurant?.id || 'cart');

    if (isMultiRestaurantCart && paymentMethod === PAYMENT_METHOD_ESEWA) {
      setCheckoutMessage('eSewa checkout needs one restaurant per payment. Use cash for multi-restaurant checkout.');
      setCheckoutLoading(false);
      return;
    }

    if (session?.isTemporaryAuth) {
      const createdAt = new Date().toISOString();
      const optimisticOrder = createOptimisticOrderRecord({
        orderId: `temp-${Date.now()}`,
        restaurant: isMultiRestaurantCart ? { name: `${cartGroups.length} restaurants` } : cartGroups[0].restaurant,
        items: cartItems,
        subtotal: summary.subtotal,
        deliveryFee: summary.deliveryFee,
        totalAmount: summary.total,
        createdAt,
        deliveryAddress: normalizedAddress,
        deliveryLocation: deliveryLocation || defaultAddressEntry,
        paymentStatus: 'pending',
        paymentMethod,
      });

      if (paymentMethod === PAYMENT_METHOD_ESEWA) {
        openEsewaPayment({
          orderId: optimisticOrder.id,
          transactionUuid,
          summary,
          deliveryFee,
          optimisticOrder,
          temporary: true,
        });
        setCheckoutMessage('Complete eSewa to place this order.');
        setCheckoutLoading(false);
        return;
      }

      setLocalOrders((current) => mergeOrderRecords([optimisticOrder], current));
      setCheckoutMessage(`Temporary login mode: simulated order (${summary.itemCount} items).`);
      clearCart();
      setOrderView(ORDER_VIEW_CURRENT);
      setActiveTab(TAB_ORDERS);
      setCheckoutLoading(false);
      return;
    }

    const checkoutResults = [];
    let checkoutError = null;

    for (const group of cartGroups) {
      const { data, error: groupError } = await createCheckoutOrder(supabase, {
        customerId: session?.user?.id,
        restaurantId: group.restaurant.id,
        deliveryAddress: normalizedAddress,
        deliveryLocation: deliveryLocation || defaultAddressEntry,
        deliveryFee: group.deliveryFee,
        paymentMethod,
        paymentProvider: paymentMethod === PAYMENT_METHOD_ESEWA ? 'esewa' : '',
        paymentReference: paymentMethod === PAYMENT_METHOD_ESEWA ? transactionUuid : '',
        paymentIntentId: paymentMethod === PAYMENT_METHOD_ESEWA ? transactionUuid : '',
        paymentMetadata: paymentMethod === PAYMENT_METHOD_ESEWA
          ? { gateway: 'esewa', sandbox: true, transactionUuid }
          : { checkoutGroupSize: cartGroups.length },
        cartItems: group.items,
      });

      if (groupError) {
        checkoutError = groupError;
        break;
      }

      checkoutResults.push({ ...data, restaurant: group.restaurant, items: group.items });
    }

    if (checkoutError) {
      setCheckoutMessage(checkoutError.message || 'Could not confirm your order. Please try again.');
    } else {
      const shortOrderId = checkoutResults[0]?.orderId ? String(checkoutResults[0].orderId).slice(0, 8) : '';
      const optimisticOrder = createOptimisticOrderRecord({
        orderId: checkoutResults.map((result) => result.orderId).filter(Boolean).join(', ') || `order-${Date.now()}`,
        restaurant: isMultiRestaurantCart ? { name: `${cartGroups.length} restaurants` } : cartGroups[0].restaurant,
        items: cartItems,
        subtotal: checkoutResults.reduce((sum, result) => sum + (result.subtotal || 0), 0) || cartSummary.subtotal,
        deliveryFee: checkoutResults.reduce((sum, result) => sum + (result.deliveryFee || 0), 0) || deliveryFee,
        totalAmount: checkoutResults.reduce((sum, result) => sum + (result.totalAmount || 0), 0) || cartSummary.total,
        createdAt: new Date().toISOString(),
        deliveryAddress: normalizedAddress,
        deliveryLocation: deliveryLocation || defaultAddressEntry,
        paymentStatus: 'pending',
        paymentMethod,
      });

      if (paymentMethod === PAYMENT_METHOD_ESEWA) {
        openEsewaPayment({
          orderId: checkoutResults[0]?.orderId,
          transactionUuid,
          summary,
          deliveryFee,
          optimisticOrder,
        });
        setCheckoutMessage('Complete eSewa to place this order.');
        setCheckoutLoading(false);
        return;
      }

      setLocalOrders((current) => mergeOrderRecords([optimisticOrder], current));
      setCheckoutMessage(`Order placed successfully${shortOrderId ? ` (#${shortOrderId})` : ''}.`);
      clearCart();
      setOrderView(ORDER_VIEW_CURRENT);
      setActiveTab(TAB_ORDERS);
    }

    setCheckoutLoading(false);
  };

  const cartDeliveryFee = cartGroups.reduce((sum, group) => sum + group.deliveryFee, 0);
  const cartSummary = getSummary(cartDeliveryFee);
  const isHomeTab = activeTab === TAB_HOME;
  const showRestaurantMenu = activeTab === TAB_HOME && selectedRestaurantId && selectedRestaurant;

  if (showRestaurantMenu) {
    return (
      <View style={[styles.screen, styles.menuScreen, { paddingBottom: bottomInset + 8 }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.menuScrollContent}
        >
          <View style={styles.menuHero}>
            <FoodImage
              uri={selectedRestaurant.image_url}
              style={styles.menuHeroImage}
              fallbackIcon="storefront"
            />
            <View style={[styles.menuHeroActions, { top: topInset + 16 }]}>
              <Pressable
                style={styles.menuHeroButton}
                hitSlop={10}
                onPress={() => {
                  setSelectedRestaurantId(null);
                  setSearchQuery('');
                  setMenuSelection({ itemId: null, quantity: 0 });
                }}
              >
                <Ionicons name="arrow-back" size={22} color={COLORS.ink} />
              </Pressable>
                <View style={styles.menuHeroRightActions}>
                <Pressable
                  style={styles.menuHeroButton}
                  onPress={() => handleToggleFavoriteRestaurant(selectedRestaurant)}
                  accessibilityLabel={favoriteRestaurantIdSet.has(selectedRestaurant.id) ? 'Remove favorite' : 'Save favorite'}
                >
                  <Ionicons
                    name={favoriteRestaurantIdSet.has(selectedRestaurant.id) ? 'heart' : 'heart-outline'}
                    size={21}
                    color={favoriteRestaurantIdSet.has(selectedRestaurant.id) ? COLORS.orange : COLORS.ink}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.contentFrame}>
            <View style={styles.menuRestaurantCard}>
              <View style={styles.menuRestaurantAvatar}>
                <FoodImage uri={getRestaurantBannerUrl(selectedRestaurant) || selectedRestaurant.image_url} style={styles.menuRestaurantImage} fallbackIcon="storefront" />
              </View>
              <View style={styles.menuRestaurantInfo}>
                <View style={styles.menuRestaurantTitleLine}>
                  <Text style={styles.menuRestaurantName} numberOfLines={1}>{selectedRestaurant.name}</Text>
                  <View style={styles.menuOpenBadge}>
                    <Text style={styles.menuOpenBadgeText}>Open</Text>
                  </View>
                </View>
                <View style={styles.menuRestaurantMetaRow}>
                  <MaterialCommunityIcons name="star" size={15} color={COLORS.orange} />
                  <Text style={styles.menuRestaurantMetaText}>{getRestaurantRating(selectedRestaurant.id)}</Text>
                  <Text style={styles.menuDotText}>.</Text>
                  <MaterialCommunityIcons name="motorbike" size={15} color={COLORS.muted} />
                  <Text style={styles.menuRestaurantMetaText}>{formatNpr(getDeliveryFee(selectedRestaurant.id))}</Text>
                </View>
                <Text style={styles.menuRestaurantAddress} numberOfLines={2}>
                  {selectedRestaurant.description || 'Authentic Nepali food made with fresh ingredients.'}
                </Text>
              </View>
            </View>

            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search this menu"
              menu
            />

            <Text style={styles.menuSectionTitle}>{searchQuery ? 'Search results' : 'Menu'}</Text>
            {!selectedMenuItems.length ? (
              <Text style={styles.emptyText}>No menu items match your search.</Text>
            ) : (
              <View style={styles.menuFoodList}>
                {selectedMenuItems.map((item) => {
                  const cartQuantity = cartItems.find((cartItem) => cartItem.id === item.id)?.quantity || 0;
                  const canAddItem = true;

                  return (
                    <MenuFoodCard
                      key={item.id}
                      item={item}
                      quantity={cartQuantity}
                      disabled={!canAddItem}
                      onAdd={() => incrementItem(selectedRestaurant, item)}
                      onIncrease={() => incrementItem(selectedRestaurant, item)}
                      onDecrease={() => decrementItem(selectedRestaurant, item)}
                    />
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        {cartItems.length > 0 && (
          <Pressable
            style={[styles.viewCartBar, { bottom: bottomInset + 18 }]}
            onPress={() => setActiveTab(TAB_CART)}
          >
            <View style={styles.viewCartBarInner}>
              <Text style={styles.viewCartBarText}>View Cart</Text>
              <View style={styles.viewCartBarRight}>
                <Text style={styles.viewCartBarCount}>{itemCount} items</Text>
                <View style={styles.viewCartBarDot} />
                <Text style={styles.viewCartBarTotal}>{formatNpr(cartSummary.total)}</Text>
              </View>
            </View>
          </Pressable>
        )}
      </View>
    );
  }

  const bottomNavReservedHeight = 90 + Math.max(bottomInset, 10);
  const cartViewportMinHeight = Math.max(
    windowHeight - (topInset + 50) - bottomNavReservedHeight,
    0,
  );

  return (
    <View style={[
      styles.screen,
      activeTab === TAB_CART ? styles.cartScreen : activeTab === TAB_ORDERS ? styles.ordersScreen : styles.homeScreen,
      {
        paddingTop: activeTab === TAB_CART ? topInset + 50 : topInset + 34,
        paddingBottom: activeTab === TAB_CART ? bottomInset : bottomInset + 10,
      },
    ]}>
      {cartNotice ? (
        <View style={styles.noticeBarFloating}>
          <Text style={styles.noticeText}>{cartNotice}</Text>
        </View>
      ) : null}

      {isHomeTab && (
        <>
          <ScrollView
            contentContainerStyle={styles.homeContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentFrame}>
              <View style={styles.homeTopRow}>
                <View style={styles.homeBrandLockup}>
                  <TopLogoMark />
                  <View>
                    <Text style={styles.homePageTitle}>Chito Mitho</Text>
                    <Pressable
                      style={styles.homeHeaderLocationButton}
                      onPress={handleUseCurrentDeliveryLocation}
                      accessibilityLabel="Refresh delivery location"
                    >
                      <Ionicons name="location-outline" size={12} color={COLORS.orange} />
                      <Text style={styles.homeHeaderLocationText} numberOfLines={1}>
                        {locationLoading ? 'Locating...' : homeLocationText}
                      </Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.homeActionGroup}>
                  <Pressable
                    style={styles.homeIconButton}
                    onPress={() => setActiveTab(TAB_ORDERS)}
                    accessibilityLabel="Notifications"
                  >
                    <MaterialIcons name="notifications-none" size={22} color={COLORS.ink} />
                  </Pressable>
                  <Pressable
                    style={styles.homeProfileAvatarButton}
                    onPress={() => setActiveTab(TAB_PROFILE)}
                    accessibilityLabel="Open profile"
                  >
                    {profileSettings.avatarUrl ? (
                      <Image source={{ uri: profileSettings.avatarUrl }} style={styles.homeProfileAvatarImage} />
                    ) : (
                      <Text style={styles.homeProfileAvatarLetter}>
                        {(profileSettings.fullName || profileSettings.username || 'U').charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>

              {currentOrderPreview ? (
                <Pressable style={styles.homeOrderPopup} onPress={() => setActiveTab(TAB_ORDERS)}>
                  <FoodImage
                    uri={currentOrderPreview.restaurant?.image_url}
                    style={styles.homeOrderPreviewImage}
                    fallbackIcon="storefront"
                  />
                  <View style={styles.homeOrderPreviewCopy}>
                    <Text style={styles.homeOrderPopupText} numberOfLines={1}>
                      {currentOrderPreview.restaurant?.name || 'Current order'}
                    </Text>
                    <Text style={styles.homeOrderPreviewMeta} numberOfLines={1}>
                      {getOrderStatusLabel(currentOrderPreview)} . {formatNpr(currentOrderPreview.total_amount || 0)}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={COLORS.muted} />
                </Pressable>
              ) : null}

              <View style={styles.homeGreetingBlock}>
                <Text style={styles.homeCravingTitle}>Hi {firstName}</Text>
                <Text style={styles.homeCravingSubtitle}>Find food near you</Text>
              </View>

              <SearchBar value={searchQuery} onChangeText={setSearchQuery} />

              {!!locationError ? (
                <Text style={styles.errorText}>{locationError}</Text>
              ) : null}

              <SectionHeader title="Featured restaurants" />

              {loading && <Text style={styles.helperText}>Loading restaurants...</Text>}
              {!loading && !!error && <Text style={styles.errorText}>{error}</Text>}
              {!loading && !error && !filteredRestaurants.length && (
                <Text style={styles.helperText}>No restaurants match your search.</Text>
              )}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                removeClippedSubviews={false}
                style={styles.featuredScroller}
                contentContainerStyle={styles.featuredScrollContent}
                contentOffset={{ x: 0, y: 0 }}
              >
                {homeFeaturedRestaurants.map((restaurant) => (
                  <RestaurantCard
                    key={restaurant.id}
                    restaurant={restaurant}
                    onPress={() => openRestaurant(restaurant.id)}
                  />
                ))}
              </ScrollView>

              <SectionHeader title="More restaurants" />
              {!nonFeaturedRestaurants.length ? (
                <Text style={styles.helperText}>You are seeing every matching restaurant above.</Text>
              ) : (
                <View style={styles.nonFeaturedList}>
                  {nonFeaturedRestaurants.map((restaurant) => (
                    <NonFeaturedCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      onPress={() => openRestaurant(restaurant.id)}
                    />
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          <BottomNav
            activeTab={activeTab}
            onChange={setActiveTab}
            bottomInset={bottomInset}
            cartCount={itemCount}
          />
        </>
      )}

      {activeTab === TAB_FAVORITES && (
        <>
          <ScrollView
            contentContainerStyle={styles.ordersContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentFrame}>
              <View style={styles.ordersHeader}>
                <Pressable style={styles.ordersBackButton} onPress={() => setActiveTab(TAB_HOME)}>
                  <Ionicons name="arrow-back" size={20} color="#1E1E1E" />
                </Pressable>
                <View style={styles.screenHeaderCopy}>
                  <Text style={styles.ordersTitle}>Favorites</Text>
                </View>
                <View style={styles.screenHeaderBadge}>
                  <MaterialIcons name="favorite" size={18} color={COLORS.orange} />
                </View>
              </View>

              {favoriteRestaurants.length ? (
                <View style={styles.nonFeaturedList}>
                  {favoriteRestaurants.map((restaurant) => (
                    <NonFeaturedCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      onPress={() => openRestaurant(restaurant.id)}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.ordersEmptyCard}>
                  <Text style={styles.ordersEmptyTitle}>No favorites yet</Text>
                  <Text style={styles.ordersEmptySubtitle}>Tap a heart on any restaurant.</Text>
                </View>
              )}
            </View>
          </ScrollView>
          <BottomNav
            activeTab={activeTab}
            onChange={setActiveTab}
            bottomInset={bottomInset}
            cartCount={itemCount}
          />
        </>
      )}

      {activeTab === TAB_ORDERS && (
        <>
          <ScrollView
            contentContainerStyle={styles.ordersContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentFrame}>
              <View style={styles.ordersHeader}>
                <Pressable style={styles.ordersBackButton} onPress={() => setActiveTab(TAB_HOME)}>
                  <Ionicons name="arrow-back" size={20} color="#1E1E1E" />
                </Pressable>
                <View style={styles.screenHeaderCopy}>
                  <Text style={styles.ordersTitle}>Orders</Text>
                  <Text style={styles.screenHeaderSubtitle}>
                    {currentOrderPreview ? 'Current order' : pastOrders.length ? 'Previous orders' : 'Orders'}
                  </Text>
                </View>
                <View style={styles.screenHeaderBadge}>
                  <Ionicons name="receipt-outline" size={18} color={COLORS.orange} />
                </View>
              </View>

              {ordersLoading ? (
                <Text style={styles.helperText}>Loading orders...</Text>
              ) : null}
              {!ordersLoading && !!ordersError ? (
                <Text style={styles.errorText}>{ordersError}</Text>
              ) : null}
              {!ordersLoading && !ordersError && !currentOrderPreview && !pastOrders.length ? (
                <View style={styles.ordersEmptyCard}>
                  <Text style={styles.ordersEmptyTitle}>No current order</Text>
                  <Text style={styles.ordersEmptySubtitle}>Previous orders will show here too.</Text>
                </View>
              ) : null}

              {!ordersLoading && !ordersError && currentOrderPreview ? (
                <View style={styles.ordersCurrentPanel}>
                  <OrderHistoryCard key={currentOrderPreview.id} order={currentOrderPreview} large />
                </View>
              ) : null}

              {!ordersLoading && !ordersError && !currentOrderPreview && pastOrders.length ? (
                <View style={styles.ordersList}>
                  {pastOrders.map((order) => (
                    <OrderHistoryCard key={order.id} order={order} />
                  ))}
                </View>
              ) : null}
            </View>
          </ScrollView>
          <BottomNav
            activeTab={activeTab}
            onChange={setActiveTab}
            bottomInset={bottomInset}
            cartCount={itemCount}
          />
        </>
      )}

      {activeTab === TAB_CART && (
        <>
          <ScrollView
            contentContainerStyle={styles.cartContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.contentFrame, styles.cartFrame, { minHeight: cartViewportMinHeight }]}>
              <View style={styles.cartHeader}>
                <Pressable style={styles.cartHeaderIcon} onPress={() => setActiveTab(TAB_HOME)}>
                  <Ionicons name="arrow-back" size={22} color="#1E1E1E" />
                </Pressable>
                <View style={styles.screenHeaderCopy}>
                  <Text style={styles.cartTitle}>Cart</Text>
                  <Text style={styles.screenHeaderSubtitle}>{cartSummary.itemCount} items . {formatNpr(cartSummary.subtotal)}</Text>
                </View>
                <Pressable
                  style={[
                    styles.cartHeaderIcon,
                    styles.cartHeaderDeleteIcon,
                    !cartItems.length && styles.cartHeaderDeleteIconDisabled,
                  ]}
                  onPress={clearCart}
                  disabled={!cartItems.length}
                  accessibilityLabel="Clear cart"
                >
                  <Ionicons name="trash-outline" size={18} color="#C53B33" />
                </Pressable>
              </View>

              {!cartItems.length ? (
                currentOrderPreview ? (
                  <View style={styles.cartEmptyCard}>
                    <Text style={styles.cartEmptyTitle}>Order in progress</Text>
                    <Text style={styles.cartEmptySubtitle}>
                      Your cart is empty, so your active order is shown here.
                    </Text>
                    <OrderHistoryCard order={currentOrderPreview} large />
                    <View style={styles.cartEmptyActions}>
                      <Pressable style={styles.cartBrowseButton} onPress={() => setActiveTab(TAB_ORDERS)}>
                        <Text style={styles.cartBrowseButtonText}>Track Order</Text>
                      </Pressable>
                      <Pressable style={[styles.cartBrowseButton, styles.cartBrowseButtonSecondary]} onPress={() => setActiveTab(TAB_HOME)}>
                        <Text style={[styles.cartBrowseButtonText, styles.cartBrowseButtonSecondaryText]}>Browse Food</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.cartEmptyCard}>
                    <Text style={styles.cartEmptyTitle}>Your cart is empty</Text>
                    <Text style={styles.cartEmptySubtitle}>Add items from a restaurant to start checkout.</Text>
                    <Pressable style={styles.cartBrowseButton} onPress={() => setActiveTab(TAB_HOME)}>
                      <Text style={styles.cartBrowseButtonText}>Browse Food</Text>
                    </Pressable>
                  </View>
                )
              ) : (
                <View style={styles.cartBody}>
                  <View style={styles.cartItemsList}>
                    {cartGroups.map((group) => (
                      <View key={group.restaurant.id}>
                        {group.items.map((item) => (
                          <CartItemCard
                            key={item.id}
                            item={item}
                            restaurantName={group.restaurant.name || 'Selected restaurant'}
                            onIncrease={() => incrementItem(group.restaurant, item)}
                            onDecrease={() => decrementItem(group.restaurant, item)}
                          />
                        ))}
                      </View>
                    ))}
                  </View>

                  <View style={styles.billCard}>
                    <Text style={styles.billTitle}>Bill Details</Text>

                    <View style={styles.billPanel}>
                      <View style={styles.billRow}>
                        <Text style={styles.billLabel}>Subtotal</Text>
                        <Text style={styles.billValue}>{formatNpr(cartSummary.subtotal)}</Text>
                      </View>
                      <View style={styles.billRow}>
                        <Text style={styles.billLabel}>Delivery Fee</Text>
                        <Text style={styles.billValue}>{formatNpr(cartSummary.deliveryFee)}</Text>
                      </View>
                      <View style={[styles.billRow, styles.billTotalRow]}>
                        <Text style={[styles.billLabel, styles.billLabelStrong]}>Total</Text>
                        <Text style={[styles.billValue, styles.billValueStrong]}>{formatNpr(cartSummary.total)}</Text>
                      </View>
                    </View>

                    <View style={styles.deliveryAddressBox}>
                      <View style={styles.deliveryAddressHead}>
                        <View style={styles.deliveryAddressTitleWrap}>
                          <Ionicons name="location-outline" size={18} color={COLORS.orange} />
                          <Text style={styles.deliveryAddressTitle}>Delivery address</Text>
                        </View>
                      </View>

                      {hasSavedDeliveryAddresses ? (
                        <View style={styles.deliveryModeTabs}>
                          <Pressable
                            style={[styles.deliveryModeTab, deliveryAddressMode === 'saved' && styles.deliveryModeTabActive]}
                            onPress={() => handleDeliveryAddressModeChange('saved')}
                            accessibilityLabel="Use saved address"
                          >
                            <Ionicons
                              name="bookmarks-outline"
                              size={15}
                              color={deliveryAddressMode === 'saved' ? COLORS.orange : COLORS.muted}
                            />
                            <Text style={[styles.deliveryModeText, deliveryAddressMode === 'saved' && styles.deliveryModeTextActive]}>
                              Saved
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[styles.deliveryModeTab, deliveryAddressMode === 'search' && styles.deliveryModeTabActive]}
                            onPress={() => handleDeliveryAddressModeChange('search')}
                            accessibilityLabel="Search delivery address"
                          >
                            <Ionicons
                              name="search-outline"
                              size={15}
                              color={deliveryAddressMode === 'search' ? COLORS.orange : COLORS.muted}
                            />
                            <Text style={[styles.deliveryModeText, deliveryAddressMode === 'search' && styles.deliveryModeTextActive]}>
                              Search
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}

                      {hasSavedDeliveryAddresses && deliveryAddressMode === 'saved' ? (
                        <View style={styles.savedAddressList}>
                          {profileSettings.addresses.map((address) => {
                            const selected = address.id === selectedDeliveryAddressId;

                            return (
                              <Pressable
                                key={address.id}
                                style={[styles.savedAddressRow, selected && styles.savedAddressRowActive]}
                                onPress={() => handleSelectDeliveryAddress(address)}
                              >
                                <View style={styles.savedAddressTextWrap}>
                                  <Text style={styles.savedAddressLabel} numberOfLines={1}>
                                    {address.label || 'Saved address'}
                                  </Text>
                                  <Text style={styles.savedAddressText} numberOfLines={2}>
                                    {getShortAddress(address.address)}
                                  </Text>
                                </View>
                                <Ionicons
                                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                                  size={19}
                                  color={selected ? COLORS.orange : '#C4C0BC'}
                                />
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : (
                        <View style={styles.cartAddressSearchRow}>
                          <View style={styles.cartAddressSearchPicker}>
                            <MapAddressPicker
                              compact
                              label="Search address"
                              value={deliveryAddress}
                              coordinates={(deliveryLocation || defaultAddressEntry)?.coordinates}
                              placeholder="Search delivery address"
                              onChange={(nextAddress) => {
                                setDeliveryAddress(nextAddress.address);
                                setDeliveryLocation(nextAddress);
                                if (checkoutMessage) {
                                  setCheckoutMessage('');
                                }
                              }}
                            />
                          </View>
                          <Pressable
                            style={styles.deliveryAddressIconButton}
                            onPress={handleUseCurrentDeliveryLocation}
                            disabled={locationLoading}
                            accessibilityLabel="Use current location"
                          >
                            <MaterialIcons name={locationLoading ? 'sync' : 'my-location'} size={18} color={COLORS.orange} />
                          </Pressable>
                        </View>
                      )}
                    </View>

                    {!hasValidAddress ? (
                      <Text style={styles.addressHelperText}>
                        {addressHelperText}
                      </Text>
                    ) : null}

                    <View style={styles.paymentMethodCard}>
                      <Text style={styles.paymentMethodTitle}>Payment method</Text>
                      <View style={styles.paymentMethodOptions}>
                        <Pressable
                          style={[
                            styles.paymentMethodOption,
                            paymentMethod === PAYMENT_METHOD_CASH && styles.paymentMethodOptionActive,
                          ]}
                          onPress={() => setPaymentMethod(PAYMENT_METHOD_CASH)}
                          accessibilityLabel="Pay with cash"
                        >
                          <Ionicons
                            name="cash-outline"
                            size={18}
                            color={paymentMethod === PAYMENT_METHOD_CASH ? COLORS.orange : COLORS.muted}
                          />
                          <View style={styles.paymentMethodTextWrap}>
                            <Text style={styles.paymentMethodName}>Cash</Text>
                            <Text style={styles.paymentMethodNote}>Pay on delivery</Text>
                          </View>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.paymentMethodOption,
                            paymentMethod === PAYMENT_METHOD_ESEWA && styles.paymentMethodOptionActive,
                          ]}
                          onPress={() => setPaymentMethod(PAYMENT_METHOD_ESEWA)}
                          accessibilityLabel="Pay with eSewa"
                        >
                          <Ionicons
                            name="wallet-outline"
                            size={18}
                            color={paymentMethod === PAYMENT_METHOD_ESEWA ? COLORS.orange : COLORS.muted}
                          />
                          <View style={styles.paymentMethodTextWrap}>
                            <Text style={styles.paymentMethodName}>eSewa</Text>
                            <Text style={styles.paymentMethodNote}>Digital wallet</Text>
                          </View>
                        </Pressable>
                      </View>
                    </View>

                    <Pressable
                      style={[
                        styles.checkoutButton,
                        (checkoutLoading || !hasValidAddress) && styles.checkoutButtonDisabled,
                      ]}
                      onPress={handleCheckout}
                      disabled={checkoutLoading || !hasValidAddress}
                    >
                      <View style={styles.checkoutButtonInner}>
                        <View style={styles.checkoutButtonContent}>
                          <Ionicons name="card-outline" size={18} color={COLORS.white} />
                          <Text style={styles.checkoutButtonText}>
                            {checkoutLoading
                              ? 'Placing order...'
                              : paymentMethod === PAYMENT_METHOD_ESEWA
                                ? 'Pay with eSewa'
                                : 'Pay with cash'}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                    {!!checkoutMessage && (
                      <Text style={styles.checkoutMessage}>{checkoutMessage}</Text>
                    )}
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </>
      )}

      {activeTab === TAB_PROFILE && (
        <>
          <ScrollView
            contentContainerStyle={styles.profileContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentFrame}>
              <View style={styles.profileTopBar}>
                <View style={styles.screenHeaderCopy}>
                  <Text style={styles.profileTopTitle}>Profile</Text>
                  <Text style={styles.screenHeaderSubtitle}>{profileSettings.addresses.length} saved places</Text>
                </View>
              </View>

              {profileLoading ? (
                <Text style={styles.helperText}>Loading profile settings...</Text>
              ) : null}

              {!!profileMessage ? (
                <View style={styles.profileNoticeSuccess}>
                  <Ionicons name="checkmark-circle" size={16} color="#2D6A33" />
                  <Text style={styles.profileNoticeText}>{profileMessage}</Text>
                </View>
              ) : null}

              {!!profileError ? (
                <View style={styles.profileNoticeError}>
                  <Ionicons name="alert-circle" size={16} color="#D32F2F" />
                  <Text style={[styles.profileNoticeText, styles.profileNoticeTextError]}>{profileError}</Text>
                </View>
              ) : null}

              <View style={styles.profileIdentityCard}>
                <Pressable style={styles.profileLargeAvatar} onPress={handlePickProfileImage} accessibilityLabel="Choose profile photo">
                  {profileSettings.avatarUrl ? (
                    <Image source={{ uri: profileSettings.avatarUrl }} style={styles.profileLargeAvatarImage} />
                  ) : (
                    <Text style={styles.profileLargeAvatarLetter}>
                      {(profileSettings.fullName || 'U').charAt(0).toUpperCase()}
                    </Text>
                  )}
                  <View style={styles.profileAvatarEditButton}>
                    <MaterialIcons name="edit" size={15} color={COLORS.white} />
                  </View>
                </Pressable>
                <Text style={styles.profileIdentityName}>{profileSettings.fullName || 'User'}</Text>
                {!!profileSettings.username ? (
                  <Text style={styles.profileIdentityDetail}>@{profileSettings.username}</Text>
                ) : null}
                <View style={styles.profileIdentityRow}>
                  <Ionicons name="call-outline" size={14} color="#6E6761" />
                  <Text style={styles.profileIdentityDetail}>{profileSettings.phone || 'No phone saved'}</Text>
                </View>
                <View style={styles.profileIdentityRow}>
                  <Ionicons name="mail-outline" size={14} color="#6E6761" />
                  <Text style={styles.profileIdentityDetail}>{session?.user?.email || 'No email'}</Text>
                </View>
              </View>

              <View style={styles.profileSectionCard}>
                <View style={styles.profileSectionHead}>
                  <View>
                    <Text style={styles.profileSectionTitle}>Profile</Text>
                    <Text style={styles.profileSectionNote}>Set a username and photo.</Text>
                  </View>
                  <Text style={styles.profileSyncPill}>
                    {session?.isTemporaryAuth ? 'Temp' : 'Synced'}
                  </Text>
                </View>

                <View style={styles.profileReadOnlyRow}>
                  <MaterialIcons name="badge" size={18} color={COLORS.muted} />
                  <Text style={styles.profileIdentityDetail}>{profileSettings.fullName || 'Full name'}</Text>
                </View>

                <View style={styles.profileField}>
                  <Text style={styles.profileFieldLabel}>Username</Text>
                  <TextInput
                    value={profileForm.username}
                    onChangeText={(value) => {
                      setProfileForm((current) => ({ ...current, username: value }));
                      if (profileError) {
                        setProfileError('');
                      }
                    }}
                    placeholder="Add username"
                    placeholderTextColor="#9C9691"
                    autoCapitalize="none"
                    style={styles.profileTextInput}
                  />
                </View>

                <View style={styles.profileField}>
                  <Text style={styles.profileFieldLabel}>Mobile number</Text>
                  <TextInput
                    value={profileForm.phone}
                    onChangeText={(value) => {
                      setProfileForm((current) => ({ ...current, phone: value }));
                      if (profileError) {
                        setProfileError('');
                      }
                    }}
                    placeholder="9800000000"
                    placeholderTextColor="#9C9691"
                    keyboardType="phone-pad"
                    maxLength={10}
                    style={styles.profileTextInput}
                  />
                </View>

                <Pressable
                  style={[styles.profileActionButton, profileSaving && styles.profileActionButtonDisabled]}
                  onPress={handleSaveProfileDetails}
                  disabled={profileSaving}
                >
                  <Text style={styles.profileActionButtonText}>
                    {profileSaving ? 'Saving profile...' : 'Save profile'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.profileSectionCard}>
                <View style={styles.profileSectionHead}>
                  <View>
                    <Text style={styles.profileSectionTitle}>Saved addresses</Text>
                    <Text style={styles.profileSectionNote}>Saved delivery places.</Text>
                  </View>
                  <View style={styles.profileCountChip}>
                    <Ionicons name="bookmark-outline" size={13} color={COLORS.orange} />
                    <Text style={styles.profileCountChipText}>{profileSettings.addresses.length}</Text>
                  </View>
                </View>

                <View style={styles.profileAddressList}>
                  {profileSettings.addresses.map((address) => (
                    <ProfileAddressCard
                      key={address.id}
                      address={address}
                      isDefault={address.id === profileSettings.defaultAddressId}
                      canDelete={profileSettings.addresses.length > 1}
                      onSetDefault={() => handleSetDefaultAddress(address.id)}
                      onEdit={() => handleEditAddress(address)}
                      onDelete={() => handleDeleteAddress(address.id)}
                    />
                  ))}
                </View>

                <View style={styles.profileAddressFormCard}>
                  <View style={styles.profileAddressFormHead}>
                    <Text style={styles.profileAddressFormTitle}>
                      {editingAddressId ? 'Edit address' : 'Add address'}
                    </Text>
                    {editingAddressId ? (
                      <Pressable style={styles.profileAddressReset} onPress={handleCancelAddressEdit}>
                        <Ionicons name="close" size={17} color={COLORS.ink} />
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={styles.profileField}>
                    <Text style={styles.profileFieldLabel}>Label</Text>
                    <TextInput
                      value={addressDraft.label}
                      onChangeText={(value) => {
                        setAddressDraft((current) => ({ ...current, label: value }));
                        setAddressError('');
                      }}
                      placeholder="Home, Office, Hostel..."
                      placeholderTextColor="#9C9691"
                      style={styles.profileTextInput}
                    />
                  </View>

                  <MapAddressPicker
                    label="Address"
                    value={addressDraft.address}
                    coordinates={addressDraft.coordinates}
                    placeholder="Search street, area, or landmark"
                    onChange={(nextAddress) => {
                      setAddressDraft((current) => ({
                        ...current,
                        address: nextAddress.address,
                        formattedAddress: nextAddress.formattedAddress,
                        coordinates: nextAddress.coordinates,
                        placeId: nextAddress.placeId,
                      }));
                      setAddressError('');
                    }}
                  />

                  {!!addressError ? (
                    <Text style={styles.profileInlineError}>{addressError}</Text>
                  ) : null}

                  <View style={styles.profileAddressButtonRow}>
                    {editingAddressId ? (
                      <Pressable style={[styles.profileActionButton, styles.profileSecondaryButton]} onPress={handleCancelAddressEdit}>
                        <Text style={[styles.profileActionButtonText, styles.profileSecondaryButtonText]}>Cancel</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[
                        styles.profileActionButton,
                        styles.profileAddressSaveButton,
                        addressSaving && styles.profileActionButtonDisabled,
                      ]}
                      onPress={handleSaveAddressDraft}
                      disabled={addressSaving}
                    >
                      <Text style={styles.profileActionButtonText}>
                        {addressSaving ? 'Saving address...' : editingAddressId ? 'Update address' : 'Save address'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <Pressable
                style={styles.profileLogoutRow}
                onPress={handleLogout}
                disabled={logoutLoading}
              >
                <Ionicons name="log-out-outline" size={20} color="#B3261E" />
                <Text style={styles.profileLogoutText}>
                  {logoutLoading ? 'Logging out...' : 'Logout'}
                </Text>
              </Pressable>

            </View>
          </ScrollView>
          <BottomNav
            activeTab={activeTab}
            onChange={setActiveTab}
            bottomInset={bottomInset}
            cartCount={itemCount}
          />
        </>
      )}

      <Modal
        visible={Boolean(esewaPayment)}
        animationType="slide"
        onRequestClose={() => handleEsewaFailure('eSewa payment was closed.')}
      >
        <View style={[styles.esewaModal, { paddingTop: topInset + 12, paddingBottom: bottomInset + 12 }]}>
          <View style={styles.esewaModalHeader}>
            <View>
              <Text style={styles.esewaModalTitle}>eSewa Sandbox</Text>
              <Text style={styles.esewaModalSubtitle}>
                {esewaProcessing ? 'Verifying payment...' : 'Use test ID 9806800001 and token 123456.'}
              </Text>
            </View>
            <Pressable
              style={styles.esewaModalClose}
              onPress={() => handleEsewaFailure('eSewa payment was closed.')}
              accessibilityLabel="Close eSewa payment"
            >
              <Ionicons name="close" size={22} color={COLORS.ink} />
            </Pressable>
          </View>

          {esewaPayment?.html ? (
            <WebView
              source={{ html: esewaPayment.html, baseUrl: 'https://chito-mitho.local' }}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              onShouldStartLoadWithRequest={handleEsewaNavigation}
              onNavigationStateChange={handleEsewaNavigation}
              style={styles.esewaWebView}
            />
          ) : null}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFCF9',
    paddingHorizontal: 0,
  },
  homeScreen: {
    backgroundColor: '#FFFCF9',
  },
  cartScreen: {
    backgroundColor: '#FFFCF9',
  },
  ordersScreen: {
    backgroundColor: '#FFFCF9',
  },
  contentFrame: {
    width: '100%',
    paddingHorizontal: 20,
  },
  noticeBar: {
    borderRadius: 12,
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  noticeBarFloating: {
    borderRadius: 12,
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  noticeText: {
    color: '#FFF3E8',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  homeContent: {
    paddingBottom: 120,
  },
  homeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 0,
  },
  homeBrandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    flex: 1,
  },
  homeUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexShrink: 1,
  },
  homeAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F8964F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  homeAvatarLetter: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 18,
    lineHeight: 22,
  },
  homeGreeting: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
    lineHeight: 24,
  },
  homeLocation: {
    color: '#5E5E5E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    lineHeight: 17,
  },
  homeLocationRow: {
    marginTop: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  homeBellButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  homeCravingTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
    lineHeight: 28,
    marginBottom: 14,
    maxWidth: 280,
  },
  categoryPillsScroll: {
    marginBottom: 4,
    marginHorizontal: -20,
  },
  categoryPillsContent: {
    paddingHorizontal: 20,
    gap: 14,
  },
  categoryPill: {
    alignItems: 'center',
    gap: 6,
  },
  categoryPillIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  categoryPillLabel: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 11,
    lineHeight: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    color: '#2A2A2A',
    fontFamily: 'Outfit_500Medium',
    fontSize: 15,
    paddingVertical: 9,
  },
  searchBarMenu: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInputMenu: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 0,
    color: '#8E8882',
  },
  sectionHeaderRow: {
    marginTop: 24,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    lineHeight: 18,
  },
  sectionAction: {
    color: '#F8964F',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
  },
  sectionActionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  mapReadyCard: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10,
  },
  mapReadyCardCompact: {
    marginTop: 0,
    marginBottom: 12,
    padding: 10,
  },
  mapReadyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mapReadyTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
  mapReadyBadge: {
    minHeight: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F3D7C2',
    backgroundColor: '#FFF8F2',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mapReadyBadgeText: {
    color: COLORS.orange,
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
  },
  routeLineWrap: {
    flexDirection: 'row',
    gap: 10,
  },
  routeRail: {
    width: 14,
    alignItems: 'center',
    paddingTop: 3,
    paddingBottom: 4,
  },
  routeDotStart: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: '#F8964F',
  },
  routeLine: {
    width: 1,
    flex: 1,
    minHeight: 28,
    backgroundColor: '#E4DDD7',
    marginVertical: 4,
  },
  routeDotEnd: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: '#1E1E1E',
  },
  routeTextWrap: {
    flex: 1,
    gap: 10,
  },
  routeLabel: {
    color: '#8C837C',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 11,
    lineHeight: 14,
  },
  routeAddress: {
    marginTop: 1,
    color: '#2D2B2A',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    lineHeight: 17,
  },
  featuredList: {
    gap: 12,
    marginBottom: 16,
  },
  featuredScroller: {
    marginBottom: 12,
  },
  featuredScrollContent: {
    gap: 12,
    paddingRight: 20,
    paddingVertical: 2,
  },
  restaurantCard: {
    width: 256,
    flexShrink: 0,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  restaurantCardCover: {
    height: 140,
    position: 'relative',
    backgroundColor: '#F5ECE3',
  },
  restaurantCoverImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  restaurantProfileThumb: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
  },
  restaurantCoverPattern: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F5ECE3',
  },
  restaurantCoverOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 30,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  restaurantCoverTitle: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 18,
    lineHeight: 21,
    letterSpacing: 0,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  restaurantHeartButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restaurantCardBody: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 3,
  },
  restaurantName: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    lineHeight: 17,
  },
  restaurantCategory: {
    color: '#6E6761',
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
  },
  restaurantMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#C4C0BC',
  },
  metaText: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
  },
  helperText: {
    color: '#5E5E5E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    marginBottom: 8,
  },
  nonFeaturedList: {
    gap: 8,
    marginBottom: 18,
  },
  nonFeaturedCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  nonFeaturedImageWrap: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFF8F2',
    position: 'relative',
  },
  nonFeaturedImage: {
    width: '100%',
    height: '100%',
  },
  nonFeaturedImagePattern: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFF8F2',
  },
  nonFeaturedBody: {
    flex: 1,
    justifyContent: 'space-between',
  },
  nonFeaturedTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  nonFeaturedName: {
    color: '#2A2A2A',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    lineHeight: 18,
    flex: 1,
  },
  nonFeaturedPrice: {
    color: '#F8964F',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    lineHeight: 18,
  },
  nonFeaturedAddress: {
    color: '#5E5E5E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 15,
    marginTop: 2,
  },
  nonFeaturedChips: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  nonFeaturedChip: {
    height: 22,
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: '#FFF3E8',
    borderWidth: 1,
    borderColor: '#F2DDCC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nonFeaturedChipText: {
    color: '#2E2E2E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
  },
  errorText: {
    color: '#D32F2F',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    marginBottom: 8,
  },
  bottomNav: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    minHeight: 64,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
  },
  bottomNavLabel: {
    color: '#9E9E9E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 10,
    lineHeight: 12,
  },
  bottomNavLabelActive: {
    color: '#F8964F',
  },
  bottomNavIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_700Bold',
    fontSize: 9,
    lineHeight: 11,
  },
  menuScreen: {
    backgroundColor: '#FFFFFF',
  },
  menuLayout: {
    flex: 1,
    justifyContent: 'space-between',
  },
  menuMainContent: {
    flex: 1,
    position: 'relative',
    paddingBottom: 0,
  },
  menuScrollContent: {
    paddingBottom: 80,
  },
  menuTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 0,
    gap: 10,
    marginBottom: 18,
  },
  menuBackButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuSearchWrap: {
    flex: 1,
  },
  menuRestaurantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 78,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0E8E0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  menuRestaurantAvatar: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#FFF8F2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  menuRestaurantImage: {
    width: '100%',
    height: '100%',
  },
  menuRestaurantInfo: {
    flex: 1,
  },
  menuRestaurantName: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    lineHeight: 24,
  },
  menuRestaurantAddress: {
    color: '#5E5E5E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  menuRestaurantMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  menuRestaurantRatingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  menuRestaurantRating: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    lineHeight: 18,
  },
  menuFeaturedTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    lineHeight: 18,
    marginBottom: 8,
  },
  menuRegularHeading: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    lineHeight: 18,
    marginTop: 18,
    marginBottom: 8,
  },
  menuPanel: {
    marginBottom: 4,
    gap: 0,
  },
  menuPanelContent: {
    gap: 8,
  },
  menuRegularCard: {
    marginBottom: 4,
    gap: 8,
  },
  menuRegularHint: {
    color: '#7A7773',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 8,
  },
  menuItemRow: {
    minHeight: 72,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0E8E0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
    overflow: 'hidden',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  menuItemRowActive: {
    backgroundColor: '#FFF3E8',
    borderColor: '#F8964F',
    borderWidth: 1.5,
    shadowColor: '#F8964F',
    shadowOpacity: 0.18,
    elevation: 3,
  },
  menuItemRowText: {
    flex: 1,
    gap: 4,
  },
  menuItemThumbActive: {
    backgroundColor: '#FFD9BC',
  },
  menuItemIndicator: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF0E6',
    borderWidth: 1,
    borderColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuItemIndicatorActive: {
    backgroundColor: '#F8964F',
    borderColor: '#F8964F',
  },
  menuItemThumb: {
    width: 50,
    height: 50,
    borderRadius: 10,
  },
  menuItemThumbPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#F5EEE8',
  },
  menuItemName: {
    flex: 1,
    color: '#2A2A2A',
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
  menuItemNameActive: {
    color: '#C05A10',
  },
  menuItemPrice: {
    color: '#F8964F',
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
  menuItemPriceActive: {
    color: '#C05A10',
  },
  foodPatternIcon: {
    position: 'absolute',
    opacity: 1,
  },
  menuQtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#F0E8E0',
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  menuQtyAction: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuQtyValue: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 17,
    lineHeight: 21,
    minWidth: 20,
    textAlign: 'center',
  },
  cartInlineStepper: {
    position: 'absolute',
    right: 10,
    top: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 30,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#F3E1D3',
  },
  cartInlineAction: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  cartInlineValue: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    lineHeight: 16,
  },
  emptyText: {
    color: '#666',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
  },
  cartContent: {
    flexGrow: 1,
    paddingBottom: 22,
    gap: 0,
  },
  ordersContent: {
    paddingBottom: 120,
  },
  ordersHeader: {
    position: 'relative',
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
  },
  ordersBackButton: {
    position: 'absolute',
    left: 0,
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
    lineHeight: 28,
  },
  ordersList: {
    gap: 10,
  },
  ordersEmptyCard: {
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: '#F2DFD2',
  },
  ordersEmptyTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    lineHeight: 24,
  },
  ordersEmptySubtitle: {
    marginTop: 6,
    color: '#6B625C',
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    lineHeight: 20,
  },
  orderHistoryCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: '#F0E8E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  orderHistoryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  orderHistoryLead: {
    alignItems: 'center',
    width: 30,
    paddingTop: 2,
  },
  orderHistoryAvatar: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderHistoryLeadLine: {
    width: 1,
    height: 28,
    marginTop: 4,
    backgroundColor: '#ECECEC',
  },
  orderHistoryMeta: {
    flex: 1,
    paddingTop: 1,
  },
  orderHistoryRestaurant: {
    color: '#2D2B2A',
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    lineHeight: 19,
  },
  orderHistoryMetaText: {
    marginTop: 5,
    color: '#6A6662',
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    lineHeight: 16,
  },
  orderHistoryDateRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  orderHistoryTime: {
    color: '#4A4744',
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    lineHeight: 16,
  },
  orderHistorySummaryShell: {
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    padding: 8,
    gap: 8,
  },
  orderHistorySummaryCard: {
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  orderHistoryItemLine: {
    color: '#5B5753',
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    lineHeight: 22,
  },
  orderHistoryTotal: {
    marginTop: 4,
    color: '#2B2A29',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    lineHeight: 20,
  },
  orderHistoryStatusLine: {
    color: '#2B2A29',
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    lineHeight: 21,
  },
  cartFrame: {
    flex: 1,
  },
  cartBody: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 0,
  },
  cartItemsList: {
    gap: 0,
  },
  cartHeader: {
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  cartHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    lineHeight: 24,
  },
  cartClearText: {
    color: '#F8964F',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
  },
  cartEmptyCard: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EFDCCD',
    backgroundColor: '#FFF9F3',
    padding: 16,
    gap: 8,
  },
  cartEmptyTitle: {
    color: '#2E2E2E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
  },
  cartEmptySubtitle: {
    color: '#5B5B5B',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
  },
  cartBrowseButton: {
    marginTop: 8,
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartEmptyActions: {
    gap: 10,
  },
  cartBrowseButtonSecondary: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  cartBrowseButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
  },
  cartBrowseButtonSecondaryText: {
    color: COLORS.ink,
  },
  cartItemCard: {
    minHeight: 82,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    paddingLeft: 0,
    paddingTop: 10,
    paddingBottom: 10,
    paddingRight: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    position: 'relative',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderColor: '#ECECEC',
    shadowOpacity: 0,
    elevation: 0,
  },
  cartItemImageWrap: {
    width: 56,
    height: 56,
    borderRadius: 8,
    padding: 0,
    backgroundColor: '#FFF8F2',
    borderWidth: 0,
  },
  cartItemImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#FFEBDD',
  },
  cartItemImagePlaceholder: {
    backgroundColor: '#F9E4D4',
  },
  cartItemTextWrap: {
    flex: 1,
    minHeight: 56,
    paddingTop: 1,
    paddingRight: 62,
    paddingBottom: 0,
  },
  cartItemName: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    lineHeight: 19,
    flex: 1,
  },
  cartItemRestaurantChip: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    marginTop: 4,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cartItemRestaurant: {
    color: '#65574F',
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    lineHeight: 14,
  },
  cartItemPrice: {
    color: '#DD7B34',
    fontFamily: 'Outfit_700Bold',
    fontSize: 17,
    lineHeight: 19,
    marginTop: 4,
  },
  billCard: {
    minHeight: 0,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#F0E8E0',
    shadowColor: '#D87833',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  billTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 0,
  },
  billTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  billTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 20,
    lineHeight: 24,
  },
  billItemCountChip: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#F6DECF',
  },
  billItemCount: {
    color: '#65574F',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 14,
  },
  billPanel: {
    minHeight: 94,
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 13,
    paddingVertical: 13,
    gap: 7,
    borderWidth: 1,
    borderColor: '#F6D0B3',
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  billLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  billTotalRow: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(37, 37, 37, 0.10)',
    minHeight: 34,
  },
  billLabel: {
    color: '#5E5E5E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    lineHeight: 17,
  },
  billLabelStrong: {
    color: '#252525',
    fontSize: 17,
    lineHeight: 19,
  },
  billValue: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    lineHeight: 17,
  },
  billValueStrong: {
    color: '#111111',
    fontSize: 17,
    lineHeight: 19,
  },
  checkoutButton: {
    marginTop: 14,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: '#F8964F',
    padding: 0,
    overflow: 'hidden',
    shadowColor: '#F8964F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  checkoutButtonInner: {
    flex: 1,
    borderRadius: 26,
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  checkoutButtonPattern: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8964F',
  },
  checkoutButtonDisabled: {
    opacity: 0.6,
  },
  checkoutButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_700Bold',
    fontSize: 17,
    lineHeight: 20,
  },
  checkoutButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuBottomActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuAddToCartButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F8964F',
    overflow: 'hidden',
    shadowColor: '#F8964F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  menuAddToCartInner: {
    flex: 1,
    borderRadius: 26,
    backgroundColor: '#F8964F',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuAddToCartPattern: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8964F',
  },
  menuAddToCartButtonDisabled: {
    opacity: 0.56,
  },
  menuAddToCartText: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    lineHeight: 20,
  },
  checkoutMessage: {
    marginTop: 10,
    color: '#2D6A33',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  placeholderPane: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 60,
    gap: 8,
  },
  placeholderTitle: {
    color: '#F8964F',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 32,
    textAlign: 'center',
  },
  placeholderSubtitle: {
    color: '#555',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  profileContent: {
    paddingBottom: 190,
  },
  profileHeroCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0E8E0',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  profileHeroAvatar: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#FFF8F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeroText: {
    flex: 1,
    gap: 4,
  },
  profileTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
    lineHeight: 25,
  },
  profileSubtitle: {
    color: '#6E6761',
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    lineHeight: 20,
  },
  profileNoticeSuccess: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#F1FAF1',
    borderWidth: 1,
    borderColor: '#CDE9CF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  profileNoticeError: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#F2C9C9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  profileNoticeText: {
    flex: 1,
    color: '#2D6A33',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  profileNoticeTextError: {
    color: '#C12626',
  },
  profileSummaryCard: {
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F2DFD2',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 12,
  },
  profileSummaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  profileSummaryItem: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    borderWidth: 0,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileSummaryValue: {
    flex: 1,
    color: '#2D2B2A',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    lineHeight: 16,
  },
  profileSummaryAddress: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    borderWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  profileSummaryAddressText: {
    flex: 1,
    color: '#5E5E5E',
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  profileSectionCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0E8E0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  profileSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  profileSectionTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 17,
    lineHeight: 20,
  },
  profileSectionNote: {
    color: '#6E6761',
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    lineHeight: 19,
  },
  profileCountChip: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    borderWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profileCountChipText: {
    color: '#6D5A4F',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    lineHeight: 14,
  },
  profileFullButton: {
    width: '100%',
  },
  profileDangerButton: {
    backgroundColor: '#D84A3A',
    borderColor: '#D84A3A',
  },
  profileStickyFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 12,
    elevation: 12,
  },
  profileStickyFooterInner: {
    width: '100%',
    maxWidth: 330,
    paddingHorizontal: 0,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingTop: 10,
    paddingBottom: 2,
  },
  profileSecondaryButton: {
    flex: 1,
  },
  profileAddressList: {
    gap: 8,
  },
  profileAddressCard: {
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEC',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  profileAddressCardActive: {
    backgroundColor: '#FFF8F2',
    borderColor: '#F3D7C2',
  },
  profileAddressCardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  profileAddressCardTitleWrap: {
    flex: 1,
    gap: 8,
  },
  profileAddressCardTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    lineHeight: 18,
  },
  profileDefaultBadge: {
    alignSelf: 'flex-start',
    minHeight: 24,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F6D0B3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profileDefaultBadgeText: {
    color: COLORS.orange,
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    lineHeight: 13,
  },
  profileAddressCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profileAddressAction: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  profileAddressLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  profileAddressText: {
    flex: 1,
    color: '#5E5E5E',
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  profileMapSlot: {
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#ECECEC',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profileMapSlotText: {
    color: '#6E6761',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 15,
  },
  profileAddressFormCard: {
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#ECECEC',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  profileAddressFormHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  profileAddressFormTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    lineHeight: 18,
  },
  profileAddressReset: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F2DFD2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTextareaLabel: {
    color: '#333232',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    lineHeight: 18,
    paddingLeft: 2,
  },
  profileTextareaField: {
    minHeight: 88,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEC',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileTextareaInput: {
    flex: 1,
    color: '#1E1E1E',
    fontSize: 15,
    fontFamily: 'Outfit_500Medium',
    lineHeight: 21,
  },
  profileInlineError: {
    color: '#D32F2F',
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    lineHeight: 16,
  },
  profileAddressButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileAddressSaveButton: {
    flex: 1,
  },

  // --- View Cart Bar ---
  viewCartBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#E07830',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  viewCartBarInner: {
    backgroundColor: '#F8964F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  viewCartBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewCartBarText: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
  },
  viewCartBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewCartBarCount: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
  },
  viewCartBarDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  viewCartBarTotal: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
  },

  // --- Profile Menu List ---
  profileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  profileTopTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
    lineHeight: 28,
  },
  profileSettingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIdentityCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  profileLargeAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#F8964F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  profileLargeAvatarLetter: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 28,
    lineHeight: 32,
  },
  profileIdentityName: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    lineHeight: 24,
    marginBottom: 6,
  },
  profileIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  profileIdentityDetail: {
    color: '#6E6761',
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    lineHeight: 17,
  },
  profileMenuCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  profileMenuGroupTitle: {
    color: '#6E6761',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  profileMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F0EB',
  },
  profileMenuItemLast: {
    borderBottomWidth: 0,
  },
  profileMenuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  profileMenuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileMenuItemText: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    lineHeight: 19,
  },
  profileMenuBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFF0E0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  profileMenuBadgeText: {
    color: '#F8964F',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
  },
  profileLogoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFDFDF',
    backgroundColor: '#FFF8F8',
    marginBottom: 20,
  },
  profileLogoutText: {
    color: '#D32F2F',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
  },

  // --- Reference redesign overrides ---
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  contentFrame: {
    width: '100%',
    paddingHorizontal: 18,
  },
  homeContent: {
    paddingBottom: 126,
  },
  homeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
  },
  homeLocationBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  topLogoMark: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeLocationRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  homeLocation: {
    color: COLORS.ink,
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    lineHeight: 17,
    maxWidth: 220,
  },
  homeBellButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  homeBellBadge: {
    position: 'absolute',
    top: -3,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  homeBellBadgeText: {
    color: COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 9,
  },
  homeGreeting: {
    color: COLORS.muted,
    fontFamily: 'Outfit_500Medium',
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 6,
  },
  homeCravingTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 27,
    lineHeight: 31,
    maxWidth: 270,
    marginBottom: 20,
  },
  searchBar: {
    minHeight: 52,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 18,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    paddingVertical: 8,
  },
  searchFilterButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPillsScroll: {
    marginHorizontal: -18,
    marginBottom: 6,
  },
  categoryPillsContent: {
    paddingHorizontal: 18,
    gap: 10,
  },
  categoryPill: {
    width: 58,
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  categoryPillActive: {
    borderColor: COLORS.orange,
  },
  categoryPillIcon: {
    width: 34,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  categoryPillIconActive: {
    backgroundColor: COLORS.soft,
  },
  categoryPillLabel: {
    color: COLORS.ink,
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    lineHeight: 13,
  },
  sectionHeaderRow: {
    marginTop: 24,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 16,
    lineHeight: 20,
  },
  sectionAction: {
    color: COLORS.orange,
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
  },
  restaurantCard: {
    width: 150,
    borderRadius: 8,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  restaurantCardCover: {
    height: 118,
    backgroundColor: COLORS.soft,
    position: 'relative',
  },
  restaurantCoverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  restaurantProfileThumb: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
  },
  restaurantDiscountBadge: {
    position: 'absolute',
    top: 8,
    left: 0,
    backgroundColor: COLORS.orange,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  restaurantDiscountText: {
    color: COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 10,
  },
  restaurantHeartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restaurantCardBody: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 5,
  },
  restaurantName: {
    color: COLORS.ink,
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    lineHeight: 15,
  },
  restaurantMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: '#494650',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 11,
  },
  restaurantCategory: {
    color: '#494650',
    fontFamily: 'Outfit_500Medium',
    fontSize: 11,
  },
  fastDeliveryScroller: {
    marginHorizontal: -18,
  },
  fastDeliveryScrollContent: {
    paddingHorizontal: 18,
    gap: 10,
    paddingBottom: 10,
  },
  fastDeliveryCard: {
    width: 128,
    height: 108,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.ink,
  },
  fastDeliveryImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  fastDeliveryTime: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fastDeliveryTimeText: {
    color: COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 11,
  },
  fastDeliveryName: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 7,
    color: COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 74,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingTop: 8,
  },
  bottomNavLabel: {
    color: '#62606A',
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
    lineHeight: 12,
  },
  bottomNavLabelActive: {
    color: COLORS.orange,
  },
  cartBadge: {
    position: 'absolute',
    top: -7,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  foodImageFallback: {
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  menuScreen: {
    backgroundColor: COLORS.bg,
  },
  menuScrollContent: {
    paddingBottom: 108,
  },
  menuHero: {
    height: 252,
    backgroundColor: COLORS.ink,
  },
  menuHeroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  menuHeroActions: {
    position: 'absolute',
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuHeroRightActions: {
    flexDirection: 'row',
    gap: 10,
  },
  menuHeroButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRestaurantCard: {
    marginTop: -68,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 6,
  },
  menuRestaurantAvatar: {
    width: 78,
    height: 78,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.soft,
  },
  menuRestaurantImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  menuRestaurantInfo: {
    flex: 1,
    gap: 5,
  },
  menuRestaurantTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuRestaurantName: {
    flex: 1,
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 16,
    lineHeight: 20,
  },
  menuOpenBadge: {
    borderRadius: 7,
    backgroundColor: '#E8F8E4',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  menuOpenBadgeText: {
    color: '#2F7C2F',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 10,
  },
  menuRestaurantMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  menuRestaurantMetaText: {
    color: COLORS.text,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 11,
  },
  menuDotText: {
    color: '#9C9691',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },
  menuRestaurantAddress: {
    color: '#56515A',
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    lineHeight: 16,
  },
  menuTabs: {
    paddingTop: 18,
    paddingBottom: 12,
    gap: 20,
  },
  menuTab: {
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  menuTabActive: {
    borderBottomColor: COLORS.orange,
  },
  menuTabText: {
    color: '#4E4B54',
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
  },
  menuTabTextActive: {
    color: COLORS.orange,
  },
  menuSectionTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 18,
    lineHeight: 22,
    marginBottom: 8,
  },
  menuFoodList: {
    borderRadius: 14,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  menuFoodCard: {
    minHeight: 118,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
  },
  menuFoodText: {
    flex: 1,
    paddingTop: 2,
  },
  menuFoodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuFoodName: {
    flexShrink: 1,
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
    lineHeight: 18,
  },
  menuFoodBadge: {
    borderRadius: 6,
    backgroundColor: '#FFE9DC',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  menuFoodBadgeText: {
    color: COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 9,
  },
  menuFoodDescription: {
    marginTop: 6,
    color: '#56515A',
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    lineHeight: 16,
  },
  menuFoodPrice: {
    marginTop: 8,
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
  },
  menuFoodImageWrap: {
    width: 108,
    height: 92,
    position: 'relative',
  },
  menuFoodImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    resizeMode: 'cover',
  },
  menuFoodAddButton: {
    position: 'absolute',
    right: 0,
    bottom: -6,
    minWidth: 58,
    height: 28,
    borderRadius: 7,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  menuFoodAddButtonDisabled: {
    opacity: 0.45,
  },
  menuFoodAddText: {
    color: COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },
  cartInlineStepper: {
    position: 'absolute',
    right: 0,
    bottom: -6,
    top: undefined,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: 7,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#FFD7C5',
  },
  cartInlineValue: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 13,
    minWidth: 14,
    textAlign: 'center',
  },
  viewCartBar: {
    position: 'absolute',
    left: 18,
    right: 18,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: COLORS.orange,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  viewCartBarInner: {
    backgroundColor: COLORS.orange,
    minHeight: 50,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewCartBarText: {
    color: COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 15,
  },

  cartContent: {
    flexGrow: 1,
    paddingBottom: 26,
  },
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  cartHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 18,
  },
  cartClearText: {
    color: COLORS.orange,
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
  },
  cartItemCard: {
    minHeight: 90,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: COLORS.bg,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 12,
    position: 'relative',
  },
  cartItemImageWrap: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.soft,
  },
  cartItemImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    resizeMode: 'cover',
  },
  cartItemTextWrap: {
    flex: 1,
    minHeight: 72,
    paddingRight: 92,
  },
  cartItemName: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
    lineHeight: 18,
  },
  cartItemRestaurantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  cartItemPrice: {
    marginTop: 5,
    color: COLORS.ink,
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
  },
  promoRow: {
    marginTop: 18,
    minHeight: 56,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  promoIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoRowText: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
  },
  billCard: {
    marginTop: 14,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 12,
  },
  billTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
    marginBottom: 12,
  },
  billPanel: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 12,
  },
  billLabel: {
    color: COLORS.text,
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
  },
  billValue: {
    color: COLORS.ink,
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
  },
  billTotalRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: 14,
    marginTop: 2,
  },
  billLabelStrong: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
  },
  billValueStrong: {
    color: COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 18,
  },
  deliverToTitle: {
    marginTop: 20,
    marginBottom: 10,
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
  },
  deliverToRow: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deliverToText: {
    flex: 1,
    color: COLORS.text,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
  },
  deliverToChange: {
    color: COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 11,
  },
  checkoutButton: {
    marginTop: 20,
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: COLORS.orange,
    overflow: 'hidden',
  },
  checkoutButtonInner: {
    flex: 1,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutButtonText: {
    color: COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 15,
  },
  savingsText: {
    marginTop: 18,
    textAlign: 'center',
    color: '#0D751D',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },

  ordersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    minHeight: 38,
  },
  ordersBackButton: {
    position: 'absolute',
    left: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 20,
  },
  orderHistoryCard: {
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 12,
    marginBottom: 12,
  },
  orderHistoryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orderHistoryImage: {
    width: 68,
    height: 68,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  orderHistoryRestaurant: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 15,
  },
  orderHistoryMetaText: {
    color: COLORS.muted,
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
  },
  orderHistoryStatusLine: {
    color: COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },
  orderHistorySummaryShell: {
    marginTop: 12,
    gap: 10,
  },
  orderHistorySummaryCard: {
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    padding: 10,
  },
  orderHistoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  orderReorderButton: {
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: COLORS.orange,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderReorderText: {
    color: COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },

  profileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  profileTopTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 20,
  },
  profileIdentityCard: {
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: COLORS.white,
    marginHorizontal: -18,
    marginBottom: 14,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  profilePatternHero: {
    height: 166,
    width: '100%',
    backgroundColor: COLORS.orange,
    position: 'relative',
    overflow: 'hidden',
  },
  profileLargeAvatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: COLORS.ink,
    borderWidth: 5,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -50,
    marginBottom: 10,
  },
  profileLargeAvatarLetter: {
    color: COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 34,
  },
  profileIdentityName: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 18,
    marginBottom: 4,
  },
  profileMenuCard: {
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingTop: 0,
    marginBottom: 16,
  },
  profileMenuGroupTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
    textTransform: 'none',
    letterSpacing: 0,
    marginBottom: 10,
  },
  profileMenuItem: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 0,
    paddingVertical: 6,
  },
  profileMenuItemText: {
    color: COLORS.text,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
  },
  profileLogoutRow: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 0,
    backgroundColor: '#F3F1EF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  profileLogoutText: {
    color: COLORS.text,
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
  },

  // --- Brand cleanup overrides ---
  topLogoMark: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLogoImage: {
    width: 28,
    height: 28,
  },
  homeCravingTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 28,
    lineHeight: 32,
    maxWidth: 260,
    marginBottom: 18,
  },
  restaurantCard: {
    width: 170,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  restaurantCardCover: {
    height: 126,
    backgroundColor: COLORS.soft,
  },
  restaurantHeartButton: {
    display: 'none',
  },
  nonFeaturedCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  nonFeaturedImageWrap: {
    width: 74,
    height: 74,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.soft,
  },
  nonFeaturedName: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 15,
    lineHeight: 18,
    flex: 1,
  },
  nonFeaturedPrice: {
    color: COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
  },
  nonFeaturedChip: {
    minHeight: 24,
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 72,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingTop: 8,
  },
  cartItemCard: {
    minHeight: 90,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: COLORS.bg,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 12,
    position: 'relative',
  },
  billCard: {
    marginTop: 16,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 14,
  },
  deliverToRow: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileIdentityCard: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  profileBrandLogo: {
    width: 42,
    height: 42,
    marginBottom: 12,
  },
  profileLargeAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.soft,
    borderWidth: 1,
    borderColor: '#FFDCC3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  profileLargeAvatarLetter: {
    color: COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 24,
  },
  profileLargeAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
  },
  profileMenuCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 0,
    marginBottom: 16,
  },
  profileMenuGroupTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
    marginBottom: 8,
  },
  profileLogoutRow: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  screen: {
    flex: 1,
    backgroundColor: '#FBFBFB',
  },
  contentFrame: {
    width: '100%',
    paddingHorizontal: 16,
  },
  homeContent: {
    paddingBottom: 132,
  },
  homeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  homeLocationBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  homeLocation: {
    flex: 1,
    color: COLORS.ink,
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    lineHeight: 17,
  },
  homeGreeting: {
    color: COLORS.muted,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 5,
  },
  homeCravingTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 26,
    lineHeight: 30,
    maxWidth: 280,
    marginBottom: 16,
  },
  searchBar: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    gap: 9,
    marginBottom: 14,
  },
  searchFilterButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipsScroll: {
    marginHorizontal: -16,
    marginBottom: 2,
  },
  filterChipsScrollCompact: {
    marginTop: 14,
    marginBottom: 8,
  },
  filterChipsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChipsContentCompact: {
    paddingHorizontal: 0,
    gap: 8,
  },
  filterChip: {
    minHeight: 36,
    maxWidth: 144,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChipCompact: {
    minHeight: 34,
    paddingHorizontal: 11,
  },
  filterChipActive: {
    borderColor: '#FFD0AD',
    backgroundColor: '#FFF5EC',
  },
  filterChipLabel: {
    color: '#5D5A62',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    lineHeight: 15,
  },
  filterChipLabelActive: {
    color: COLORS.orangeHot,
  },
  sectionHeaderRow: {
    marginTop: 20,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  restaurantCard: {
    width: 174,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
    shadowColor: '#1E1E1E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  restaurantCardCover: {
    height: 122,
    backgroundColor: COLORS.soft,
  },
  restaurantCardBody: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 5,
  },
  nonFeaturedCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 9,
    shadowOpacity: 0,
    elevation: 0,
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 72,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingTop: 8,
  },
  bottomNavItem: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  bottomNavLabel: {
    color: '#62606A',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 10,
    lineHeight: 12,
  },
  bottomNavLabelActive: {
    color: COLORS.orangeHot,
  },
  viewCartBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: COLORS.orange,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  viewCartBarInner: {
    backgroundColor: COLORS.orangeHot,
    minHeight: 50,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuScreen: {
    backgroundColor: '#FBFBFB',
  },
  menuScrollContent: {
    paddingBottom: 108,
  },
  menuHero: {
    height: 218,
    backgroundColor: COLORS.ink,
  },
  menuRestaurantCard: {
    marginTop: -46,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#1E1E1E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  menuRestaurantAvatar: {
    width: 68,
    height: 68,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.soft,
  },
  menuFoodList: {
    borderRadius: 12,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  menuFoodCard: {
    minHeight: 112,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
  },
  cartContent: {
    flexGrow: 1,
    paddingBottom: 122,
  },
  cartHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartItemCard: {
    minHeight: 90,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 12,
    position: 'relative',
  },
  billCard: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 14,
    shadowOpacity: 0,
    elevation: 0,
  },
  checkoutButton: {
    marginTop: 20,
    minHeight: 54,
    borderRadius: 10,
    backgroundColor: COLORS.orangeHot,
    overflow: 'hidden',
    shadowColor: COLORS.orange,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  checkoutButtonInner: {
    flex: 1,
    backgroundColor: COLORS.orangeHot,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ordersContent: {
    paddingBottom: 128,
  },
  orderHistoryCard: {
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 12,
    marginBottom: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  profileContent: {
    paddingBottom: 132,
  },
  profileIdentityCard: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  profileMenuCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 0,
    marginBottom: 14,
  },
  profileMenuItemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileLogoutRow: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  homeScreen: {
    backgroundColor: COLORS.white,
  },
  cartScreen: {
    backgroundColor: COLORS.white,
  },
  ordersScreen: {
    backgroundColor: COLORS.white,
  },
  menuScreen: {
    backgroundColor: COLORS.white,
  },
  homeContent: {
    paddingBottom: 124,
    paddingTop: 4,
  },
  homeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 26,
  },
  homeGreeting: {
    color: COLORS.muted,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    lineHeight: 19,
    marginBottom: 8,
  },
  homeCravingTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 27,
    lineHeight: 32,
    maxWidth: 290,
    marginBottom: 22,
  },
  searchBar: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 22,
  },
  searchBarMenu: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    marginTop: 18,
    marginBottom: 18,
  },
  sectionHeaderRow: {
    marginTop: 30,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  featuredScroller: {
    marginBottom: 18,
  },
  featuredScrollContent: {
    gap: 14,
    paddingRight: 20,
    paddingVertical: 4,
  },
  nonFeaturedList: {
    gap: 12,
    marginBottom: 26,
  },
  restaurantCard: {
    width: 178,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
    shadowOpacity: 0,
    elevation: 0,
  },
  restaurantCardCover: {
    height: 124,
    backgroundColor: COLORS.soft,
  },
  nonFeaturedCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  menuHero: {
    height: 208,
    backgroundColor: COLORS.ink,
  },
  menuRestaurantCard: {
    marginTop: -36,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  menuSectionTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 18,
    lineHeight: 22,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  menuFoodCard: {
    minHeight: 104,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  menuFoodText: {
    flex: 1,
    paddingTop: 0,
  },
  menuFoodActionWrap: {
    minWidth: 78,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  menuFoodAddButton: {
    position: 'relative',
    right: undefined,
    bottom: undefined,
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  inlineStepperStatic: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineStepperAction: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineStepperValue: {
    minWidth: 16,
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 13,
    textAlign: 'center',
  },
  cartContent: {
    flexGrow: 1,
    paddingBottom: 128,
  },
  cartItemCard: {
    minHeight: 78,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: COLORS.white,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
  },
  cartItemTextWrap: {
    flex: 1,
    minHeight: 0,
    paddingRight: 0,
  },
  billCard: {
    marginTop: 22,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 16,
    shadowOpacity: 0,
    elevation: 0,
  },
  deliveryAddressBox: {
    marginTop: 22,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    padding: 14,
    gap: 12,
  },
  deliveryAddressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  deliveryAddressTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deliveryAddressTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
    lineHeight: 18,
  },
  deliveryAddressStatus: {
    color: COLORS.muted,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 11,
  },
  deliveryAddressStatusReady: {
    color: COLORS.orange,
  },
  deliveryModeTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  deliveryModeTab: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deliveryModeTabActive: {
    borderColor: COLORS.orange,
    backgroundColor: COLORS.soft,
  },
  deliveryModeText: {
    color: COLORS.muted,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },
  deliveryModeTextActive: {
    color: COLORS.orange,
  },
  savedAddressList: {
    gap: 8,
  },
  savedAddressRow: {
    minHeight: 58,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  savedAddressRowActive: {
    borderColor: COLORS.orange,
    backgroundColor: COLORS.soft,
  },
  savedAddressTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  savedAddressLabel: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 13,
    lineHeight: 16,
  },
  savedAddressText: {
    marginTop: 3,
    color: COLORS.muted,
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    lineHeight: 16,
  },
  addressHelperText: {
    marginTop: 10,
    color: '#C12626',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  addressHelperTextReady: {
    color: COLORS.muted,
  },
  checkoutButton: {
    marginTop: 22,
    minHeight: 54,
    borderRadius: 10,
    backgroundColor: COLORS.orange,
    overflow: 'hidden',
    shadowOpacity: 0,
    elevation: 0,
  },
  checkoutButtonInner: {
    flex: 1,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restaurantCard: {
    width: 224,
    minHeight: 276,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
    shadowOpacity: 0,
    elevation: 0,
  },
  restaurantCardCover: {
    height: 142,
    backgroundColor: COLORS.soft,
  },
  restaurantCardBody: {
    minHeight: 134,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  restaurantName: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 16,
    lineHeight: 20,
  },
  restaurantAddress: {
    color: COLORS.muted,
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    lineHeight: 16,
  },
  restaurantMetaRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  restaurantCategory: {
    color: COLORS.text,
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    lineHeight: 15,
  },
  restaurantHeartButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    display: 'flex',
  },
  restaurantHeartButtonActive: {
    backgroundColor: COLORS.orange,
  },
  homeBellButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderViewSwitch: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  orderViewButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  orderViewButtonActive: {
    borderColor: COLORS.orange,
    backgroundColor: COLORS.soft,
  },
  orderViewButtonText: {
    color: COLORS.muted,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
  },
  orderViewButtonTextActive: {
    color: COLORS.orange,
  },
  deliveryAddressActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  inlineLocationButton: {
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD7C5',
    backgroundColor: COLORS.soft,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inlineLocationButtonText: {
    color: COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 11,
  },
  profileSyncPill: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD7C5',
    backgroundColor: COLORS.soft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    color: COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 11,
    overflow: 'hidden',
  },
  profileField: {
    gap: 7,
  },
  profileFieldLabel: {
    color: COLORS.ink,
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    lineHeight: 16,
  },
  profileTextInput: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    color: COLORS.ink,
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
  },
  profileActionButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  profileActionButtonDisabled: {
    opacity: 0.6,
  },
  profileActionButtonText: {
    color: COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
  },
  profileSecondaryButton: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  profileSecondaryButtonText: {
    color: COLORS.ink,
  },
  profileInlineLocationButton: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFD7C5',
    backgroundColor: COLORS.soft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  profileInlineLocationButtonText: {
    color: COLORS.orange,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 13,
  },
  profileSectionCard: {
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 14,
    gap: 14,
    marginBottom: 14,
  },
  profileAddressFormCard: {
    borderRadius: 10,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 12,
    gap: 12,
  },
  paymentMethodCard: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surfaceMuted,
    padding: 12,
    gap: 10,
  },
  paymentMethodTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
  },
  paymentMethodOptions: {
    gap: 8,
  },
  paymentMethodOption: {
    minHeight: 58,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentMethodOptionActive: {
    borderColor: '#FFD7C5',
    backgroundColor: COLORS.soft,
  },
  paymentMethodTextWrap: {
    flex: 1,
  },
  paymentMethodName: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
  },
  paymentMethodNote: {
    marginTop: 2,
    color: COLORS.muted,
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
  },
  esewaModal: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  esewaModalHeader: {
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  esewaModalTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 18,
  },
  esewaModalSubtitle: {
    marginTop: 3,
    color: COLORS.muted,
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
  },
  esewaModalClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  esewaWebView: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  homeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  homePageTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 23,
    lineHeight: 27,
  },
  homeTopKicker: {
    marginTop: 2,
    color: COLORS.muted,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 15,
  },
  homeActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  homeIconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeIconButtonDark: {
    borderColor: COLORS.ink,
    backgroundColor: COLORS.ink,
  },
  homeLocationCard: {
    minHeight: 62,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  homeLocationCopy: {
    flex: 1,
    minWidth: 0,
  },
  homeLocationLabel: {
    color: COLORS.muted,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 10,
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  homeLocation: {
    marginTop: 2,
    flex: 1,
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 15,
    lineHeight: 19,
  },
  homeGreeting: {
    color: COLORS.muted,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    lineHeight: 17,
    marginBottom: 4,
  },
  homeCravingTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 25,
    lineHeight: 29,
    maxWidth: 280,
    marginBottom: 14,
  },
  topLogoMark: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: '#FFF1E6',
    borderWidth: 1,
    borderColor: '#FFD7C5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLogoImage: {
    width: 29,
    height: 29,
  },
  locationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 30, 30, 0.34)',
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationModalCard: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  locationModalIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  locationModalTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 24,
    lineHeight: 29,
  },
  locationModalSubtitle: {
    marginTop: 6,
    color: COLORS.muted,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    lineHeight: 19,
  },
  locationFoundCard: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD7C5',
    backgroundColor: COLORS.soft,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  locationFoundText: {
    flex: 1,
    color: COLORS.ink,
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    lineHeight: 18,
  },
  locationErrorCard: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: '#FFF2F1',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  locationErrorText: {
    flex: 1,
    color: '#A82E2E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 17,
  },
  locationPrimaryButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: COLORS.orange,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  locationPrimaryButtonText: {
    color: COLORS.white,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 15,
  },
  locationButtonDisabled: {
    opacity: 0.62,
  },
  locationSecondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  locationSecondaryButtonText: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
  },
  locationModalActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  locationSmallButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  locationSmallButtonText: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 13,
  },
  locationTextButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  locationTextButtonText: {
    color: COLORS.muted,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 13,
  },
  ordersHeader: {
    minHeight: 50,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cartHeader: {
    minHeight: 50,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileTopBar: {
    minHeight: 50,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  screenHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  screenHeaderSubtitle: {
    marginTop: 2,
    color: COLORS.muted,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 15,
  },
  screenHeaderBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD7C5',
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersCartCard: {
    minHeight: 62,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  ordersCartTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 15,
  },
  ordersSectionLabel: {
    color: COLORS.muted,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  ordersDivider: {
    height: 1,
    backgroundColor: COLORS.line,
    marginVertical: 14,
  },
  ordersTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 23,
    lineHeight: 27,
  },
  cartTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 23,
    lineHeight: 27,
  },
  profileTopTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 23,
    lineHeight: 27,
  },
  ordersBackButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarEditButton: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.orange,
    borderWidth: 2,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileReadOnlyRow: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  homeProfileAvatarButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  homeProfileAvatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  homeProfileAvatarLetter: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 16,
  },
  homeBrandLockup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  homePageTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 18,
    lineHeight: 22,
  },
  homeHeaderLocationButton: {
    marginTop: 2,
    maxWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  homeHeaderLocationText: {
    color: COLORS.muted,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 15,
  },
  homeActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  homeIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeGreetingBlock: {
    marginTop: 20,
    marginBottom: 12,
  },
  homeCravingTitle: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 24,
    lineHeight: 29,
  },
  homeCravingSubtitle: {
    marginTop: 3,
    color: COLORS.muted,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    lineHeight: 18,
  },
  homeLocationCard: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 34,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 10,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  homeLocation: {
    color: COLORS.ink,
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    lineHeight: 17,
  },
  homeOrderPopup: {
    minHeight: 62,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE0CC',
    backgroundColor: '#FFF8F3',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  homeOrderPopupText: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
  },
  homeOrderPreviewImage: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: COLORS.soft,
  },
  homeOrderPreviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  homeOrderPreviewMeta: {
    marginTop: 2,
    color: COLORS.muted,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    lineHeight: 15,
  },
  topLogoMark: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLogoImage: {
    width: 32,
    height: 32,
  },
  restaurantCard: {
    width: 232,
    minHeight: 202,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
    shadowOpacity: 0,
    elevation: 0,
  },
  restaurantCardCover: {
    height: 94,
    backgroundColor: COLORS.soft,
  },
  restaurantCardBody: {
    minHeight: 108,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 5,
  },
  restaurantName: {
    color: COLORS.ink,
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 15,
    lineHeight: 18,
  },
  restaurantAddress: {
    color: COLORS.muted,
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    lineHeight: 15,
  },
  restaurantMetaRow: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  searchBar: {
    width: '94%',
    alignSelf: 'center',
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1.4,
    borderColor: '#D3CCC5',
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    shadowOpacity: 0,
    elevation: 0,
  },
  searchInput: {
    flex: 1,
    color: COLORS.ink,
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    paddingVertical: 8,
  },
  searchFilterButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuHeroButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restaurantCategory: {
    color: COLORS.text,
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    lineHeight: 14,
  },
  profileLogoutRow: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#FFF1F0',
    borderWidth: 1,
    borderColor: '#F1C6C2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  profileLogoutText: {
    color: '#B3261E',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 14,
  },
  cartHeaderDeleteIcon: {
    borderColor: '#F1C6C2',
    backgroundColor: '#FFF1F0',
  },
  cartHeaderDeleteIconDisabled: {
    opacity: 0.45,
  },
  cartDeleteStepperAction: {
    borderColor: '#F1C6C2',
    backgroundColor: '#FFF1F0',
  },
  deliveryAddressIconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#FFE0CC',
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartAddressSearchRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  cartAddressSearchPicker: {
    flex: 1,
    minWidth: 0,
  },
  billCard: {
    marginTop: 20,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
    gap: 18,
    shadowOpacity: 0,
    elevation: 0,
  },
  billPanel: {
    minHeight: 142,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.line,
    paddingVertical: 16,
    paddingHorizontal: 4,
    justifyContent: 'space-between',
  },
  deliveryAddressBox: {
    marginTop: 2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    padding: 14,
    gap: 12,
  },
  paymentMethodCard: {
    marginTop: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    padding: 14,
    gap: 10,
  },
  paymentMethodOptions: {
    gap: 8,
  },
  paymentMethodOption: {
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD7C5',
    backgroundColor: COLORS.soft,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ordersCurrentPanel: {
    flex: 1,
    minHeight: 0,
  },
  orderHistoryCardLarge: {
    minHeight: 0,
  },
  ordersContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  cartContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 150,
  },
  cartHeader: {
    minHeight: 50,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bottomNavLabelActive: {
    color: COLORS.orange,
  },
});
