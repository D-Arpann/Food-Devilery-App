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
import { Ionicons } from '@expo/vector-icons';
import { fetchRestaurantFeed, logout } from '@repo/api';
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
  { key: TAB_HOME, icon: 'home', label: 'Home' },
  { key: TAB_ORDERS, icon: 'document-text', label: 'Orders' },
  { key: TAB_CART, icon: 'cart', label: 'Cart' },
  { key: TAB_PROFILE, icon: 'person', label: 'Profile' },
];

function SearchBar({ value, onChangeText, placeholder = 'Search' }) {
  return (
    <View style={styles.searchBar}>
      <Ionicons name="search" size={20} color="#F8964F" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8E8882"
        style={styles.searchInput}
      />
    </View>
  );
}

function SectionHeader({ title }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionAction}>Show all</Text>
    </View>
  );
}

function RestaurantCard({ restaurant, onPress }) {
  const firstItem = restaurant.menu_items?.[0];

  return (
    <Pressable style={styles.restaurantCard} onPress={onPress}>
      <View style={styles.restaurantCardCover}>
        <Image
          source={{ uri: restaurant.image_url || firstItem?.image_url }}
          style={styles.restaurantCoverImage}
        />
        <View style={styles.restaurantCoverTint} />
        <Text style={styles.restaurantCoverTitle}>{firstItem?.name || restaurant.name}</Text>
      </View>

      <View style={styles.restaurantCardBody}>
        <Text style={styles.restaurantName}>{restaurant.name}</Text>
        <Text style={styles.restaurantCategory}>
          {firstItem?.category || 'Popular'} · {restaurant.menu_items?.length || 0} items
        </Text>

        <View style={styles.restaurantMetaRow}>
          <View style={styles.metaPair}>
            <Ionicons name="star" size={14} color="#111" />
            <Text style={styles.metaText}>{getRestaurantRating(restaurant.id)}</Text>
          </View>
          <View style={styles.metaPair}>
            <Ionicons name="bicycle" size={14} color="#111" />
            <Text style={styles.metaText}>{formatNpr(getDeliveryFee(restaurant.id))}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function MenuItemRow({ item }) {
  return (
    <View style={styles.menuItemRow}>
      <Image source={{ uri: item.image_url }} style={styles.menuItemImage} />
      <Text style={styles.menuItemName}>{item.name}</Text>
      <Text style={styles.menuItemPrice}>Rs {Math.round(item.price)}</Text>
    </View>
  );
}

function BottomNav({ activeTab, onChange, bottomInset }) {
  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(bottomInset, 8) }]}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            style={styles.bottomNavItem}
            onPress={() => onChange(tab.key)}
          >
            <Ionicons
              name={active ? tab.icon : `${tab.icon}-outline`}
              size={22}
              color={active ? '#F8964F' : '#6E6E6E'}
            />
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

export function DiscoveryScreen({ session, supabase, topInset = 0, bottomInset = 0, brandLogo }) {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(TAB_HOME);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(null);
  const [logoutLoading, setLogoutLoading] = useState(false);

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

  const openRestaurant = (restaurantId) => {
    setActiveTab(TAB_HOME);
    setSelectedRestaurantId(restaurantId);
    setSearchQuery('');
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

  if (showRestaurantMenu) {
    return (
      <View style={[styles.screen, { paddingTop: topInset + 10, paddingBottom: bottomInset + 10 }]}>
        <ScrollView
          contentContainerStyle={styles.menuScreenContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.menuTopRow}>
            <Pressable
              style={styles.menuBackButton}
              onPress={() => {
                setSelectedRestaurantId(null);
                setSearchQuery('');
              }}
            >
              <Ionicons name="arrow-back" size={20} color="#1E1E1E" />
            </Pressable>
            <View style={styles.menuSearchWrap}>
              <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
            </View>
          </View>

          <View style={styles.menuRestaurantCard}>
            <Image
              source={{ uri: selectedRestaurant.image_url || selectedRestaurant.menu_items?.[0]?.image_url }}
              style={styles.menuRestaurantAvatar}
            />
            <View style={styles.menuRestaurantInfo}>
              <Text style={styles.menuRestaurantName}>{selectedRestaurant.name}</Text>
              <Text style={styles.menuRestaurantAddress}>{selectedRestaurant.address || 'Kathmandu Valley'}</Text>
              <View style={styles.menuRestaurantRatingWrap}>
                <Ionicons name="star" size={17} color="#111" />
                <Text style={styles.menuRestaurantRating}>{getRestaurantRating(selectedRestaurant.id)}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.menuFeaturedTitle}>Featured:</Text>

          <View style={styles.menuPanel}>
            {!selectedMenuItems.length ? (
              <Text style={styles.emptyText}>No menu items match your search.</Text>
            ) : (
              selectedMenuItems.map((item) => <MenuItemRow key={item.id} item={item} />)
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: topInset + 8, paddingBottom: bottomInset + 10 }]}>
      {activeTab === TAB_HOME && (
        <>
          <ScrollView
            contentContainerStyle={styles.homeContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.homeTopRow}>
              <View style={styles.homeUserRow}>
                <View style={styles.homeAvatar}>
                  <Image source={brandLogo} style={styles.homeAvatarImage} />
                </View>
                <View>
                  <Text style={styles.homeGreeting}>Hey {firstName}</Text>
                  <Text style={styles.homeLocation}>Naxal, Kathmandu</Text>
                </View>
              </View>
              <Pressable style={styles.homeBellButton}>
                <Ionicons name="notifications-outline" size={21} color="#1E1E1E" />
              </Pressable>
            </View>

            <SearchBar value={searchQuery} onChangeText={setSearchQuery} />

            <SectionHeader title="Offers:" />
            <View style={styles.offerCard}>
              <View style={[styles.offerBlob, { top: -24, left: -8 }]} />
              <View style={[styles.offerBlob, { bottom: -30, right: -15 }]} />
              <Text style={styles.offerHeadline}>5% OFF</Text>
              <Text style={styles.offerSub}>first 3 orders on Chito Mitho</Text>
            </View>

            <View style={styles.offerDots}>
              <View style={[styles.dot, styles.dotActive]} />
              <View style={styles.dot} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>

            <SectionHeader title="Featured:" />

            {loading && <Text style={styles.helperText}>Loading restaurants...</Text>}
            {!loading && !!error && <Text style={styles.errorText}>{error}</Text>}
            {!loading && !error && !filteredRestaurants.length && (
              <Text style={styles.helperText}>No restaurants match your search.</Text>
            )}

            <View style={styles.featuredList}>
              {filteredRestaurants.map((restaurant) => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  onPress={() => openRestaurant(restaurant.id)}
                />
              ))}
            </View>
          </ScrollView>

          <BottomNav
            activeTab={activeTab}
            onChange={setActiveTab}
            bottomInset={bottomInset}
          />
        </>
      )}

      {activeTab === TAB_ORDERS && (
        <>
          <PlaceholderPane
            title="Orders Coming Soon"
            subtitle="Your order history and live tracking will appear here in the next patch."
          />
          <BottomNav activeTab={activeTab} onChange={setActiveTab} bottomInset={bottomInset} />
        </>
      )}

      {activeTab === TAB_CART && (
        <>
          <PlaceholderPane
            title="Cart Coming Soon"
            subtitle="Item add-to-cart and checkout flow will be added in the next patch."
          />
          <BottomNav activeTab={activeTab} onChange={setActiveTab} bottomInset={bottomInset} />
        </>
      )}

      {activeTab === TAB_PROFILE && (
        <>
          <View style={styles.profilePane}>
            <Text style={styles.profileTitle}>Your Profile</Text>
            <Text style={styles.profileSubtitle}>Signed in as {userName}</Text>
            <Pressable style={styles.profileLogout} onPress={handleLogout}>
              <Text style={styles.profileLogoutText}>{logoutLoading ? 'Logging out...' : 'Logout'}</Text>
            </Pressable>
          </View>
          <BottomNav activeTab={activeTab} onChange={setActiveTab} bottomInset={bottomInset} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#EFEFEF',
    paddingHorizontal: 18,
  },
  homeContent: {
    paddingBottom: 108,
  },
  homeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  homeUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  homeAvatar: {
    width: 56,
    height: 56,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6CFBD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeAvatarImage: {
    width: 38,
    height: 38,
  },
  homeGreeting: {
    color: '#F8964F',
    fontFamily: 'Outfit_700Bold',
    fontSize: 35,
    lineHeight: 36,
  },
  homeLocation: {
    color: '#424242',
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    lineHeight: 19,
  },
  homeBellButton: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#F4B98A',
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#EED3BF',
    backgroundColor: '#F3E1D2',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#2A2A2A',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 18,
    paddingVertical: 8,
  },
  sectionHeaderRow: {
    marginTop: 20,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 34,
    lineHeight: 35,
  },
  sectionAction: {
    color: '#F8964F',
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
  },
  offerCard: {
    minHeight: 136,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#EFA96A',
    backgroundColor: '#F8964F',
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  offerBlob: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  offerHeadline: {
    color: '#FFFFFF',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 54,
    lineHeight: 54,
    letterSpacing: -0.6,
  },
  offerSub: {
    color: '#FFEBDD',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    marginTop: 4,
  },
  offerDots: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: '#DABEA5',
  },
  dotActive: {
    backgroundColor: '#F8964F',
  },
  featuredList: {
    gap: 14,
    marginBottom: 16,
  },
  restaurantCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EFD8C4',
    backgroundColor: '#F3E1D2',
  },
  restaurantCardCover: {
    height: 150,
    position: 'relative',
  },
  restaurantCoverImage: {
    width: '100%',
    height: '100%',
  },
  restaurantCoverTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34, 17, 5, 0.25)',
  },
  restaurantCoverTitle: {
    position: 'absolute',
    left: 14,
    bottom: 12,
    color: '#FFFFFF',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 40,
    lineHeight: 40,
    letterSpacing: -0.4,
  },
  restaurantCardBody: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 2,
  },
  restaurantName: {
    color: '#2A2A2A',
    fontFamily: 'Outfit_700Bold',
    fontSize: 30,
    lineHeight: 31,
  },
  restaurantCategory: {
    color: '#5F5F5F',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
  },
  restaurantMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 16,
  },
  metaPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
  },
  helperText: {
    color: '#5E5E5E',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    marginBottom: 8,
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
    minHeight: 70,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: '#EDE5DE',
    borderTopWidth: 1,
    borderColor: '#E3D7CC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 8,
  },
  bottomNavItem: {
    width: 52,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuScreenContent: {
    paddingBottom: 12,
  },
  menuTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  menuBackButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
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
    backgroundColor: '#F3E1D2',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ECD1BC',
  },
  menuRestaurantAvatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: '#CCC',
  },
  menuRestaurantInfo: {
    flex: 1,
  },
  menuRestaurantName: {
    color: '#F8964F',
    fontFamily: 'Outfit_700Bold',
    fontSize: 34,
    lineHeight: 35,
  },
  menuRestaurantAddress: {
    color: '#464646',
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
  },
  menuRestaurantRatingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  menuRestaurantRating: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 30,
    lineHeight: 31,
  },
  menuFeaturedTitle: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 34,
    lineHeight: 35,
    marginBottom: 10,
  },
  menuPanel: {
    minHeight: 400,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECD0BB',
    backgroundColor: '#F3E1D2',
    padding: 10,
    gap: 8,
  },
  menuItemRow: {
    minHeight: 74,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
  },
  menuItemImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#D2D2D2',
  },
  menuItemName: {
    flex: 1,
    color: '#2A2A2A',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
  },
  menuItemPrice: {
    color: '#2A2A2A',
    fontFamily: 'Outfit_700Bold',
    fontSize: 17,
  },
  emptyText: {
    color: '#666',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
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
  profilePane: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 80,
    gap: 8,
  },
  profileTitle: {
    color: '#F8964F',
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: 34,
  },
  profileSubtitle: {
    color: '#4F4F4F',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    textAlign: 'center',
  },
  profileLogout: {
    marginTop: 14,
    minHeight: 52,
    minWidth: 180,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#1E1E1E',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  profileLogoutText: {
    color: '#1E1E1E',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
  },
});
