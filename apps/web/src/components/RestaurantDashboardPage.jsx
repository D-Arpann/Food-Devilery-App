import { useEffect, useMemo, useState } from 'react';
import {
  deleteRestaurantMenuItem,
  fetchRestaurantDashboard,
  fetchRestaurantOperatingSettings,
  fetchRestaurantOrderDetails,
  getDefaultRestaurantOperatingHours,
  saveRestaurantMenuItem,
  subscribeToRestaurantOrders,
  updateRestaurantProfile,
  updateRestaurantOperatingSettings,
  updateRestaurantOrderStatus,
  uploadRestaurantImage,
} from '@repo/api';
import { Logo } from '@repo/ui';
import {
  ORDER_STATUS,
  formatNpr,
  getMenuCategoryOptions,
  getRestaurantBannerUrl,
  getRestaurantProfileImageUrl,
  getShortAddress,
  normalizeMenuCategory,
} from '@repo/utils';
import './RestaurantDashboardPage.css';

const DASHBOARD_TAB = {
  OVERVIEW: 'overview',
  ORDERS: 'orders',
  MENU: 'menu',
  SETTINGS: 'settings',
};

const emptyMenuForm = {
  id: '',
  name: '',
  category: 'Specials',
  description: '',
  price: '',
  isAvailable: true,
};

const emptyProfileForm = {
  name: '',
  description: '',
  contactPhone: '',
  contactEmail: '',
  address: '',
  formattedAddress: '',
  googlePlaceId: '',
  latitude: null,
  longitude: null,
};

const statusLabels = {
  [ORDER_STATUS.PLACED]: 'New',
  [ORDER_STATUS.ACCEPTED]: 'Accepted',
  [ORDER_STATUS.COOKING]: 'Cooking',
  [ORDER_STATUS.READY_FOR_PICKUP]: 'Ready',
  [ORDER_STATUS.PICKED_UP]: 'Picked up',
  [ORDER_STATUS.ARRIVED]: 'Arrived',
  [ORDER_STATUS.DELIVERED]: 'Delivered',
  [ORDER_STATUS.CANCELLED]: 'Cancelled',
};

const statusNext = {
  [ORDER_STATUS.ACCEPTED]: {
    label: 'Start cooking',
    status: ORDER_STATUS.COOKING,
  },
  [ORDER_STATUS.COOKING]: {
    label: 'Ready for pickup',
    status: ORDER_STATUS.READY_FOR_PICKUP,
  },
};

const tabCopy = {
  [DASHBOARD_TAB.OVERVIEW]: {
    title: 'Overview',
    description: 'Today’s metrics and performance summary.',
  },
  [DASHBOARD_TAB.ORDERS]: {
    title: 'Orders',
    description: 'Manage incoming orders and kitchen queue.',
  },
  [DASHBOARD_TAB.MENU]: {
    title: 'Menu',
    description: 'Edit your catalog of items and categories.',
  },
  [DASHBOARD_TAB.SETTINGS]: {
    title: 'Settings',
    description: 'Configure restaurant hours and availability.',
  },
};

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="4" y="4" width="6.5" height="7" rx="1.6" />
      <rect x="13.5" y="4" width="6.5" height="4.5" rx="1.6" />
      <rect x="13.5" y="11.5" width="6.5" height="8.5" rx="1.6" />
      <rect x="4" y="14" width="6.5" height="6" rx="1.6" />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M7 4h10l1.5 16h-13L7 4Z" />
      <path d="M9 8h6M9.5 12h5M10 16h4" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M18 9a6 6 0 0 0-12 0c0 7-2.5 7-2.5 7h17S18 16 18 9Z" />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.04.04a2.1 2.1 0 1 1-2.96 2.96l-.04-.04a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.66V21a2.1 2.1 0 1 1-4.2 0v-.06A1.8 1.8 0 0 0 8.4 19.3a1.8 1.8 0 0 0-2 .36l-.04.04A2.1 2.1 0 1 1 3.4 16.74l.04-.04a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 2.14 13H2a2.1 2.1 0 1 1 0-4.2h.14A1.8 1.8 0 0 0 3.8 7.7a1.8 1.8 0 0 0-.36-2l-.04-.04A2.1 2.1 0 1 1 6.36 2.7l.04.04a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 9.5 1.44V1.3a2.1 2.1 0 1 1 4.2 0v.14a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 2-.36l.04-.04A2.1 2.1 0 1 1 19.8 5.66l-.04.04a1.8 1.8 0 0 0-.36 2 1.8 1.8 0 0 0 1.66 1.1H21a2.1 2.1 0 1 1 0 4.2h-.14A1.8 1.8 0 0 0 19.4 15Z" />
    </svg>
  );
}

function shortId(value = '') {
  return String(value).slice(0, 8).toUpperCase();
}

function formatTime(value) {
  if (!value) {
    return 'Just now';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getCustomerName(order) {
  return order?.customer?.full_name || order?.customer?.phone || 'Customer';
}

function getOrderItemCount(order) {
  return (order?.lineItems || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function groupMenuItems(menuItems = []) {
  return menuItems.reduce((acc, item) => {
    const category = normalizeMenuCategory(item.category);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {});
}

function buildRestaurantProfileForm(restaurant = {}) {
  return {
    name: restaurant?.name || '',
    description: restaurant?.description || '',
    contactPhone: restaurant?.contact_phone || '',
    contactEmail: restaurant?.contact_email || '',
    address: restaurant?.address || '',
    formattedAddress: restaurant?.formatted_address || restaurant?.address || '',
    googlePlaceId: restaurant?.google_place_id || '',
    latitude: restaurant?.latitude ?? null,
    longitude: restaurant?.longitude ?? null,
  };
}

function mergeOrder(orders, nextOrder) {
  if (!nextOrder?.id) {
    return orders;
  }

  const exists = orders.some((order) => order.id === nextOrder.id);
  if (!exists) {
    return [nextOrder, ...orders];
  }

  return orders.map((order) => (order.id === nextOrder.id ? nextOrder : order));
}

function MetricCard({ label, value, detail }) {
  return (
    <article className="restaurant-dashboard-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function StatusPill({ status }) {
  return (
    <span className="restaurant-dashboard-status" data-status={status}>
      {statusLabels[status] || status}
    </span>
  );
}

function OrderCard({ order, active, onSelect }) {
  return (
    <button
      type="button"
      className={`restaurant-dashboard-order-card ${active ? 'is-active' : ''}`}
      onClick={() => onSelect(order)}
    >
      <div>
        <strong>#{shortId(order.id)}</strong>
        <span>{getCustomerName(order)}</span>
      </div>
      <div>
        <StatusPill status={order.status} />
        <span>{formatNpr(order.total_amount)}</span>
      </div>
    </button>
  );
}

function OrderDetails({ order, busy, onAccept, onDecline, onAdvance }) {
  if (!order) {
    return (
      <section className="restaurant-dashboard-panel restaurant-dashboard-empty">
        <IconOrders />
        <h3>Select an order</h3>
        <p>Choose an order from the queue to view details and manage its status.</p>
      </section>
    );
  }

  const nextAction = statusNext[order.status];

  return (
    <section className="restaurant-dashboard-panel restaurant-dashboard-order-details">
      <div className="restaurant-dashboard-panel-head">
        <div>
          <span className="restaurant-dashboard-kicker">Order #{shortId(order.id)}</span>
          <h2>{getCustomerName(order)}</h2>
          <p>{order.delivery_address}</p>
        </div>
        <StatusPill status={order.status} />
      </div>

      <div className="restaurant-dashboard-order-meta">
        <div>
          <span>Placed</span>
          <strong>{formatTime(order.created_at)}</strong>
        </div>
        <div>
          <span>Items</span>
          <strong>{getOrderItemCount(order)}</strong>
        </div>
        <div>
          <span>Subtotal</span>
          <strong>{formatNpr(order.subtotal || order.total_amount)}</strong>
        </div>
      </div>

      <div className="restaurant-dashboard-items">
        {(order.lineItems || []).map((item) => (
          <div key={item.id} className="restaurant-dashboard-item-row">
            <div>
              <strong>{item.item_name}</strong>
              <span>{formatNpr(item.item_price)}</span>
            </div>
            <span>x{item.quantity}</span>
          </div>
        ))}
      </div>

      <div className="restaurant-dashboard-actions">
        {order.status === ORDER_STATUS.PLACED ? (
          <>
            <button type="button" className="restaurant-dashboard-primary" onClick={onAccept} disabled={busy}>
              Accept order
            </button>
            <button type="button" className="restaurant-dashboard-danger" onClick={onDecline} disabled={busy}>
              Decline
            </button>
          </>
        ) : null}

        {nextAction ? (
          <button type="button" className="restaurant-dashboard-primary" onClick={() => onAdvance(nextAction.status)} disabled={busy}>
            {nextAction.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function MenuEditor({
  form,
  saving,
  onChange,
  onSubmit,
  onCancel,
  categories,
}) {
  return (
    <form className="restaurant-dashboard-panel restaurant-dashboard-menu-editor" onSubmit={onSubmit}>
      <div className="restaurant-dashboard-panel-head">
        <div>
          <span className="restaurant-dashboard-kicker">Menu builder</span>
          <h2>{form.id ? 'Edit item' : 'Add menu item'}</h2>
          <p>Keep item details simple and ready for customers.</p>
        </div>
      </div>

      <div className="restaurant-dashboard-form-grid">
        <label>
          <span>Name</span>
          <input value={form.name} onChange={(event) => onChange('name', event.target.value)} placeholder="Chicken Steam Momo" required />
        </label>
        <label>
          <span>Category</span>
          <input value={form.category} onChange={(event) => onChange('category', event.target.value)} list="restaurant-menu-categories" placeholder="Momo" />
          <datalist id="restaurant-menu-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </label>
        <label>
          <span>Price</span>
          <input type="number" min="1" step="1" value={form.price} onChange={(event) => onChange('price', event.target.value)} placeholder="220" required />
        </label>
      </div>

      <label className="restaurant-dashboard-textarea">
        <span>Description</span>
        <textarea value={form.description} onChange={(event) => onChange('description', event.target.value)} placeholder="Short prep notes or customer-facing description." />
      </label>

      <label className="restaurant-dashboard-checkbox">
        <input type="checkbox" checked={form.isAvailable} onChange={(event) => onChange('isAvailable', event.target.checked)} />
        <span>Available to customers</span>
      </label>

      <div className="restaurant-dashboard-actions restaurant-dashboard-actions-spaced">
        <button type="submit" className="restaurant-dashboard-primary" disabled={saving}>
          {saving ? 'Saving...' : form.id ? 'Save changes' : 'Add item'}
        </button>
        {form.id ? (
          <button type="button" className="restaurant-dashboard-secondary" onClick={onCancel} disabled={saving}>
            Cancel edit
          </button>
        ) : null}
      </div>
    </form>
  );
}

function RestaurantProfileSettings({
  form,
  saving,
  onChange,
  onSubmit,
}) {
  return (
    <form className="restaurant-dashboard-panel restaurant-dashboard-profile-form" onSubmit={onSubmit}>
      <div className="restaurant-dashboard-panel-head">
        <div>
          <span className="restaurant-dashboard-kicker">Public profile</span>
          <h2>Restaurant details</h2>
          <p>These fields appear on customer restaurant pages.</p>
        </div>
      </div>

      <div className="restaurant-dashboard-form-grid">
        <label>
          <span>Name</span>
          <input value={form.name} onChange={(event) => onChange('name', event.target.value)} placeholder="Momo Station" required />
        </label>
        <label>
          <span>Contact phone</span>
          <input type="tel" inputMode="tel" maxLength={10} value={form.contactPhone} onChange={(event) => onChange('contactPhone', event.target.value)} placeholder="9800000000" required />
        </label>
        <label>
          <span>Contact email</span>
          <input type="email" value={form.contactEmail} onChange={(event) => onChange('contactEmail', event.target.value)} placeholder="owner@example.com" required />
        </label>
      </div>

      <label className="restaurant-dashboard-textarea">
        <span>Bio</span>
        <textarea value={form.description} onChange={(event) => onChange('description', event.target.value)} placeholder="Short customer-facing restaurant bio." required />
      </label>

      <label className="restaurant-dashboard-textarea">
        <span>Address <small style={{ fontWeight: 500, color: '#8a827b' }}>(set during registration)</small></span>
        <textarea value={form.address} readOnly tabIndex={-1} style={{ opacity: 0.65, cursor: 'not-allowed', resize: 'none' }} />
      </label>

      <div className="restaurant-dashboard-actions restaurant-dashboard-actions-spaced">
        <button type="submit" className="restaurant-dashboard-primary" disabled={saving}>
          {saving ? 'Saving profile...' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}

function OperatingSettings({
  acceptingOrders,
  operatingHours,
  saving,
  onToggleAccepting,
  onHourChange,
  onSubmit,
}) {
  return (
    <form className="restaurant-dashboard-settings-grid" onSubmit={onSubmit}>
      <section className="restaurant-dashboard-panel restaurant-dashboard-toggle-card">
        <div className="restaurant-dashboard-panel-head">
          <div>
            <span className="restaurant-dashboard-kicker">Restaurant status</span>
            <h2>{acceptingOrders ? 'Open for orders' : 'Closed to customers'}</h2>
            <p>Choose whether customers can order right now.</p>
          </div>
        </div>

        <label className="restaurant-dashboard-switch">
          <input type="checkbox" checked={acceptingOrders} onChange={(event) => onToggleAccepting(event.target.checked)} />
          <span aria-hidden="true" />
          <strong>{acceptingOrders ? 'Accepting orders' : 'Not accepting orders'}</strong>
        </label>

        <p className="restaurant-dashboard-note">
          Closed restaurants stay hidden from customer ordering.
        </p>
      </section>

      <section className="restaurant-dashboard-panel restaurant-dashboard-hours-card">
        <div className="restaurant-dashboard-panel-head">
          <div>
            <span className="restaurant-dashboard-kicker">Operating hours</span>
            <h2>Weekly schedule</h2>
            <p>Set clear opening and closing times.</p>
          </div>
        </div>

        <div className="restaurant-dashboard-hours">
          {operatingHours.map((item, index) => (
            <div key={item.day} className="restaurant-dashboard-hour-row">
              <strong>{item.day}</strong>
              <label>
                <span>Open</span>
                <input
                  type="time"
                  value={item.open}
                  onChange={(event) => onHourChange(index, 'open', event.target.value)}
                  disabled={item.closed}
                />
              </label>
              <label>
                <span>Close</span>
                <input
                  type="time"
                  value={item.close}
                  onChange={(event) => onHourChange(index, 'close', event.target.value)}
                  disabled={item.closed}
                />
              </label>
              <label className="restaurant-dashboard-closed-check">
                <input
                  type="checkbox"
                  checked={item.closed}
                  onChange={(event) => onHourChange(index, 'closed', event.target.checked)}
                />
                <span>Closed</span>
              </label>
            </div>
          ))}
        </div>

        <div className="restaurant-dashboard-actions">
          <button type="submit" className="restaurant-dashboard-primary" disabled={saving}>
            {saving ? 'Saving settings...' : 'Save settings'}
          </button>
        </div>
      </section>
    </form>
  );
}

export default function RestaurantDashboardPage({ session, supabase, onLogout }) {
  const [activeTab, setActiveTab] = useState(DASHBOARD_TAB.OVERVIEW);
  const [restaurant, setRestaurant] = useState(null);
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [incomingOrder, setIncomingOrder] = useState(null);
  const [todayIsoDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [savingMenu, setSavingMenu] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [orderBusy, setOrderBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [menuForm, setMenuForm] = useState(emptyMenuForm);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [operatingHours, setOperatingHours] = useState(() => getDefaultRestaurantOperatingHours());

  const ownerId = session?.user?.id || '';

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      if (!supabase || !ownerId) {
        return;
      }

      setLoading(true);
      setError('');

      const { data, error: dashboardError } = await fetchRestaurantDashboard(supabase, ownerId);

      if (!active) {
        return;
      }

      if (dashboardError) {
        setError(dashboardError.message || 'Could not load restaurant dashboard.');
      } else {
        const nextRestaurant = data?.restaurant || null;
        setRestaurant(nextRestaurant);
        setProfileForm(buildRestaurantProfileForm(nextRestaurant));
        setOrders(data?.orders || []);
        setMenuItems(data?.menuItems || []);
        setSelectedOrderId((current) => current || data?.orders?.[0]?.id || '');

        if (nextRestaurant?.id) {
          const { data: settingsData, error: settingsError } = await fetchRestaurantOperatingSettings(supabase, nextRestaurant.id);

          if (!active) {
            return;
          }

          if (settingsError) {
            setAcceptingOrders(Boolean(nextRestaurant.is_active));
            setOperatingHours(getDefaultRestaurantOperatingHours());
            setMessage('Using default operating hours until settings can be loaded.');
          } else {
            setAcceptingOrders(settingsData?.isActive ?? Boolean(nextRestaurant.is_active));
            setOperatingHours(settingsData?.operatingHours || getDefaultRestaurantOperatingHours());
          }
        } else {
          setAcceptingOrders(true);
          setOperatingHours(getDefaultRestaurantOperatingHours());
        }
      }

      setLoading(false);
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [ownerId, supabase]);

  useEffect(() => {
    if (!supabase || !restaurant?.id) {
      return undefined;
    }

    return subscribeToRestaurantOrders(
      supabase,
      restaurant.id,
      async (order) => {
        const { data } = await fetchRestaurantOrderDetails(supabase, order.id);
        const nextOrder = data || order;
        setOrders((current) => mergeOrder(current, nextOrder));
        setIncomingOrder(nextOrder);
        setSelectedOrderId(nextOrder.id);
        setActiveTab(DASHBOARD_TAB.ORDERS);
      },
      () => {
        setMessage('Realtime order alerts are unavailable. Use refresh to check for new orders.');
      },
    );
  }, [restaurant?.id, supabase]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId],
  );

  const openOrders = useMemo(
    () => orders.filter((order) => ![ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED].includes(order.status)),
    [orders],
  );

  const metrics = useMemo(() => {
    const pendingOrders = orders.filter((order) => order.status === ORDER_STATUS.PLACED).length;
    const completedOrders = orders.filter((order) => order.status === ORDER_STATUS.DELIVERED).length;
    const dailyEarnings = orders
      .filter((order) => order.status !== ORDER_STATUS.CANCELLED)
      .filter((order) => (todayIsoDate ? String(order.created_at || '').startsWith(todayIsoDate) : true))
      .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

    return {
      pendingOrders,
      completedOrders,
      dailyEarnings,
      activeOrders: openOrders.length,
    };
  }, [openOrders.length, orders, todayIsoDate]);

  const menuByCategory = useMemo(() => groupMenuItems(menuItems), [menuItems]);
  const categories = useMemo(
    () => Object.keys(menuByCategory).sort((a, b) => a.localeCompare(b)),
    [menuByCategory],
  );
  const menuCategoryOptions = useMemo(() => getMenuCategoryOptions(), []);

  const updateOrderInState = (nextOrder) => {
    setOrders((current) => mergeOrder(current, nextOrder));
    setIncomingOrder((current) => (current?.id === nextOrder.id ? nextOrder : current));
  };

  const handleOrderStatus = async (order, status) => {
    if (!order?.id) {
      return;
    }

    setOrderBusy(order.id);
    setError('');

    const { data, error: statusError } = await updateRestaurantOrderStatus(supabase, order.id, status);

    if (statusError) {
      setError(statusError.message || 'Could not update order status.');
    } else if (data) {
      updateOrderInState(data);
      setMessage(`Order #${shortId(data.id)} moved to ${statusLabels[data.status] || data.status}.`);
      if ([ORDER_STATUS.ACCEPTED, ORDER_STATUS.CANCELLED].includes(data.status)) {
        setIncomingOrder(null);
      }
    }

    setOrderBusy('');
  };

  const handleRefresh = async () => {
    if (!restaurant?.id) {
      return;
    }

    setLoading(true);
    setError('');

    const { data, error: dashboardError } = await fetchRestaurantDashboard(supabase, ownerId);

    if (dashboardError) {
      setError(dashboardError.message || 'Could not refresh dashboard.');
    } else {
      const nextRestaurant = data?.restaurant || restaurant;
      setRestaurant(nextRestaurant);
      setProfileForm(buildRestaurantProfileForm(nextRestaurant));
      setOrders(data?.orders || []);
      setMenuItems(data?.menuItems || []);

      if (nextRestaurant?.id) {
        const { data: settingsData, error: settingsError } = await fetchRestaurantOperatingSettings(supabase, nextRestaurant.id);

        if (settingsError) {
          setError(settingsError.message || 'Could not refresh restaurant settings.');
        } else {
          setAcceptingOrders(settingsData?.isActive ?? Boolean(nextRestaurant.is_active));
          setOperatingHours(settingsData?.operatingHours || getDefaultRestaurantOperatingHours());
        }
      }
    }

    setLoading(false);
  };

  const handleMenuChange = (field, value) => {
    setMenuForm((current) => ({
      ...current,
      [field]: value,
    }));
    setMessage('');
    setError('');
  };

  const resetMenuForm = () => {
    setMenuForm(emptyMenuForm);
  };

  const handleEditMenuItem = (item) => {
    setActiveTab(DASHBOARD_TAB.MENU);
    setMenuForm({
      id: item.id,
      name: item.name || '',
      category: normalizeMenuCategory(item.category),
      description: item.description || '',
      price: String(item.price || ''),
      isAvailable: Boolean(item.is_available),
    });
  };

  const handleMenuSubmit = async (event) => {
    event.preventDefault();
    if (!restaurant?.id) {
      setError('Restaurant profile is not available yet.');
      return;
    }

    setSavingMenu(true);
    setError('');
    setMessage('');

    const { data, error: saveError } = await saveRestaurantMenuItem(supabase, {
      ...menuForm,
      category: normalizeMenuCategory(menuForm.category),
      restaurantId: restaurant.id,
    });

    if (saveError) {
      setError(saveError.message || 'Could not save menu item.');
    } else if (data) {
      setMenuItems((current) => {
        const exists = current.some((item) => item.id === data.id);
        return exists
          ? current.map((item) => (item.id === data.id ? data : item))
          : [data, ...current];
      });
      setMessage(`${data.name} has been saved.`);
      resetMenuForm();
    }

    setSavingMenu(false);
  };

  const handleDeleteMenuItem = async (item) => {
    const { error: deleteError } = await deleteRestaurantMenuItem(supabase, restaurant.id, item.id);

    if (deleteError) {
      setError(deleteError.message || 'Could not delete menu item.');
      return;
    }

    setMenuItems((current) => current.filter((menuItem) => menuItem.id !== item.id));
    setMessage(`${item.name} was removed from the menu.`);
    if (menuForm.id === item.id) {
      resetMenuForm();
    }
  };

  const handleProfileChange = (field, value) => {
    setProfileForm((current) => ({
      ...current,
      [field]: value,
    }));
    setMessage('');
    setError('');
  };

  const handleToggleAccepting = (value) => {
    setAcceptingOrders(value);
    setMessage('');
    setError('');
  };

  const handleOperatingHourChange = (index, field, value) => {
    setOperatingHours((current) => current.map((item, itemIndex) => (
      itemIndex === index
        ? {
          ...item,
          [field]: value,
        }
        : item
    )));
    setMessage('');
    setError('');
  };

  const handleSettingsSubmit = async (event) => {
    event.preventDefault();
    if (!restaurant?.id) {
      setError('Restaurant profile is not available yet.');
      return;
    }

    const incompleteDay = operatingHours.find((item) => !item.closed && (!item.open || !item.close));
    if (incompleteDay) {
      setError(`${incompleteDay.day} needs both an opening and closing time.`);
      return;
    }

    setSavingSettings(true);
    setError('');
    setMessage('');

    const { data, error: settingsError } = await updateRestaurantOperatingSettings(supabase, restaurant.id, {
      isActive: acceptingOrders,
      operatingHours,
    });

    if (settingsError) {
      setError(settingsError.message || 'Could not save restaurant settings.');
    } else if (data) {
      setRestaurant((current) => ({
        ...current,
        ...(data.restaurant || {}),
      }));
      setAcceptingOrders(data.isActive ?? acceptingOrders);
      setOperatingHours(data.operatingHours || operatingHours);
      setMessage('Restaurant settings saved.');
    }

    setSavingSettings(false);
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    if (!restaurant?.id) {
      setError('Restaurant profile is not available yet.');
      return;
    }

    setSavingProfile(true);
    setError('');
    setMessage('');

    const { data, error: profileError } = await updateRestaurantProfile(supabase, restaurant.id, {
      name: profileForm.name,
      description: profileForm.description,
      contactPhone: profileForm.contactPhone,
      contactEmail: profileForm.contactEmail,
      address: profileForm.address,
      formattedAddress: profileForm.formattedAddress || profileForm.address,
      googlePlaceId: profileForm.googlePlaceId,
      coordinates: {
        latitude: profileForm.latitude,
        longitude: profileForm.longitude,
      },
    });

    if (profileError) {
      setError(profileError.message || 'Could not save restaurant profile.');
    } else if (data) {
      setRestaurant((current) => ({
        ...current,
        ...data,
      }));
      setProfileForm(buildRestaurantProfileForm(data));
      setMessage('Restaurant profile saved.');
    }

    setSavingProfile(false);
  };

  const handleRestaurantImageUpload = async (kind, file) => {
    if (!file || !ownerId || !restaurant?.id) {
      return;
    }

    setError('');
    setMessage('');

    const { data, error: uploadError } = await uploadRestaurantImage(
      supabase,
      ownerId,
      restaurant.id,
      file,
      kind,
    );

    if (uploadError) {
      setError(uploadError.message || 'Could not upload restaurant image.');
      return;
    }

    if (data?.url) {
      setRestaurant((current) => ({
        ...current,
        ...(kind === 'profile'
          ? { profile_image_url: data.url }
          : { banner_url: data.url, image_url: data.url }),
      }));
      setMessage(kind === 'profile' ? 'Profile photo updated.' : 'Banner updated.');
    }
  };

  if (loading && !restaurant) {
    return (
      <main className="restaurant-dashboard-shell">
        <div className="restaurant-dashboard-loading">
          <div className="pulse" />
          <p>Loading restaurant dashboard...</p>
        </div>
      </main>
    );
  }

  if (!restaurant) {
    return (
      <main className="restaurant-dashboard-shell">
        <nav className="restaurant-dashboard-nav">
          <div className="restaurant-dashboard-nav-inner">
            <div className="restaurant-dashboard-brand">
              <img src={Logo} alt="Chito Mitho logo" />
              <span>Chito Mitho</span>
            </div>
            <button type="button" className="restaurant-dashboard-logout" onClick={onLogout}>Logout</button>
          </div>
        </nav>
        <section className="restaurant-dashboard-stage restaurant-dashboard-empty-state">
          <span className="restaurant-dashboard-kicker">Restaurant dashboard</span>
          <h1>No verified restaurant found.</h1>
          <p>Your account does not have an active restaurant profile yet. Once your application is verified, this dashboard will unlock.</p>
        </section>
      </main>
    );
  }

  const activeCopy = tabCopy[activeTab] || tabCopy[DASHBOARD_TAB.OVERVIEW];
  const liveMessage = message || (acceptingOrders ? 'Live: Accepting new orders' : 'Paused: Not accepting orders');

  return (
    <main className="restaurant-dashboard-shell">
      <nav className="restaurant-dashboard-nav">
        <div className="restaurant-dashboard-nav-inner">
          <button type="button" className="restaurant-dashboard-brand" onClick={() => setActiveTab(DASHBOARD_TAB.OVERVIEW)}>
            <img src={Logo} alt="Chito Mitho logo" />
            <span>{restaurant.name}</span>
          </button>

          <div className="restaurant-dashboard-nav-actions">
            <button type="button" className="restaurant-dashboard-logout" onClick={onLogout}>Logout</button>
          </div>
        </div>
      </nav>

      <div className="restaurant-dashboard-layout">
        <aside className="restaurant-dashboard-sidebar">
          <div className="restaurant-dashboard-sidebar-card">
            <label className="restaurant-dashboard-banner-upload" title="Click to change restaurant banner">
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(event) => handleRestaurantImageUpload('banner', event.target.files?.[0] || null)}
              />
              <img src={getRestaurantBannerUrl(restaurant) || Logo} alt={restaurant.name} />
              <span className="restaurant-dashboard-banner-hint">Change banner</span>
            </label>
            <div className="restaurant-dashboard-profile-row">
              <label className="restaurant-dashboard-profile-upload" title="Click to change restaurant profile photo">
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(event) => handleRestaurantImageUpload('profile', event.target.files?.[0] || null)}
                />
                <img src={getRestaurantProfileImageUrl(restaurant) || Logo} alt="" />
                <span className="restaurant-dashboard-profile-hint">Photo</span>
              </label>
              <div>
                <strong>{restaurant.name}</strong>
                <span>{getShortAddress(restaurant.address || 'Kathmandu Valley')}</span>
              </div>
            </div>
          </div>

          <button type="button" className={activeTab === DASHBOARD_TAB.OVERVIEW ? 'is-active' : ''} onClick={() => setActiveTab(DASHBOARD_TAB.OVERVIEW)}>
            <IconDashboard />
            Overview
          </button>
          <button type="button" className={activeTab === DASHBOARD_TAB.ORDERS ? 'is-active' : ''} onClick={() => setActiveTab(DASHBOARD_TAB.ORDERS)}>
            <IconOrders />
            Orders
            {metrics.pendingOrders ? <span>{metrics.pendingOrders}</span> : null}
          </button>
          <button type="button" className={activeTab === DASHBOARD_TAB.MENU ? 'is-active' : ''} onClick={() => setActiveTab(DASHBOARD_TAB.MENU)}>
            <IconMenu />
            Menu
          </button>
          <button type="button" className={activeTab === DASHBOARD_TAB.SETTINGS ? 'is-active' : ''} onClick={() => setActiveTab(DASHBOARD_TAB.SETTINGS)}>
            <IconSettings />
            Settings
          </button>
        </aside>

        <section className="restaurant-dashboard-main">
          <header className="restaurant-dashboard-stage">
            <div>
              <span className="restaurant-dashboard-kicker">Restaurant</span>
              <h1>{activeCopy.title}</h1>
              <p>{activeCopy.description}</p>
            </div>
            <div className="restaurant-dashboard-live">
              <IconBell />
              <span>{liveMessage}</span>
            </div>
          </header>

          {error ? <p className="restaurant-dashboard-alert" data-state="error">{error}</p> : null}

          {activeTab === DASHBOARD_TAB.OVERVIEW ? (
            <>
              <section className="restaurant-dashboard-metrics">
                <MetricCard label="Pending orders" value={metrics.pendingOrders} detail="Need accept or decline" />
                <MetricCard label="Completed" value={metrics.completedOrders} detail="Delivered orders" />
                <MetricCard label="Earnings" value={formatNpr(metrics.dailyEarnings)} detail="Today so far" />
                <MetricCard label="Menu items" value={menuItems.length} detail={`${categories.length || 1} categories`} />
                <MetricCard label="Status" value={acceptingOrders ? 'Open' : 'Closed'} detail="Customer visibility" />
              </section>

              <section className="restaurant-dashboard-grid">
                <div className="restaurant-dashboard-panel">
                  <div className="restaurant-dashboard-panel-head">
                    <div>
                      <span className="restaurant-dashboard-kicker">Kitchen queue</span>
                      <h2>Active orders</h2>
                    </div>
                    <button type="button" className="restaurant-dashboard-link" onClick={() => setActiveTab(DASHBOARD_TAB.ORDERS)}>View all</button>
                  </div>
                  <div className="restaurant-dashboard-order-list">
                    {openOrders.slice(0, 5).map((order) => (
                      <OrderCard key={order.id} order={order} active={order.id === selectedOrderId} onSelect={(nextOrder) => {
                        setSelectedOrderId(nextOrder.id);
                        setActiveTab(DASHBOARD_TAB.ORDERS);
                      }} />
                    ))}
                    {!openOrders.length ? <p className="restaurant-dashboard-note">No active orders right now.</p> : null}
                  </div>
                </div>

                <div className="restaurant-dashboard-panel">
                  <div className="restaurant-dashboard-panel-head">
                    <div>
                      <span className="restaurant-dashboard-kicker">Menu categories</span>
                      <h2>Categories</h2>
                    </div>
                    <button type="button" className="restaurant-dashboard-link" onClick={() => setActiveTab(DASHBOARD_TAB.MENU)}>Manage</button>
                  </div>
                  <div className="restaurant-dashboard-category-list">
                    {categories.map((category) => (
                      <div key={category}>
                        <strong>{category}</strong>
                        <span>{menuByCategory[category].length} items</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {activeTab === DASHBOARD_TAB.ORDERS ? (
            <section className="restaurant-dashboard-orders-grid">
              <div className="restaurant-dashboard-panel">
                <div className="restaurant-dashboard-panel-head">
                  <div>
                    <span className="restaurant-dashboard-kicker">Incoming and active</span>
                    <h2>Queue</h2>
                  </div>
                </div>
                <div className="restaurant-dashboard-order-list">
                  {orders.map((order) => (
                    <OrderCard key={order.id} order={order} active={order.id === selectedOrder?.id} onSelect={(nextOrder) => setSelectedOrderId(nextOrder.id)} />
                  ))}
                  {!orders.length ? <p className="restaurant-dashboard-note">No orders have arrived yet.</p> : null}
                </div>
              </div>

              <OrderDetails
                order={selectedOrder}
                busy={orderBusy === selectedOrder?.id}
                onAccept={() => handleOrderStatus(selectedOrder, ORDER_STATUS.ACCEPTED)}
                onDecline={() => handleOrderStatus(selectedOrder, ORDER_STATUS.CANCELLED)}
                onAdvance={(status) => handleOrderStatus(selectedOrder, status)}
              />
            </section>
          ) : null}

          {activeTab === DASHBOARD_TAB.MENU ? (
            <section className="restaurant-dashboard-menu-grid">
              <MenuEditor
                form={menuForm}
                saving={savingMenu}
                onChange={handleMenuChange}
                onSubmit={handleMenuSubmit}
                onCancel={resetMenuForm}
                categories={menuCategoryOptions}
              />

              <section className="restaurant-dashboard-panel restaurant-dashboard-menu-list">
                <div className="restaurant-dashboard-panel-head">
                  <div>
                    <span className="restaurant-dashboard-kicker">Live menu</span>
                    <h2>{menuItems.length} items</h2>
                  </div>
                </div>

                {categories.map((category) => (
                  <div key={category} className="restaurant-dashboard-menu-group">
                    <h3>{category}</h3>
                    {menuByCategory[category].map((item) => (
                      <article key={item.id} className="restaurant-dashboard-menu-item">
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.description || 'No description yet.'}</span>
                          <small>{item.is_available ? 'Available' : 'Hidden'} · {formatNpr(item.price)}</small>
                        </div>
                        <div>
                          <button type="button" className="restaurant-dashboard-secondary" onClick={() => handleEditMenuItem(item)}>Edit</button>
                          <button type="button" className="restaurant-dashboard-danger" onClick={() => handleDeleteMenuItem(item)}>Delete</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ))}
              </section>
            </section>
          ) : null}

          {activeTab === DASHBOARD_TAB.SETTINGS ? (
            <div className="restaurant-dashboard-settings-stack">
              <RestaurantProfileSettings
                form={profileForm}
                saving={savingProfile}
                onChange={handleProfileChange}
                onSubmit={handleProfileSubmit}
              />

              <OperatingSettings
                acceptingOrders={acceptingOrders}
                operatingHours={operatingHours}
                saving={savingSettings}
                onToggleAccepting={handleToggleAccepting}
                onHourChange={handleOperatingHourChange}
                onSubmit={handleSettingsSubmit}
              />
            </div>
          ) : null}
        </section>
      </div>

      {incomingOrder && incomingOrder.status === ORDER_STATUS.PLACED ? (
        <div className="restaurant-dashboard-modal-overlay" role="presentation">
          <section className="restaurant-dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="incoming-order-title">
            <span className="restaurant-dashboard-kicker">New order</span>
            <h2 id="incoming-order-title">Order #{shortId(incomingOrder.id)} just arrived.</h2>
            <p>{getCustomerName(incomingOrder)} · {getOrderItemCount(incomingOrder)} items · {formatNpr(incomingOrder.total_amount)}</p>
            <div className="restaurant-dashboard-items">
              {(incomingOrder.lineItems || []).map((item) => (
                <div key={item.id} className="restaurant-dashboard-item-row">
                  <div>
                    <strong>{item.item_name}</strong>
                    <span>{formatNpr(item.item_price)}</span>
                  </div>
                  <span>x{item.quantity}</span>
                </div>
              ))}
            </div>
            <div className="restaurant-dashboard-actions">
              <button type="button" className="restaurant-dashboard-primary" onClick={() => handleOrderStatus(incomingOrder, ORDER_STATUS.ACCEPTED)} disabled={orderBusy === incomingOrder.id}>
                Accept
              </button>
              <button type="button" className="restaurant-dashboard-danger" onClick={() => handleOrderStatus(incomingOrder, ORDER_STATUS.CANCELLED)} disabled={orderBusy === incomingOrder.id}>
                Decline
              </button>
              <button type="button" className="restaurant-dashboard-secondary" onClick={() => setIncomingOrder(null)}>
                Review later
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
