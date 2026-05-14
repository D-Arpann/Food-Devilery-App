import { normalizeDeliveryAddress } from './cart.js';

function normalizeAddressCoordinates(entry = {}) {
  const source = entry?.coordinates || entry?.coords || entry?.location || {};
  const latitude = Number(source.latitude ?? source.lat ?? entry?.latitude ?? entry?.lat);
  const longitude = Number(source.longitude ?? source.lng ?? source.lon ?? entry?.longitude ?? entry?.lng ?? entry?.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export function normalizeSavedAddresses(rawAddresses = [], fallbackAddress = '') {
  const normalized = (rawAddresses || [])
    .map((entry, index) => {
      const address = normalizeDeliveryAddress(entry?.address || entry?.value || '', '');
      if (!address) {
        return null;
      }

      const fallbackId = `address-${index + 1}`;
      const nextId = String(entry?.id || fallbackId).trim() || fallbackId;
      const nextLabel = String(entry?.label || `Address ${index + 1}`).trim() || `Address ${index + 1}`;
      const coordinates = normalizeAddressCoordinates(entry);
      const placeId = String(entry?.placeId || entry?.place_id || '').trim();
      const formattedAddress = normalizeDeliveryAddress(
        entry?.formattedAddress || entry?.formatted_address || address,
        address,
      );

      return {
        id: nextId,
        label: nextLabel,
        address,
        formattedAddress,
        coordinates,
        placeId,
      };
    })
    .filter(Boolean);

  if (normalized.length) {
    return normalized;
  }

  const fallback = normalizeDeliveryAddress(fallbackAddress, '');
  if (!fallback) {
    return [];
  }

  return [
    {
      id: 'address-home',
      label: 'Home',
      address: fallback,
      formattedAddress: fallback,
      coordinates: null,
      placeId: '',
    },
  ];
}

export function resolveDefaultSavedAddressId(addresses = [], preferredId = '') {
  const normalizedId = String(preferredId || '').trim();
  if (normalizedId && addresses.some((entry) => entry.id === normalizedId)) {
    return normalizedId;
  }

  return addresses[0]?.id || '';
}

export function getDefaultSavedAddress(addresses = [], preferredId = '', fallbackAddress = '') {
  const resolvedId = resolveDefaultSavedAddressId(addresses, preferredId);
  return (
    addresses.find((entry) => entry.id === resolvedId)?.address ||
    normalizeDeliveryAddress(fallbackAddress, '')
  );
}

export function getShortAddress(value = '', maxParts = 2) {
  const normalized = normalizeDeliveryAddress(value, '');
  if (!normalized) {
    return '';
  }

  const parts = normalized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.slice(0, Math.max(1, maxParts)).join(', ') || normalized;
}
