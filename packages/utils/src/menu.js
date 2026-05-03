export const MENU_CATEGORIES = [
  'Specials',
  'Momo',
  'Pizza',
  'Burgers',
  'Rice Meals',
  'Thakali',
  'Korean',
  'Newari',
  'Street Snacks',
  'Bakery',
  'Breads',
  'Sweets',
  'Drinks',
];

const MENU_CATEGORY_ALIASES = {
  momo: 'Momo',
  'momo & dumplings': 'Momo',
  dumpling: 'Momo',
  dumplings: 'Momo',
  pizza: 'Pizza',
  pizzas: 'Pizza',
  italian: 'Pizza',
  burger: 'Burgers',
  burgers: 'Burgers',
  'main course': 'Rice Meals',
  'rice & curry': 'Rice Meals',
  mains: 'Rice Meals',
  curry: 'Rice Meals',
  rice: 'Rice Meals',
  biryani: 'Rice Meals',
  thakali: 'Thakali',
  'thali set': 'Thakali',
  thali: 'Thakali',
  korean: 'Korean',
  gimbap: 'Korean',
  newari: 'Newari',
  newa: 'Newari',
  khaja: 'Newari',
  snack: 'Street Snacks',
  snacks: 'Street Snacks',
  'street snacks': 'Street Snacks',
  fastfood: 'Street Snacks',
  'fast food': 'Street Snacks',
  bakery: 'Bakery',
  cake: 'Bakery',
  cakes: 'Bakery',
  pastry: 'Bakery',
  bread: 'Breads',
  breads: 'Breads',
  naan: 'Breads',
  dessert: 'Sweets',
  desserts: 'Sweets',
  sweet: 'Sweets',
  sweets: 'Sweets',
  drinks: 'Drinks',
  drink: 'Drinks',
  beverage: 'Drinks',
  beverages: 'Drinks',
  specials: 'Specials',
  special: 'Specials',
};

export function normalizeMenuCategory(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return 'Specials';
  }

  const lower = normalized.toLowerCase();
  if (MENU_CATEGORY_ALIASES[lower]) {
    return MENU_CATEGORY_ALIASES[lower];
  }

  return MENU_CATEGORIES.includes(normalized) ? normalized : 'Specials';
}

export function getMenuCategoryOptions() {
  return [...MENU_CATEGORIES];
}
