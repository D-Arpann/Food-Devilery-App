import {
  clampQuantity,
  isValidNepalPhoneNumber,
  normalizeDeliveryAddress,
  normalizeMenuCategory,
  onlyDigits,
  ORDER_STATUS,
  summarizeCart,
  TABLES,
  toNepalE164Phone,
  USER_ROLES,
} from '@repo/utils';
import { upsertCurrentUserProfile } from './auth.js';

const RESTAURANT_ORDER_SELECT =
  'id, customer_id, restaurant_id, rider_id, subtotal, delivery_fee, total_amount, status, delivery_address, delivery_place_id, delivery_lat, delivery_lng, rider_lat, rider_lng, rider_heading, rider_speed_mps, rider_accuracy_m, rider_location_updated_at, estimated_arrival_minutes, payment_status, created_at, updated_at';
const RIDER_ORDER_SELECT = '*';
const RIDER_PROFILE_SELECT =
  'id, full_name, email, phone, role, avatar_url, verification_status, is_online, vehicle_type, vehicle_details, bike_model, bike_condition, license_front_url, license_back_url, rejection_reason, created_at';
const ADMIN_PROFILE_SELECT =
  'id, full_name, email, phone, role, avatar_url, verification_status, is_online, vehicle_type, vehicle_details, bike_model, bike_condition, license_front_url, license_back_url, rejection_reason, created_at';
const ADMIN_RESTAURANT_SELECT =
  'id, owner_id, name, description, image_url, banner_url, profile_image_url, address, formatted_address, google_place_id, latitude, longitude, contact_phone, contact_email, is_active, verification_status, rejection_reason, created_at';
const ADMIN_ORDER_SELECT =
  'id, customer_id, restaurant_id, rider_id, total_amount, status, payment_status, created_at, updated_at';
const CUSTOMER_ORDER_SELECT =
  'id, customer_id, restaurant_id, rider_id, subtotal, delivery_fee, total_amount, status, delivery_address, delivery_place_id, delivery_lat, delivery_lng, rider_lat, rider_lng, rider_heading, rider_speed_mps, rider_accuracy_m, rider_location_updated_at, estimated_arrival_minutes, payment_status, payment_method, payment_provider, payment_reference, payment_intent_id, payment_amount, payment_currency, payment_metadata, paid_at, created_at, updated_at';
const OWNED_RESTAURANT_SELECT =
  'id, owner_id, name, description, image_url, banner_url, profile_image_url, address, formatted_address, google_place_id, latitude, longitude, contact_phone, contact_email, is_active, verification_status, rejection_reason, created_at';
const RESTAURANT_APPLICATION_SELECT =
  'id, name, description, image_url, banner_url, profile_image_url, address, formatted_address, google_place_id, latitude, longitude, contact_phone, contact_email, verification_status, rejection_reason';
const DEFAULT_OPERATING_HOURS = [
  { day: 'Mon', open: '10:00', close: '21:00', closed: false },
  { day: 'Tue', open: '10:00', close: '21:00', closed: false },
  { day: 'Wed', open: '10:00', close: '21:00', closed: false },
  { day: 'Thu', open: '10:00', close: '21:00', closed: false },
  { day: 'Fri', open: '10:00', close: '22:00', closed: false },
  { day: 'Sat', open: '11:00', close: '22:00', closed: false },
  { day: 'Sun', open: '11:00', close: '20:00', closed: false },
];
const RIDER_VEHICLE_TYPES = ['bicycle', 'motorbike', 'scooter'];
const RIDER_VEHICLE_LABELS = {
  bicycle: 'Bicycle',
  motorbike: 'Motorbike',
  scooter: 'Scooter',
};

export function getDefaultRestaurantOperatingHours() {
  return DEFAULT_OPERATING_HOURS.map((item) => ({ ...item }));
}

function normalizeOperatingHours(value) {
  const source = Array.isArray(value) && value.length ? value : [];
  const sourceByDay = source.reduce((acc, item) => {
    if (item?.day) {
      acc[item.day] = item;
    }
    return acc;
  }, {});

  return DEFAULT_OPERATING_HOURS.map((fallback) => {
    const item = sourceByDay[fallback.day] || {};
    return {
      day: fallback.day,
      open: String(item?.open || fallback.open),
      close: String(item?.close || fallback.close),
      closed: Boolean(item?.closed ?? fallback.closed),
    };
  });
}

function groupBy(items = [], key) {
  return items.reduce((acc, item) => {
    const groupKey = item?.[key];
    if (!groupKey) {
      return acc;
    }

    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(item);
    return acc;
  }, {});
}

function mapById(items = []) {
  return items.reduce((acc, item) => {
    if (item?.id) {
      acc[item.id] = item;
    }
    return acc;
  }, {});
}

function isMissingDatabaseFunction(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42883' ||
    error?.code === 'PGRST202' ||
    message.includes('could not find the function') ||
    message.includes('function') && message.includes('does not exist')
  );
}

function normalizeVerificationStatus(value = '') {
  return String(value || 'pending').trim().toLowerCase() || 'pending';
}

function normalizeRejectionReason(value = '') {
  return String(value || '').trim();
}

function normalizeRiderVehicleType(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return RIDER_VEHICLE_TYPES.includes(normalized) ? normalized : 'motorbike';
}

function mergeOwnersIntoRestaurants(restaurants = [], profiles = []) {
  const profilesById = mapById(profiles);
  return restaurants.map((restaurant) => ({
    ...restaurant,
    owner: restaurant.owner_id ? profilesById[restaurant.owner_id] || null : null,
  }));
}

function buildOrderStatusBreakdown(orders = []) {
  const statusCounts = orders.reduce((acc, order) => {
    const status = order?.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(statusCounts)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

function buildAdminMetrics({ profiles = [], restaurants = [], pendingRestaurants = [], pendingRiders = [], orders = [] }) {
  const activeOrders = orders.filter((order) => ![
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.CANCELLED,
  ].includes(order.status)).length;
  const revenue = orders
    .filter((order) => order.status !== ORDER_STATUS.CANCELLED)
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  return {
    totalUsers: profiles.length,
    verifiedUsers: profiles.filter((profile) => normalizeVerificationStatus(profile.verification_status) === 'verified').length,
    totalRestaurants: restaurants.length,
    pendingApplications: pendingRestaurants.length + pendingRiders.length,
    activeOrders,
    revenue,
  };
}

async function enrichRestaurantOrders(client, orders = []) {
  const normalizedOrders = orders || [];
  if (!normalizedOrders.length) {
    return [];
  }

  const orderIds = normalizedOrders.map((order) => order.id).filter(Boolean);
  const customerIds = [...new Set(normalizedOrders.map((order) => order.customer_id).filter(Boolean))];

  const [{ data: orderItems, error: orderItemsError }, { data: customers, error: customersError }] = await Promise.all([
    orderIds.length
      ? client
        .from(TABLES.ORDER_LINE_ITEMS)
        .select('id, order_id, menu_item_id, item_name, item_price, quantity')
        .in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? client
        .from(TABLES.USER_PROFILES)
        .select('id, full_name, email, phone')
        .in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (orderItemsError) {
    throw orderItemsError;
  }

  if (customersError) {
    throw customersError;
  }

  const itemsByOrder = groupBy(orderItems || [], 'order_id');
  const customersById = mapById(customers || []);

  return normalizedOrders.map((order) => ({
    ...order,
    lineItems: itemsByOrder[order.id] || [],
    customer: customersById[order.customer_id] || null,
  }));
}

function fallbackRiderEmail(phone, userId) {
  const phoneDigits = onlyDigits(phone);
  const seed = phoneDigits || userId?.slice(0, 10) || Date.now();
  return `rider-${seed}@chitomitho.local`;
}

async function getAuthenticatedUser(client) {
  const { data, error } = await client.auth.getUser();

  if (error) {
    throw error;
  }

  const user = data?.user || null;
  if (!user?.id) {
    throw new Error('No authenticated user found.');
  }

  return user;
}

async function resolveRiderId(client, riderId) {
  const targetRiderId = String(riderId || '').trim();
  if (targetRiderId) {
    return targetRiderId;
  }

  const user = await getAuthenticatedUser(client);
  return user.id;
}

function normalizeRiderApplicationPayload(payload = {}) {
  const vehicleType = normalizeRiderVehicleType(payload.vehicleType || payload.vehicle_type);
  const bikeModel = String(payload.bikeModel || payload.bike_model || '').trim();
  const bikeCondition = String(payload.bikeCondition || payload.bike_condition || '').trim();
  const licenseFrontUrl = String(payload.licenseFrontUrl || payload.license_front_url || '').trim();
  const licenseBackUrl = String(payload.licenseBackUrl || payload.license_back_url || '').trim();

  return {
    riderName: String(
      payload.riderName ||
      payload.rider_name ||
      payload.fullName ||
      payload.full_name ||
      payload.name ||
      '',
    ).trim(),
    phone: String(
      payload.phoneNumber ||
      payload.phone_number ||
      payload.phone ||
      payload.contactPhone ||
      payload.contact_phone ||
      '',
    ).trim(),
    bikeModel,
    bikeCondition,
    vehicleType,
    licenseFrontUrl,
    licenseBackUrl,
    licenseFrontFile: payload.licenseFrontFile || payload.license_front_file || null,
    licenseBackFile: payload.licenseBackFile || payload.license_back_file || null,
    vehicleDetails: String(payload.vehicleDetails || payload.vehicle_details || '').trim(),
  };
}

function buildRiderVehicleDetails({ bikeModel, bikeCondition, vehicleDetails, vehicleType }) {
  const providedDetails = String(vehicleDetails || '').trim();
  if (providedDetails) {
    return providedDetails;
  }

  const vehicleLabel = RIDER_VEHICLE_LABELS[vehicleType] || RIDER_VEHICLE_LABELS.motorbike;
  if (vehicleType === 'bicycle') {
    return `Vehicle: ${vehicleLabel}`;
  }

  return [
    `Vehicle: ${vehicleLabel}`,
    bikeModel ? `Model: ${bikeModel}` : '',
    bikeCondition ? `Condition: ${bikeCondition}` : '',
    'License front and back uploaded.',
  ].filter(Boolean).join(' ');
}

function normalizeRiderJobsOptions(options = {}) {
  if (typeof options === 'string') {
    return {
      riderId: options,
      limit: 50,
    };
  }

  const payload = options && typeof options === 'object' ? options : {};
  const rawLimit = Number(payload.limit);
  return {
    riderId: payload.riderId || payload.rider_id || payload.id || null,
    limit: Number.isFinite(rawLimit) ? rawLimit : 50,
  };
}

function normalizeRiderAvailabilityInput(riderIdOrPayload, isOnlineValue) {
  if (riderIdOrPayload && typeof riderIdOrPayload === 'object') {
    return {
      riderId: riderIdOrPayload.riderId || riderIdOrPayload.rider_id || riderIdOrPayload.id || null,
      isOnline:
        riderIdOrPayload.isOnline ??
        riderIdOrPayload.is_online ??
        riderIdOrPayload.online,
    };
  }

  if (typeof isOnlineValue === 'undefined') {
    return {
      riderId: null,
      isOnline: riderIdOrPayload,
    };
  }

  return {
    riderId: riderIdOrPayload,
    isOnline: isOnlineValue,
  };
}

function normalizeEtaMinutes(value) {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error('Enter a valid ETA in minutes.');
  }

  return minutes;
}

function normalizeCoordinatePair(input = {}) {
  const source = input?.coordinates || input?.location || input?.coords || input;
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

function normalizePlaceId(input = {}) {
  return String(input?.placeId || input?.place_id || input?.googlePlaceId || input?.google_place_id || '').trim();
}

function withRestaurantLocationDefaults(restaurant) {
  if (!restaurant) {
    return restaurant;
  }

  return {
    formatted_address: restaurant.formatted_address || restaurant.address || '',
    google_place_id: restaurant.google_place_id || '',
    latitude: restaurant.latitude ?? null,
    longitude: restaurant.longitude ?? null,
    ...restaurant,
  };
}

function withCustomerOrderLocationDefaults(order) {
  if (!order) {
    return order;
  }

  return {
    delivery_place_id: order.delivery_place_id || '',
    delivery_lat: order.delivery_lat ?? null,
    delivery_lng: order.delivery_lng ?? null,
    rider_lat: order.rider_lat ?? null,
    rider_lng: order.rider_lng ?? null,
    rider_heading: order.rider_heading ?? null,
    rider_speed_mps: order.rider_speed_mps ?? null,
    rider_accuracy_m: order.rider_accuracy_m ?? null,
    rider_location_updated_at: order.rider_location_updated_at || null,
    estimated_arrival_minutes: order.estimated_arrival_minutes ?? null,
    payment_method: order.payment_method || 'cash',
    payment_provider: order.payment_provider || '',
    payment_reference: order.payment_reference || '',
    payment_intent_id: order.payment_intent_id || '',
    payment_amount: order.payment_amount ?? null,
    payment_currency: order.payment_currency || 'NPR',
    payment_metadata: order.payment_metadata && typeof order.payment_metadata === 'object'
      ? order.payment_metadata
      : {},
    paid_at: order.paid_at || null,
    ...order,
  };
}

async function enrichRiderOrders(client, orders = []) {
  const normalizedOrders = orders || [];
  if (!normalizedOrders.length) {
    return [];
  }

  const orderIds = normalizedOrders.map((order) => order.id).filter(Boolean);
  const placeIds = [...new Set(normalizedOrders.map((order) => order.restaurant_id).filter(Boolean))];
  const customerIds = [...new Set(normalizedOrders.map((order) => order.customer_id).filter(Boolean))];

  const [
    { data: places, error: placesError },
    { data: orderItems, error: orderItemsError },
    { data: customers, error: customersError },
  ] = await Promise.all([
    placeIds.length
      ? client
        .from(TABLES.RESTAURANTS)
        .select('id, name, description, image_url, banner_url, profile_image_url, address, formatted_address, google_place_id, latitude, longitude, contact_phone, contact_email')
        .in('id', placeIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? client
        .from(TABLES.ORDER_LINE_ITEMS)
        .select('id, order_id, menu_item_id, item_name, item_price, quantity')
        .in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? client
        .from(TABLES.USER_PROFILES)
        .select('id, full_name, email, phone')
        .in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (placesError) {
    throw placesError;
  }

  if (orderItemsError) {
    throw orderItemsError;
  }

  if (customersError) {
    throw customersError;
  }

  const menuItemIds = [...new Set((orderItems || []).map((item) => item.menu_item_id).filter(Boolean))];
  const { data: menuItems, error: menuItemsError } = menuItemIds.length
      ? await client
        .from(TABLES.RESTAURANT_MENU_ITEMS)
      .select('id, restaurant_id, name, description, price, is_available, category')
      .in('id', menuItemIds)
    : { data: [], error: null };

  if (menuItemsError) {
    throw menuItemsError;
  }

  const placesById = mapById(places || []);
  const customersById = mapById(customers || []);
  const menuItemsById = mapById(menuItems || []);
  const itemsByOrder = groupBy(
    (orderItems || []).map((item) => ({
      ...item,
      menuItem: menuItemsById[item.menu_item_id] || null,
    })),
    'order_id',
  );

  return normalizedOrders.map((order) => {
    const restaurant = placesById[order.restaurant_id] || null;
    return {
      ...order,
      estimated_arrival_minutes: order.estimated_arrival_minutes ?? null,
      restaurant,
      lineItems: itemsByOrder[order.id] || [],
      customer: customersById[order.customer_id] || null,
    };
  });
}

export async function fetchAdminDashboard(client) {
  try {
    const [
      { data: profiles, error: profilesError },
      { data: restaurants, error: restaurantsError },
      { data: orders, error: ordersError },
    ] = await Promise.all([
      client
        .from(TABLES.USER_PROFILES)
        .select(ADMIN_PROFILE_SELECT)
        .order('created_at', { ascending: false })
        .limit(500),
      client
        .from(TABLES.RESTAURANTS)
        .select(ADMIN_RESTAURANT_SELECT)
        .order('created_at', { ascending: false })
        .limit(500),
      client
        .from(TABLES.CUSTOMER_ORDERS)
        .select(ADMIN_ORDER_SELECT)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (profilesError) {
      throw profilesError;
    }

    if (restaurantsError) {
      throw restaurantsError;
    }

    const normalizedProfiles = profiles || [];
    const normalizedRestaurants = restaurants || [];
    const normalizedOrders = ordersError ? [] : orders || [];
    const restaurantsWithOwners = mergeOwnersIntoRestaurants(normalizedRestaurants, normalizedProfiles);
    const pendingRestaurants = restaurantsWithOwners.filter((restaurant) => (
      normalizeVerificationStatus(restaurant.verification_status) === 'pending'
    ));
    const pendingRiders = normalizedProfiles.filter((profile) => (
      normalizeVerificationStatus(profile.verification_status) === 'pending' &&
      (profile.role === USER_ROLES.RIDER || Boolean(profile.vehicle_details))
    ));

    return {
      data: {
        metrics: buildAdminMetrics({
          profiles: normalizedProfiles,
          restaurants: normalizedRestaurants,
          pendingRestaurants,
          pendingRiders,
          orders: normalizedOrders,
        }),
        pendingRestaurants,
        pendingRiders,
        activeUsers: normalizedProfiles,
        orderStatusBreakdown: buildOrderStatusBreakdown(normalizedOrders),
        partialError: ordersError ? ordersError.message || 'Could not read global order data.' : '',
      },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    return { data: null, error };
  }
}

export async function verifyAdminRestaurantApplication(client, restaurantId) {
  try {
    if (!restaurantId) {
      throw new Error('Missing restaurant application id.');
    }

    const rpcResult = await client.rpc('admin_verify_restaurant_application', {
      p_restaurant_id: restaurantId,
    });

    if (!rpcResult.error) {
      const restaurant = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
      return { data: restaurant ? withRestaurantLocationDefaults(restaurant) : null, error: null };
    }

    if (!isMissingDatabaseFunction(rpcResult.error)) {
      throw rpcResult.error;
    }

    const { data: restaurant, error: restaurantError } = await client
      .from(TABLES.RESTAURANTS)
      .update({
        verification_status: 'verified',
        is_active: true,
        rejection_reason: null,
      })
      .eq('id', restaurantId)
      .select(ADMIN_RESTAURANT_SELECT)
      .single();

    if (restaurantError) {
      throw restaurantError;
    }

    let owner = null;
    if (restaurant?.owner_id) {
      const { data: profile, error: profileError } = await client
        .from(TABLES.USER_PROFILES)
        .update({
          role: USER_ROLES.RESTAURANT_OWNER,
          verification_status: 'verified',
          rejection_reason: null,
        })
        .eq('id', restaurant.owner_id)
        .select(ADMIN_PROFILE_SELECT)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      owner = profile || null;
    }

    return {
      data: {
        ...restaurant,
        owner,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error verifying restaurant application:', error);
    return { data: null, error };
  }
}

export async function rejectAdminRestaurantApplication(client, restaurantId, reason = '') {
  const rejectionReason = normalizeRejectionReason(reason);

  try {
    if (!restaurantId) {
      throw new Error('Missing restaurant application id.');
    }

    if (!rejectionReason) {
      throw new Error('Enter a rejection reason.');
    }

    const { data, error } = await client
      .from(TABLES.RESTAURANTS)
      .update({
        verification_status: 'rejected',
        is_active: false,
        rejection_reason: rejectionReason,
      })
      .eq('id', restaurantId)
      .select(ADMIN_RESTAURANT_SELECT)
      .single();

    if (error) {
      throw error;
    }

    return { data: withRestaurantLocationDefaults(data), error: null };
  } catch (error) {
    console.error('Error rejecting restaurant application:', error);
    return { data: null, error };
  }
}

export async function verifyAdminRiderApplication(client, profileId) {
  try {
    if (!profileId) {
      throw new Error('Missing rider profile id.');
    }

    const rpcResult = await client.rpc('admin_verify_rider_application', {
      p_profile_id: profileId,
    });

    if (!rpcResult.error) {
      const profile = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
      return { data: profile || null, error: null };
    }

    if (!isMissingDatabaseFunction(rpcResult.error)) {
      throw rpcResult.error;
    }

    const { data, error } = await client
      .from(TABLES.USER_PROFILES)
      .update({
        role: USER_ROLES.RIDER,
        verification_status: 'verified',
        is_online: false,
        rejection_reason: null,
      })
      .eq('id', profileId)
      .select(ADMIN_PROFILE_SELECT)
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error verifying rider application:', error);
    return { data: null, error };
  }
}

export async function rejectAdminRiderApplication(client, profileId, reason = '') {
  const rejectionReason = normalizeRejectionReason(reason);

  try {
    if (!profileId) {
      throw new Error('Missing rider profile id.');
    }

    if (!rejectionReason) {
      throw new Error('Enter a rejection reason.');
    }

    const { data, error } = await client
      .from(TABLES.USER_PROFILES)
      .update({
        role: USER_ROLES.RIDER,
        verification_status: 'rejected',
        is_online: false,
        rejection_reason: rejectionReason,
      })
      .eq('id', profileId)
      .select(ADMIN_PROFILE_SELECT)
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error rejecting rider application:', error);
    return { data: null, error };
  }
}

export async function setAdminProfileStatus(client, profileId, status) {
  const nextStatus = normalizeVerificationStatus(status);
  const allowedStatuses = ['pending', 'verified', 'suspended'];

  try {
    if (!profileId) {
      throw new Error('Missing profile id.');
    }

    if (!allowedStatuses.includes(nextStatus)) {
      throw new Error('Unsupported account status.');
    }

    const rpcResult = await client.rpc('admin_set_profile_status', {
      p_profile_id: profileId,
      p_status: nextStatus,
    });

    if (!rpcResult.error) {
      const profile = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
      return { data: profile || null, error: null };
    }

    if (!isMissingDatabaseFunction(rpcResult.error)) {
      throw rpcResult.error;
    }

    const updatePayload = {
      verification_status: nextStatus,
    };

    if (nextStatus === 'suspended') {
      updatePayload.is_online = false;
    }

    const { data, error } = await client
      .from(TABLES.USER_PROFILES)
      .update(updatePayload)
      .eq('id', profileId)
      .select(ADMIN_PROFILE_SELECT)
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error updating profile status:', error);
    return { data: null, error };
  }
}

export async function deleteAdminProfile(client, profileId) {
  try {
    if (!profileId) {
      throw new Error('Missing profile id.');
    }

    const rpcResult = await client.rpc('admin_delete_profile', {
      p_profile_id: profileId,
    });

    if (!rpcResult.error) {
      const deletedProfile = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
      return { data: deletedProfile || { id: profileId }, error: null };
    }

    if (!isMissingDatabaseFunction(rpcResult.error)) {
      throw rpcResult.error;
    }

    const { data, error } = await client
      .from(TABLES.USER_PROFILES)
      .delete()
      .eq('id', profileId)
      .select(ADMIN_PROFILE_SELECT)
      .single();

    if (error) {
      throw error;
    }

    return { data: data || { id: profileId }, error: null };
  } catch (error) {
    console.error('Error deleting profile:', error);
    return { data: null, error };
  }
}

export async function fetchActiveRestaurants(client, options = {}) {
  const { limit = 24 } = options;

  const buildQuery = (selectStr) => {
    let q = client
      .from(TABLES.RESTAURANTS)
      .select(selectStr)
      .eq('is_active', true)
      .eq('verification_status', 'verified')
      .order('created_at', { ascending: false });

    if (limit > 0) {
      q = q.limit(limit);
    }

    return q;
  };

  try {
    const { data, error } = await buildQuery(
      'id, name, description, image_url, banner_url, profile_image_url, address, formatted_address, google_place_id, latitude, longitude, is_active, created_at',
    );

    if (error) {
      throw error;
    }

    return { data: (data || []).map(withRestaurantLocationDefaults), error: null };
  } catch (error) {
    console.error('Error fetching active restaurants:', error);
    return { data: null, error };
  }
}

export async function fetchActiveMenu(client, restaurantId) {
  try {
    const { data, error } = await client
      .from(TABLES.RESTAURANT_MENU_ITEMS)
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_available', true);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching active menu:', error);
    return { data: null, error };
  }
}

export async function fetchRestaurantFeed(client, options = {}) {
  const { limit = 36 } = options;

  try {
    const { data: restaurants, error: restaurantError } = await fetchActiveRestaurants(client, { limit });
    if (restaurantError) throw restaurantError;

    const placeIds = (restaurants || []).map((place) => place.id).filter(Boolean);
    if (!placeIds.length) {
      return { data: [], error: null };
    }

    const { data: menuItems, error: menuError } = await client
      .from(TABLES.RESTAURANT_MENU_ITEMS)
      .select('id, restaurant_id, name, description, price, is_available, category')
      .in('restaurant_id', placeIds)
      .eq('is_available', true)
      .order('created_at', { ascending: false });

    if (menuError) throw menuError;

    const menuByPlaceId = (menuItems || []).reduce((acc, item) => {
      const placeId = item.restaurant_id;
      if (!acc[placeId]) {
        acc[placeId] = [];
      }
      acc[placeId].push(item);
      return acc;
    }, {});

    const mergedFeed = (restaurants || []).map((place) => ({
      ...place,
      menuItems: menuByPlaceId[place.id] || [],
    }));

    return { data: mergedFeed, error: null };
  } catch (error) {
    console.error('Error fetching restaurant feed:', error);
    return { data: null, error };
  }
}

export async function fetchCustomerOrders(client, customerId, options = {}) {
  const { limit = 12 } = options;

  try {
    if (!customerId) {
      throw new Error('Missing customer id for orders.');
    }

    const buildOrdersQuery = (selectStr) => {
      let query = client
        .from(TABLES.CUSTOMER_ORDERS)
        .select(selectStr)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (limit > 0) {
        query = query.limit(limit);
      }

      return query;
    };

    const { data: orders, error: ordersError } = await buildOrdersQuery(CUSTOMER_ORDER_SELECT);

    if (ordersError) {
      throw ordersError;
    }

    const normalizedOrders = (orders || []).map(withCustomerOrderLocationDefaults);
    if (!normalizedOrders.length) {
      return { data: [], error: null };
    }

    const placeIds = [...new Set(normalizedOrders.map((order) => order.restaurant_id).filter(Boolean))];
    const orderIds = normalizedOrders.map((order) => order.id).filter(Boolean);

    let places = [];
    if (placeIds.length) {
      const placesResult = await client
        .from(TABLES.RESTAURANTS)
        .select('id, name, description, address, formatted_address, google_place_id, latitude, longitude, image_url, banner_url, profile_image_url')
        .in('id', placeIds);

      if (placesResult.error) {
        throw placesResult.error;
      }

      places = (placesResult.data || []).map(withRestaurantLocationDefaults);
    }

    const { data: orderItems, error: itemsError } = orderIds.length
      ? await client
        .from(TABLES.ORDER_LINE_ITEMS)
        .select('id, order_id, item_name, item_price, quantity')
        .in('order_id', orderIds)
      : { data: [], error: null };

    if (itemsError) {
      throw itemsError;
    }

    const placesById = (places || []).reduce((acc, place) => {
      acc[place.id] = place;
      return acc;
    }, {});

    const itemsByOrderId = (orderItems || []).reduce((acc, item) => {
      if (!acc[item.order_id]) {
        acc[item.order_id] = [];
      }
      acc[item.order_id].push(item);
      return acc;
    }, {});

    return {
      data: normalizedOrders.map((order) => ({
        ...order,
        restaurant: placesById[order.restaurant_id] || null,
        lineItems: itemsByOrderId[order.id] || [],
      })),
      error: null,
    };
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    return { data: null, error };
  }
}

export async function createOrder(client, orderPayload) {
  try {
    const { data, error } = await client
      .from(TABLES.CUSTOMER_ORDERS)
      .insert([orderPayload])
      .select('id')
      .single();

    if (error) throw error;
    return { data: data.id, error: null };
  } catch (error) {
    console.error('Error creating order:', error);
    return { data: null, error };
  }
}

export async function fetchOwnedRestaurant(client, ownerId) {
  try {
    if (!ownerId) {
      throw new Error('Missing restaurant owner id.');
    }

    let query = client
      .from(TABLES.RESTAURANTS)
      .select(OWNED_RESTAURANT_SELECT)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(1);

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    return { data: data ? withRestaurantLocationDefaults(data) : null, error: null };
  } catch (error) {
    console.error('Error fetching owned restaurant:', error);
    return { data: null, error };
  }
}

export async function fetchRestaurantOperatingSettings(client, restaurantId) {
  try {
    if (!restaurantId) {
      throw new Error('Missing restaurant id for operating settings.');
    }

    const { data, error } = await client
      .from(TABLES.RESTAURANTS)
      .select('id, is_active, operating_hours')
      .eq('id', restaurantId)
      .single();

    if (error) {
      if (error.code === '42703' || String(error.message || '').includes('operating_hours')) {
        const { data: fallbackData, error: fallbackError } = await client
          .from(TABLES.RESTAURANTS)
          .select('id, is_active')
          .eq('id', restaurantId)
          .single();

        if (fallbackError) {
          throw fallbackError;
        }

        return {
          data: {
            isActive: Boolean(fallbackData?.is_active),
            operatingHours: getDefaultRestaurantOperatingHours(),
          },
          error: null,
        };
      }

      throw error;
    }

    return {
      data: {
        isActive: Boolean(data?.is_active),
        operatingHours: normalizeOperatingHours(data?.operating_hours),
      },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching restaurant operating settings:', error);
    return { data: null, error };
  }
}

export async function updateRestaurantOperatingSettings(client, restaurantId, payload = {}) {
  const nextIsActive = Boolean(payload.isActive ?? payload.is_active);
  const nextOperatingHours = normalizeOperatingHours(payload.operatingHours || payload.operating_hours);

  try {
    if (!restaurantId) {
      throw new Error('Missing restaurant id for operating settings.');
    }

    const updatePayload = {
      is_active: nextIsActive,
      operating_hours: nextOperatingHours,
    };

    const result = await client
      .from(TABLES.RESTAURANTS)
      .update(updatePayload)
      .eq('id', restaurantId)
      .select('id, owner_id, name, description, image_url, banner_url, profile_image_url, address, formatted_address, google_place_id, latitude, longitude, contact_phone, contact_email, is_active, verification_status, created_at')
      .single();

    if (result.error) {
      throw result.error;
    }

    return {
      data: {
        restaurant: result.data,
        isActive: Boolean(result.data?.is_active),
        operatingHours: nextOperatingHours,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error updating restaurant operating settings:', error);
    return { data: null, error };
  }
}

export async function fetchRestaurantOrders(client, restaurantId, options = {}) {
  const { limit = 80 } = options;

  try {
    if (!restaurantId) {
      throw new Error('Missing restaurant id for orders.');
    }

    let query = client
      .from(TABLES.CUSTOMER_ORDERS)
      .select(RESTAURANT_ORDER_SELECT)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (limit > 0) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const orders = await enrichRestaurantOrders(client, data || []);
    return { data: orders, error: null };
  } catch (error) {
    console.error('Error fetching restaurant orders:', error);
    return { data: null, error };
  }
}

export async function fetchRestaurantMenuItems(client, restaurantId) {
  try {
    if (!restaurantId) {
      throw new Error('Missing restaurant id for menu.');
    }

    const { data, error } = await client
      .from(TABLES.RESTAURANT_MENU_ITEMS)
      .select('id, restaurant_id, name, description, price, is_available, category, created_at')
      .eq('restaurant_id', restaurantId)
      .order('category', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching restaurant menu items:', error);
    return { data: null, error };
  }
}

export async function fetchRestaurantDashboard(client, ownerId) {
  try {
    const { data: restaurant, error: restaurantError } = await fetchOwnedRestaurant(client, ownerId);
    if (restaurantError) {
      throw restaurantError;
    }

    if (!restaurant?.id) {
      return {
        data: {
          restaurant: null,
          orders: [],
          menuItems: [],
        },
        error: null,
      };
    }

    const [{ data: orders, error: ordersError }, { data: menuItems, error: menuError }] = await Promise.all([
      fetchRestaurantOrders(client, restaurant.id),
      fetchRestaurantMenuItems(client, restaurant.id),
    ]);

    if (ordersError) {
      throw ordersError;
    }

    if (menuError) {
      throw menuError;
    }

    return {
      data: {
        restaurant,
        orders: orders || [],
        menuItems: menuItems || [],
      },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching restaurant dashboard:', error);
    return { data: null, error };
  }
}

export function subscribeToRestaurantOrders(client, restaurantId, onOrder, onError) {
  if (!client || !restaurantId) {
    return () => {};
  }

  const channel = client
    .channel(`restaurant-orders-${restaurantId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: TABLES.CUSTOMER_ORDERS,
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      (payload) => {
        onOrder?.(payload.new);
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(new Error('Realtime order listener could not connect.'));
      }
    });

  return () => {
    client.removeChannel(channel);
  };
}

export function subscribeToRestaurantFeed(client, onChange, onError) {
  if (!client) {
    return () => {};
  }

  try {
    const channel = client
      .channel('restaurant-feed')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.RESTAURANTS,
        },
        (payload) => onChange?.(payload),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.RESTAURANT_MENU_ITEMS,
        },
        (payload) => onChange?.(payload),
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError?.(new Error('Realtime restaurant feed listener could not connect.'));
        }
      });

    return () => {
      client.removeChannel(channel);
    };
  } catch (error) {
    console.error('Error subscribing to restaurant feed:', error);
    onError?.(error);
    return () => {};
  }
}

export function subscribeToCustomerOrders(client, customerId, onChange, onError) {
  if (!client || !customerId) {
    return () => {};
  }

  try {
    const handleChange = (payload) => {
      const row = payload.new;
      if (row && row.customer_id === customerId) {
        onChange?.(payload);
      }
    };

    const channel = client
      .channel(`customer-orders-${customerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.CUSTOMER_ORDERS,
        },
        handleChange,
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError?.(new Error('Realtime order listener could not connect.'));
        }
      });

    return () => {
      client.removeChannel(channel);
    };
  } catch (error) {
    console.error('Error subscribing to customer orders:', error);
    onError?.(error);
    return () => {};
  }
}

export async function fetchRestaurantOrderDetails(client, orderId) {
  try {
    if (!orderId) {
      throw new Error('Missing order id.');
    }

    const { data, error } = await client
      .from(TABLES.CUSTOMER_ORDERS)
      .select(RESTAURANT_ORDER_SELECT)
      .eq('id', orderId)
      .single();

    if (error) {
      throw error;
    }

    const [order] = await enrichRestaurantOrders(client, data ? [data] : []);
    return { data: order || null, error: null };
  } catch (error) {
    console.error('Error fetching restaurant order details:', error);
    return { data: null, error };
  }
}

export async function updateRestaurantOrderStatus(client, orderId, newStatus) {
  const allowedStatuses = Object.values(ORDER_STATUS);

  try {
    if (!orderId) {
      throw new Error('Missing order id.');
    }

    if (!allowedStatuses.includes(newStatus)) {
      throw new Error('Unsupported restaurant order status.');
    }

    const { data, error } = await client
      .from(TABLES.CUSTOMER_ORDERS)
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select(RESTAURANT_ORDER_SELECT)
      .single();

    if (error) {
      throw error;
    }

    const [order] = await enrichRestaurantOrders(client, data ? [data] : []);
    return { data: order || data, error: null };
  } catch (error) {
    console.error('Error updating restaurant order status:', error);
    return { data: null, error };
  }
}

export async function submitRiderApplication(client, payload = {}) {
  const {
    riderName,
    phone,
    bikeModel,
    bikeCondition,
    vehicleType,
    licenseFrontUrl,
    licenseBackUrl,
    licenseFrontFile,
    licenseBackFile,
    vehicleDetails,
  } = normalizeRiderApplicationPayload(payload);
  const normalizedPhone = isValidNepalPhoneNumber(phone) ? toNepalE164Phone(phone) : phone;

  try {
    if (!riderName) {
      throw new Error('Enter your rider name.');
    }

    if (!isValidNepalPhoneNumber(phone)) {
      throw new Error('Enter a valid phone number.');
    }

    const user = await getAuthenticatedUser(client);
    const needsLicenseDetails = vehicleType !== 'bicycle';

    if (needsLicenseDetails && !bikeModel) {
      throw new Error('Enter your bike model.');
    }

    if (needsLicenseDetails && !bikeCondition) {
      throw new Error('Enter your bike condition.');
    }

    const uploadedFront = needsLicenseDetails
      ? licenseFrontUrl || (licenseFrontFile
        ? (await uploadRiderDocument(client, user.id, licenseFrontFile, 'front')).data?.url
        : '')
      : null;
    const uploadedBack = needsLicenseDetails
      ? licenseBackUrl || (licenseBackFile
        ? (await uploadRiderDocument(client, user.id, licenseBackFile, 'back')).data?.url
        : '')
      : null;

    if (needsLicenseDetails && (!uploadedFront || !uploadedBack)) {
      throw new Error('Upload license front and back images.');
    }

    const { data: existingProfile, error: existingProfileError } = await client
      .from(TABLES.USER_PROFILES)
      .select(RIDER_PROFILE_SELECT)
      .eq('id', user.id)
      .maybeSingle();

    if (existingProfileError) {
      throw existingProfileError;
    }

    const nextMetadata = {
      ...(user.user_metadata || {}),
      full_name: riderName,
      phone: normalizedPhone,
      role: USER_ROLES.RIDER,
      verification_status: 'pending',
      is_online: false,
      vehicle_type: vehicleType,
      bike_model: needsLicenseDetails ? bikeModel : null,
      bike_condition: needsLicenseDetails ? bikeCondition : null,
      license_front_url: uploadedFront,
      license_back_url: uploadedBack,
      rejection_reason: null,
    };

    nextMetadata.vehicle_details = buildRiderVehicleDetails({
      bikeModel,
      bikeCondition,
      vehicleDetails,
      vehicleType,
    });

    const { error: metadataError } = await client.auth.updateUser({ data: nextMetadata });
    if (metadataError) {
      throw metadataError;
    }

    const profilePayload = {
      id: user.id,
      full_name: riderName,
      email:
        existingProfile?.email ||
        user.email ||
        user.user_metadata?.email ||
        fallbackRiderEmail(normalizedPhone, user.id),
      phone: normalizedPhone,
      role: USER_ROLES.RIDER,
      verification_status: 'pending',
      is_online: false,
      vehicle_details: nextMetadata.vehicle_details || existingProfile?.vehicle_details || null,
      vehicle_type: vehicleType,
      bike_model: needsLicenseDetails ? bikeModel : null,
      bike_condition: needsLicenseDetails ? bikeCondition : null,
      license_front_url: uploadedFront,
      license_back_url: uploadedBack,
      rejection_reason: null,
    };

    const { data, error } = await client
      .from(TABLES.USER_PROFILES)
      .upsert(profilePayload, { onConflict: 'id' })
      .select(RIDER_PROFILE_SELECT)
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error submitting rider application:', error);
    return { data: null, error };
  }
}

export async function fetchRiderProfile(client, riderId) {
  try {
    const targetRiderId = await resolveRiderId(client, riderId);
    const { data, error } = await client
      .from(TABLES.USER_PROFILES)
      .select(RIDER_PROFILE_SELECT)
      .eq('id', targetRiderId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return { data: data || null, error: null };
  } catch (error) {
    console.error('Error fetching rider profile:', error);
    return { data: null, error };
  }
}

export async function updateRiderAvailability(client, riderIdOrPayload, isOnlineValue) {
  const { riderId, isOnline } = normalizeRiderAvailabilityInput(riderIdOrPayload, isOnlineValue);

  try {
    if (typeof isOnline === 'undefined') {
      throw new Error('Missing rider availability.');
    }

    const targetRiderId = await resolveRiderId(client, riderId);
    const { data, error } = await client
      .from(TABLES.USER_PROFILES)
      .update({ is_online: Boolean(isOnline) })
      .eq('id', targetRiderId)
      .select(RIDER_PROFILE_SELECT)
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error updating rider availability:', error);
    return { data: null, error };
  }
}

export async function fetchRiderJobs(client, options = {}) {
  const { riderId, limit } = normalizeRiderJobsOptions(options);

  try {
    const targetRiderId = await resolveRiderId(client, riderId);
    let availableJobsQuery = client
      .from(TABLES.CUSTOMER_ORDERS)
      .select(RIDER_ORDER_SELECT)
      .eq('status', ORDER_STATUS.READY_FOR_PICKUP)
      .is('rider_id', null)
      .order('created_at', { ascending: true });
    let activeOrdersQuery = client
      .from(TABLES.CUSTOMER_ORDERS)
      .select(RIDER_ORDER_SELECT)
      .eq('rider_id', targetRiderId)
      .in('status', [
        ORDER_STATUS.READY_FOR_PICKUP,
        ORDER_STATUS.PICKED_UP,
        ORDER_STATUS.ARRIVED,
      ])
      .order('updated_at', { ascending: false });

    if (limit > 0) {
      availableJobsQuery = availableJobsQuery.limit(limit);
      activeOrdersQuery = activeOrdersQuery.limit(limit);
    }

    const [
      { data: availableJobs, error: availableJobsError },
      { data: activeOrders, error: activeOrdersError },
    ] = await Promise.all([availableJobsQuery, activeOrdersQuery]);

    if (availableJobsError) {
      throw availableJobsError;
    }

    if (activeOrdersError) {
      throw activeOrdersError;
    }

    const allOrders = [...(availableJobs || []), ...(activeOrders || [])];
    const enrichedOrders = await enrichRiderOrders(client, allOrders);
    const enrichedById = mapById(enrichedOrders);

    return {
      data: {
        availableJobs: (availableJobs || []).map((order) => enrichedById[order.id]).filter(Boolean),
        activeOrders: (activeOrders || []).map((order) => enrichedById[order.id]).filter(Boolean),
      },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching rider jobs:', error);
    return { data: null, error };
  }
}

export function subscribeToRiderJobs(client, onOrder, onError) {
  if (!client) {
    return () => {};
  }

  try {
    const handleOrder = (payload) => {
      onOrder?.(payload.new);
    };
    const channel = client
      .channel(`rider-jobs-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: TABLES.CUSTOMER_ORDERS,
          filter: `status=eq.${ORDER_STATUS.READY_FOR_PICKUP}`,
        },
        handleOrder,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: TABLES.CUSTOMER_ORDERS,
          filter: `status=eq.${ORDER_STATUS.READY_FOR_PICKUP}`,
        },
        handleOrder,
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError?.(new Error('Realtime rider job listener could not connect.'));
        }
      });

    return () => {
      client.removeChannel(channel);
    };
  } catch (error) {
    console.error('Error subscribing to rider jobs:', error);
    onError?.(error);
    return () => {};
  }
}

export async function claimRiderJob(client, orderIdOrPayload, riderId) {
  const payload = orderIdOrPayload && typeof orderIdOrPayload === 'object' ? orderIdOrPayload : {};
  const orderId = String(payload.orderId || payload.order_id || payload.id || orderIdOrPayload || '').trim();
  const requestedRiderId = payload.riderId || payload.rider_id || riderId;

  try {
    if (!orderId) {
      throw new Error('Missing rider job id.');
    }

    const targetRiderId = await resolveRiderId(client, requestedRiderId);
    const { data, error } = await client
      .from(TABLES.CUSTOMER_ORDERS)
      .update({
        rider_id: targetRiderId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('status', ORDER_STATUS.READY_FOR_PICKUP)
      .is('rider_id', null)
      .select(RIDER_ORDER_SELECT)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('This rider job is no longer available.');
    }

    const [order] = await enrichRiderOrders(client, [data]);
    return { data: order || data, error: null };
  } catch (error) {
    console.error('Error claiming rider job:', error);
    return { data: null, error };
  }
}

export async function updateRiderLocation(client, payload = {}) {
  const orderId = String(payload.orderId || payload.order_id || payload.id || '').trim();
  const coordinates = normalizeCoordinatePair(payload);
  const heading = payload.heading ?? payload.coords?.heading ?? null;
  const speedMps = payload.speedMps ?? payload.speed_mps ?? payload.coords?.speed ?? null;
  const accuracyM = payload.accuracyM ?? payload.accuracy_m ?? payload.coords?.accuracy ?? null;

  try {
    if (!orderId) {
      throw new Error('Missing active order id for rider location.');
    }

    if (!coordinates) {
      throw new Error('Missing valid rider coordinates.');
    }

    const rpcResult = await client.rpc('update_rider_location', {
      p_order_id: orderId,
      p_latitude: coordinates.latitude,
      p_longitude: coordinates.longitude,
      p_heading: Number.isFinite(Number(heading)) ? Number(heading) : null,
      p_speed_mps: Number.isFinite(Number(speedMps)) ? Number(speedMps) : null,
      p_accuracy_m: Number.isFinite(Number(accuracyM)) ? Number(accuracyM) : null,
    });

    if (!rpcResult.error) {
      const locationRecord = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
      return { data: locationRecord || null, error: null };
    }

    if (!isMissingDatabaseFunction(rpcResult.error)) {
      throw rpcResult.error;
    }

    const timestamp = new Date().toISOString();

    const riderIdResult = await client.auth.getUser();
    const currentRiderId = riderIdResult.data?.user?.id;

    if (currentRiderId) {
      await client
        .from(TABLES.RIDER_LOCATIONS)
        .upsert({
          rider_id: currentRiderId,
          active_order_id: orderId,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          heading: Number.isFinite(Number(heading)) ? Number(heading) : null,
          speed_mps: Number.isFinite(Number(speedMps)) ? Number(speedMps) : null,
          accuracy_m: Number.isFinite(Number(accuracyM)) ? Number(accuracyM) : null,
          updated_at: timestamp,
        }, { onConflict: 'rider_id' });
    }

    const { data, error } = await client
      .from(TABLES.CUSTOMER_ORDERS)
      .update({
        rider_lat: coordinates.latitude,
        rider_lng: coordinates.longitude,
        rider_heading: Number.isFinite(Number(heading)) ? Number(heading) : null,
        rider_speed_mps: Number.isFinite(Number(speedMps)) ? Number(speedMps) : null,
        rider_accuracy_m: Number.isFinite(Number(accuracyM)) ? Number(accuracyM) : null,
        rider_location_updated_at: timestamp,
        updated_at: timestamp,
      })
      .eq('id', orderId)
      .select('id, rider_id, rider_lat, rider_lng, rider_location_updated_at')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error updating rider location:', error);
    return { data: null, error };
  }
}

export async function updateRiderDeliveryStatus(client, orderIdOrPayload, statusOrPayload, options = {}) {
  const payload = orderIdOrPayload && typeof orderIdOrPayload === 'object' ? orderIdOrPayload : {};
  const statusPayload = statusOrPayload && typeof statusOrPayload === 'object' ? statusOrPayload : {};
  const optionsPayload = options && typeof options === 'object' ? options : { estimatedArrivalMinutes: options };
  const orderId = String(payload.orderId || payload.order_id || payload.id || orderIdOrPayload || '').trim();
  const nextStatus = payload.status || payload.newStatus || statusPayload.status || statusPayload.newStatus || statusOrPayload;
  const requestedRiderId =
    payload.riderId ||
    payload.rider_id ||
    statusPayload.riderId ||
    statusPayload.rider_id ||
    optionsPayload.riderId ||
    optionsPayload.rider_id;
  const etaInput =
    payload.estimatedArrivalMinutes ??
    payload.estimated_arrival_minutes ??
    statusPayload.estimatedArrivalMinutes ??
    statusPayload.estimated_arrival_minutes ??
    optionsPayload.estimatedArrivalMinutes ??
    optionsPayload.estimated_arrival_minutes;
  const allowedStatuses = [
    ORDER_STATUS.PICKED_UP,
    ORDER_STATUS.ARRIVED,
    ORDER_STATUS.DELIVERED,
  ];

  try {
    if (!orderId) {
      throw new Error('Missing rider order id.');
    }

    if (!allowedStatuses.includes(nextStatus)) {
      throw new Error('Unsupported rider delivery status.');
    }

    const estimatedArrivalMinutes = normalizeEtaMinutes(etaInput);
    const targetRiderId = await resolveRiderId(client, requestedRiderId);
    const updatePayload = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    if (typeof estimatedArrivalMinutes !== 'undefined') {
      updatePayload.estimated_arrival_minutes = estimatedArrivalMinutes;
    }

    const { data, error } = await client
      .from(TABLES.CUSTOMER_ORDERS)
      .update(updatePayload)
      .eq('id', orderId)
      .eq('rider_id', targetRiderId)
      .select(RIDER_ORDER_SELECT)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('This rider order could not be updated.');
    }

    const [order] = await enrichRiderOrders(client, [data]);
    return { data: order || data, error: null };
  } catch (error) {
    console.error('Error updating rider delivery status:', error);
    return { data: null, error };
  }
}

export async function updateRiderEta(client, orderIdOrPayload, estimatedArrivalMinutes, options = {}) {
  const payload = orderIdOrPayload && typeof orderIdOrPayload === 'object' ? orderIdOrPayload : {};
  const etaPayload = estimatedArrivalMinutes && typeof estimatedArrivalMinutes === 'object'
    ? estimatedArrivalMinutes
    : {};
  const optionsPayload = options && typeof options === 'object' ? options : {};
  const orderId = String(payload.orderId || payload.order_id || payload.id || orderIdOrPayload || '').trim();
  const requestedRiderId =
    payload.riderId ||
    payload.rider_id ||
    etaPayload.riderId ||
    etaPayload.rider_id ||
    optionsPayload.riderId ||
    optionsPayload.rider_id;
  const etaInput =
    payload.estimatedArrivalMinutes ??
    payload.estimated_arrival_minutes ??
    etaPayload.estimatedArrivalMinutes ??
    etaPayload.estimated_arrival_minutes ??
    estimatedArrivalMinutes;

  try {
    if (!orderId) {
      throw new Error('Missing rider order id.');
    }

    const nextEtaMinutes = normalizeEtaMinutes(etaInput);
    if (typeof nextEtaMinutes === 'undefined') {
      throw new Error('Missing rider ETA.');
    }

    const targetRiderId = await resolveRiderId(client, requestedRiderId);
    const { data, error } = await client
      .from(TABLES.CUSTOMER_ORDERS)
      .update({
        estimated_arrival_minutes: nextEtaMinutes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('rider_id', targetRiderId)
      .select(RIDER_ORDER_SELECT)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('This rider ETA could not be updated.');
    }

    const [order] = await enrichRiderOrders(client, [data]);
    return { data: order || data, error: null };
  } catch (error) {
    console.error('Error updating rider ETA:', error);
    return { data: null, error };
  }
}

export async function submitRestaurantApplication(client, payload = {}) {
  const restaurantName = String(payload.restaurantName || payload.name || '').trim();
  const description = String(payload.description || payload.bio || payload.restaurantBio || payload.restaurant_bio || '').trim();
  const imageUrl = String(payload.imageUrl || payload.image_url || payload.restaurantImageUrl || payload.restaurant_image_url || '').trim();
  const bannerUrl = String(payload.bannerUrl || payload.banner_url || imageUrl || '').trim();
  const profileImageUrl = String(payload.profileImageUrl || payload.profile_image_url || '').trim();
  const contactPhoneInput = String(payload.phone || payload.contactPhone || '').trim();
  const contactEmail = String(payload.email || payload.contactEmail || payload.contact_email || '').trim();
  const location = normalizeDeliveryAddress(payload.location || payload.address || payload.formattedAddress || payload.formatted_address || '', '');
  const coordinates = normalizeCoordinatePair(payload);
  const googlePlaceId = normalizePlaceId(payload);

  try {
    if (!restaurantName) {
      throw new Error('Enter your restaurant name.');
    }

    if (description.length < 8) {
      throw new Error('Add a short restaurant bio.');
    }

    if (!isValidNepalPhoneNumber(contactPhoneInput)) {
      throw new Error('Enter a valid phone number.');
    }

    const contactPhone = toNepalE164Phone(contactPhoneInput);

    if (!contactEmail || !contactEmail.includes('@')) {
      throw new Error('Enter a valid email address.');
    }

    if (!location || location.length < 3) {
      throw new Error('Enter your restaurant location.');
    }

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) {
      throw userError;
    }

    const user = userData?.user || null;
    if (!user?.id) {
      throw new Error('Login required before submitting a restaurant application.');
    }

    const profileName = user.user_metadata?.full_name || restaurantName;
    const { error: profileError } = await upsertCurrentUserProfile(client, {
      full_name: profileName,
      phone: user.phone || contactPhone,
      email: user.email || contactEmail,
    });

    if (profileError) {
      throw profileError;
    }

    const { data: existingRows, error: existingError } = await client
      .from(TABLES.RESTAURANTS)
      .select('id, verification_status, is_active')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    const existingApplication = existingRows?.[0] || null;

    if (existingApplication?.verification_status === 'verified' && existingApplication?.is_active) {
      throw new Error('This account already has a verified restaurant.');
    }

    const sharedPayload = {
      name: restaurantName,
      description,
      image_url: bannerUrl || null,
      banner_url: bannerUrl || null,
      profile_image_url: profileImageUrl || null,
      address: location,
      formatted_address: String(payload.formattedAddress || payload.formatted_address || location).trim() || location,
      google_place_id: googlePlaceId || null,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      contact_phone: contactPhone,
      contact_email: contactEmail,
      is_active: false,
      verification_status: 'pending',
      rejection_reason: null,
    };

    if (existingApplication?.id) {
      const { data, error } = await client
        .from(TABLES.RESTAURANTS)
        .update(sharedPayload)
        .eq('id', existingApplication.id)
        .select(RESTAURANT_APPLICATION_SELECT)
        .single();

      if (error) {
        throw error;
      }

      return {
        data: {
          ...withRestaurantLocationDefaults(data),
          mode: 'updated',
        },
        error: null,
      };
    }

    const { data, error } = await client
      .from(TABLES.RESTAURANTS)
      .insert([
        {
          owner_id: user.id,
          ...sharedPayload,
        },
      ])
      .select(RESTAURANT_APPLICATION_SELECT)
      .single();

    if (error) {
      throw error;
    }

    return {
      data: {
        ...withRestaurantLocationDefaults(data),
        mode: 'created',
      },
      error: null,
    };
  } catch (error) {
    console.error('Error submitting restaurant application:', error);
    return { data: null, error };
  }
}

export async function updateRestaurantProfile(client, restaurantId, payload = {}) {
  const restaurantName = String(payload.restaurantName || payload.name || '').trim();
  const description = String(payload.description || payload.bio || '').trim();
  const hasImageUrlInput = Object.hasOwn(payload, 'imageUrl') || Object.hasOwn(payload, 'image_url');
  const imageUrl = String(payload.imageUrl || payload.image_url || '').trim();
  const hasBannerUrlInput = Object.hasOwn(payload, 'bannerUrl') || Object.hasOwn(payload, 'banner_url');
  const bannerUrl = String(payload.bannerUrl || payload.banner_url || '').trim();
  const hasProfileImageUrlInput = Object.hasOwn(payload, 'profileImageUrl') || Object.hasOwn(payload, 'profile_image_url');
  const profileImageUrl = String(payload.profileImageUrl || payload.profile_image_url || '').trim();
  const contactPhoneInput = String(payload.phone || payload.contactPhone || payload.contact_phone || '').trim();
  const contactEmail = String(payload.email || payload.contactEmail || payload.contact_email || '').trim();
  const location = normalizeDeliveryAddress(payload.location || payload.address || payload.formattedAddress || payload.formatted_address || '', '');
  const coordinates = normalizeCoordinatePair(payload);
  const googlePlaceId = normalizePlaceId(payload);

  try {
    if (!restaurantId) {
      throw new Error('Missing restaurant id.');
    }

    if (!restaurantName) {
      throw new Error('Enter your restaurant name.');
    }

    if (description.length < 8) {
      throw new Error('Add a short restaurant bio.');
    }

    if (!isValidNepalPhoneNumber(contactPhoneInput)) {
      throw new Error('Enter a valid phone number.');
    }

    const contactPhone = toNepalE164Phone(contactPhoneInput);

    if (!contactEmail || !contactEmail.includes('@')) {
      throw new Error('Enter a valid email address.');
    }

    if (!location || location.length < 3) {
      throw new Error('Enter your restaurant location.');
    }

    const updatePayload = {
      name: restaurantName,
      description,
      address: location,
      formatted_address: String(payload.formattedAddress || payload.formatted_address || location).trim() || location,
      google_place_id: googlePlaceId || null,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      contact_phone: contactPhone,
      contact_email: contactEmail,
    };

    if (hasImageUrlInput) {
      updatePayload.image_url = imageUrl || null;
    }

    if (hasBannerUrlInput) {
      updatePayload.banner_url = bannerUrl || null;
      updatePayload.image_url = bannerUrl || null;
    }

    if (hasProfileImageUrlInput) {
      updatePayload.profile_image_url = profileImageUrl || null;
    }

    const { data, error } = await client
      .from(TABLES.RESTAURANTS)
      .update(updatePayload)
      .eq('id', restaurantId)
      .select(OWNED_RESTAURANT_SELECT)
      .single();

    if (error) {
      throw error;
    }

    return { data: withRestaurantLocationDefaults(data), error: null };
  } catch (error) {
    console.error('Error updating restaurant profile:', error);
    return { data: null, error };
  }
}

function normalizeMenuItemPayload(payload = {}) {
  return {
    restaurant_id: payload.restaurantId || payload.restaurant_id || payload.foodPlaceId || payload.food_place_id,
    name: String(payload.name || '').trim(),
    description: String(payload.description || '').trim(),
    price: Number(payload.price || 0),
    is_available: payload.isAvailable ?? payload.is_available ?? true,
    category: normalizeMenuCategory(payload.category || 'Specials'),
  };
}

export async function saveRestaurantMenuItem(client, payload = {}) {
  try {
    const itemId = payload.id || null;
    const menuPayload = normalizeMenuItemPayload(payload);

    if (!menuPayload.restaurant_id) {
      throw new Error('Missing restaurant id for menu item.');
    }

    if (!menuPayload.name) {
      throw new Error('Add a menu item name.');
    }

    if (!Number.isFinite(menuPayload.price) || menuPayload.price <= 0) {
      throw new Error('Add a valid menu item price.');
    }

    const query = itemId
      ? client
        .from(TABLES.RESTAURANT_MENU_ITEMS)
        .update(menuPayload)
        .eq('id', itemId)
        .eq('restaurant_id', menuPayload.restaurant_id)
      : client
        .from(TABLES.RESTAURANT_MENU_ITEMS)
        .insert([menuPayload]);

    const { data, error } = await query
      .select('id, restaurant_id, name, description, price, is_available, category, created_at')
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error saving restaurant menu item:', error);
    return { data: null, error };
  }
}

export async function deleteRestaurantMenuItem(client, restaurantId, itemId) {
  try {
    if (!restaurantId || !itemId) {
      throw new Error('Missing menu item details.');
    }

    const { error } = await client
      .from(TABLES.RESTAURANT_MENU_ITEMS)
      .delete()
      .eq('id', itemId)
      .eq('restaurant_id', restaurantId);

    if (error) {
      throw error;
    }

    return { data: itemId, error: null };
  } catch (error) {
    console.error('Error deleting restaurant menu item:', error);
    return { data: null, error };
  }
}

export async function createCheckoutOrder(client, payload = {}) {
  const {
    customerId,
    restaurantId,
    deliveryAddress,
    deliveryLocation,
    deliveryCoordinates,
    deliveryPlaceId,
    deliveryFee = 0,
    paymentMethod = 'cash',
    paymentProvider = '',
    paymentReference = '',
    paymentIntentId = '',
    paymentCurrency = 'NPR',
    paymentMetadata = {},
    cartItems = [],
  } = payload;

  try {
    if (!customerId) {
      throw new Error('Missing customer id for checkout.');
    }

    if (!restaurantId) {
      throw new Error('Missing restaurant id for checkout.');
    }

    const normalizedItems = (cartItems || [])
      .map((item) => ({
        id: item?.id || item?.menu_item_id || item?.menuItemId,
        name: item?.name || item?.item_name || 'Menu item',
        price: Number(item?.price ?? item?.item_price ?? 0),
        quantity: clampQuantity(item?.quantity || 0),
      }))
      .filter((item) => item.id && item.quantity > 0);

    if (!normalizedItems.length) {
      throw new Error('Cart is empty.');
    }

    const summary = summarizeCart(normalizedItems, deliveryFee);
    const coordinates = normalizeCoordinatePair(deliveryLocation || deliveryCoordinates || payload);
    const placeId = String(deliveryPlaceId || normalizePlaceId(deliveryLocation || payload)).trim();
    const orderPayload = {
      customer_id: customerId,
      restaurant_id: restaurantId,
      subtotal: summary.subtotal,
      delivery_fee: summary.deliveryFee,
      total_amount: summary.total,
      status: 'placed',
      delivery_address: normalizeDeliveryAddress(deliveryAddress),
      delivery_place_id: placeId || null,
      delivery_lat: coordinates?.latitude ?? null,
      delivery_lng: coordinates?.longitude ?? null,
      payment_status: 'pending',
      payment_method: String(paymentMethod || 'cash').trim() || 'cash',
      payment_provider: String(paymentProvider || payload.payment_provider || '').trim() || null,
      payment_reference: String(paymentReference || payload.payment_reference || '').trim() || null,
      payment_intent_id: String(paymentIntentId || payload.payment_intent_id || '').trim() || null,
      payment_amount: summary.total,
      payment_currency: String(paymentCurrency || payload.payment_currency || 'NPR').trim() || 'NPR',
      payment_metadata: paymentMetadata && typeof paymentMetadata === 'object' && !Array.isArray(paymentMetadata)
        ? paymentMetadata
        : {},
    };

    const { data: createdOrder, error: orderError } = await client
      .from(TABLES.CUSTOMER_ORDERS)
      .insert([orderPayload])
      .select('id')
      .single();

    if (orderError) {
      throw orderError;
    }

    const orderId = createdOrder?.id;
    if (!orderId) {
      throw new Error('Order creation failed.');
    }

    const orderItemsPayload = normalizedItems.map((item) => ({
      order_id: orderId,
      menu_item_id: item.id,
      item_name: item.name,
      item_price: item.price,
      quantity: item.quantity,
    }));

    const { error: orderItemsError } = await client
      .from(TABLES.ORDER_LINE_ITEMS)
      .insert(orderItemsPayload);

    if (orderItemsError) {
      await client
        .from(TABLES.CUSTOMER_ORDERS)
        .delete()
        .eq('id', orderId);
      throw orderItemsError;
    }

    return {
      data: {
        orderId,
        itemCount: summary.itemCount,
        subtotal: summary.subtotal,
        deliveryFee: summary.deliveryFee,
        totalAmount: summary.total,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error creating checkout order:', error);
    return { data: null, error };
  }
}

export async function updateOrderStatus(client, orderId, newStatus) {
  try {
    const { data, error } = await client
      .from(TABLES.CUSTOMER_ORDERS)
      .update({ status: newStatus })
      .eq('id', orderId)
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating order status:', error);
    return { data: null, error };
  }
}

export async function updateOrderPaymentStatus(client, orderIdOrPayload, paymentPayload = {}) {
  const source = orderIdOrPayload && typeof orderIdOrPayload === 'object'
    ? orderIdOrPayload
    : paymentPayload;
  const orderId = String(source.orderId || source.order_id || source.id || orderIdOrPayload || '').trim();
  const paymentStatus = String(source.paymentStatus || source.payment_status || source.status || '').trim();
  const timestamp = new Date().toISOString();

  try {
    if (!orderId) {
      throw new Error('Missing order id for payment update.');
    }

    if (!paymentStatus) {
      throw new Error('Missing payment status.');
    }

    const updatePayload = {
      payment_status: paymentStatus,
      updated_at: timestamp,
    };

    if (!['pending', 'paid', 'failed', 'refunded'].includes(paymentStatus)) {
      throw new Error('Unsupported payment status.');
    }

    const optionalTextFields = [
      ['payment_method', source.paymentMethod || source.payment_method],
      ['payment_provider', source.paymentProvider || source.payment_provider],
      ['payment_reference', source.paymentReference || source.payment_reference],
      ['payment_intent_id', source.paymentIntentId || source.payment_intent_id],
      ['payment_currency', source.paymentCurrency || source.payment_currency],
    ];

    optionalTextFields.forEach(([column, value]) => {
      if (typeof value !== 'undefined') {
        const normalized = String(value || '').trim();
        updatePayload[column] = normalized || null;
      }
    });

    const amount = source.paymentAmount ?? source.payment_amount;
    if (typeof amount !== 'undefined') {
      const normalizedAmount = Number(amount);
      if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
        throw new Error('Enter a valid payment amount.');
      }
      updatePayload.payment_amount = normalizedAmount;
    }

    const metadata = source.paymentMetadata || source.payment_metadata;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      updatePayload.payment_metadata = metadata;
    }

    const paidAt = source.paidAt || source.paid_at;
    if (paidAt) {
      updatePayload.paid_at = paidAt;
    } else if (['paid', 'completed', 'captured'].includes(paymentStatus.toLowerCase())) {
      updatePayload.paid_at = timestamp;
    }

    const result = await client
      .from(TABLES.CUSTOMER_ORDERS)
      .update(updatePayload)
      .eq('id', orderId)
      .select('id, payment_status, payment_method, payment_provider, payment_reference, payment_intent_id, payment_amount, payment_currency, payment_metadata, paid_at, updated_at')
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return { data: result.data || null, error: null };
  } catch (error) {
    console.error('Error updating order payment status:', error);
    return { data: null, error };
  }
}

export async function submitContactForm(client, payload = {}) {
  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim();
  const message = String(payload.message || '').trim();

  try {
    if (!name) {
      throw new Error('Please enter your name.');
    }

    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email.');
    }

    if (!message || message.length < 5) {
      throw new Error('Please enter a message (at least 5 characters).');
    }

    const { data, error } = await client
      .from(TABLES.CONTACT_SUBMISSIONS)
      .insert([{ name, email, message }])
      .select('id, created_at')
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error submitting contact form:', error);
    return { data: null, error };
  }
}

export async function fetchContactSubmissions(client, options = {}) {
  const { limit = 50 } = options;

  try {
    let query = client
      .from(TABLES.CONTACT_SUBMISSIONS)
      .select('id, name, email, message, is_read, created_at')
      .order('created_at', { ascending: false });

    if (limit > 0) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching contact submissions:', error);
    return { data: null, error };
  }
}

export async function markContactSubmissionRead(client, submissionId) {
  try {
    if (!submissionId) {
      throw new Error('Missing submission id.');
    }

    const { data, error } = await client
      .from(TABLES.CONTACT_SUBMISSIONS)
      .update({ is_read: true })
      .eq('id', submissionId)
      .select('id, is_read')
      .single();

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error marking contact submission read:', error);
    return { data: null, error };
  }
}

// ==========================================
// Storage helpers — avatars & restaurant images
// ==========================================

export async function uploadAvatar(client, userId, file) {
  try {
    if (!userId) {
      throw new Error('Missing user id for avatar upload.');
    }

    if (!file) {
      throw new Error('No file provided.');
    }

    const uploadBody = file.uri && typeof fetch === 'function'
      ? await fetch(file.uri).then((response) => response.blob())
      : file;
    const extension = file.name?.split('.').pop() || file.fileName?.split('.').pop() || 'jpg';
    const filePath = `${userId}/avatar.${extension}`;

    const { error: uploadError } = await client.storage
      .from('avatars')
      .upload(filePath, uploadBody, { upsert: true, contentType: file.type || file.mimeType || 'image/jpeg' });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData } = client.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl || '';

    // Also persist in user_profiles
    if (publicUrl) {
      await client
        .from(TABLES.USER_PROFILES)
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
    }

    return { data: { url: publicUrl }, error: null };
  } catch (error) {
    console.error('Error uploading avatar:', error);
    return { data: null, error };
  }
}

export async function uploadRiderDocument(client, userId, file, side = 'front') {
  try {
    if (!userId) {
      throw new Error('Missing user id for rider document upload.');
    }

    if (!file) {
      throw new Error('No file provided.');
    }

    const normalizedSide = side === 'back' ? 'back' : 'front';
    const uploadBody = file.uri && typeof fetch === 'function'
      ? await fetch(file.uri).then((response) => response.blob())
      : file;
    const extension = file.name?.split('.').pop() || file.fileName?.split('.').pop() || 'jpg';
    const filePath = `${userId}/license-${normalizedSide}.${extension}`;

    const { error: uploadError } = await client.storage
      .from('rider_documents')
      .upload(filePath, uploadBody, { upsert: true, contentType: file.type || file.mimeType || 'image/jpeg' });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData } = client.storage
      .from('rider_documents')
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl || '';
    const updatePayload = normalizedSide === 'front'
      ? { license_front_url: publicUrl }
      : { license_back_url: publicUrl };

    if (publicUrl) {
      await client
        .from(TABLES.USER_PROFILES)
        .update(updatePayload)
        .eq('id', userId);
    }

    return { data: { url: publicUrl, side: normalizedSide }, error: null };
  } catch (error) {
    console.error('Error uploading rider document:', error);
    return { data: null, error };
  }
}

export async function uploadRestaurantImage(client, userId, restaurantId, file, kind = 'banner') {
  try {
    if (!userId || !restaurantId) {
      throw new Error('Missing user or restaurant id for image upload.');
    }

    if (!file) {
      throw new Error('No file provided.');
    }

    const normalizedKind = kind === 'profile' ? 'profile' : 'banner';
    const extension = file.name?.split('.').pop() || 'jpg';
    const filePath = `${userId}/restaurant-${restaurantId}-${normalizedKind}.${extension}`;

    const { error: uploadError } = await client.storage
      .from('restaurant_images')
      .upload(filePath, file, { upsert: true, contentType: file.type || 'image/jpeg' });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData } = client.storage
      .from('restaurant_images')
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl || '';

    const updatePayload = normalizedKind === 'profile'
      ? { profile_image_url: publicUrl }
      : { banner_url: publicUrl, image_url: publicUrl };

    if (publicUrl) {
      await client
        .from(TABLES.RESTAURANTS)
        .update(updatePayload)
        .eq('id', restaurantId)
        .eq('owner_id', userId);
    }

    return { data: { url: publicUrl, kind: normalizedKind }, error: null };
  } catch (error) {
    console.error('Error uploading restaurant image:', error);
    return { data: null, error };
  }
}
