import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getMenuCategoryOptions, normalizeMenuCategory } from './menu.js';

describe('menu categories', () => {
  it('maps old free-text categories into stable customer-facing groups', () => {
    assert.equal(normalizeMenuCategory('Momo & Dumplings'), 'Momo');
    assert.equal(normalizeMenuCategory('Main Course'), 'Rice Meals');
    assert.equal(normalizeMenuCategory('Pizza'), 'Pizza');
    assert.equal(normalizeMenuCategory('burger'), 'Burgers');
    assert.equal(normalizeMenuCategory('Thali Set'), 'Thakali');
    assert.equal(normalizeMenuCategory('gimbap'), 'Korean');
    assert.equal(normalizeMenuCategory('Bread'), 'Breads');
    assert.equal(normalizeMenuCategory('Dessert'), 'Sweets');
    assert.equal(normalizeMenuCategory(''), 'Specials');
  });

  it('exposes categories in a stable order', () => {
    assert.deepEqual(getMenuCategoryOptions().slice(0, 4), [
      'Specials',
      'Momo',
      'Pizza',
      'Burgers',
    ]);
  });
});
