import { useEffect, useMemo, useState } from 'react';
import { fetchRestaurantFeed } from '@repo/api';
import {
  filterMenuItems,
  filterRestaurantFeed,
  formatNpr,
  getDeliveryFee,
  getRestaurantRating,
} from '@repo/utils';
import { Logo } from '@repo/ui';
import './DiscoveryPage.css';

function SearchField({ value, onChange, placeholder = 'Search restaurants or menu items' }) {
  return (
    <label className="discover-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
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

export default function DiscoveryPage({ session, supabase, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [feed, setFeed] = useState([]);
  const [activeRestaurantId, setActiveRestaurantId] = useState(null);

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

  const resolvedActiveRestaurantId = useMemo(() => {
    if (!filteredRestaurants.length) {
      return null;
    }

    const exists = filteredRestaurants.some((restaurant) => restaurant.id === activeRestaurantId);
    return exists ? activeRestaurantId : filteredRestaurants[0].id;
  }, [filteredRestaurants, activeRestaurantId]);

  const activeRestaurant = useMemo(
    () => filteredRestaurants.find((restaurant) => restaurant.id === resolvedActiveRestaurantId) || null,
    [filteredRestaurants, resolvedActiveRestaurantId],
  );

  const activeMenuItems = useMemo(
    () => filterMenuItems(activeRestaurant?.menu_items || [], searchQuery),
    [activeRestaurant, searchQuery],
  );

  const fullName = session?.user?.user_metadata?.full_name || session?.user?.phone || 'Hey User';
  const firstName = fullName.split(' ')[0] || fullName;

  return (
    <main className="discover-shell">
      <header className="discover-topbar">
        <div className="discover-brand">
          <img src={Logo} alt="Chito Mitho logo" />
          <div>
            <p className="discover-greeting">Hey {firstName}</p>
            <p className="discover-location">Naxal, Kathmandu</p>
          </div>
        </div>
        <button className="discover-logout" onClick={onLogout}>Logout</button>
      </header>

      <SearchField value={searchQuery} onChange={setSearchQuery} />

      <section className="discover-layout">
        <aside className="discover-list">
          <div className="discover-list-head">
            <h2>Featured Restaurants</h2>
            <span>{filteredRestaurants.length} places</span>
          </div>

          {loading && <p className="discover-note">Loading restaurants...</p>}
          {!loading && error && <p className="discover-error">{error}</p>}
          {!loading && !error && !filteredRestaurants.length && (
            <p className="discover-note">No restaurants match your search.</p>
          )}

          <div className="discover-cards">
            {filteredRestaurants.map((restaurant) => {
              const rating = getRestaurantRating(restaurant.id);
              const active = restaurant.id === resolvedActiveRestaurantId;
              const firstItem = restaurant.menu_items?.[0];

              return (
                <button
                  key={restaurant.id}
                  className={`discover-card ${active ? 'active' : ''}`}
                  onClick={() => setActiveRestaurantId(restaurant.id)}
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
                      <span>★ {rating}</span>
                      <span>🚲 {formatNpr(getDeliveryFee(restaurant.id))}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="discover-menu">
          {!activeRestaurant ? (
            <div className="discover-empty">
              <h3>Choose a restaurant</h3>
              <p>Select a restaurant from the left to view its menu.</p>
            </div>
          ) : (
            <>
              <div className="discover-hero">
                <img
                  src={activeRestaurant.image_url || activeRestaurant.menu_items?.[0]?.image_url || Logo}
                  alt={activeRestaurant.name}
                />
                <div>
                  <h2>{activeRestaurant.name}</h2>
                  <p>{activeRestaurant.address || 'Kathmandu Valley'}</p>
                  <div className="discover-hero-meta">
                    <span>★ {getRestaurantRating(activeRestaurant.id)}</span>
                    <span>{activeRestaurant.menu_items?.length || 0} items</span>
                  </div>
                </div>
              </div>

              <div className="discover-offer">
                <strong>5% OFF</strong>
                <span>on your first 3 orders from this restaurant.</span>
              </div>

              <div className="discover-menu-head">
                <h3>Menu</h3>
                <span>{activeMenuItems.length} items</span>
              </div>

              {!activeMenuItems.length ? (
                <p className="discover-note">No menu items match your search.</p>
              ) : (
                <div className="discover-menu-grid">
                  {activeMenuItems.map((item) => (
                    <article key={item.id} className="discover-menu-item">
                      <img src={item.image_url || Logo} alt={item.name} />
                      <div>
                        <h4>{item.name}</h4>
                        <p>{item.description || item.category || 'House special'}</p>
                      </div>
                      <strong>{formatNpr(item.price)}</strong>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  );
}
