import { TABLES } from '@repo/utils';

export async function fetchActiveRestaurants(client, options = {}) {
  const { limit = 24 } = options;

  try {
    let query = client
      .from(TABLES.FOOD_PLACES)
      .select('id, name, description, image_url, address, is_active, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (limit > 0) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching active restaurants:', error);
    return { data: null, error };
  }
}

export async function fetchActiveMenu(client, foodPlaceId) {
  try {
    const { data, error } = await client
      .from(TABLES.MENU_ITEMS)
      .select('*')
      .eq('food_place_id', foodPlaceId)
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
      .from(TABLES.MENU_ITEMS)
      .select('id, food_place_id, name, description, price, image_url, is_available, category')
      .in('food_place_id', placeIds)
      .eq('is_available', true)
      .order('created_at', { ascending: false });

    if (menuError) throw menuError;

    const menuByPlaceId = (menuItems || []).reduce((acc, item) => {
      const placeId = item.food_place_id;
      if (!acc[placeId]) {
        acc[placeId] = [];
      }
      acc[placeId].push(item);
      return acc;
    }, {});

    const mergedFeed = (restaurants || []).map((place) => ({
      ...place,
      menu_items: menuByPlaceId[place.id] || [],
    }));

    return { data: mergedFeed, error: null };
  } catch (error) {
    console.error('Error fetching restaurant feed:', error);
    return { data: null, error };
  }
}

export async function createOrder(client, orderPayload) {
  try {
    const { data, error } = await client
      .from(TABLES.ORDERS)
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

export async function updateOrderStatus(client, orderId, newStatus) {
  try {
    const { data, error } = await client
      .from(TABLES.ORDERS)
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
