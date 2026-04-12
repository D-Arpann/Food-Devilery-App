import { useEffect, useMemo, useState } from 'react';
import { createCheckoutOrder, fetchRestaurantFeed } from '@repo/api';
import { Logo, useCart } from '@repo/ui';
import {
  filterMenuItems,
  filterRestaurantFeed,
  formatNpr,
  getDeliveryFee,
  getRestaurantRating,
  isValidDeliveryAddress,
  normalizeDeliveryAddress,
} from '@repo/utils';
import './DiscoveryPage.css';

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

function IconArrowLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 18 9 12l6-6" />
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

function QuantityControl({ quantity, onDecrease, onIncrease }) {
  return (
    <div className="discover-qty">
      <button type="button" onClick={onDecrease} aria-label="Decrease quantity">-</button>
      <span>{quantity}</span>
      <button type="button" onClick={onIncrease} aria-label="Increase quantity">+</button>
    </div>
  );
}

function RestaurantCard({ restaurant, active, compact = false, onSelect }) {
  const firstItem = restaurant.menu_items?.[0];
  const rating = getRestaurantRating(restaurant.id);

  return (
    <button
      type="button"
      className={`discover-card ${compact ? 'discover-card-compact' : ''} ${active ? 'active' : ''}`}
      onClick={() => onSelect(restaurant.id)}
    >
      <div className="discover-card-cover">
        <img
          src={restaurant.image_url || firstItem?.image_url || Logo}
          alt={restaurant.name}
        />
        <span>{firstItem?.name || 'Popular picks'}</span>
      </div>

      <div className="discover-card-body">
        <h3>{restaurant.name}</h3>
        <p>{restaurant.address || 'Kathmandu Valley'}</p>

        <div className="discover-card-meta">
          <span className="discover-meta-pill">
            <IconStar />
            {rating}
          </span>
          <span className="discover-meta-pill discover-price-tag">
            <IconDelivery />
            {formatNpr(getDeliveryFee(restaurant.id))}
          </span>
          <span className="discover-meta-pill">
            <IconMenu />
            {restaurant.menu_items?.length || 0} items
          </span>
        </div>
      </div>
    </button>
  );
}

function MenuItemCard({ item, quantity, canAdd, onAdd, onIncrease, onDecrease }) {
  return (
    <article className="discover-menu-item">
      <img src={item.image_url || Logo} alt={item.name} />
      <div className="discover-menu-main">
        <div className="discover-menu-title-row">
          <h4>{item.name}</h4>
          <span className="discover-menu-category">
            <IconTag />
            {item.category || 'Special'}
          </span>
        </div>
        <p>{item.description || item.category || 'House special'}</p>

        <div className="discover-menu-bottom">
          <strong className="discover-price-tag">
            <IconRupee />
            {formatNpr(item.price)}
          </strong>

          <div className="discover-menu-actions">
            {quantity > 0 ? (
              <QuantityControl
                quantity={quantity}
                onIncrease={onIncrease}
                onDecrease={onDecrease}
              />
            ) : (
              <button
                type="button"
                className="discover-add-btn"
                onClick={onAdd}
                disabled={!canAdd}
              >
                {canAdd ? 'Add' : 'Single restaurant cart'}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function CartLineItem({ item, onIncrease, onDecrease }) {
  return (
    <article className="discover-cart-item">
      <img src={item.image_url || Logo} alt={item.name} />
      <div>
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

export default function DiscoveryPage({ session, supabase, onLogout }) {
  const initialAddress = normalizeDeliveryAddress(session?.user?.user_metadata?.address);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [feed, setFeed] = useState([]);
  const [activeRestaurantId, setActiveRestaurantId] = useState(null);
  const [screen, setScreen] = useState('browse');
  const [deliveryAddress, setDeliveryAddress] = useState(initialAddress);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [checkoutSuccess, setCheckoutSuccess] = useState(null);

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
    if (!cartNotice) {
      return undefined;
    }

    const timer = setTimeout(() => {
      dismissNotice();
    }, 3200);

    return () => clearTimeout(timer);
  }, [cartNotice, dismissNotice]);

  useEffect(() => {
    if (cartItems.length && checkoutSuccess) {
      setCheckoutSuccess(null);
    }
  }, [cartItems.length, checkoutSuccess]);

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
  }, [supabase]);

  const filteredRestaurants = useMemo(
    () => filterRestaurantFeed(feed, searchQuery),
    [feed, searchQuery],
  );

  const featuredRestaurants = useMemo(
    () => filteredRestaurants.slice(0, 2),
    [filteredRestaurants],
  );

  const remainingRestaurants = useMemo(
    () => filteredRestaurants.slice(2),
    [filteredRestaurants],
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
    () => filterMenuItems(activeRestaurant?.menu_items || [], searchQuery),
    [activeRestaurant, searchQuery],
  );

  const menuQuantityMap = useMemo(() => {
    return cartItems.reduce((acc, item) => {
      acc[item.id] = item.quantity;
      return acc;
    }, {});
  }, [cartItems]);

  const canAddFromActiveRestaurant = !cartRestaurant?.id || cartRestaurant.id === activeRestaurant?.id;
  const checkoutDeliveryFee = cartRestaurant?.id ? getDeliveryFee(cartRestaurant.id) : 0;
  const checkoutSummary = getSummary(checkoutDeliveryFee);
  const hasValidAddress = isValidDeliveryAddress(deliveryAddress);
  const checkoutButtonLabel = checkoutLoading
    ? 'Placing order...'
    : !cartItems.length
      ? 'Add items to checkout'
      : !hasValidAddress
        ? 'Enter delivery address'
        : 'Proceed to Checkout';
  const addressHelperText = !cartItems.length
    ? 'Add items first to unlock checkout and delivery details.'
    : hasValidAddress
      ? 'This address will be used for delivery and order confirmation.'
      : 'Enter at least 6 characters for a complete delivery address.';
  const addressHelperClassName = !cartItems.length || hasValidAddress
    ? 'discover-note'
    : 'discover-error';

  const fullName = session?.user?.user_metadata?.full_name || session?.user?.phone || 'Hey User';
  const firstName = fullName.split(' ')[0] || fullName;

  const handleOpenRestaurant = (restaurantId) => {
    setActiveRestaurantId(restaurantId);
    setScreen('restaurant');
  };

  const handleOpenCartScreen = () => {
    if (cartRestaurant?.id) {
      setActiveRestaurantId(cartRestaurant.id);
      setScreen('restaurant');
      return;
    }

    if (activeRestaurant?.id) {
      setScreen('restaurant');
    }
  };

  const handleCheckout = async () => {
    if (!cartItems.length || !cartRestaurant?.id || checkoutLoading) {
      return;
    }

    if (!hasValidAddress) {
      setCheckoutMessage('Please enter a complete delivery address.');
      return;
    }

    const normalizedAddress = normalizeDeliveryAddress(deliveryAddress);

    setCheckoutLoading(true);
    setCheckoutMessage('');
    setCheckoutSuccess(null);

    const { data, error: checkoutError } = await createCheckoutOrder(supabase, {
      customerId: session?.user?.id,
      foodPlaceId: cartRestaurant.id,
      deliveryAddress: normalizedAddress,
      deliveryFee: checkoutDeliveryFee,
      cartItems,
    });

    if (checkoutError) {
      setCheckoutMessage(checkoutError.message || 'Could not place order. Please try again.');
    } else {
      setCheckoutSuccess({
        orderId: data?.orderId || '',
        itemCount: data?.itemCount ?? checkoutSummary.itemCount,
        subtotal: data?.subtotal ?? checkoutSummary.subtotal,
        deliveryFee: data?.deliveryFee ?? checkoutDeliveryFee,
        totalAmount: data?.totalAmount ?? checkoutSummary.total,
        restaurantName: cartRestaurant?.name || '',
      });
      setCheckoutMessage('');
      clearCart();
    }

    setCheckoutLoading(false);
  };

  return (
    <main className="discover-shell">
      <nav className="discover-nav">
        <div className="discover-nav-inner">
          <button type="button" className="discover-nav-brand" onClick={() => setScreen('browse')}>
            <img src={Logo} alt="Chito Mitho logo" />
            <span>Chito Mitho</span>
          </button>

          <div className="discover-nav-actions">
            {screen === 'restaurant' && (
              <button type="button" className="discover-main-btn" onClick={() => setScreen('browse')}>
                <IconHome />
                Main page
              </button>
            )}
            <button
              className="discover-cart-chip"
              type="button"
              onClick={handleOpenCartScreen}
              disabled={!activeRestaurant && !cartRestaurant}
            >
              Cart <span>{itemCount}</span>
            </button>
            <button className="discover-logout" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      <section className="discover-stage">
        <header className="discover-stage-head">
          <p className="discover-kicker">Hey {firstName}</p>
          <h1>{screen === 'browse' ? 'Browse restaurants' : activeRestaurant?.name || 'Menu and cart'}</h1>
          <p className="discover-subtitle">
            {screen === 'browse'
              ? 'Pick a restaurant and open its menu with checkout in one focused screen.'
              : 'Add items, review your cart, and checkout without leaving this view.'}
          </p>
        </header>

        <div className="discover-stage-row">
          <SearchField
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={screen === 'browse' ? 'Search restaurants or menu items' : 'Search menu items'}
          />

          <div className="discover-kpis">
            <article>
              <span>{screen === 'browse' ? 'Restaurants' : 'Menu Items'}</span>
              <strong>{screen === 'browse' ? filteredRestaurants.length : activeMenuItems.length}</strong>
            </article>
            <article>
              <span>Cart Total</span>
              <strong>{formatNpr(checkoutSummary.total)}</strong>
            </article>
          </div>
        </div>

        {!!cartNotice && (
          <div className="discover-notice">
            {cartNotice}
          </div>
        )}
      </section>

      <section className="discover-layout">
        {screen === 'browse' ? (
          <section className="discover-restaurants">
            <header className="discover-restaurants-head">
              <div>
                <h2>Restaurant Feed</h2>
                <p>Featured picks are highlighted, and every other result is available below.</p>
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
                      onSelect={handleOpenRestaurant}
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
                      onSelect={handleOpenRestaurant}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        ) : (
          <section className="discover-workbench">
            <header className="discover-workbench-head">
              <button type="button" className="discover-back-btn" onClick={() => setScreen('browse')}>
                <span className="discover-back-icon" aria-hidden="true">
                  <IconArrowLeft />
                </span>
                Back to main page
              </button>
              <span>{activeRestaurant ? `${activeRestaurant.menu_items?.length || 0} items available` : 'No restaurant selected'}</span>
            </header>

            {!activeRestaurant ? (
              <div className="discover-empty">
                <h3>Choose a restaurant</h3>
                <p>Select a restaurant to open menu and cart.</p>
                <button type="button" className="discover-empty-btn" onClick={() => setScreen('browse')}>
                  Browse restaurants
                </button>
              </div>
            ) : (
              <div className="discover-workbench-grid">
                <section className="discover-menu" id="discover-menu-panel">
                  <div className="discover-hero">
                    <img
                      src={activeRestaurant.image_url || activeRestaurant.menu_items?.[0]?.image_url || Logo}
                      alt={activeRestaurant.name}
                    />
                    <div>
                      <h2>{activeRestaurant.name}</h2>
                      <p>{activeRestaurant.address || 'Kathmandu Valley'}</p>
                      <div className="discover-hero-meta">
                        <span>
                          <IconStar />
                          {getRestaurantRating(activeRestaurant.id)} rating
                        </span>
                        <span>
                          <IconMenu />
                          {activeRestaurant.menu_items?.length || 0} items
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="discover-offer">
                    <strong>5% OFF</strong>
                    <span>on your first 3 orders from this restaurant.</span>
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
                            onAdd={() => incrementItem(activeRestaurant, item)}
                            onIncrease={() => incrementItem(activeRestaurant, item)}
                            onDecrease={() => decrementItem(activeRestaurant, item)}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>

                <aside className="discover-cart" id="discover-cart-panel">
                  <div className="discover-cart-head">
                    <h3>Cart</h3>
                    <button type="button" onClick={clearCart} disabled={!cartItems.length}>Clear</button>
                  </div>

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
                    <div className="discover-cart-empty">
                      <p>{checkoutSuccess ? 'Ready for your next order.' : 'Your cart is empty.'}</p>
                      <span>
                        {checkoutSuccess
                          ? 'Add items from one restaurant to start a new cart.'
                          : 'Add items from one restaurant to see delivery fees and checkout here.'}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="discover-cart-restaurant">
                        <strong>{cartRestaurant?.name}</strong>
                        <span>{cartRestaurant?.address || 'Kathmandu Valley'}</span>
                      </div>

                      <div className="discover-cart-list">
                        {cartItems.map((item) => (
                          <CartLineItem
                            key={item.id}
                            item={item}
                            onIncrease={() => incrementItem(cartRestaurant, item)}
                            onDecrease={() => decrementItem(cartRestaurant, item)}
                          />
                        ))}
                      </div>

                      <div className="discover-bill">
                        <div><span>Items</span><strong>{checkoutSummary.itemCount}</strong></div>
                        <div><span>Subtotal</span><strong>{formatNpr(checkoutSummary.subtotal)}</strong></div>
                        <div><span>Delivery</span><strong>{formatNpr(checkoutSummary.deliveryFee)}</strong></div>
                        <div className="discover-bill-total"><span>Total</span><strong>{formatNpr(checkoutSummary.total)}</strong></div>
                      </div>

                      <label className="discover-address">
                        <span>Delivery address</span>
                        <textarea
                          value={deliveryAddress}
                          onChange={(event) => {
                            setDeliveryAddress(event.target.value);
                            if (checkoutMessage) {
                              setCheckoutMessage('');
                            }
                          }}
                          rows={3}
                          placeholder="Enter delivery address"
                          aria-invalid={cartItems.length > 0 && !hasValidAddress}
                        />
                      </label>

                      <p className={addressHelperClassName}>{addressHelperText}</p>

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
                    </>
                  )}
                </aside>
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
