import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildEsewaPaymentRequest,
  createCheckoutOrder,
  createEsewaTransactionUuid,
  decodeEsewaResponseData,
  fetchCustomerOrders,
  fetchCustomerSettings,
  fetchRestaurantFeed,
  mapEsewaStatusToPaymentStatus,
  subscribeToCustomerOrders,
  subscribeToRestaurantFeed,
  updateCustomerSettings,
  updateOrderPaymentStatus,
  uploadAvatar,
  verifyEsewaResponseSignature,
} from '@repo/api';
import { Input, Logo, useCart } from '@repo/ui';
import {
  filterMenuItems,
  filterRestaurantFeed,
  formatNpr,
  getDefaultSavedAddress,
  getDeliveryFee,
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
  normalizeMenuCategory,
  normalizeDeliveryAddress,
  normalizeSavedAddresses,
  ORDER_STATUS,
  resolveDefaultSavedAddressId,
} from '@repo/utils';
import './DiscoveryPage.css';
import GoogleAddressPicker from './GoogleAddressPicker';
import RouteMap from './RouteMap';
import { reverseGeocode } from '../lib/googleMaps';

const PAYMENT_METHOD_CASH = 'cash';
const PAYMENT_METHOD_ESEWA = 'esewa';
const ESEWA_PENDING_PAYMENT_KEY = 'chito-mitho-esewa-pending-payment';

function SearchField({ value, onChange, placeholder = 'Search restaurants or menu items' }) {
  return (
    <label className="discover-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="20" y1="20" x2="16.65" y2="16.65" />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function IconStar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m12 3 2.8 5.67 6.2.9-4.5 4.38 1.07 6.2L12 17.2l-5.57 2.95 1.07-6.2L3 9.57l6.2-.9L12 3Z" />
    </svg>
  );
}

function IconDelivery() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 8h11v8H3zM14 11h3l3 3v2h-6z" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="17.5" cy="17.5" r="1.5" />
    </svg>
  );
}

function writePendingEsewaPayment(payment) {
  try {
    window.localStorage.setItem(ESEWA_PENDING_PAYMENT_KEY, JSON.stringify(payment));
  } catch {
    // Payment can still be attempted; the return screen just may not restore details.
  }
}

function readPendingEsewaPayment() {
  try {
    const rawValue = window.localStorage.getItem(ESEWA_PENDING_PAYMENT_KEY);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

function clearPendingEsewaPayment() {
  try {
    window.localStorage.removeItem(ESEWA_PENDING_PAYMENT_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function submitEsewaPostForm(paymentUrl, fields = {}) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = paymentUrl;
  form.style.display = 'none';

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value ?? '');
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

function buildEsewaReturnUrl(type) {
  const url = new URL(window.location.href);
  url.searchParams.set('payment', type);
  url.searchParams.delete('data');
  return url.toString();
}

function clearEsewaReturnParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete('payment');
  url.searchParams.delete('data');
  window.history.replaceState({}, '', url.toString());
}

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M20 10 12 2H4v8l8 8 8-8Z" />
      <circle cx="7.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconRupee() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 6h11M5 10h11M5 6c5.5 0 7.5 1.6 7.5 4S10.5 14 5 14l10 4" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="m3 10 9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M20.8 8.6c0 5.3-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9Z" />
    </svg>
  );
}

function IconLocation() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 21s6-5.1 6-10a6 6 0 1 0-12 0c0 4.9 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2" />
    </svg>
  );
}

function IconCart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M5 6h16l-2 8H7L5 3H2" />
      <circle cx="9" cy="20" r="1.6" />
      <circle cx="17" cy="20" r="1.6" />
    </svg>
  );
}

function IconCartEmpty() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="discover-cart-empty-icon">
      <path d="M12 14h42l-5 20H17L12 8H6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="48" r="3.5" />
      <circle cx="44" cy="48" r="3.5" />
      <path d="M28 28l8 8M36 28l-8 8" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

function IconEmptyFavorites() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="discover-empty-icon">
      <path d="M52 22c0 13.5-20 26-20 26S12 35.5 12 22a12 12 0 0 1 20-8.8A12 12 0 0 1 52 22Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 26l12 12M38 26l-12 12" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

function IconEmptySearch() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="discover-empty-icon">
      <circle cx="28" cy="28" r="16" />
      <path d="M40 40l14 14" strokeLinecap="round" />
      <path d="M22 28h12M28 22v12" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

function IconEmptyOrders() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="discover-cart-empty-icon">
      <rect x="12" y="8" width="40" height="48" rx="4" />
      <path d="M22 22h20M22 32h14M22 42h8" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-7 8-7s8 3 8 7" strokeLinecap="round" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="M2 7l10 6 10-6" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M10 5H5v14h5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H9" />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 11h6M9 15h3" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconMapPin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M12 21s-7-5.5-7-10a7 7 0 1114 0c0 4.5-7 10-7 10z" />
      <circle cx="12" cy="11" r="2.5" />
    </svg>
  );
}

function QuantityControl({
  quantity,
  onDecrease,
  onIncrease,
  disableDecrease = false,
  disableIncrease = false,
}) {
  return (
    <div className="discover-qty">
      <button type="button" onClick={onDecrease} disabled={disableDecrease} aria-label="Decrease quantity">-</button>
      <span>{quantity}</span>
      <button type="button" onClick={onIncrease} disabled={disableIncrease} aria-label="Increase quantity">+</button>
    </div>
  );
}

function RestaurantCard({
  restaurant,
  active,
  compact = false,
  isFavorite = false,
  onSelect,
  onToggleFavorite,
}) {
  const rating = getRestaurantRating(restaurant.id);
  const displayAddress = getShortAddress(restaurant.address || restaurant.formatted_address || 'Kathmandu Valley');
  const bannerUrl = getRestaurantBannerUrl(restaurant);
  const profileImageUrl = getRestaurantProfileImageUrl(restaurant);

  return (
    <article
      className={`discover-card ${compact ? 'discover-card-compact' : ''} ${active ? 'active' : ''}`}
      style={{
        '--restaurant-card-banner': `url("${bannerUrl || Logo}")`,
      }}
    >
      <button
        type="button"
        className="discover-card-main"
        onClick={() => onSelect(restaurant.id)}
      >
        <span className="discover-card-rating-inline">
          <IconStar />
          {rating}
        </span>
        <div className="discover-card-overlay">
          <div className="discover-card-profile-image">
            <img src={profileImageUrl || bannerUrl || Logo} alt="" />
          </div>

          <div className="discover-card-body">
            <h3>{restaurant.name}</h3>
            <p>
              <IconLocation />
              {displayAddress || 'Kathmandu Valley'}
            </p>
          </div>
        </div>
      </button>

      <button
        type="button"
        className={`discover-card-heart ${isFavorite ? 'is-active' : ''}`}
        onClick={() => onToggleFavorite?.(restaurant)}
        aria-label={isFavorite ? `Remove ${restaurant.name} from favorites` : `Add ${restaurant.name} to favorites`}
      >
        <IconHeart />
      </button>
    </article>
  );
}

function getEstimatedOrderMinutes(order) {
  const explicitEta = Number(order.estimated_arrival_minutes ?? order.estimatedArrivalMinutes);
  const canShowEta = [ORDER_STATUS.PICKED_UP, ORDER_STATUS.ARRIVED].includes(order.status);
  if (canShowEta && Number.isFinite(explicitEta) && explicitEta > 0) {
    return explicitEta;
  }

  return null;
}

function getNextOrderStatus(status) {
  const nextByStatus = {
    [ORDER_STATUS.PLACED]: ORDER_STATUS.ACCEPTED,
    [ORDER_STATUS.ACCEPTED]: ORDER_STATUS.COOKING,
    [ORDER_STATUS.COOKING]: ORDER_STATUS.READY_FOR_PICKUP,
    [ORDER_STATUS.READY_FOR_PICKUP]: ORDER_STATUS.PICKED_UP,
    [ORDER_STATUS.PICKED_UP]: ORDER_STATUS.ARRIVED,
    [ORDER_STATUS.ARRIVED]: ORDER_STATUS.DELIVERED,
  };

  return nextByStatus[status] || '';
}

function OrderCard({ order, variant = 'past' }) {
  const restaurantName = order.restaurantName || order.restaurant?.name || 'Restaurant';
  const createdAt = order.created_at || order.createdAt;
  const updatedAt = order.updated_at || order.updatedAt;
  const dateLabel = createdAt
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(createdAt))
    : 'Just now';
  const updatedLabel = updatedAt
    ? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(updatedAt))
    : '';
  const lineItems = order.lineItems || [];
  const subtotal = Number(order.subtotal ?? order.subtotalAmount ?? lineItems.reduce((sum, item) => (
    sum + Number(item.item_price ?? item.price ?? 0) * Number(item.quantity || 1)
  ), 0));
  const deliveryFee = Number(order.delivery_fee ?? order.deliveryFee ?? 0);
  const total = Number(order.total_amount ?? order.totalAmount ?? subtotal + deliveryFee);
  const orderId = String(order.id || order.orderId || 'pending');
  const isCurrent = variant === 'current';
  const deliveryAddress = getShortAddress(order.delivery_address || order.deliveryAddress || 'Delivery address not saved');
  const riderLabel = order.rider_id || order.riderId
    ? 'Rider assigned'
    : isCurrent
      ? 'Waiting for rider'
      : 'No rider details';
  const etaMinutes = getEstimatedOrderMinutes(order);
  const nextStatus = getNextOrderStatus(order.status);

  return (
    <article className={`discover-order-card ${isCurrent ? 'is-current' : 'is-past'}`}>
      <div className="discover-order-card-head">
        <span className="discover-order-icon"><IconOrders /></span>
        <div>
          <strong>{restaurantName}</strong>
          <span>Order #{orderId.slice(0, 8)} · {dateLabel}</span>
        </div>
        <span className="discover-order-status">{formatOrderStatus(order.status)}</span>
      </div>

      {isCurrent ? (
        <div className="discover-order-live">
          <div>
            <span>Now</span>
            <strong>{formatOrderStatus(order.status)}</strong>
          </div>
          <div>
            <span>{etaMinutes ? 'ETA' : 'Next'}</span>
            <strong>{etaMinutes ? `${etaMinutes} min` : nextStatus ? formatOrderStatus(nextStatus) : riderLabel}</strong>
          </div>
        </div>
      ) : null}

      <div className="discover-order-address">
        <IconLocation />
        <span>{deliveryAddress}</span>
      </div>

      {lineItems.length ? (
        <div className="discover-order-items">
          {lineItems.slice(0, 4).map((item) => (
            <span key={item.id || item.menu_item_id || item.item_name}>
              {item.quantity || 1}x {item.item_name || item.name}
            </span>
          ))}
          {lineItems.length > 4 ? <span>+{lineItems.length - 4} more</span> : null}
        </div>
      ) : null}

      <div className="discover-order-total">
        <div>
          <span>Subtotal</span>
          <strong>{formatNpr(subtotal)}</strong>
        </div>
        <div>
          <span>Delivery</span>
          <strong>{formatNpr(deliveryFee)}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{formatNpr(total)}</strong>
        </div>
      </div>

      <div className="discover-order-actions">
        <span>{updatedLabel ? `Updated ${updatedLabel}` : 'Details synced'}</span>
      </div>

      {isCurrent && (order.rider_id || order.riderId) ? (
        <RouteMap
          restaurant={order.restaurant}
          deliveryLocation={{
            latitude: order.delivery_lat,
            longitude: order.delivery_lng,
          }}
          riderLocation={{
            latitude: order.rider_lat,
            longitude: order.rider_lng,
          }}
          title="Live delivery"
        />
      ) : null}
    </article>
  );
}

function MenuItemCard({
  item,
  quantity,
  canAdd,
  onIncrease,
  onDecrease,
}) {
  return (
    <article className="discover-menu-item">
      <div className="discover-menu-main">
        <div className="discover-menu-title-row">
          <h4>{item.name}</h4>
          <span className="discover-menu-category">
            <IconTag />
            {normalizeMenuCategory(item.category || 'Specials')}
          </span>
        </div>
        <p>{item.description || normalizeMenuCategory(item.category || 'Specials')}</p>

        <div className="discover-menu-bottom">
          <strong className="discover-price-tag">
            <IconRupee />
            {formatNpr(item.price)}
          </strong>

          <div className="discover-menu-actions">
            <QuantityControl
              quantity={quantity}
              onIncrease={onIncrease}
              onDecrease={onDecrease}
              disableDecrease={quantity <= 0}
              disableIncrease={!canAdd}
            />
            {!canAdd && quantity <= 0 ? (
              <span className="discover-menu-cart-note">Cart has another restaurant</span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function CartLineItem({ item, onIncrease, onDecrease }) {
  return (
    <article className="discover-cart-item">
      <div className="discover-cart-item-info">
        <h4>{item.name}</h4>
        <p>{formatNpr(item.price)}</p>
      </div>
      <QuantityControl
        quantity={item.quantity}
        onIncrease={onIncrease}
        onDecrease={onDecrease}
      />
    </article>
  );
}

function formatOrderStatus(status = '') {
  return String(status || 'placed')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSessionCustomerSettings(session) {
  const user = session?.user || {};
  const metadata = user.user_metadata || {};
  const phone = metadata.phone || user.phone || '';
  const fullName = metadata.full_name || phone || 'Customer';
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
    email: metadata.email || user.email || '',
    phone,
    avatarUrl: metadata.avatar_url || '',
    addresses,
    defaultAddressId,
    defaultAddress,
  };
}

function createLocalAddressId() {
  return `address-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

const QUICK_CATEGORIES = ['Momo', 'Pizza', 'Burgers', 'Rice Meals', 'Thakali', 'Korean', 'Newari', 'Street Snacks', 'Bakery'];
const FAVORITES_STORAGE_KEY = 'chito-mitho-favorite-restaurants';

function readFavoriteRestaurantIds() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function formatTopLocationLabel(deliveryLocation, deliveryAddress, defaultAddressEntry) {
  if (deliveryLocation?.label && deliveryLocation.label !== 'My location') {
    const sourceAddress = deliveryLocation.address || deliveryAddress || defaultAddressEntry?.address || '';
    if (/kathmandu/i.test(sourceAddress) && !/kathmandu/i.test(deliveryLocation.label)) {
      return getShortAddress(`${deliveryLocation.label}, Kathmandu`);
    }

    return getShortAddress(deliveryLocation.label);
  }

  return getShortAddress(
    deliveryLocation?.address ||
    deliveryAddress ||
    defaultAddressEntry?.address ||
    defaultAddressEntry?.label ||
    'Naxal, Kathmandu'
  );
}

export default function DiscoveryPage({ session, supabase, onLogout }) {
  const isTemporaryAuth = Boolean(session?.isTemporaryAuth);
  const sessionProfileSettings = useMemo(
    () => buildSessionCustomerSettings(session),
    [session],
  );
  const initialAddress = normalizeDeliveryAddress(sessionProfileSettings.defaultAddress);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [feed, setFeed] = useState([]);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [activeRestaurantId, setActiveRestaurantId] = useState(null);
  const [screen, setScreen] = useState('browse');
  const [deliveryAddress, setDeliveryAddress] = useState(initialAddress);
  const [deliveryLocation, setDeliveryLocation] = useState(() => (
    sessionProfileSettings.addresses.find((entry) => entry.id === sessionProfileSettings.defaultAddressId) || null
  ));
  const [deliveryAddressMode, setDeliveryAddressMode] = useState(
    sessionProfileSettings.addresses.length ? 'saved' : 'search',
  );
  const [cartView, setCartView] = useState('cart');
  const [orderView, setOrderView] = useState('current');
  const [customerOrders, setCustomerOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [checkoutSuccess, setCheckoutSuccess] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHOD_CASH);
  const [profileSettings, setProfileSettings] = useState(sessionProfileSettings);
  const [profileForm, setProfileForm] = useState({
    fullName: sessionProfileSettings.fullName,
    phone: sessionProfileSettings.phone,
    avatarUrl: sessionProfileSettings.avatarUrl || '',
  });
  const [showAllQuickCategories, setShowAllQuickCategories] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [addressDraft, setAddressDraft] = useState(createAddressDraft());
  const [editingAddressId, setEditingAddressId] = useState('');
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [cartPreview, setCartPreview] = useState(null);
  const [favoriteRestaurantIds, setFavoriteRestaurantIds] = useState(readFavoriteRestaurantIds);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

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

  const loadCustomerOrders = useCallback(async ({ silent = false } = {}) => {
    if (isTemporaryAuth || !session?.user?.id) {
      setCustomerOrders([]);
      setOrdersLoading(false);
      setOrdersError('');
      return;
    }

    if (!silent) {
      setOrdersLoading(true);
      setOrdersError('');
    }

    const { data, error: orderError } = await fetchCustomerOrders(supabase, session.user.id, { limit: 30 });

    if (orderError) {
      if (!silent) {
        setCustomerOrders([]);
        setOrdersError('Could not load your orders right now.');
      }
    } else {
      const nextOrders = (data || []).map(normalizeOrderRecord).filter(Boolean);
      setCustomerOrders((current) => (
        silent ? mergeOrderRecords(current, nextOrders) : mergeOrderRecords(nextOrders, [])
      ));
      setOrdersError('');
    }

    if (!silent) {
      setOrdersLoading(false);
    }
  }, [isTemporaryAuth, session?.user?.id, supabase]);

  useEffect(() => {
    if (!cartNotice) {
      return undefined;
    }

    const timer = setTimeout(() => {
      dismissNotice();
    }, 3200);

    return () => clearTimeout(timer);
  }, [cartNotice, dismissNotice]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setProfileSettings(sessionProfileSettings);
      setProfileForm({
        fullName: sessionProfileSettings.fullName,
        phone: sessionProfileSettings.phone,
        avatarUrl: sessionProfileSettings.avatarUrl || '',
      });
      setDeliveryAddress(normalizeDeliveryAddress(sessionProfileSettings.defaultAddress));
      setDeliveryLocation(
        sessionProfileSettings.addresses.find((entry) => entry.id === sessionProfileSettings.defaultAddressId) || null,
      );
      setDeliveryAddressMode(sessionProfileSettings.addresses.length ? 'saved' : 'search');
    }, 0);

    return () => clearTimeout(timer);
  }, [sessionProfileSettings]);

  useEffect(() => {
    if (cartItems.length && checkoutSuccess) {
      const timer = setTimeout(() => {
        setCheckoutSuccess(null);
      }, 0);

      return () => clearTimeout(timer);
    }

    return undefined;
  }, [cartItems.length, checkoutSuccess]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const params = new URLSearchParams(window.location.search);
    const paymentResult = params.get('payment');

    if (!paymentResult?.startsWith('esewa-')) {
      return undefined;
    }

    let active = true;

    async function resolveEsewaReturn() {
      const pendingPayment = readPendingEsewaPayment();
      setScreen('cart');
      setCartView('orders');
      setOrderView('current');

      if (!pendingPayment) {
        if (active) {
          setCheckoutMessage('Returned from eSewa, but no pending payment was found.');
          clearEsewaReturnParams();
        }
        return;
      }

      if (paymentResult === 'esewa-failure') {
        if (pendingPayment.orderId && !pendingPayment.temporary) {
          await updateOrderPaymentStatus(supabase, {
            orderId: pendingPayment.orderId,
            paymentStatus: 'failed',
            paymentMethod: PAYMENT_METHOD_ESEWA,
            paymentProvider: 'esewa',
            paymentReference: pendingPayment.transactionUuid,
            paymentIntentId: pendingPayment.transactionUuid,
          });
        }

        if (active) {
          clearPendingEsewaPayment();
          clearEsewaReturnParams();
          setCheckoutMessage('eSewa payment was cancelled or failed.');
        }
        return;
      }

      try {
        const response = decodeEsewaResponseData(params.get('data') || '');
        if (!response || !verifyEsewaResponseSignature(response)) {
          throw new Error('Could not verify eSewa payment signature.');
        }

        const nextPaymentStatus = mapEsewaStatusToPaymentStatus(response.status);
        if (pendingPayment.orderId && !pendingPayment.temporary) {
          const { error: paymentError } = await updateOrderPaymentStatus(supabase, {
            orderId: pendingPayment.orderId,
            paymentStatus: nextPaymentStatus,
            paymentMethod: PAYMENT_METHOD_ESEWA,
            paymentProvider: 'esewa',
            paymentReference: response.transaction_code || response.refId || response.ref_id || pendingPayment.transactionUuid,
            paymentIntentId: response.transaction_uuid || pendingPayment.transactionUuid,
            paymentAmount: response.total_amount,
            paymentCurrency: 'NPR',
            paymentMetadata: response,
          });

          if (paymentError) {
            throw paymentError;
          }
        }

        if (active) {
          clearPendingEsewaPayment();
          clearEsewaReturnParams();
          clearCart();
          setCheckoutSuccess({
            ...pendingPayment.orderSummary,
            paymentStatus: nextPaymentStatus,
          });
          setCheckoutMessage(
            nextPaymentStatus === 'paid'
              ? 'eSewa payment complete. Order placed successfully.'
              : `eSewa returned ${response.status || 'an incomplete status'}.`,
          );
        }
      } catch (paymentError) {
        if (active) {
          clearPendingEsewaPayment();
          clearEsewaReturnParams();
          setCheckoutMessage(paymentError.message || 'Could not verify eSewa payment.');
        }
      }
    }

    resolveEsewaReturn();

    return () => {
      active = false;
    };
  }, [clearCart, supabase]);

  useEffect(() => {
    if (!cartPreview) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setCartPreview(null);
    }, 3600);

    return () => clearTimeout(timer);
  }, [cartPreview]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteRestaurantIds));
  }, [favoriteRestaurantIds]);

  useEffect(() => {
    let active = true;

    const loadFeed = async () => {
      setLoading(true);
      setError('');

      const { data, error: feedError } = await fetchRestaurantFeed(supabase, { limit: 60 });
      if (!active) {
        return;
      }

      if (feedError) {
        setFeed([]);
        setError('Could not load restaurants right now.');
      } else {
        const nextFeed = data || [];
        setFeed(nextFeed);
        setActiveRestaurantId((current) => current || nextFeed[0]?.id || null);
      }

      setLoading(false);
    };

    loadFeed();
    return () => {
      active = false;
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
    let active = true;

    const loadProfileSettings = async () => {
      if (isTemporaryAuth || !session?.user?.id) {
        return;
      }

      setProfileLoading(true);
      setProfileError('');

      const { data, error: customerSettingsError } = await fetchCustomerSettings(
        supabase,
        session.user.id,
      );

      if (!active) {
        return;
      }

      if (customerSettingsError) {
        setProfileError('Could not load your profile settings right now.');
      } else if (data) {
        setProfileSettings(data);
        setProfileForm({
          fullName: data.fullName || '',
          phone: data.phone || '',
          avatarUrl: data.avatarUrl || '',
        });
        setDeliveryAddress(normalizeDeliveryAddress(data.defaultAddress));
        setDeliveryLocation(data.addresses.find((entry) => entry.id === data.defaultAddressId) || null);
        setDeliveryAddressMode(data.addresses?.length ? 'saved' : 'search');
      }

      setProfileLoading(false);
    };

    loadProfileSettings();

    return () => {
      active = false;
    };
  }, [isTemporaryAuth, session?.user?.id, supabase]);

  useEffect(() => {
    loadCustomerOrders();
  }, [checkoutSuccess, loadCustomerOrders]);

  // Realtime: subscribe to rider location updates on active customer orders
  useEffect(() => {
    if (isTemporaryAuth || !session?.user?.id || !supabase) {
      return undefined;
    }

    return subscribeToCustomerOrders(supabase, session.user.id, (payload) => {
      const updated = payload.new;
      if (!updated?.id) {
        return;
      }

      setCustomerOrders((prev) => mergeOrderRecords(prev, [updated]));
    });
  }, [isTemporaryAuth, session?.user?.id, supabase]);

  const filteredRestaurants = useMemo(
    () => filterRestaurantFeed(feed, searchQuery),
    [feed, searchQuery],
  );
  const visibleQuickCategories = useMemo(
    () => (showAllQuickCategories ? QUICK_CATEGORIES : QUICK_CATEGORIES.slice(0, 5)),
    [showAllQuickCategories],
  );

  const featuredRestaurants = useMemo(
    () => filteredRestaurants.slice(0, 2),
    [filteredRestaurants],
  );

  const remainingRestaurants = useMemo(
    () => filteredRestaurants.slice(2),
    [filteredRestaurants],
  );

  const favoriteRestaurantIdSet = useMemo(
    () => new Set(favoriteRestaurantIds),
    [favoriteRestaurantIds],
  );

  const favoriteRestaurants = useMemo(
    () => feed.filter((restaurant) => favoriteRestaurantIdSet.has(restaurant.id)),
    [favoriteRestaurantIdSet, feed],
  );

  const resolvedActiveRestaurantId = useMemo(() => {
    if (!feed.length) {
      return null;
    }

    const exists = feed.some((restaurant) => restaurant.id === activeRestaurantId);
    return exists ? activeRestaurantId : feed[0].id;
  }, [feed, activeRestaurantId]);

  const activeRestaurant = useMemo(
    () => feed.find((restaurant) => restaurant.id === resolvedActiveRestaurantId) || null,
    [feed, resolvedActiveRestaurantId],
  );

  const activeMenuItems = useMemo(
    () => filterMenuItems(activeRestaurant?.menuItems || [], searchQuery),
    [activeRestaurant, searchQuery],
  );

  const menuQuantityMap = useMemo(() => {
    return cartItems.reduce((acc, item) => {
      acc[item.id] = item.quantity;
      return acc;
    }, {});
  }, [cartItems]);

  const canAddFromActiveRestaurant = true;
  const temporaryOrders = useMemo(() => {
    if (!checkoutSuccess) {
      return [];
    }

    return [{
      id: checkoutSuccess.orderId,
      restaurantName: checkoutSuccess.restaurantName,
      totalAmount: checkoutSuccess.totalAmount,
      status: ORDER_STATUS.PLACED,
      createdAt: new Date().toISOString(),
      deliveryAddress: checkoutSuccess.deliveryAddress,
      deliveryFee: checkoutSuccess.deliveryFee,
      lineItems: checkoutSuccess.lineItems || [],
    }];
  }, [checkoutSuccess]);
  const allCustomerOrders = isTemporaryAuth ? temporaryOrders : customerOrders;
  const currentOrders = useMemo(() => getCurrentOrders(allCustomerOrders).slice(0, 1), [allCustomerOrders]);
  const pastOrders = useMemo(() => getPastOrders(allCustomerOrders), [allCustomerOrders]);
  const currentOrderPreview = currentOrders[0] || null;
  const hasBlockingCurrentOrder = Boolean(currentOrderPreview);
  const currentOrderRestaurantName = currentOrderPreview?.restaurant?.name
    || currentOrderPreview?.restaurantName
    || currentOrderPreview?.restaurant_name
    || 'Your order';

  const checkoutDeliveryFee = cartGroups.reduce((sum, group) => sum + group.deliveryFee, 0);
  const checkoutSummary = getSummary(checkoutDeliveryFee);
  const hasValidAddress = isValidDeliveryAddress(deliveryAddress);
  const checkoutButtonLabel = checkoutLoading
    ? 'Placing order...'
    : hasBlockingCurrentOrder
      ? 'Track current order'
    : !cartItems.length
      ? 'Add items to checkout'
    : !hasValidAddress
      ? 'Enter delivery address'
      : paymentMethod === PAYMENT_METHOD_ESEWA
        ? 'Pay with eSewa'
        : 'Place order';
  const addressHelperText = hasBlockingCurrentOrder
    ? 'Finish your ongoing order before placing another.'
    : !cartItems.length
    ? 'Add items first to unlock checkout and delivery details.'
    : hasValidAddress
      ? 'This address will be used for delivery and order confirmation.'
      : 'Enter at least 6 characters for a complete delivery address.';
  const addressHelperClassName = !cartItems.length || hasValidAddress
    ? 'discover-note'
    : 'discover-error';

  const fullName = profileSettings.fullName || session?.user?.phone || 'Hey User';
  const firstName = fullName.split(' ')[0] || fullName;
  const defaultAddressEntry = useMemo(
    () => profileSettings.addresses.find((entry) => entry.id === profileSettings.defaultAddressId) || null,
    [profileSettings.addresses, profileSettings.defaultAddressId],
  );
  const topLocationLabel = formatTopLocationLabel(deliveryLocation, deliveryAddress, defaultAddressEntry);
  const selectedDeliveryAddressId = useMemo(() => (
    profileSettings.addresses.find((address) => (
      address.id === deliveryLocation?.id || address.address === deliveryAddress
    ))?.id || ''
  ), [deliveryAddress, deliveryLocation?.id, profileSettings.addresses]);
  const hasSavedDeliveryAddresses = profileSettings.addresses.length > 0;

  useEffect(() => {
    if (isTemporaryAuth || !session?.user?.id || !currentOrders.length) {
      return undefined;
    }

    const timer = setInterval(() => {
      loadCustomerOrders({ silent: true });
    }, 15000);

    return () => clearInterval(timer);
  }, [currentOrders.length, isTemporaryAuth, loadCustomerOrders, session?.user?.id]);

  const handleOpenRestaurant = (restaurantId) => {
    setActiveRestaurantId(restaurantId);
    setScreen('restaurant');
  };

  const handleOpenBrowseScreen = () => {
    setSearchQuery('');
    setScreen('browse');
  };

  const handleOpenSearchScreen = () => {
    setScreen('search');
  };

  const handleOpenFavoritesScreen = () => {
    setScreen('favorites');
  };

  const handleOpenProfileScreen = () => {
    setScreen('profile');
  };

  const handleOpenCartScreen = () => {
    if (!cartItems.length && currentOrderPreview) {
      setCartView('orders');
      setOrderView('current');
    } else {
      setCartView('cart');
    }
    setScreen('cart');
  };

  const handleTopSearchChange = (value) => {
    setSearchQuery(value);

    if (screen !== 'restaurant' && String(value || '').trim()) {
      setScreen('search');
    }
  };

  const handleQuickCategorySearch = (category) => {
    setSearchQuery(category);
    setScreen('search');
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

  const resolveCurrentLocation = async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Location services are not available in this browser.');
    }

    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      });
    });
    const coordinates = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    const geo = await reverseGeocode(coordinates);
    const displayAddress = geo?.formattedAddress || geo?.address || `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;

    const shortLabel = geo?.name || displayAddress.split(',')[0]?.trim() || displayAddress;

    return {
      id: 'current-location',
      label: shortLabel,
      address: displayAddress,
      formattedAddress: geo?.formattedAddress || displayAddress,
      coordinates: geo?.coordinates || coordinates,
      placeId: geo?.placeId || '',
    };
  };

  const handleUseCurrentDeliveryLocation = async () => {
    if (locationLoading) {
      return;
    }

    setLocationLoading(true);
    setLocationError('');

    try {
      const currentLocation = await resolveCurrentLocation();
      handleSelectDeliveryAddress(currentLocation);
      setDeliveryAddressMode('search');
    } catch (locationFailure) {
      setLocationError(locationFailure.message || 'Could not access your current location.');
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
      const currentLocation = await resolveCurrentLocation();
      setAddressDraft((current) => ({
        ...current,
        label: current.label || 'Current location',
        address: currentLocation.address,
        formattedAddress: currentLocation.formattedAddress,
        coordinates: currentLocation.coordinates,
        placeId: currentLocation.placeId,
      }));
    } catch (locationFailure) {
      setAddressError(locationFailure.message || 'Could not access your current location.');
      setLocationError(locationFailure.message || 'Could not access your current location.');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleAddMenuItemToCart = (restaurant, item) => {
    if (!restaurant || !item) {
      return;
    }

    const nextQuantity = (menuQuantityMap[item.id] || 0) + 1;
    const itemPrice = Number(item.price || 0);
    const nextSubtotal = checkoutSummary.subtotal + itemPrice;
    const hasRestaurantInCart = cartGroups.some((group) => group.restaurant.id === restaurant.id);
    const nextDeliveryFee = checkoutDeliveryFee + (hasRestaurantInCart ? 0 : getDeliveryFee(restaurant.id));

    incrementItem(restaurant, item);
    setCartPreview({
      item: {
        ...item,
        quantity: nextQuantity,
      },
      restaurant,
      itemCount: checkoutSummary.itemCount + 1,
      total: nextSubtotal + nextDeliveryFee,
    });
  };

  const handleSelectDeliveryAddress = (address) => {
    const nextAddress = normalizeDeliveryAddress(address?.address || address?.formattedAddress || '');

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

  const handleCheckout = async () => {
    if (!cartItems.length || !cartGroups.length || checkoutLoading) {
      return;
    }

    if (hasBlockingCurrentOrder) {
      setCartView('orders');
      setOrderView('current');
      setScreen('cart');
      setCheckoutMessage('Finish your ongoing order before placing another.');
      return;
    }

    if (!hasValidAddress) {
      setCheckoutMessage('Please enter a complete delivery address.');
      return;
    }

    const normalizedAddress = normalizeDeliveryAddress(deliveryAddress);
    const isMultiRestaurantCart = cartGroups.length > 1;
    const transactionUuid = createEsewaTransactionUuid(cartGroups[0]?.restaurant?.id || 'cart');
    const orderSummary = {
      itemCount: checkoutSummary.itemCount,
      subtotal: checkoutSummary.subtotal,
      deliveryFee: checkoutDeliveryFee,
      totalAmount: checkoutSummary.total,
      restaurantName: isMultiRestaurantCart ? `${cartGroups.length} restaurants` : cartGroups[0]?.restaurant?.name || '',
      deliveryAddress: normalizedAddress,
      lineItems: cartItems,
    };

    setCheckoutLoading(true);
    setCheckoutMessage('');
    setCheckoutSuccess(null);

    if (isTemporaryAuth) {
      if (paymentMethod === PAYMENT_METHOD_ESEWA) {
        setCheckoutMessage('eSewa checkout needs one restaurant per payment. Use cash for multi-restaurant checkout.');
        setCheckoutLoading(false);
        return;
      }

      setCheckoutSuccess({
        orderId: `temp-${cartGroups.map((group) => group.restaurant.id).join('-')}`,
        ...orderSummary,
      });
      setCheckoutMessage(`Temporary login mode: simulated order (${checkoutSummary.itemCount} items).`);
      setCartView('orders');
      setOrderView('current');
      clearCart();
      setCheckoutLoading(false);
      return;
    }

    if (isMultiRestaurantCart && paymentMethod === PAYMENT_METHOD_ESEWA) {
      setCheckoutMessage('eSewa checkout needs one restaurant per payment. Use cash for multi-restaurant checkout.');
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

      checkoutResults.push({ ...data, restaurantName: group.restaurant.name });
    }

    if (checkoutError) {
      setCheckoutMessage(checkoutError.message || 'Could not place order. Please try again.');
    } else {
      const nextOrderSummary = {
        orderId: checkoutResults.map((result) => result.orderId).filter(Boolean).join(', '),
        ...orderSummary,
        itemCount: checkoutResults.reduce((sum, result) => sum + (result.itemCount || 0), 0) || orderSummary.itemCount,
        subtotal: checkoutResults.reduce((sum, result) => sum + (result.subtotal || 0), 0) || orderSummary.subtotal,
        deliveryFee: checkoutResults.reduce((sum, result) => sum + (result.deliveryFee || 0), 0) || orderSummary.deliveryFee,
        totalAmount: checkoutResults.reduce((sum, result) => sum + (result.totalAmount || 0), 0) || orderSummary.totalAmount,
      };

      if (paymentMethod === PAYMENT_METHOD_ESEWA) {
        const request = buildEsewaPaymentRequest({
          subtotal: nextOrderSummary.subtotal,
          deliveryFee: nextOrderSummary.deliveryFee,
          totalAmount: nextOrderSummary.totalAmount,
          transactionUuid,
          successUrl: buildEsewaReturnUrl('esewa-success'),
          failureUrl: buildEsewaReturnUrl('esewa-failure'),
        });

        writePendingEsewaPayment({
          orderId: nextOrderSummary.orderId,
          transactionUuid,
          orderSummary: nextOrderSummary,
        });
        setCheckoutMessage('Redirecting to eSewa sandbox...');
        submitEsewaPostForm(request.paymentUrl, request.fields);
        return;
      }

      setCheckoutSuccess(nextOrderSummary);
      setCheckoutMessage('');
      setCartView('orders');
      setOrderView('current');
      clearCart();
    }

    setCheckoutLoading(false);
  };

  const handleSaveProfile = async () => {
    const nextFullName = String(profileForm.fullName || '').trim();
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

    if (isTemporaryAuth) {
      setProfileSettings((current) => ({
        ...current,
        fullName: nextFullName,
        phone: nextPhone,
        avatarUrl: nextAvatarUrl,
      }));
      setProfileForm((current) => ({
        ...current,
        fullName: nextFullName,
        phone: nextPhone,
        avatarUrl: nextAvatarUrl,
      }));
      setProfileMessage('Temporary login mode: profile changes are saved only for this session.');
      setProfileSaving(false);
      return;
    }

    const { data, error: saveError } = await updateCustomerSettings(supabase, {
      fullName: nextFullName,
      phone: nextPhone,
      avatarUrl: nextAvatarUrl,
      addresses: profileSettings.addresses,
      defaultAddressId: profileSettings.defaultAddressId,
    });

    if (saveError) {
      setProfileError(saveError.message || 'Could not save your profile right now.');
      setProfileSaving(false);
      return;
    }

    const updatedSettings = {
      ...profileSettings,
      ...data,
      fullName: data?.fullName || nextFullName,
      phone: data?.phone || nextPhone,
      avatarUrl: data?.avatarUrl || nextAvatarUrl,
    };

    setProfileSettings(updatedSettings);
    setProfileForm((current) => ({
      ...current,
      fullName: updatedSettings.fullName,
      phone: updatedSettings.phone,
      avatarUrl: updatedSettings.avatarUrl || '',
    }));
    setDeliveryAddress(normalizeDeliveryAddress(updatedSettings.defaultAddress));
    setProfileMessage('Your profile details are up to date.');
    setProfileSaving(false);
  };

  const saveAddressSettings = async (nextAddresses, nextDefaultAddressId) => {
    const normalizedAddresses = normalizeSavedAddresses(nextAddresses, deliveryAddress || initialAddress);
    const resolvedDefaultAddressId = resolveDefaultSavedAddressId(
      normalizedAddresses,
      nextDefaultAddressId || profileSettings.defaultAddressId,
    );
    const resolvedDefaultAddress = getDefaultSavedAddress(
      normalizedAddresses,
      resolvedDefaultAddressId,
      deliveryAddress || initialAddress,
    );
    const nextSettings = {
      ...profileSettings,
      addresses: normalizedAddresses,
      defaultAddressId: resolvedDefaultAddressId,
      defaultAddress: resolvedDefaultAddress,
    };

    if (isTemporaryAuth) {
      setProfileSettings(nextSettings);
      setDeliveryAddress(normalizeDeliveryAddress(resolvedDefaultAddress));
      setDeliveryLocation(normalizedAddresses.find((entry) => entry.id === resolvedDefaultAddressId) || null);
      return { error: null, temporary: true };
    }

    const { data, error: saveError } = await updateCustomerSettings(supabase, {
      fullName: profileSettings.fullName,
      phone: profileSettings.phone,
      addresses: normalizedAddresses,
      defaultAddressId: resolvedDefaultAddressId,
    });

    if (saveError) {
      return { error: saveError, temporary: false };
    }

    const updatedSettings = {
      ...nextSettings,
      ...data,
    };
    setProfileSettings(updatedSettings);
    setDeliveryAddress(normalizeDeliveryAddress(updatedSettings.defaultAddress));
    setDeliveryLocation(updatedSettings.addresses.find((entry) => entry.id === updatedSettings.defaultAddressId) || null);
    return { error: null, temporary: false };
  };

  const handleSaveAddress = async () => {
    const nextLabel = String(addressDraft.label || '').trim();
    const nextAddress = normalizeDeliveryAddress(addressDraft.address, '');

    if (!nextLabel) {
      setAddressError('Add a short label for this address.');
      return;
    }

    if (!isValidDeliveryAddress(nextAddress)) {
      setAddressError('Choose a complete address.');
      return;
    }

    setAddressSaving(true);
    setAddressError('');
    setProfileError('');
    setProfileMessage('');

    const nextEntry = {
      id: editingAddressId || createLocalAddressId(),
      label: nextLabel,
      address: nextAddress,
      formattedAddress: addressDraft.formattedAddress || nextAddress,
      coordinates: addressDraft.coordinates,
      placeId: addressDraft.placeId || '',
    };
    const baseAddresses = editingAddressId
      ? profileSettings.addresses.map((entry) => (entry.id === editingAddressId ? nextEntry : entry))
      : [...profileSettings.addresses, nextEntry];
    const nextDefaultAddressId = profileSettings.defaultAddressId || nextEntry.id;
    const { error: saveError, temporary } = await saveAddressSettings(baseAddresses, nextDefaultAddressId);

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

  const handleSetDefaultAddress = async (addressId) => {
    if (!addressId || addressId === profileSettings.defaultAddressId) {
      return;
    }

    setAddressSaving(true);
    setAddressError('');
    const { error: saveError, temporary } = await saveAddressSettings(profileSettings.addresses, addressId);

    if (saveError) {
      setAddressError(saveError.message || 'Could not set default address.');
    } else {
      setProfileMessage(temporary ? 'Default address changed for this session.' : 'Default address updated.');
    }

    setAddressSaving(false);
  };

  const handleDeleteAddress = async (addressId) => {
    const nextAddresses = profileSettings.addresses.filter((entry) => entry.id !== addressId);
    if (!nextAddresses.length) {
      setAddressError('Keep at least one saved address.');
      return;
    }

    setAddressSaving(true);
    setAddressError('');
    const nextDefaultAddressId = resolveDefaultSavedAddressId(
      nextAddresses,
      profileSettings.defaultAddressId === addressId ? '' : profileSettings.defaultAddressId,
    );
    const { error: saveError } = await saveAddressSettings(nextAddresses, nextDefaultAddressId);

    if (saveError) {
      setAddressError(saveError.message || 'Could not remove this address.');
    } else {
      if (editingAddressId === addressId) {
        setEditingAddressId('');
        setAddressDraft(createAddressDraft());
      }
      setProfileMessage('Address removed.');
    }

    setAddressSaving(false);
  };

  const stageTitle = screen === 'browse'
    ? 'Browse restaurants'
    : screen === 'search'
      ? 'Advanced search'
      : screen === 'favorites'
        ? 'Favorite restaurants'
    : screen === 'profile'
      ? 'Profile settings'
      : screen === 'cart'
        ? 'Cart & orders'
        : activeRestaurant?.name || 'Menu';
  const stageSubtitle = screen === 'browse'
    ? 'Fresh picks around Kathmandu.'
    : screen === 'search'
      ? 'Search by dish, restaurant, cuisine, or area.'
      : screen === 'favorites'
        ? 'Restaurants you saved for fast reordering.'
    : screen === 'profile'
      ? 'Keep your account details current.'
      : screen === 'cart'
        ? 'Checkout, ongoing orders, and past orders.'
        : 'Choose dishes from this restaurant.';

  return (
    <main className="discover-shell">
      <nav className="discover-nav">
        <div className="discover-nav-inner">
          <button type="button" className="discover-nav-brand" onClick={handleOpenBrowseScreen}>
            <img src={Logo} alt="Chito Mitho logo" />
            <span>Chito Mitho</span>
          </button>

          <div className="discover-nav-actions">
            <button
              type="button"
              className={`discover-main-btn ${screen === 'browse' ? 'is-active' : ''}`}
              onClick={handleOpenBrowseScreen}
            >
              <IconHome />
              <span className="discover-nav-label">Home</span>
            </button>
            <button
              type="button"
              className={`discover-main-btn ${screen === 'search' ? 'is-active' : ''}`}
              onClick={handleOpenSearchScreen}
            >
              <IconSearch />
              <span className="discover-nav-label">Search</span>
            </button>
            <button
              type="button"
              className={`discover-main-btn ${screen === 'favorites' ? 'is-active' : ''}`}
              onClick={handleOpenFavoritesScreen}
            >
              <IconHeart />
              <span className="discover-nav-label">Favorites</span>
            </button>
            <button
              type="button"
              className="discover-logout"
              onClick={onLogout}
              aria-label={isTemporaryAuth ? 'Exit temp login' : 'Logout'}
              title={isTemporaryAuth ? 'Exit temp login' : 'Logout'}
            >
              <IconLogout />
            </button>
          </div>
        </div>
      </nav>

      <section className="discover-stage">
        <header className="discover-stage-head">
          <p className="discover-kicker">Hey {firstName}</p>
          <h1>{stageTitle}</h1>
          <p className="discover-subtitle">{stageSubtitle}</p>
        </header>

        <div className="discover-stage-row">
          <div className="discover-location-group">
            <button type="button" className="discover-location-chip" onClick={handleUseCurrentDeliveryLocation} disabled={locationLoading}>
              <IconLocation />
      <span>{locationLoading ? 'Locating...' : topLocationLabel}</span>
            </button>
          </div>

          <SearchField
            value={searchQuery}
            onChange={handleTopSearchChange}
            placeholder={screen === 'restaurant' ? 'Search menu items' : 'Search for food, restaurants, cuisines...'}
          />

          <div className="discover-top-actions">
            <button type="button" className="discover-top-cart" onClick={handleOpenCartScreen} aria-label="Open cart">
              <IconCart />
              {itemCount ? <span>{itemCount}</span> : null}
            </button>
            <button type="button" className="discover-avatar-button" onClick={handleOpenProfileScreen} aria-label="Open profile">
              {profileSettings.avatarUrl ? <img src={profileSettings.avatarUrl} alt="" /> : firstName.charAt(0).toUpperCase()}
            </button>
          </div>
        </div>

        {isTemporaryAuth && (
          <p className="discover-note">
            Temporary login mode: checkout is simulated and this login clears on refresh.
          </p>
        )}

        {!!cartNotice && (
          <div className="discover-notice">
            {cartNotice}
          </div>
        )}

        {locationError ? (
          <p className="discover-error">{locationError}</p>
        ) : null}
      </section>

      <section className="discover-layout">
        {screen === 'browse' ? (
          <section className="discover-restaurants">
            <div className="discover-home-top">
              <div className="discover-craving-copy">
                <p>Hi {firstName}</p>
                <h2>What are you craving today?</h2>
              </div>
            </div>

            <div className="discover-category-row" aria-label="Food categories">
              {visibleQuickCategories.map((category) => (
                <button key={category} type="button" onClick={() => handleQuickCategorySearch(category)}>
                  <span>{category.charAt(0)}</span>
                  {category}
                </button>
              ))}
              {QUICK_CATEGORIES.length > 5 ? (
                <button
                  type="button"
                  className="discover-category-more"
                  onClick={() => setShowAllQuickCategories((current) => !current)}
                >
                  <span><IconSearch /></span>
                  {showAllQuickCategories ? 'Less' : 'More'}
                </button>
              ) : null}
            </div>

            {currentOrderPreview ? (
              <aside className="discover-live-order-popover" aria-live="polite">
                <div>
                  <span>Ongoing order</span>
                  <strong>{currentOrderRestaurantName}</strong>
                  <p>{formatOrderStatus(currentOrderPreview.status)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCartView('orders');
                    setOrderView('current');
                    setScreen('cart');
                  }}
                >
                  Track
                </button>
              </aside>
            ) : null}

            <header className="discover-restaurants-head">
              <div>
                <h2>Popular restaurants</h2>
                <p>Featured kitchens and daily favorites.</p>
              </div>
              <span>{filteredRestaurants.length} results</span>
            </header>

            {loading && <p className="discover-note">Loading restaurants...</p>}
            {!loading && error && <p className="discover-error">{error}</p>}
            {!loading && !error && !filteredRestaurants.length && (
              <p className="discover-note">No restaurants match your search.</p>
            )}

            {!!featuredRestaurants.length && (
              <>
                <div className="discover-subhead">
                  <h3>Featured</h3>
                  <span>Top picks</span>
                </div>
                <div className="discover-featured-grid">
                  {featuredRestaurants.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      active={restaurant.id === resolvedActiveRestaurantId}
                      isFavorite={favoriteRestaurantIdSet.has(restaurant.id)}
                      onSelect={handleOpenRestaurant}
                      onToggleFavorite={handleToggleFavoriteRestaurant}
                    />
                  ))}
                </div>
              </>
            )}

            {!!remainingRestaurants.length && (
              <>
                <div className="discover-subhead">
                  <h3>More restaurants</h3>
                  <span>Full catalog</span>
                </div>
                <div className="discover-all-grid">
                  {remainingRestaurants.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      compact
                      active={restaurant.id === resolvedActiveRestaurantId}
                      isFavorite={favoriteRestaurantIdSet.has(restaurant.id)}
                      onSelect={handleOpenRestaurant}
                      onToggleFavorite={handleToggleFavoriteRestaurant}
                    />
                  ))}
                </div>
              </>
            )}

            {!loading && !error && !!featuredRestaurants.length && !remainingRestaurants.length && (
              <p className="discover-note discover-note-muted">
                All current results are already shown in featured.
              </p>
            )}
          </section>
        ) : screen === 'search' ? (
          <section className="discover-search-page">
            <header className="discover-page-head">
              <div>
                <span>Advanced search</span>
                <h2>Find exactly what you want</h2>
                <p>Search restaurants, menu items, cuisines, or delivery areas.</p>
              </div>
              <strong>{filteredRestaurants.length} matches</strong>
            </header>

            <div className="discover-advanced-search-panel">
              <div className="discover-search-filter-row" aria-label="Popular search filters">
                <button
                  type="button"
                  className={!searchQuery ? 'is-active' : ''}
                  onClick={() => setSearchQuery('')}
                >
                  All
                </button>
                {QUICK_CATEGORIES.filter((category) => category !== 'More').map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={searchQuery === category ? 'is-active' : ''}
                    onClick={() => setSearchQuery(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {loading && <p className="discover-note">Loading restaurants...</p>}
            {!loading && error && <p className="discover-error">{error}</p>}
            {!loading && !error && !filteredRestaurants.length ? (
              <div className="discover-empty">
                <IconEmptySearch />
                <h3>No matches found</h3>
                <p>Try a restaurant name, cuisine, nearby area, or another dish.</p>
                <button type="button" className="discover-empty-btn" onClick={() => setSearchQuery('')}>Clear search</button>
              </div>
            ) : null}

            {!loading && !error && filteredRestaurants.length ? (
              <div className="discover-all-grid discover-search-results-grid">
                {filteredRestaurants.map((restaurant) => (
                  <RestaurantCard
                    key={restaurant.id}
                    restaurant={restaurant}
                    compact
                    active={restaurant.id === resolvedActiveRestaurantId}
                    isFavorite={favoriteRestaurantIdSet.has(restaurant.id)}
                    onSelect={handleOpenRestaurant}
                    onToggleFavorite={handleToggleFavoriteRestaurant}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : screen === 'favorites' ? (
          <section className="discover-favorites-page">
            <header className="discover-page-head">
              <div>
                <span>Favorites</span>
                <h2>Saved restaurants</h2>
                <p>Use the heart on any restaurant card to save or remove it.</p>
              </div>
              <strong>{favoriteRestaurants.length} saved</strong>
            </header>

            {favoriteRestaurants.length ? (
              <div className="discover-all-grid">
                {favoriteRestaurants.map((restaurant) => (
                  <RestaurantCard
                    key={restaurant.id}
                    restaurant={restaurant}
                    compact
                    active={restaurant.id === resolvedActiveRestaurantId}
                    isFavorite
                    onSelect={handleOpenRestaurant}
                    onToggleFavorite={handleToggleFavoriteRestaurant}
                  />
                ))}
              </div>
            ) : (
              <div className="discover-empty">
                <IconEmptyFavorites />
                <h3>No favorites yet</h3>
                <p>Save restaurants from Home or Search, then they will appear here.</p>
                <button type="button" className="discover-empty-btn" onClick={handleOpenBrowseScreen}>Browse restaurants</button>
              </div>
            )}
          </section>
        ) : screen === 'profile' ? (
          <section className="discover-profile">
            <div className="discover-profile-grid">
              <aside className="discover-profile-panel">
                <div className="discover-profile-hero">
                  <span className="discover-profile-badge">Account</span>
                  <label className="discover-profile-avatar-upload" title="Click to change profile picture">
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !session?.user?.id) return;
                        try {
                          setProfileSaving(true);
                          setProfileError('');
                          setProfileMessage('');
                          const { data, error: uploadError } = await uploadAvatar(supabase, session.user.id, file);
                          if (uploadError || !data?.url) {
                            throw uploadError || new Error('Could not upload profile picture.');
                          }
                          const nextAvatarUrl = data.url;
                          const nextSettings = { ...profileSettings, avatarUrl: nextAvatarUrl };
                          setProfileSettings(nextSettings);
                          setProfileForm((prev) => ({ ...prev, avatarUrl: nextAvatarUrl }));

                          if (!isTemporaryAuth) {
                            const { error: saveError } = await updateCustomerSettings(supabase, {
                              fullName: profileForm.fullName || profileSettings.fullName,
                              phone: profileForm.phone || profileSettings.phone,
                              avatarUrl: nextAvatarUrl,
                              addresses: profileSettings.addresses,
                              defaultAddressId: profileSettings.defaultAddressId,
                            });
                            if (saveError) {
                              throw saveError;
                            }
                          }

                          setProfileMessage('Profile picture updated.');
                        } catch (uploadError) {
                          setProfileError(uploadError.message || 'Could not upload profile picture.');
                        } finally {
                          setProfileSaving(false);
                        }
                      }}
                    />
                    {profileSettings.avatarUrl ? (
                      <img src={profileSettings.avatarUrl} alt="" className="discover-profile-avatar-img" />
                    ) : (
                      <span className="discover-profile-avatar-bubble">
                        {(profileSettings.fullName || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="discover-profile-avatar-hint">Edit</span>
                  </label>
                  <h2>{profileSettings.fullName || 'Your account'}</h2>
                  <p>Name, phone, and delivery details.</p>
                </div>

                <div className="discover-profile-summary">
                  <div>
                    <span><IconUser /> Name</span>
                    <strong>{profileSettings.fullName || 'Not set'}</strong>
                  </div>
                  <div>
                    <span><IconPhone /> Phone</span>
                    <strong>{profileSettings.phone || 'Not set'}</strong>
                  </div>
                  <div>
                    <span><IconMail /> Email</span>
                    <strong>{profileSettings.email || 'Not set'}</strong>
                  </div>
                  <div>
                    <span><IconMapPin /> Default address</span>
                    <strong>{getShortAddress(profileSettings.defaultAddress) || 'Not available'}</strong>
                  </div>
                </div>
              </aside>

              <section className="discover-profile-form-card">
                <div className="discover-profile-form-head">
                  <div>
                    <h3>Personal details</h3>
                    <p>Update the basics for checkout.</p>
                  </div>
                  <span>{isTemporaryAuth ? 'Temp session' : 'Synced to Supabase'}</span>
                </div>

                {profileLoading ? (
                  <p className="discover-note">Loading profile settings...</p>
                ) : null}

                {profileMessage ? (
                  <p className="discover-profile-alert" data-state="success">
                    {profileMessage}
                  </p>
                ) : null}

                {profileError ? (
                  <p className="discover-profile-alert" data-state="error">
                    {profileError}
                  </p>
                ) : null}

                <div className="discover-profile-fields">
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
                    maxLength={10}
                    value={profileForm.phone}
                    onChangeText={(value) => {
                      setProfileForm((current) => ({ ...current, phone: value }));
                      if (profileError) {
                        setProfileError('');
                      }
                    }}
                  />

                  <button
                    type="button"
                    className="discover-profile-save"
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                  >
                    {profileSaving ? 'Saving profile...' : 'Save profile'}
                  </button>
                </div>

                <div className="discover-address-manager">
                  <div className="discover-profile-form-head">
                    <div>
                      <h3>Saved addresses</h3>
                      <p>Search for an address, then use the map icon on a suggestion for a precise pin.</p>
                    </div>
                    <span>{profileSettings.addresses.length} saved</span>
                  </div>

                  <div className="discover-address-list">
                    {profileSettings.addresses.map((address) => {
                      const isDefault = address.id === profileSettings.defaultAddressId;
                      return (
                        <article key={address.id} className={`discover-address-card ${isDefault ? 'is-default' : ''}`}>
                          <div>
                            <strong>{address.label}</strong>
                            <span>{getShortAddress(address.address)}</span>
                          </div>
                          <div className="discover-address-card-actions">
                            {!isDefault ? (
                              <button type="button" onClick={() => handleSetDefaultAddress(address.id)}>
                                Default
                              </button>
                            ) : (
                              <span>Default</span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAddressId(address.id);
                                setAddressDraft(createAddressDraft(address));
                                setAddressError('');
                              }}
                            >
                              Edit
                            </button>
                            {profileSettings.addresses.length > 1 ? (
                              <button type="button" onClick={() => handleDeleteAddress(address.id)}>
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="discover-address-editor">
                    <Input
                      label="Label"
                      placeholder="Home, Office, Hostel..."
                      value={addressDraft.label}
                      onChangeText={(value) => {
                        setAddressDraft((current) => ({ ...current, label: value }));
                        setAddressError('');
                      }}
                    />

                    <GoogleAddressPicker
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

                    <button
                      type="button"
                      className="discover-inline-location-btn"
                      onClick={handleUseCurrentDraftLocation}
                      disabled={locationLoading}
                    >
                      <IconLocation />
                      {locationLoading ? 'Locating...' : 'Use my location'}
                    </button>

                    {addressError ? <p className="discover-profile-alert" data-state="error">{addressError}</p> : null}

                    <div className="discover-address-editor-actions">
                      {editingAddressId ? (
                        <button
                          type="button"
                          className="discover-profile-save is-secondary"
                          onClick={() => {
                            setEditingAddressId('');
                            setAddressDraft(createAddressDraft());
                            setAddressError('');
                          }}
                        >
                          Cancel
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="discover-profile-save"
                        onClick={handleSaveAddress}
                        disabled={addressSaving}
                      >
                        {addressSaving ? 'Saving address...' : editingAddressId ? 'Update address' : 'Save address'}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </section>
        ) : screen === 'cart' ? (
          <section className="discover-cart-page">
            <div className="discover-cart-page-head">
              <div className="discover-cart-view-switch" role="tablist" aria-label="Cart and orders">
                <button
                  type="button"
                  className={cartView === 'cart' ? 'is-active' : ''}
                  onClick={() => setCartView('cart')}
                >
                  <IconCart /> Cart
                </button>
                <button
                  type="button"
                  className={cartView === 'orders' ? 'is-active' : ''}
                  onClick={() => setCartView('orders')}
                >
                  <IconOrders /> Orders
                </button>
              </div>
              {cartView === 'cart' ? (
                <button type="button" className="discover-cart-clear" onClick={clearCart} disabled={!cartItems.length}><IconTrash /> Clear cart</button>
              ) : null}
            </div>

            {cartView === 'orders' ? (
              <section className="discover-orders-panel">
                <div className="discover-order-view-switch" role="tablist" aria-label="Order history view">
                  <button
                    type="button"
                    className={orderView === 'current' ? 'is-active' : ''}
                    onClick={() => setOrderView('current')}
                  >
                    <IconClock /> Current
                  </button>
                  <button
                    type="button"
                    className={orderView === 'past' ? 'is-active' : ''}
                    onClick={() => setOrderView('past')}
                  >
                    <IconCheck /> Past
                  </button>
                </div>

                {ordersLoading ? <p className="discover-note">Loading orders...</p> : null}
                {ordersError ? <p className="discover-error">{ordersError}</p> : null}
                {!ordersLoading && !ordersError ? (
                  <div className="discover-order-list">
                    {(orderView === 'current' ? currentOrders : pastOrders).length ? (
                      (orderView === 'current' ? currentOrders : pastOrders).map((order) => (
                        <OrderCard
                          key={order.id || order.orderId}
                          order={order}
                          variant={orderView === 'current' ? 'current' : 'past'}
                        />
                      ))
                    ) : (
                      <div className="discover-cart-empty">
                        <IconEmptyOrders />
                        <p>{orderView === 'current' ? 'No ongoing orders.' : 'No past orders yet.'}</p>
                        <span>{orderView === 'current' ? 'Placed orders will appear here while they are active.' : 'Completed and cancelled orders will appear here.'}</span>
                      </div>
                    )}
                  </div>
                ) : null}
              </section>
            ) : (
              <section className="discover-cart-checkout">
                {!!checkoutSuccess && (
                  <>
                    <div className="discover-cart-empty">
                      <p>Order placed successfully.</p>
                      <span>
                        Order #{String(checkoutSuccess.orderId).slice(0, 8) || 'pending'}
                        {checkoutSuccess.restaurantName ? ` · ${checkoutSuccess.restaurantName}` : ''}
                      </span>
                    </div>

                    <div className="discover-bill">
                      <div><span>Items</span><strong>{checkoutSuccess.itemCount}</strong></div>
                      <div><span>Subtotal</span><strong>{formatNpr(checkoutSuccess.subtotal)}</strong></div>
                      <div><span>Delivery</span><strong>{formatNpr(checkoutSuccess.deliveryFee)}</strong></div>
                      <div className="discover-bill-total">
                        <span>Total</span>
                        <strong>{formatNpr(checkoutSuccess.totalAmount)}</strong>
                      </div>
                    </div>
                  </>
                )}

                {!cartItems.length ? (
                  currentOrderPreview ? (
                    <div className="discover-cart-empty discover-cart-empty-current">
                      <p>Order in progress</p>
                      <span>Your cart is empty, so the active order is shown here for quick tracking.</span>
                      <OrderCard order={currentOrderPreview} variant="current" />
                      <div className="discover-empty-actions">
                        <button
                          type="button"
                          className="discover-empty-btn"
                          onClick={() => {
                            setCartView('orders');
                            setOrderView('current');
                          }}
                        >
                          Track order
                        </button>
                        <button type="button" className="discover-empty-btn is-secondary" onClick={handleOpenBrowseScreen}>
                          Browse food
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="discover-cart-empty">
                      <IconCartEmpty />
                      <p>{checkoutSuccess ? 'Ready for your next order.' : 'Your cart is empty.'}</p>
                      <span>
                        {checkoutSuccess
                          ? 'Add items to start a new order.'
                          : 'Add items from a restaurant menu, then come back here to checkout.'}
                      </span>
                    </div>
                  )
                ) : (
                  <div className="discover-cart-checkout-grid">
                    <section className="discover-cart-lines">
                      {cartGroups.map((group) => (
                        <div key={group.restaurant.id} className="discover-cart-group">
                          <div className="discover-cart-restaurant">
                            <strong>{group.restaurant.name}</strong>
                            <span>{getShortAddress(group.restaurant.address || 'Kathmandu Valley')}</span>
                          </div>

                          <div className="discover-cart-list">
                            {group.items.map((item) => (
                              <CartLineItem
                                key={item.id}
                                item={item}
                                onIncrease={() => incrementItem(group.restaurant, item)}
                                onDecrease={() => decrementItem(group.restaurant, item)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </section>

                    <aside className="discover-cart-summary">
                      <div className="discover-bill">
                        <div><span>Items</span><strong>{checkoutSummary.itemCount}</strong></div>
                        <div><span>Subtotal</span><strong>{formatNpr(checkoutSummary.subtotal)}</strong></div>
                        <div><span>Delivery</span><strong>{formatNpr(checkoutSummary.deliveryFee)}</strong></div>
                        <div className="discover-bill-total"><span>Total</span><strong>{formatNpr(checkoutSummary.total)}</strong></div>
                      </div>

                      <div className="discover-delivery-address-box">
                        <div className="discover-delivery-address-head">
                          <strong>Delivery address</strong>
                          <button
                            type="button"
                            className="discover-inline-location-btn"
                            onClick={handleUseCurrentDeliveryLocation}
                            disabled={locationLoading}
                          >
                            <IconLocation />
                            {locationLoading ? 'Locating...' : 'Use my location'}
                          </button>
                        </div>

                        {hasSavedDeliveryAddresses ? (
                          <div className="discover-delivery-address-tabs" role="tablist" aria-label="Delivery address mode">
                            <button
                              type="button"
                              className={deliveryAddressMode === 'saved' ? 'is-active' : ''}
                              onClick={() => handleDeliveryAddressModeChange('saved')}
                            >
                              Saved
                            </button>
                            <button
                              type="button"
                              className={deliveryAddressMode === 'search' ? 'is-active' : ''}
                              onClick={() => handleDeliveryAddressModeChange('search')}
                            >
                              Search
                            </button>
                          </div>
                        ) : null}

                        {hasSavedDeliveryAddresses && deliveryAddressMode === 'saved' ? (
                          <label className="discover-saved-address-select">
                            <span>Saved address</span>
                            <select
                              value={selectedDeliveryAddressId}
                              onChange={(event) => {
                                const nextAddress = profileSettings.addresses.find((address) => address.id === event.target.value);
                                if (nextAddress) {
                                  handleSelectDeliveryAddress(nextAddress);
                                }
                              }}
                            >
                              <option value="" disabled>Select saved address</option>
                              {profileSettings.addresses.map((address) => (
                                <option key={address.id} value={address.id}>
                                  {address.label || 'Saved'} - {getShortAddress(address.address)}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <GoogleAddressPicker
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
                        )}
                      </div>

                      <p className={addressHelperClassName}>{addressHelperText}</p>

                      <div className="discover-payment-methods" aria-label="Payment method">
                        <strong>Payment method</strong>
                        <div className="discover-payment-grid">
                          <button
                            type="button"
                            className={paymentMethod === PAYMENT_METHOD_CASH ? 'is-active' : ''}
                            onClick={() => setPaymentMethod(PAYMENT_METHOD_CASH)}
                          >
                            <span>Cash</span>
                            <small>Pay on delivery</small>
                          </button>
                          <button
                            type="button"
                            className={paymentMethod === PAYMENT_METHOD_ESEWA ? 'is-active' : ''}
                            onClick={() => setPaymentMethod(PAYMENT_METHOD_ESEWA)}
                          >
                            <span>eSewa</span>
                            <small>Sandbox checkout</small>
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="discover-checkout"
                        onClick={handleCheckout}
                        disabled={checkoutLoading || !cartItems.length || !hasValidAddress}
                      >
                        {checkoutButtonLabel}
                      </button>

                      {!!checkoutMessage && (
                        <p
                          className="discover-checkout-message"
                          data-state={checkoutSuccess ? 'success' : 'error'}
                        >
                          {checkoutMessage}
                        </p>
                      )}
                    </aside>
                  </div>
                )}
              </section>
            )}
          </section>
        ) : (
          <section className="discover-workbench">
            <header className="discover-workbench-head">
              <strong>Menu</strong>
              <span>{activeRestaurant ? `${activeRestaurant.menuItems?.length || 0} items available` : 'No restaurant selected'}</span>
            </header>

            {!activeRestaurant ? (
              <div className="discover-empty">
                <h3>Select a restaurant</h3>
                <p>Choose a restaurant to view its menu and start your order.</p>
                <button type="button" className="discover-empty-btn" onClick={handleOpenBrowseScreen}>
                  Browse restaurants
                </button>
              </div>
            ) : (
              <div className="discover-workbench-grid is-menu-only">
                <section className="discover-menu" id="discover-menu-panel">
                  <div
                    className="discover-hero"
                    style={{ '--restaurant-banner-image': `url("${getRestaurantBannerUrl(activeRestaurant) || Logo}")` }}
                  >
                    <img
                      src={getRestaurantBannerUrl(activeRestaurant) || Logo}
                      alt={activeRestaurant.name}
                    />
                    <div className="discover-hero-profile-image">
                      <img src={getRestaurantProfileImageUrl(activeRestaurant) || getRestaurantBannerUrl(activeRestaurant) || Logo} alt="" />
                    </div>
                    <div className="discover-hero-main">
                      <h2>{activeRestaurant.name}</h2>
                      <p>{getShortAddress(activeRestaurant.address || activeRestaurant.formatted_address || 'Kathmandu Valley')}</p>
                      <div className="discover-hero-meta">
                        <span>
                          <IconStar />
                          {getRestaurantRating(activeRestaurant.id)} rating
                        </span>
                        <span>
                          <IconMenu />
                          {activeRestaurant.menuItems?.length || 0} items
                        </span>
                        <span>
                          <IconDelivery />
                          {formatNpr(getDeliveryFee(activeRestaurant.id))} delivery
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="discover-menu-head">
                    <h3>Menu</h3>
                    <span>{activeMenuItems.length} results</span>
                  </div>

                  {!activeMenuItems.length ? (
                    <p className="discover-note">No menu items match your search.</p>
                  ) : (
                    <div className="discover-menu-grid">
                      {activeMenuItems.map((item) => {
                        const quantity = menuQuantityMap[item.id] || 0;

                        return (
                          <MenuItemCard
                            key={item.id}
                            item={item}
                            quantity={quantity}
                            canAdd={canAddFromActiveRestaurant}
                            onIncrease={() => handleAddMenuItemToCart(activeRestaurant, item)}
                            onDecrease={() => decrementItem(activeRestaurant, item)}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}
          </section>
        )}
      </section>

      {cartPreview ? (
        <aside className="discover-cart-preview" aria-live="polite">
          <button
            type="button"
            className="discover-cart-preview-close"
            onClick={() => setCartPreview(null)}
            aria-label="Close cart preview"
          >
            &times;
          </button>
          <div className="discover-cart-preview-item">
            <span className="discover-cart-preview-icon"><IconMenu /></span>
            <div>
              <span>Added to cart</span>
              <strong>{cartPreview.item.name}</strong>
              <p>{cartPreview.item.quantity} in cart from {cartPreview.restaurant.name}</p>
            </div>
          </div>
          <div className="discover-cart-preview-foot">
            <span>{cartPreview.itemCount} items</span>
            <strong>{formatNpr(cartPreview.total)}</strong>
          </div>
          <button
            type="button"
            className="discover-cart-preview-action"
            onClick={() => {
              setCartPreview(null);
              setScreen('cart');
            }}
          >
            View cart
          </button>
        </aside>
      ) : null}
    </main>
  );
}
