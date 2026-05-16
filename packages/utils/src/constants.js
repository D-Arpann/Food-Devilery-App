export const TABLES = {
  USER_PROFILES: 'user_profiles',
  RESTAURANTS: 'restaurants',
  RESTAURANT_MENU_ITEMS: 'restaurant_menu_items',
  CUSTOMER_ORDERS: 'customer_orders',
  ORDER_LINE_ITEMS: 'order_line_items',
  USER_NOTIFICATIONS: 'user_notifications',
  RIDER_LOCATIONS: 'rider_locations',
  CONTACT_SUBMISSIONS: 'contact_submissions'
};

export const USER_ROLES = {
  CUSTOMER: 'customer',
  RESTAURANT_OWNER: 'restaurant_owner',
  RIDER: 'rider',
  ADMIN: 'admin'
};

export const ORDER_STATUS = {
  PLACED: 'placed',
  ACCEPTED: 'accepted',
  COOKING: 'cooking',
  READY_FOR_PICKUP: 'ready_for_pickup',
  PICKED_UP: 'picked_up',
  ARRIVED: 'arrived',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
};

export const SUPABASE_DEFAULTS = {
  URL: '',
  ANON_KEY: ''
};
