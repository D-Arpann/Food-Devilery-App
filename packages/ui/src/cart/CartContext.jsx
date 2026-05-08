import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import { getDeliveryFee, summarizeCart, updateCartItems } from '@repo/utils';

const CartContext = createContext(null);

const ACTIONS = {
  SET_NOTICE: 'SET_NOTICE',
  CLEAR_NOTICE: 'CLEAR_NOTICE',
  SET_ITEM_QUANTITY: 'SET_ITEM_QUANTITY',
  CLEAR_CART: 'CLEAR_CART',
};

const initialState = {
  restaurant: null,
  items: [],
  notice: '',
};

function reduceCart(state, action) {
  switch (action.type) {
    case ACTIONS.SET_NOTICE:
      return {
        ...state,
        notice: action.payload || '',
      };

    case ACTIONS.CLEAR_NOTICE:
      return {
        ...state,
        notice: '',
      };

    case ACTIONS.CLEAR_CART:
      return {
        ...initialState,
      };

    case ACTIONS.SET_ITEM_QUANTITY: {
      const { restaurant, item, quantity } = action.payload || {};

      if (!restaurant?.id || !item?.id) {
        return state;
      }

      const cartItem = {
        ...item,
        restaurantId: restaurant.id,
        restaurant_id: restaurant.id,
        restaurantName: restaurant.name,
        restaurantAddress: restaurant.address || restaurant.formatted_address || '',
        restaurantImageUrl: restaurant.image_url || restaurant.banner_url || restaurant.profile_image_url || '',
      };
      const nextItems = updateCartItems(state.items, cartItem, quantity);
      const firstRestaurantItem = nextItems[0] || null;
      const nextRestaurant = nextItems.length
        ? {
          id: firstRestaurantItem.restaurantId || restaurant.id,
          name: firstRestaurantItem.restaurantName || restaurant.name,
          image_url: firstRestaurantItem.restaurantImageUrl || restaurant.image_url || '',
          address: firstRestaurantItem.restaurantAddress || restaurant.address || '',
        }
        : null;

      return {
        ...state,
        restaurant: nextRestaurant,
        items: nextItems,
        notice: '',
      };
    }

    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(reduceCart, initialState);

  const setItemQuantity = useCallback((restaurant, item, quantity) => {
    dispatch({
      type: ACTIONS.SET_ITEM_QUANTITY,
      payload: { restaurant, item, quantity },
    });
  }, []);

  const incrementItem = useCallback((restaurant, item) => {
    const currentQuantity = state.items.find((entry) => entry.id === item?.id)?.quantity || 0;
    setItemQuantity(restaurant, item, currentQuantity + 1);
  }, [setItemQuantity, state.items]);

  const decrementItem = useCallback((restaurant, item) => {
    const currentQuantity = state.items.find((entry) => entry.id === item?.id)?.quantity || 0;
    setItemQuantity(restaurant, item, Math.max(0, currentQuantity - 1));
  }, [setItemQuantity, state.items]);

  const removeItem = useCallback((restaurant, item) => {
    setItemQuantity(restaurant, item, 0);
  }, [setItemQuantity]);

  const clearCart = useCallback(() => {
    dispatch({ type: ACTIONS.CLEAR_CART });
  }, []);

  const dismissNotice = useCallback(() => {
    dispatch({ type: ACTIONS.CLEAR_NOTICE });
  }, []);

  const setNotice = useCallback((notice) => {
    dispatch({
      type: ACTIONS.SET_NOTICE,
      payload: notice,
    });
  }, []);

  const baseSummary = useMemo(
    () => summarizeCart(state.items, 0),
    [state.items],
  );

  const groups = useMemo(() => {
    const byRestaurant = new Map();

    state.items.forEach((item) => {
      const restaurantId = item.restaurantId || item.restaurant_id || state.restaurant?.id || 'unknown';
      if (!byRestaurant.has(restaurantId)) {
        byRestaurant.set(restaurantId, {
          restaurant: {
            id: restaurantId,
            name: item.restaurantName || state.restaurant?.name || 'Restaurant',
            address: item.restaurantAddress || state.restaurant?.address || '',
            image_url: item.restaurantImageUrl || state.restaurant?.image_url || '',
          },
          items: [],
          deliveryFee: restaurantId === 'unknown' ? 0 : getDeliveryFee(restaurantId),
        });
      }

      byRestaurant.get(restaurantId).items.push(item);
    });

    return Array.from(byRestaurant.values()).map((group) => ({
      ...group,
      summary: summarizeCart(group.items, group.deliveryFee),
    }));
  }, [state.items, state.restaurant]);

  const totalDeliveryFee = useMemo(
    () => groups.reduce((sum, group) => sum + group.deliveryFee, 0),
    [groups],
  );

  const getSummary = useCallback(
    (deliveryFee = 0) => summarizeCart(state.items, deliveryFee),
    [state.items],
  );

  const value = useMemo(() => ({
    restaurant: state.restaurant,
    items: state.items,
    groups,
    notice: state.notice,
    itemCount: baseSummary.itemCount,
    subtotal: baseSummary.subtotal,
    deliveryFee: totalDeliveryFee,
    setItemQuantity,
    incrementItem,
    decrementItem,
    removeItem,
    clearCart,
    setNotice,
    dismissNotice,
    getSummary,
  }), [
    state,
    baseSummary,
    groups,
    totalDeliveryFee,
    setItemQuantity,
    incrementItem,
    decrementItem,
    removeItem,
    clearCart,
    setNotice,
    dismissNotice,
    getSummary,
  ]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error('useCart must be used inside a CartProvider');
  }

  return context;
}
