import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  createCheckoutOrder,
  fetchCustomerOrders,
  fetchCustomerSettings,
  fetchRestaurantFeed,
  logout,
  updateCustomerSettings,
} from '@repo/api';
import { Button, Input, useCart } from '@repo/ui';
import {
  filterMenuItems,
  filterRestaurantFeed,
  formatNpr,
  getDeliveryFee,
  getDefaultSavedAddress,
  getRestaurantRating,
  hasMinDigits,
  isValidDeliveryAddress,
  normalizeDeliveryAddress,
  normalizeSavedAddresses,
  resolveDefaultSavedAddressId,
} from '@repo/utils';

const TAB_HOME = 'home';
const TAB_ORDERS = 'orders';
const TAB_CART = 'cart';
const TAB_PROFILE = 'profile';

const tabs = [
  { key: TAB_HOME, label: 'Home' },
  { key: TAB_ORDERS, label: 'Orders' },
  { key: TAB_CART, label: 'Cart' },
  { key: TAB_PROFILE, label: 'Profile' },
];

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

function SearchBar({ value, onChangeText, placeholder = 'Search', menu = false }) {
  return (
    <View style={[styles.searchBar, menu && styles.searchBarMenu]}>
      <MaterialCommunityIcons name="magnify" size={22} color="#F8964F" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={menu ? '#8E8882' : '#8E8882'}
        style={[styles.searchInput, menu && styles.searchInputMenu]}
      />
    </View>
  );
}

function SectionHeader({ title }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionActionWrap}>
        <Text style={styles.sectionAction}>Show all</Text>
        <Ionicons name="chevron-forward" size={16} color="#F8964F" />
      </View>
    </View>
  );
}

function MenuQuantityControl({ quantity, onIncrease, onDecrease }) {
  return (
    <View style={styles.menuQtyControl}>
      <View style={styles.menuQtyInner}>
        <View style={styles.menuQtyPattern} />
        <FoodPatternLayer color="rgba(214, 96, 24, 0.42)" />
        <Pressable style={styles.menuQtyAction} onPress={onDecrease}>
          <Ionicons name="remove" size={15} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.menuQtyValue}>{quantity}</Text>
        <Pressable style={styles.menuQtyAction} onPress={onIncrease}>
          <Ionicons name="add" size={16} color="#FFFFFF" />
        </Pressable>
      </View>
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

function RestaurantCard({ restaurant, onPress }) {
  const firstItem = restaurant.menu_items?.[0];

  return (
    <Pressable style={styles.restaurantCard} onPress={onPress}>
      <View style={styles.restaurantCardCover}>
        <View style={styles.restaurantCoverPattern} />
        <FoodPatternLayer color="rgba(218, 95, 22, 0.38)" />
        <Text style={styles.restaurantCoverTitle} numberOfLines={2}>
          {firstItem?.name || restaurant.name}
        </Text>
      </View>

      <View style={styles.restaurantCardBody}>
        <Text style={styles.restaurantName} numberOfLines={1}>{restaurant.name}</Text>
        <Text style={styles.restaurantCategory}>
          {firstItem?.category || 'Popular'} · {restaurant.menu_items?.length || 0} items
        </Text>

        <View style={styles.restaurantMetaRow}>
          <View style={styles.metaPair}>
            <MaterialCommunityIcons name="star" size={14} color="#111" />
            <Text style={styles.metaText}>{getRestaurantRating(restaurant.id)}</Text>
          </View>
          <View style={styles.metaPair}>
            <MaterialCommunityIcons name="motorbike" size={15} color="#111" />
            <Text style={styles.metaText}>{formatNpr(getDeliveryFee(restaurant.id))}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function NonFeaturedCard({ restaurant, onPress }) {
  const firstItem = restaurant.menu_items?.[0];
  const previewPrice = firstItem?.price || 0;

  return (
    <Pressable style={styles.nonFeaturedCard} onPress={onPress}>
      <View style={styles.nonFeaturedImageWrap}>
        {restaurant.image_url ? (
          <Image source={{ uri: restaurant.image_url }} style={styles.nonFeaturedImage} />
        ) : (
          <>
            <View style={styles.nonFeaturedImagePattern} />
            <FoodPatternLayer color="rgba(214, 96, 24, 0.34)" />
          </>
        )}
      </View>

      <View style={styles.nonFeaturedBody}>
        <View style={styles.nonFeaturedTopRow}>
          <Text style={styles.nonFeaturedName} numberOfLines={1}>
            {restaurant.name}
          </Text>
          <Text style={styles.nonFeaturedPrice}>{formatNpr(previewPrice)}</Text>
        </View>

        <Text style={styles.nonFeaturedAddress} numberOfLines={1}>
          {restaurant.address || 'Kathmandu'}
        </Text>

        <View style={styles.nonFeaturedChips}>
          <View style={styles.nonFeaturedChip}>
            <MaterialCommunityIcons name="star" size={13} color="#111" />
            <Text style={styles.nonFeaturedChipText}>{getRestaurantRating(restaurant.id)}</Text>
          </View>
          <View style={styles.nonFeaturedChip}>
            <MaterialCommunityIcons name="silverware-fork-knife" size={13} color="#111" />
            <Text style={styles.nonFeaturedChipText}>
              {firstItem?.category || 'Popular'}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function MenuItemRow({ item, active = false, onPress }) {
  return (
    <Pressable style={[styles.menuItemRow, active && styles.menuItemRowActive]} onPress={onPress}>
      {active ? (
        <>
          <View style={styles.menuItemRowPattern} />
          <FoodPatternLayer color="rgba(214, 96, 24, 0.4)" />
        </>
      ) : null}
      <View style={styles.menuItemRowInner}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.menuItemThumb} />
        ) : (
          <View style={styles.menuItemThumbPlaceholder} />
        )}
        <Text style={[styles.menuItemName, active && styles.menuItemNameActive]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.menuItemPrice, active && styles.menuItemPriceActive]}>{formatNpr(item.price)}</Text>
      </View>
    </Pressable>
  );
}

function CartItemCard({ item, restaurantName, onIncrease, onDecrease }) {
  return (
    <View style={styles.cartItemCard}>
      <View style={styles.cartItemImageWrap}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.cartItemImage} />
        ) : (
          <View style={[styles.cartItemImage, styles.cartItemImagePlaceholder]} />
        )}
      </View>
      <View style={styles.cartItemTextWrap}>
        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.cartItemRestaurantChip}>
          <Ionicons name="storefront" size={12} color="#D67D3B" />
          <Text style={styles.cartItemRestaurant} numberOfLines={1}>{restaurantName}</Text>
        </View>
        <Text style={styles.cartItemPrice}>{formatNpr(item.price)}</Text>
      </View>
      <CartInlineStepper
        quantity={item.quantity}
        onIncrease={onIncrease}
        onDecrease={onDecrease}
      />
    </View>
  );
}

function BottomNav({ activeTab, onChange, bottomInset, cartCount = 0 }) {
  const getTabIcon = (tabKey, active) => {
    if (tabKey === TAB_HOME) {
      return (
        <MaterialCommunityIcons
          name="home-variant"
          size={24}
          color={active ? '#F8964F' : '#5E5E5E'}
        />
      );
    }

    if (tabKey === TAB_CART) {
      return (
        <MaterialCommunityIcons
          name="cart"
          size={23}
          color={active ? '#F8964F' : '#5E5E5E'}
        />
      );
    }

    if (tabKey === TAB_PROFILE) {
      return (
        <MaterialCommunityIcons
          name="account-circle"
          size={24}
          color={active ? '#F8964F' : '#5E5E5E'}
        />
      );
    }

    return (
      <MaterialCommunityIcons
        name="clipboard-list"
        size={23}
        color={active ? '#F8964F' : '#5E5E5E'}
      />
    );
  };

  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(bottomInset, 8) }]}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        const isCartTab = tab.key === TAB_CART;

        return (
          <Pressable
            key={tab.key}
            style={styles.bottomNavItem}
            onPress={() => onChange(tab.key)}
          >
            <View style={styles.bottomNavIconWrap}>
              {getTabIcon(tab.key, active)}
              {isCartTab && cartCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function PlaceholderPane({ title, subtitle }) {
  return (
    <View style={styles.placeholderPane}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderSubtitle}>{subtitle}</Text>
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

function getOrderEtaLabel(order) {
  if (order?.eta_label) {
    return order.eta_label;
  }

  switch (order?.status) {
    case 'accepted':
    case 'cooking':
      return '25 minutes';
    case 'ready_for_pickup':
      return '15 minutes';
    case 'picked_up':
    case 'arrived':
      return '10 minutes';
    case 'delivered':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'placed':
    default:
      return '20 minutes';
  }
}

function normalizeOrderRecord(order) {
  if (!order) {
    return null;
  }

  return {
    ...order,
    order_items: Array.isArray(order.order_items) ? order.order_items : [],
  };
}

function mergeOrderRecords(primaryOrders = [], secondaryOrders = []) {
  const merged = new Map();

  [...primaryOrders, ...secondaryOrders].forEach((order) => {
    const normalizedOrder = normalizeOrderRecord(order);
    if (!normalizedOrder?.id) {
      return;
    }

    if (!merged.has(normalizedOrder.id)) {
      merged.set(normalizedOrder.id, normalizedOrder);
      return;
    }

    const current = merged.get(normalizedOrder.id);
    merged.set(normalizedOrder.id, {
      ...current,
      ...normalizedOrder,
      food_place: normalizedOrder.food_place || current.food_place,
      order_items: normalizedOrder.order_items?.length ? normalizedOrder.order_items : current.order_items,
    });
  });

  return Array.from(merged.values()).sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime();
    const rightTime = new Date(right.created_at || 0).getTime();
    return rightTime - leftTime;
  });
}

function createOptimisticOrderRecord({
  orderId,
  restaurant,
  items,
  subtotal,
  deliveryFee,
  totalAmount,
  createdAt,
}) {
  return {
    id: orderId,
    food_place_id: restaurant?.id || null,
    subtotal,
    delivery_fee: deliveryFee,
    total_amount: totalAmount,
    status: 'placed',
    status_label: 'Rider found',
    eta_label: '20 minutes',
    created_at: createdAt,
    food_place: restaurant
      ? {
        id: restaurant.id,
        name: restaurant.name,
        address: restaurant.address,
        image_url: restaurant.image_url,
      }
      : null,
    order_items: (items || []).map((item) => ({
      id: `${orderId}-${item.id}`,
      item_name: item.name,
      item_price: item.price,
      quantity: item.quantity,
    })),
  };
}

function OrderHistoryCard({ order }) {
  const restaurantName = order?.food_place?.name || 'Restaurant';
  const itemLines = order?.order_items || [];

  return (
    <View style={styles.orderHistoryCard}>
      <View style={styles.orderHistoryTopRow}>
        <View style={styles.orderHistoryLead}>
          <View style={styles.orderHistoryAvatar}>
            <MaterialCommunityIcons name="chef-hat" size={20} color="#8D867E" />
          </View>
          <View style={styles.orderHistoryLeadLine} />
        </View>

        <View style={styles.orderHistoryMeta}>
          <Text style={styles.orderHistoryRestaurant} numberOfLines={1}>
            {restaurantName}
          </Text>
          <Text style={styles.orderHistoryMetaText}>
            Order id: {getOrderDisplayId(order?.id)}
          </Text>
          <View style={styles.orderHistoryDateRow}>
            <Text style={styles.orderHistoryMetaText}>{formatOrderDate(order?.created_at)}</Text>
            <Text style={styles.orderHistoryTime}>{formatOrderTime(order?.created_at)}</Text>
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

        <View style={styles.orderHistorySummaryCard}>
          <Text style={styles.orderHistoryStatusLine}>ETA: {getOrderEtaLabel(order)}</Text>
          <Text style={styles.orderHistoryStatusLine}>Status: {getOrderStatusLabel(order)}</Text>
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
    phone,
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
  };
}

function createLocalAddressId() {
  return `address-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function ProfileAddressCard({
  address,
  isDefault,
  onSetDefault,
  onEdit,
  onDelete,
  canDelete,
}) {
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
              <Ionicons name="trash-outline" size={18} color="#D66018" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.profileAddressLine}>
        <Ionicons name="location" size={15} color="#8C6B56" />
        <Text style={styles.profileAddressText}>{address.address}</Text>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(TAB_HOME);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(null);
  const [menuSelection, setMenuSelection] = useState({ itemId: null, quantity: 0 });
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState(initialAddress);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [remoteOrders, setRemoteOrders] = useState([]);
  const [localOrders, setLocalOrders] = useState([]);
  const [profileSettings, setProfileSettings] = useState(sessionCustomerSettings);
  const [profileForm, setProfileForm] = useState({
    fullName: sessionCustomerSettings.fullName,
    phone: sessionCustomerSettings.phone,
    password: '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [addressDraft, setAddressDraft] = useState(createAddressDraft());
  const [editingAddressId, setEditingAddressId] = useState('');
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState('');

  const {
    restaurant: cartRestaurant,
    items: cartItems,
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
      phone: sessionCustomerSettings.phone,
      password: '',
    });
    setDeliveryAddress(sessionCustomerSettings.defaultAddress || 'Naxal, Kathmandu');
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
          phone: data.phone || '',
          password: '',
        });
        setDeliveryAddress(data.defaultAddress || 'Naxal, Kathmandu');
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
      if (activeTab !== TAB_ORDERS || session?.isTemporaryAuth || !session?.user?.id) {
        return;
      }

      setOrdersLoading(true);
      setOrdersError('');

      const { data, error: customerOrdersError } = await fetchCustomerOrders(supabase, session.user.id, { limit: 10 });

      if (!mounted) {
        return;
      }

      if (customerOrdersError) {
        setOrdersError('Could not load your orders right now.');
      } else {
        setRemoteOrders((data || []).map(normalizeOrderRecord).filter(Boolean));
      }

      setOrdersLoading(false);
    };

    loadOrders();

    return () => {
      mounted = false;
    };
  }, [activeTab, session?.isTemporaryAuth, session?.user?.id, supabase]);

  const userName = profileSettings.fullName || session?.user?.phone || 'User';
  const firstName = userName.split(' ')[0] || userName;
  const homeLocationText = (profileSettings.defaultAddress || deliveryAddress || initialAddress || 'Kathmandu').trim();
  const mergedOrders = useMemo(
    () => mergeOrderRecords(localOrders, remoteOrders),
    [localOrders, remoteOrders],
  );
  const visibleOrders = useMemo(
    () => mergedOrders.filter((order) => order?.status !== 'cancelled'),
    [mergedOrders],
  );

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
    () => filterMenuItems(selectedRestaurant?.menu_items || [], searchQuery),
    [selectedRestaurant, searchQuery],
  );
  const homeFeaturedRestaurants = useMemo(
    () => filteredRestaurants.slice(0, 2),
    [filteredRestaurants],
  );
  const nonFeaturedRestaurants = useMemo(
    () => filteredRestaurants.slice(2),
    [filteredRestaurants],
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
  const canAddFromSelectedRestaurant = !cartRestaurant?.id || cartRestaurant.id === selectedRestaurant?.id;

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

  const commitProfileSettings = async (nextSettings, options = {}) => {
    const { password = '' } = options;
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
      phone: String(nextSettings.phone || '').trim(),
      addresses: resolvedAddresses,
      defaultAddressId: resolvedDefaultAddressId,
      defaultAddress: resolvedDefaultAddress,
    };

    if (session?.isTemporaryAuth) {
      setProfileSettings(normalizedSettings);
      setDeliveryAddress(resolvedDefaultAddress);
      return { data: normalizedSettings, error: null, temporary: true };
    }

    const { data, error: updateError } = await updateCustomerSettings(supabase, {
      fullName: normalizedSettings.fullName,
      phone: normalizedSettings.phone,
      password,
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
    setDeliveryAddress(updatedSettings.defaultAddress || resolvedDefaultAddress);

    return { data: updatedSettings, error: null, temporary: false };
  };

  const handleSaveProfileDetails = async () => {
    const nextFullName = String(profileForm.fullName || '').trim();
    const nextPhone = String(profileForm.phone || '').trim();
    const nextPassword = String(profileForm.password || '');

    if (!nextFullName) {
      setProfileError('Enter your full name.');
      setProfileMessage('');
      return;
    }

    if (!hasMinDigits(nextPhone, 6)) {
      setProfileError('Enter a valid phone number.');
      setProfileMessage('');
      return;
    }

    if (nextPassword && nextPassword.length < 6) {
      setProfileError('New password should be at least 6 characters.');
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
        phone: nextPhone,
      },
      { password: nextPassword },
    );

    if (saveError) {
      setProfileError(saveError.message || 'Could not save your details right now.');
    } else {
      setProfileForm((current) => ({
        ...current,
        fullName: nextFullName,
        phone: nextPhone,
        password: '',
      }));
      setProfileMessage(
        temporary
          ? 'Temporary login mode: profile changes are saved only for this session.'
          : 'Your profile details are up to date.',
      );
    }

    setProfileSaving(false);
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
          }
          : entry
      ))
      : [
        ...profileSettings.addresses,
        {
          id: createLocalAddressId(),
          label: nextLabel,
          address: nextAddress,
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

  const handleCheckout = async () => {
    if (!cartItems.length || !cartRestaurant?.id || checkoutLoading) {
      return;
    }

    if (!isValidDeliveryAddress(deliveryAddress)) {
      setCheckoutMessage('Please enter a complete delivery address.');
      return;
    }

    setCheckoutLoading(true);
    setCheckoutMessage('');

    if (session?.isTemporaryAuth) {
      const summary = getSummary(getDeliveryFee(cartRestaurant.id));
      const createdAt = new Date().toISOString();
      const optimisticOrder = createOptimisticOrderRecord({
        orderId: `temp-${Date.now()}`,
        restaurant: cartRestaurant,
        items: cartItems,
        subtotal: summary.subtotal,
        deliveryFee: summary.deliveryFee,
        totalAmount: summary.total,
        createdAt,
      });
      setLocalOrders((current) => mergeOrderRecords([optimisticOrder], current));
      setCheckoutMessage(`Temporary login mode: simulated order (${summary.itemCount} items).`);
      clearCart();
      setActiveTab(TAB_ORDERS);
      setCheckoutLoading(false);
      return;
    }

    const deliveryFee = getDeliveryFee(cartRestaurant.id);
    const { data, error: checkoutError } = await createCheckoutOrder(supabase, {
      customerId: session?.user?.id,
      foodPlaceId: cartRestaurant.id,
      deliveryAddress,
      deliveryFee,
      cartItems,
    });

    if (checkoutError) {
      setCheckoutMessage(checkoutError.message || 'Could not confirm your order. Please try again.');
    } else {
      const shortOrderId = data?.orderId ? String(data.orderId).slice(0, 8) : '';
      const optimisticOrder = createOptimisticOrderRecord({
        orderId: data?.orderId || `order-${Date.now()}`,
        restaurant: cartRestaurant,
        items: cartItems,
        subtotal: data?.subtotal ?? cartSummary.subtotal,
        deliveryFee: data?.deliveryFee ?? deliveryFee,
        totalAmount: data?.totalAmount ?? cartSummary.total,
        createdAt: new Date().toISOString(),
      });
      setLocalOrders((current) => mergeOrderRecords([optimisticOrder], current));
      setCheckoutMessage(`Order placed successfully${shortOrderId ? ` (#${shortOrderId})` : ''}.`);
      clearCart();
      setActiveTab(TAB_ORDERS);
    }

    setCheckoutLoading(false);
  };

  const showRestaurantMenu = activeTab === TAB_HOME && selectedRestaurantId && selectedRestaurant;

  if (showRestaurantMenu) {
    return (
      <View style={[styles.screen, styles.menuScreen, { paddingTop: topInset + 28, paddingBottom: bottomInset + 8 }]}>
        <View style={styles.menuLayout}>
          <View style={[styles.contentFrame, styles.menuMainContent]}>
            <View style={styles.menuTopRow}>
              <Pressable
                style={styles.menuBackButton}
                hitSlop={10}
                onPress={() => {
                  setSelectedRestaurantId(null);
                  setSearchQuery('');
                  setMenuSelection({ itemId: null, quantity: 0 });
                }}
              >
                <Ionicons name="arrow-back" size={22} color="#1E1E1E" />
              </Pressable>
              <View style={styles.menuSearchWrap}>
                <SearchBar value={searchQuery} onChangeText={setSearchQuery} menu />
              </View>
            </View>

            <View style={styles.menuRestaurantCard}>
              <View style={styles.menuRestaurantAvatar}>
                {selectedRestaurant.image_url ? (
                  <Image source={{ uri: selectedRestaurant.image_url }} style={styles.menuRestaurantImage} />
                ) : (
                  <MaterialCommunityIcons name="chef-hat" size={25} color="#AFA8A1" />
                )}
              </View>
              <View style={styles.menuRestaurantInfo}>
                <Text style={styles.menuRestaurantName} numberOfLines={1}>{selectedRestaurant.name}</Text>
                <View style={styles.menuRestaurantMetaLine}>
                  <Ionicons name="location" size={13} color="#8C6B56" />
                  <Text style={styles.menuRestaurantAddress} numberOfLines={1}>
                    {selectedRestaurant.address || 'Naxal, Kathmandu'}
                  </Text>
                </View>
                <View style={styles.menuRestaurantRatingWrap}>
                  <MaterialCommunityIcons name="star" size={17} color="#111111" />
                  <Text style={styles.menuRestaurantRating}>{getRestaurantRating(selectedRestaurant.id)}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.menuFeaturedTitle}>Featured:</Text>
            <View style={styles.menuPanel}>
              {!selectedMenuItems.length ? (
                <Text style={styles.emptyText}>No menu items match your search.</Text>
              ) : (
                <View style={styles.menuPanelContent}>
                  {featuredMenuItems.map((item) => (
                    <MenuItemRow
                      key={item.id}
                      item={item}
                      active={selectedMenuItem?.id === item.id && selectedMenuQuantity > 0}
                      onPress={() => handleSelectMenuItem(item)}
                    />
                  ))}
                </View>
              )}
            </View>

            <Text style={styles.menuRegularHeading}>Regular:</Text>
            <View style={styles.menuRegularCard}>
              {!regularMenuItems.length ? (
                <Text style={styles.menuRegularHint}>No regular items in this menu.</Text>
              ) : (
                regularMenuItems.map((item) => (
                  <MenuItemRow
                    key={item.id}
                    item={item}
                    active={selectedMenuItem?.id === item.id && selectedMenuQuantity > 0}
                    onPress={() => handleSelectMenuItem(item)}
                  />
                ))
              )}
            </View>

            {!!selectedMenuItem && selectedMenuQuantity > 0 && (
              <View style={styles.menuBottomActions}>
                <MenuQuantityControl
                  quantity={selectedMenuQuantity}
                  onIncrease={handleMenuQuantityIncrease}
                  onDecrease={handleMenuQuantityDecrease}
                />

                <Pressable
                  style={[
                    styles.menuAddToCartButton,
                    !canAddFromSelectedRestaurant && styles.menuAddToCartButtonDisabled,
                  ]}
                  onPress={handleMenuAddToCart}
                  disabled={!canAddFromSelectedRestaurant}
                >
                  <View style={styles.menuAddToCartInner}>
                    <View style={styles.menuAddToCartPattern} />
                    <FoodPatternLayer color="rgba(214, 96, 24, 0.42)" />
                    <Text style={styles.menuAddToCartText}>
                      {canAddFromSelectedRestaurant ? 'Add to cart' : 'Single restaurant cart'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  const cartDeliveryFee = cartRestaurant?.id ? getDeliveryFee(cartRestaurant.id) : 0;
  const cartSummary = getSummary(cartDeliveryFee);
  const cartViewportMinHeight = Math.max(
    windowHeight - (topInset + 50) - bottomInset,
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

      {activeTab === TAB_HOME && (
        <>
          <ScrollView
            contentContainerStyle={styles.homeContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentFrame}>
              <View style={styles.homeTopRow}>
                <View style={styles.homeUserRow}>
                  <View style={styles.homeAvatar}>
                    <MaterialCommunityIcons name="cat" size={50} color="#6F7278" />
                    <View style={styles.homeAvatarCollar} />
                  </View>
                  <View>
                    <Text style={styles.homeGreeting}>Hey {firstName}</Text>
                    <View style={styles.homeLocationRow}>
                      <Ionicons name="location" size={13} color="#8C6B56" />
                      <Text style={styles.homeLocation}>{homeLocationText}</Text>
                    </View>
                  </View>
                </View>
                <Pressable style={styles.homeBellButton}>
                  <Ionicons name="notifications" size={21} color="#1E1E1E" />
                </Pressable>
              </View>

              <SearchBar value={searchQuery} onChangeText={setSearchQuery} />

              <SectionHeader title="Offers:" />
              <View style={styles.offerCard}>
                <FoodPatternLayer color="rgba(214, 96, 24, 0.44)" />
                <Text style={styles.offerHeadline} numberOfLines={1}>
                  5% OFF
                </Text>
              </View>

              <View style={styles.offerDots}>
                <View style={styles.dot} />
                <View style={[styles.dot, styles.dotActive]} />
                <View style={styles.dot} />
                <View style={styles.dot} />
              </View>

              <SectionHeader title="Featured:" />

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

              <SectionHeader title="Non featured:" />
              {!nonFeaturedRestaurants.length ? (
                <Text style={styles.helperText}>No additional restaurants yet.</Text>
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
                <Text style={styles.ordersTitle}>Orders</Text>
              </View>

              {ordersLoading ? (
                <Text style={styles.helperText}>Loading orders...</Text>
              ) : null}
              {!ordersLoading && !!ordersError ? (
                <Text style={styles.errorText}>{ordersError}</Text>
              ) : null}
              {!ordersLoading && !ordersError && !visibleOrders.length ? (
                <View style={styles.ordersEmptyCard}>
                  <Text style={styles.ordersEmptyTitle}>No orders yet</Text>
                  <Text style={styles.ordersEmptySubtitle}>Checkout a meal and it will show up here.</Text>
                </View>
              ) : null}

              {!ordersLoading && !ordersError && !!visibleOrders.length ? (
                <View style={styles.ordersList}>
                  {visibleOrders.map((order) => (
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
              <Text style={styles.cartTitle}>Cart</Text>
              <Pressable style={styles.cartHeaderIcon} onPress={clearCart}>
                <Ionicons name="trash" size={19} color="#1E1E1E" />
              </Pressable>
            </View>

            {!cartItems.length ? (
              <View style={styles.cartEmptyCard}>
                <Text style={styles.cartEmptyTitle}>Your cart is empty</Text>
                <Text style={styles.cartEmptySubtitle}>Add items from a restaurant to start checkout.</Text>
                <Pressable style={styles.cartBrowseButton} onPress={() => setActiveTab(TAB_HOME)}>
                  <Text style={styles.cartBrowseButtonText}>Browse Food</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.cartBody}>
                <View style={styles.cartItemsList}>
                  {cartItems.map((item) => (
                    <CartItemCard
                      key={item.id}
                      item={item}
                      restaurantName={cartRestaurant?.name || 'Selected restaurant'}
                      onIncrease={() => incrementItem(cartRestaurant, item)}
                      onDecrease={() => decrementItem(cartRestaurant, item)}
                    />
                  ))}
                </View>

                <View style={styles.billCard}>
                  <View style={styles.billTopRow}>
                    <View style={styles.billTitleWrap}>
                      <MaterialCommunityIcons name="receipt-text" size={20} color="#F8964F" />
                      <Text style={styles.billTitle}>Bill</Text>
                    </View>
                    <View style={styles.billItemCountChip}>
                      <Ionicons name="cart" size={12} color="#D67D3B" />
                      <Text style={styles.billItemCount}>{cartSummary.itemCount} items</Text>
                    </View>
                  </View>

                  <View style={styles.billPanel}>
                    <View style={styles.billRow}>
                      <View style={styles.billLabelWrap}>
                        <Ionicons name="pricetag" size={14} color="#8C6B56" />
                        <Text style={styles.billLabel}>Sub Total:</Text>
                      </View>
                      <Text style={styles.billValue}>{formatNpr(cartSummary.subtotal)}</Text>
                    </View>
                    <View style={styles.billRow}>
                      <View style={styles.billLabelWrap}>
                        <MaterialCommunityIcons name="motorbike" size={15} color="#8C6B56" />
                        <Text style={styles.billLabel}>Delivery charge:</Text>
                      </View>
                      <Text style={styles.billValue}>{formatNpr(cartSummary.deliveryFee)}</Text>
                    </View>
                    <View style={[styles.billRow, styles.billTotalRow]}>
                      <View style={styles.billLabelWrap}>
                        <Ionicons name="wallet" size={15} color="#252525" />
                        <Text style={[styles.billLabel, styles.billLabelStrong]}>Total:</Text>
                      </View>
                      <Text style={[styles.billValue, styles.billValueStrong]}>{formatNpr(cartSummary.total)}</Text>
                    </View>
                  </View>

                  <Pressable
                    style={[
                      styles.checkoutButton,
                      checkoutLoading && styles.checkoutButtonDisabled,
                    ]}
                    onPress={handleCheckout}
                    disabled={checkoutLoading}
                  >
                    <View style={styles.checkoutButtonInner}>
                      <View style={styles.checkoutButtonPattern} />
                      <FoodPatternLayer color="rgba(214, 96, 24, 0.42)" />
                      <View style={styles.checkoutButtonContent}>
                        <MaterialCommunityIcons name="cart-check" size={18} color="#FFFFFF" />
                        <Text style={styles.checkoutButtonText}>
                          {checkoutLoading ? 'Placing order...' : 'Proceed'}
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
      )}

      {activeTab === TAB_PROFILE && (
        <>
          <ScrollView
            contentContainerStyle={styles.profileContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentFrame}>
              <View style={styles.profileHeroCard}>
                <View style={styles.profileHeroAvatar}>
                  <MaterialCommunityIcons name="cat" size={34} color="#6F7278" />
                </View>

                <View style={styles.profileHeroText}>
                  <Text style={styles.profileTitle}>Your Profile</Text>
                  <Text style={styles.profileSubtitle}>
                    Keep your details and default delivery address up to date.
                  </Text>
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

              <View style={styles.profileSummaryCard}>
                <View style={styles.profileSummaryRow}>
                  <View style={styles.profileSummaryItem}>
                    <Ionicons name="person-circle" size={18} color="#F8964F" />
                    <Text style={styles.profileSummaryValue} numberOfLines={1}>{profileSettings.fullName}</Text>
                  </View>
                  <View style={styles.profileSummaryItem}>
                    <Ionicons name="call" size={16} color="#F8964F" />
                    <Text style={styles.profileSummaryValue} numberOfLines={1}>{profileSettings.phone || 'No phone saved'}</Text>
                  </View>
                </View>
                <View style={styles.profileSummaryAddress}>
                  <Ionicons name="location" size={16} color="#8C6B56" />
                  <Text style={styles.profileSummaryAddressText}>
                    {profileSettings.defaultAddress || 'No default address selected'}
                  </Text>
                </View>
              </View>

              <View style={styles.profileSectionCard}>
                <View style={styles.profileSectionHead}>
                  <Text style={styles.profileSectionTitle}>Personal details</Text>
                </View>

                <Input
                  label="Full name"
                  placeholder="Your full name"
                  value={profileForm.fullName}
                  onChangeText={(value) => {
                    setProfileForm((current) => ({ ...current, fullName: value }));
                    if (profileError) {
                      setProfileError('');
                    }
                  }}
                />

                <Input
                  label="Phone number"
                  placeholder="98XXXXXXXX"
                  type="tel"
                  value={profileForm.phone}
                  onChangeText={(value) => {
                    setProfileForm((current) => ({ ...current, phone: value }));
                    if (profileError) {
                      setProfileError('');
                    }
                  }}
                />

                <Input
                  label="New password"
                  placeholder="At least 6 characters"
                  type="password"
                  value={profileForm.password}
                  onChangeText={(value) => {
                    setProfileForm((current) => ({ ...current, password: value }));
                    if (profileError) {
                      setProfileError('');
                    }
                  }}
                />

                <Button
                  title="Save details"
                  onPress={handleSaveProfileDetails}
                  loading={profileSaving}
                  style={styles.profileFullButton}
                />
              </View>

              <View style={styles.profileSectionCard}>
                <View style={styles.profileSectionHead}>
                  <Text style={styles.profileSectionTitle}>Saved addresses</Text>
                  <View style={styles.profileCountChip}>
                    <Ionicons name="location-outline" size={13} color="#D67D3B" />
                    <Text style={styles.profileCountChipText}>
                      {profileSettings.addresses.length}
                    </Text>
                  </View>
                </View>

                <Text style={styles.profileSectionNote}>
                  Choose a default address for quick checkout and manage the rest here.
                </Text>

                <View style={styles.profileAddressList}>
                  {profileSettings.addresses.map((address) => (
                    <ProfileAddressCard
                      key={address.id}
                      address={address}
                      isDefault={address.id === profileSettings.defaultAddressId}
                      onSetDefault={() => handleSetDefaultAddress(address.id)}
                      onEdit={() => handleEditAddress(address)}
                      onDelete={() => handleDeleteAddress(address.id)}
                      canDelete={profileSettings.addresses.length > 1}
                    />
                  ))}
                </View>

                <View style={styles.profileAddressFormCard}>
                  <View style={styles.profileAddressFormHead}>
                    <Text style={styles.profileAddressFormTitle}>
                      {editingAddressId ? 'Edit address' : 'Add a new address'}
                    </Text>
                    {editingAddressId ? (
                      <Pressable style={styles.profileAddressReset} onPress={handleCancelAddressEdit}>
                        <Ionicons name="close" size={16} color="#1E1E1E" />
                      </Pressable>
                    ) : null}
                  </View>

                  <Input
                    label="Label"
                    placeholder="Home, Office, Hostel..."
                    value={addressDraft.label}
                    onChangeText={(value) => {
                      setAddressDraft((current) => ({ ...current, label: value }));
                      if (addressError) {
                        setAddressError('');
                      }
                    }}
                  />

                  <Text style={styles.profileTextareaLabel}>Address</Text>
                  <View style={styles.profileTextareaField}>
                    <TextInput
                      multiline
                      numberOfLines={3}
                      placeholder="Street, area, and nearby landmark"
                      placeholderTextColor="#8E8781"
                      value={addressDraft.address}
                      onChangeText={(value) => {
                        setAddressDraft((current) => ({ ...current, address: value }));
                        if (addressError) {
                          setAddressError('');
                        }
                      }}
                      style={styles.profileTextareaInput}
                      textAlignVertical="top"
                    />
                  </View>

                  {!!addressError ? (
                    <Text style={styles.profileInlineError}>{addressError}</Text>
                  ) : null}

                  <View style={styles.profileAddressButtonRow}>
                    {editingAddressId ? (
                      <Button
                        title="Cancel"
                        variant="outline"
                        onPress={handleCancelAddressEdit}
                        style={styles.profileSecondaryButton}
                      />
                    ) : null}

                    <Button
                      title={editingAddressId ? 'Update address' : 'Save address'}
                      onPress={handleSaveAddressDraft}
                      loading={addressSaving}
                      style={editingAddressId ? styles.profileAddressSaveButton : styles.profileFullButton}
                    />
                  </View>
                </View>
              </View>

            </View>
          </ScrollView>
          <View style={[styles.profileStickyFooter, { bottom: Math.max(bottomInset, 8) + 96 }]}>
            <View style={styles.profileStickyFooterInner}>
              <Button
                title={logoutLoading ? 'Logging out...' : 'Logout'}
                onPress={handleLogout}
                disabled={logoutLoading}
                style={[styles.profileFullButton, styles.profileDangerButton]}
              />
            </View>
          </View>
          <BottomNav
            activeTab={activeTab}
            onChange={setActiveTab}
            bottomInset={bottomInset}
            cartCount={itemCount}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 0,
  },
  homeScreen: {
    backgroundColor: '#FFFFFF',
  },
  cartScreen: {
    backgroundColor: '#FFF5EF',
  },
  ordersScreen: {
    backgroundColor: '#FBF1E9',
  },
  contentFrame: {
    width: '100%',
    maxWidth: 330,
    alignSelf: 'center',
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
    paddingBottom: 118,
  },
  homeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 26,
    marginTop: 0,
  },
  homeUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexShrink: 1,
  },
  homeAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  homeAvatarCollar: {
    position: 'absolute',
    bottom: 11,
    width: 8,
    height: 3,
    borderRadius: 4,
    backgroundColor: '#F8964F',
  },
  homeGreeting: {
    color: '#F8964F',
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
    lineHeight: 25,
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
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    borderRadius: 15,
    borderWidth: 0,
    backgroundColor: '#FFEBDD',
    paddingHorizontal: 22,
    gap: 16,
  },
  searchInput: {
    flex: 1,
    color: '#2A2A2A',
    fontFamily: 'Outfit_500Medium',
    fontSize: 15,
    paddingVertical: 9,
  },
  searchBarMenu: {
    height: 45,
    borderRadius: 14,
    backgroundColor: '#FFEBDD',
    paddingHorizontal: 22,
    gap: 23,
  },
  searchInputMenu: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 0,
    color: '#8E8882',
  },
  sectionHeaderRow: {
    marginTop: 33,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 17,
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
  offerCard: {
    minHeight: 165,
    borderRadius: 14,
    borderWidth: 5,
    borderColor: '#FFDCC3',
    backgroundColor: '#F8964F',
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  offerHeadline: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 52,
    lineHeight: 52,
    letterSpacing: -0.6,
    maxWidth: '96%',
  },
  offerDots: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: '#FFDCC3',
  },
  dotActive: {
    backgroundColor: '#F8964F',
  },
  featuredList: {
    gap: 12,
    marginBottom: 16,
  },
  featuredScroller: {
    marginBottom: 20,
  },
  featuredScrollContent: {
    gap: 24,
    paddingRight: 40,
    paddingVertical: 4,
  },
  restaurantCard: {
    width: 255,
    flexShrink: 0,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#FFDCC3',
    backgroundColor: '#FFEBDD',
  },
  restaurantCardCover: {
    height: 155,
    position: 'relative',
  },
  restaurantCoverPattern: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8964F',
  },
  restaurantCoverTitle: {
    position: 'absolute',
    left: 16,
    right: 14,
    bottom: 15,
    color: '#FFFFFF',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 24,
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  restaurantCardBody: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 2,
  },
  restaurantName: {
    color: '#2A2A2A',
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    lineHeight: 16,
  },
  restaurantCategory: {
    color: '#5F5F5F',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 11,
  },
  restaurantMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 12,
  },
  metaPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
  },
  helperText: {
    color: '#5E5E5E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    marginBottom: 8,
  },
  nonFeaturedList: {
    gap: 12,
    marginBottom: 18,
  },
  nonFeaturedCard: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFDCC3',
    backgroundColor: '#FFEBDD',
    padding: 11,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  nonFeaturedImageWrap: {
    width: 86,
    height: 86,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F4A063',
    position: 'relative',
  },
  nonFeaturedImage: {
    width: '100%',
    height: '100%',
  },
  nonFeaturedImagePattern: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8964F',
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
    marginTop: 6,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  nonFeaturedChip: {
    height: 24,
    borderRadius: 999,
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
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 81,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    backgroundColor: '#FEF8F4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingTop: 10,
  },
  bottomNavItem: {
    width: 54,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomNavIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -8,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: 999,
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    lineHeight: 12,
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
    paddingBottom: 12,
  },
  menuTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    gap: 10,
    marginBottom: 29,
  },
  menuBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuSearchWrap: {
    width: 277,
  },
  menuRestaurantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    height: 112,
    backgroundColor: '#FFEBDD',
    borderRadius: 14,
    paddingLeft: 35,
    paddingRight: 18,
    marginBottom: 32,
  },
  menuRestaurantAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
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
    color: '#F8964F',
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
    fontSize: 17,
    lineHeight: 18,
    marginBottom: 12,
  },
  menuRegularHeading: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 17,
    lineHeight: 18,
    marginTop: 22,
    marginBottom: 12,
  },
  menuPanel: {
    borderRadius: 14,
    backgroundColor: '#FFEBDD',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 16,
    gap: 12,
  },
  menuPanelContent: {
    gap: 12,
    paddingBottom: 0,
  },
  menuRegularCard: {
    borderRadius: 14,
    backgroundColor: '#FFEBDD',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    minHeight: 204,
  },
  menuRegularHint: {
    color: '#7A7773',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  menuItemRow: {
    height: 62,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  menuItemRowActive: {
    backgroundColor: '#FFDCC3',
  },
  menuItemRowPattern: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8964F',
  },
  menuItemRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 12,
    backgroundColor: 'transparent',
    minHeight: 42,
    zIndex: 2,
  },
  menuItemThumb: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  menuItemThumbPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#D9D9D9',
  },
  menuItemName: {
    flex: 1,
    color: '#333232',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    lineHeight: 20,
  },
  menuItemNameActive: {
    color: '#FFFFFF',
  },
  menuItemPrice: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    lineHeight: 20,
  },
  menuItemPriceActive: {
    color: '#FFFFFF',
  },
  foodPatternIcon: {
    position: 'absolute',
  },
  menuQtyControl: {
    width: 109,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFDCC3',
    padding: 3,
  },
  menuQtyInner: {
    flex: 1,
    borderRadius: 27,
    backgroundColor: '#F8964F',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    gap: 16,
  },
  menuQtyPattern: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8964F',
  },
  menuQtyAction: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuQtyValue: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    lineHeight: 20,
  },
  cartInlineStepper: {
    position: 'absolute',
    right: 12,
    top: 85,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 34,
    paddingHorizontal: 8,
    borderRadius: 17,
    backgroundColor: '#FFF7F1',
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
    paddingBottom: 30,
    gap: 0,
  },
  ordersContent: {
    paddingBottom: 118,
  },
  ordersHeader: {
    position: 'relative',
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 38,
  },
  ordersBackButton: {
    position: 'absolute',
    left: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    lineHeight: 31,
  },
  ordersList: {
    gap: 18,
  },
  ordersEmptyCard: {
    borderRadius: 20,
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
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
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
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderHistoryLeadLine: {
    width: 1,
    height: 28,
    marginTop: 4,
    backgroundColor: '#AFA29A',
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
    marginTop: 14,
    borderRadius: 20,
    backgroundColor: '#FFD9BF',
    padding: 14,
    gap: 16,
  },
  orderHistorySummaryCard: {
    borderRadius: 17,
    backgroundColor: '#F7F7F7',
    paddingHorizontal: 16,
    paddingVertical: 13,
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
    fontSize: 16,
    lineHeight: 25,
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
    gap: 20,
  },
  cartHeader: {
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  cartHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 26,
    lineHeight: 28,
  },
  cartEmptyCard: {
    marginTop: 8,
    borderRadius: 18,
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
    borderRadius: 12,
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBrowseButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
  },
  cartItemCard: {
    minHeight: 126,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingLeft: 16,
    paddingTop: 14,
    paddingBottom: 14,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#F2DFD2',
    shadowColor: '#D87833',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  cartItemImageWrap: {
    width: 94,
    height: 94,
    borderRadius: 16,
    padding: 2,
    backgroundColor: '#FFF4EC',
    borderWidth: 1,
    borderColor: '#F6DECF',
  },
  cartItemImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    backgroundColor: '#FFEBDD',
  },
  cartItemImagePlaceholder: {
    backgroundColor: '#F9E4D4',
  },
  cartItemTextWrap: {
    flex: 1,
    minHeight: 94,
    paddingTop: 8,
    paddingRight: 18,
    paddingBottom: 12,
  },
  cartItemName: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 17,
    lineHeight: 19,
    flex: 1,
  },
  cartItemRestaurantChip: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#FFF4EC',
    borderWidth: 1,
    borderColor: '#F6DECF',
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
    marginTop: 8,
  },
  billCard: {
    minHeight: 264,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 24,
    paddingBottom: 11,
    marginTop: 28,
    borderWidth: 1,
    borderColor: '#F2DFD2',
    shadowColor: '#D87833',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  billTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingHorizontal: 14,
  },
  billTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  billTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 22,
    lineHeight: 24,
  },
  billItemCountChip: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    backgroundColor: '#FFF4EC',
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
    minHeight: 102,
    borderRadius: 12,
    backgroundColor: '#FFE4D1',
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
    marginTop: 20,
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#FFEDE1',
    padding: 2,
    overflow: 'hidden',
  },
  checkoutButtonInner: {
    flex: 1,
    borderRadius: 10,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  menuAddToCartButton: {
    flex: 1,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFEDE1',
    padding: 3,
    overflow: 'hidden',
  },
  menuAddToCartInner: {
    flex: 1,
    borderRadius: 27,
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
    paddingBottom: 198,
  },
  profileHeroCard: {
    borderRadius: 22,
    backgroundColor: '#FFEBDD',
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  profileHeroAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#FFFFFF',
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
    fontSize: 28,
    lineHeight: 31,
  },
  profileSubtitle: {
    color: '#6E6761',
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    lineHeight: 20,
  },
  profileNoticeSuccess: {
    minHeight: 44,
    borderRadius: 14,
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
    borderRadius: 14,
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
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F2DFD2',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    marginBottom: 16,
  },
  profileSummaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  profileSummaryItem: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#FFF7F1',
    borderWidth: 1,
    borderColor: '#F6DECF',
    paddingHorizontal: 12,
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
    borderRadius: 14,
    backgroundColor: '#FFF4EC',
    borderWidth: 1,
    borderColor: '#F6DECF',
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F2DFD2',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
    marginBottom: 16,
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
    fontSize: 19,
    lineHeight: 22,
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
    borderRadius: 999,
    backgroundColor: '#FFF4EC',
    borderWidth: 1,
    borderColor: '#F6DECF',
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
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingTop: 10,
    paddingBottom: 2,
  },
  profileSecondaryButton: {
    flex: 1,
  },
  profileAddressList: {
    gap: 12,
  },
  profileAddressCard: {
    borderRadius: 16,
    backgroundColor: '#FFF7F1',
    borderWidth: 1,
    borderColor: '#F6DECF',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  profileAddressCardActive: {
    backgroundColor: '#FFEBDD',
    borderColor: '#F8C49C',
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
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F6D0B3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profileDefaultBadgeText: {
    color: '#D66018',
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
    width: 32,
    height: 32,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F2DFD2',
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
  profileAddressFormCard: {
    borderRadius: 16,
    backgroundColor: '#FFF7F1',
    borderWidth: 1,
    borderColor: '#F6DECF',
    paddingHorizontal: 14,
    paddingVertical: 14,
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
    borderRadius: 14,
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
    minHeight: 98,
    borderRadius: 15,
    backgroundColor: '#F4E5D8',
    borderWidth: 2,
    borderColor: '#E7D8CA',
    paddingHorizontal: 14,
    paddingVertical: 12,
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
});
