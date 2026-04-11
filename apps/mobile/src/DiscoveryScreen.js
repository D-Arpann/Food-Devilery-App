import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchRestaurantFeed, logout } from '@repo/api';
import { useCart } from '@repo/ui';
import {
  filterMenuItems,
  filterRestaurantFeed,
  formatNpr,
  getDeliveryFee,
  getRestaurantRating,
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
        placeholderTextColor="#8E8882"
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
          <Text style={styles.cartItemRestaurantText} numberOfLines={1}>{restaurantName}</Text>
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

function BottomNav({ activeTab, onChange, bottomInset }) {
  const getTabIcon = (tabKey, active) => {
    switch (tabKey) {
      case TAB_HOME:
        return active ? 'home' : 'home-outline';
      case TAB_ORDERS:
        return active ? 'document-text' : 'document-text-outline';
      case TAB_CART:
        return active ? 'cart' : 'cart-outline';
      case TAB_PROFILE:
      default:
        return active ? 'person' : 'person-outline';
    }
  };

  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(bottomInset, 8) }]}> 
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            style={[styles.bottomNavItem, active && styles.bottomNavItemActive]}
            onPress={() => onChange(tab.key)}
          >
            <View style={styles.bottomNavIconWrap}>
              <Ionicons
                name={getTabIcon(tab.key, active)}
                size={22}
                color={active ? '#FFFFFF' : '#6E6E6E'}
              />
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

export function DiscoveryScreen({ session, supabase, topInset = 0, bottomInset = 0 }) {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(TAB_HOME);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(null);
  const [menuSelection, setMenuSelection] = useState({ itemId: null, quantity: 0 });
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [cartMessage, setCartMessage] = useState('');

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
    if (!cartItems.length && cartMessage) {
      setCartMessage('');
    }
  }, [cartItems.length, cartMessage]);

  const userName = session?.user?.user_metadata?.full_name || session?.user?.phone || 'User';
  const firstName = userName.split(' ')[0] || userName;

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

  const selectedMenuQuantity = selectedMenuItem ? menuSelection.quantity : 0;
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
    setCartMessage('');
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await logout(supabase);
    } finally {
      setLogoutLoading(false);
    }
  };

  const showRestaurantMenu = activeTab === TAB_HOME && selectedRestaurantId && selectedRestaurant;
  const cartDeliveryFee = cartRestaurant?.id ? getDeliveryFee(cartRestaurant.id) : 0;
  const cartSummary = getSummary(cartDeliveryFee);

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
                      <Text style={styles.homeLocation}>Naxal, Kathmandu</Text>
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

          <BottomNav activeTab={activeTab} onChange={setActiveTab} bottomInset={bottomInset} />
        </>
      )}

      {activeTab === TAB_ORDERS && (
        <>
          <PlaceholderPane
            title="Orders Coming Soon"
            subtitle="Order tracking will connect once checkout history lands in the next patch."
          />
          <BottomNav activeTab={activeTab} onChange={setActiveTab} bottomInset={bottomInset} />
        </>
      )}

      {activeTab === TAB_CART && (
        <ScrollView
          contentContainerStyle={styles.cartContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.contentFrame, styles.cartFrame]}>
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
                    style={[styles.checkoutButton, styles.checkoutButtonDisabled]}
                    onPress={() => setCartMessage('Checkout submission lands in the next patch.')}
                  >
                    <View style={styles.checkoutButtonInner}>
                      <View style={styles.checkoutButtonPattern} />
                      <FoodPatternLayer color="rgba(214, 96, 24, 0.42)" />
                      <View style={styles.checkoutButtonContent}>
                        <MaterialCommunityIcons name="cart-check" size={18} color="#FFFFFF" />
                        <Text style={styles.checkoutButtonText}>Checkout next</Text>
                      </View>
                    </View>
                  </Pressable>

                  {!!cartMessage && (
                    <Text style={styles.checkoutMessage}>{cartMessage}</Text>
                  )}
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {activeTab === TAB_PROFILE && (
        <>
          <PlaceholderPane
            title="Profile Coming Soon"
            subtitle={logoutLoading ? 'Logging out...' : `Signed in as ${userName}`}
          />
          <BottomNav activeTab={activeTab} onChange={setActiveTab} bottomInset={bottomInset} />
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
