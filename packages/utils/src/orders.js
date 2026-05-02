import { ORDER_STATUS } from './constants.js';

export function normalizeOrderRecord(order) {
  if (!order) {
    return null;
  }

  return {
    ...order,
    lineItems: Array.isArray(order.lineItems) ? order.lineItems : [],
  };
}

export function mergeOrderRecords(primaryOrders = [], secondaryOrders = []) {
  const merged = new Map();

  [...primaryOrders, ...secondaryOrders].forEach((order) => {
    const normalizedOrder = normalizeOrderRecord(order);
    if (!normalizedOrder?.id) {
      return;
    }

    if (!merged.has(normalizedOrder.id)) {
      merged.set(normalizedOrder.id, normalizedOrder);
      return;
    }

    const current = merged.get(normalizedOrder.id);
    merged.set(normalizedOrder.id, {
      ...current,
      ...normalizedOrder,
      restaurant: normalizedOrder.restaurant || current.restaurant,
      lineItems: normalizedOrder.lineItems?.length ? normalizedOrder.lineItems : current.lineItems,
    });
  });

  return Array.from(merged.values()).sort((left, right) => {
    const leftTime = new Date(left.created_at || left.createdAt || 0).getTime();
    const rightTime = new Date(right.created_at || right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

export function isCurrentOrder(order) {
  return ![
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.CANCELLED,
  ].includes(order?.status);
}

export function getCurrentOrders(orders = []) {
  return orders.filter(isCurrentOrder);
}

export function getPastOrders(orders = []) {
  return orders.filter((order) => !isCurrentOrder(order));
}
