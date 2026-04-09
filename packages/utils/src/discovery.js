function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function tokenize(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function includesAllTerms(haystack, terms) {
  if (!terms.length) {
    return true;
  }

  return terms.every((term) => haystack.includes(term));
}

export function filterMenuItems(menuItems = [], query = '') {
  const terms = tokenize(query);

  if (!terms.length) {
    return menuItems;
  }

  return menuItems.filter((item) => {
    const haystack = normalizeText([
      item?.name,
      item?.description,
      item?.category,
    ].join(' '));
    return includesAllTerms(haystack, terms);
  });
}

export function filterRestaurantFeed(restaurants = [], query = '') {
  const terms = tokenize(query);

  if (!terms.length) {
    return restaurants;
  }

  return restaurants.filter((restaurant) => {
    const restaurantHaystack = normalizeText([
      restaurant?.name,
      restaurant?.description,
      restaurant?.address,
    ].join(' '));

    if (includesAllTerms(restaurantHaystack, terms)) {
      return true;
    }

    return (restaurant?.menu_items || []).some((item) => {
      const itemHaystack = normalizeText([
        item?.name,
        item?.description,
        item?.category,
      ].join(' '));
      return includesAllTerms(itemHaystack, terms);
    });
  });
}

export function getRestaurantRating(restaurantId = '') {
  const codeSum = String(restaurantId)
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  const rating = 4.2 + (codeSum % 8) * 0.1;
  return rating.toFixed(1);
}

export function getDeliveryFee(restaurantId = '') {
  const codeSum = String(restaurantId)
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return 45 + (codeSum % 4) * 15;
}

export function formatNpr(amount) {
  const value = Number(amount || 0);
  return `Rs ${Math.round(value)}`;
}
