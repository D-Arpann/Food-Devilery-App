import { useEffect, useMemo, useState } from 'react';
import { fetchRestaurantFeed } from '@repo/api';
import { Logo } from '@repo/ui';
import {
  filterMenuItems,
  filterRestaurantFeed,
  formatNpr,
  getDeliveryFee,
  getRestaurantRating,
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

function MenuItemCard({ item }) {
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
        </div>
      </div>
    </article>
  );
}

export default function DiscoveryPage({ session, supabase, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [feed, setFeed] = useState([]);
  const [activeRestaurantId, setActiveRestaurantId] = useState(null);
  const [screen, setScreen] = useState('browse');

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

  const fullName = session?.user?.user_metadata?.full_name || session?.user?.phone || 'Hey User';
  const firstName = fullName.split(' ')[0] || fullName;

  const handleOpenRestaurant = (restaurantId) => {
    setActiveRestaurantId(restaurantId);
    setScreen('restaurant');
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
            <button className="discover-logout" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      <section className="discover-stage">
        <header className="discover-stage-head">
          <p className="discover-kicker">Hey {firstName}</p>
          <h1>{screen === 'browse' ? 'Browse restaurants' : activeRestaurant?.name || 'Menu view'}</h1>
          <p className="discover-subtitle">
            {screen === 'browse'
              ? 'Pick a restaurant and open its menu in a more focused customer view.'
              : 'Browse the full menu and check item details without leaving the page.'}
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
              <span>Delivery Fee</span>
              <strong>{activeRestaurant ? formatNpr(getDeliveryFee(activeRestaurant.id)) : '--'}</strong>
            </article>
          </div>
        </div>
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
                <p>Select a restaurant to open its menu.</p>
                <button type="button" className="discover-empty-btn" onClick={() => setScreen('browse')}>
                  Browse restaurants
                </button>
              </div>
            ) : (
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
                    {activeMenuItems.map((item) => (
                      <MenuItemCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
