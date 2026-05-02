import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getCurrentOrders,
  getPastOrders,
  mergeOrderRecords,
} from './orders.js';

describe('order records', () => {
  it('merges realtime order updates without losing restaurant or line item details', () => {
    const existing = [{
      id: 'order-1',
      status: 'placed',
      created_at: '2026-05-11T10:00:00.000Z',
      restaurant: { id: 'restaurant-1', name: 'Momo House' },
      lineItems: [{ id: 'line-1', item_name: 'Momo' }],
      total_amount: 545,
    }];

    const updated = [{
      id: 'order-1',
      status: 'ready_for_pickup',
      updated_at: '2026-05-11T10:05:00.000Z',
      lineItems: [],
    }];

    const [merged] = mergeOrderRecords(existing, updated);

    assert.equal(merged.status, 'ready_for_pickup');
    assert.equal(merged.restaurant.name, 'Momo House');
    assert.equal(merged.lineItems.length, 1);
    assert.equal(merged.total_amount, 545);
  });

  it('adds new realtime orders and sorts newest first', () => {
    const merged = mergeOrderRecords(
      [{ id: 'old', status: 'placed', created_at: '2026-05-11T09:00:00.000Z' }],
      [{ id: 'new', status: 'accepted', created_at: '2026-05-11T11:00:00.000Z' }],
    );

    assert.deepEqual(merged.map((order) => order.id), ['new', 'old']);
  });

  it('splits active and finished orders', () => {
    const orders = [
      { id: 'placed', status: 'placed' },
      { id: 'delivered', status: 'delivered' },
      { id: 'cancelled', status: 'cancelled' },
    ];

    assert.deepEqual(getCurrentOrders(orders).map((order) => order.id), ['placed']);
    assert.deepEqual(getPastOrders(orders).map((order) => order.id), ['delivered', 'cancelled']);
  });
});
