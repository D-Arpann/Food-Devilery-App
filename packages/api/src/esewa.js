import HmacSHA256 from 'crypto-js/hmac-sha256.js';
import Base64 from 'crypto-js/enc-base64.js';
import Utf8 from 'crypto-js/enc-utf8.js';

export const ESEWA_SIGNED_FIELD_NAMES = 'total_amount,transaction_uuid,product_code';
export const ESEWA_SANDBOX_PAYMENT_URL = 'https://rc-epay.esewa.com.np/api/epay/main/v2/form';
export const ESEWA_SANDBOX_STATUS_URL = 'https://uat.esewa.com.np/api/epay/transaction/status/';
export const ESEWA_SANDBOX_PRODUCT_CODE = 'EPAYTEST';
export const ESEWA_SANDBOX_SECRET_KEY = '8gBm/:&EnhH.1/q';
export const ESEWA_SUCCESS_URL = 'https://chito-mitho.local/payments/esewa/success';
export const ESEWA_FAILURE_URL = 'https://chito-mitho.local/payments/esewa/failure';

function env(name, fallback = '') {
  if (typeof process === 'undefined' || !process?.env) {
    return fallback;
  }

  return process.env[name] || fallback;
}

export function getEsewaConfig(overrides = {}) {
  return {
    paymentUrl: overrides.paymentUrl || env('EXPO_PUBLIC_ESEWA_PAYMENT_URL', env('VITE_ESEWA_PAYMENT_URL', ESEWA_SANDBOX_PAYMENT_URL)),
    statusUrl: overrides.statusUrl || env('EXPO_PUBLIC_ESEWA_STATUS_URL', env('VITE_ESEWA_STATUS_URL', ESEWA_SANDBOX_STATUS_URL)),
    productCode: overrides.productCode || env('EXPO_PUBLIC_ESEWA_PRODUCT_CODE', env('VITE_ESEWA_PRODUCT_CODE', ESEWA_SANDBOX_PRODUCT_CODE)),
    secretKey: overrides.secretKey || env('EXPO_PUBLIC_ESEWA_SECRET_KEY', env('VITE_ESEWA_SECRET_KEY', ESEWA_SANDBOX_SECRET_KEY)),
    successUrl: overrides.successUrl || env('EXPO_PUBLIC_ESEWA_SUCCESS_URL', env('VITE_ESEWA_SUCCESS_URL', ESEWA_SUCCESS_URL)),
    failureUrl: overrides.failureUrl || env('EXPO_PUBLIC_ESEWA_FAILURE_URL', env('VITE_ESEWA_FAILURE_URL', ESEWA_FAILURE_URL)),
  };
}

export function formatEsewaAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Invalid eSewa amount.');
  }

  return (Math.round(amount * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
}

function normalizeTransactionUuid(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalized) {
    throw new Error('Missing eSewa transaction id.');
  }

  return normalized;
}

export function createEsewaTransactionUuid(orderId = '') {
  const suffix = String(orderId || Math.random().toString(36).slice(2))
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .slice(0, 24);
  return normalizeTransactionUuid(`chito-${Date.now()}-${suffix}`);
}

function buildSignatureMessage(values = {}, signedFieldNames = ESEWA_SIGNED_FIELD_NAMES) {
  return String(signedFieldNames || '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field) => `${field}=${values[field] ?? ''}`)
    .join(',');
}

export function generateEsewaSignature({
  totalAmount,
  transactionUuid,
  productCode,
  secretKey,
  values,
  signedFieldNames = ESEWA_SIGNED_FIELD_NAMES,
} = {}) {
  const config = getEsewaConfig({ secretKey, productCode });
  const signatureValues = values || {
    total_amount: formatEsewaAmount(totalAmount),
    transaction_uuid: normalizeTransactionUuid(transactionUuid),
    product_code: productCode || config.productCode,
  };
  const message = buildSignatureMessage(signatureValues, signedFieldNames);
  return Base64.stringify(HmacSHA256(message, config.secretKey));
}

export function buildEsewaPaymentRequest(input = {}) {
  const config = getEsewaConfig(input);
  const subtotal = Number(input.subtotal ?? input.amount ?? 0);
  const taxAmount = Number(input.taxAmount ?? input.tax_amount ?? 0);
  const serviceCharge = Number(input.serviceCharge ?? input.product_service_charge ?? 0);
  const deliveryFee = Number(input.deliveryFee ?? input.product_delivery_charge ?? 0);
  const totalAmount = Number(input.totalAmount ?? input.total_amount ?? subtotal + taxAmount + serviceCharge + deliveryFee);
  const transactionUuid = normalizeTransactionUuid(input.transactionUuid || input.transaction_uuid);

  const fields = {
    amount: formatEsewaAmount(subtotal),
    tax_amount: formatEsewaAmount(taxAmount),
    total_amount: formatEsewaAmount(totalAmount),
    transaction_uuid: transactionUuid,
    product_code: config.productCode,
    product_service_charge: formatEsewaAmount(serviceCharge),
    product_delivery_charge: formatEsewaAmount(deliveryFee),
    success_url: input.successUrl || input.success_url || config.successUrl,
    failure_url: input.failureUrl || input.failure_url || config.failureUrl,
    signed_field_names: ESEWA_SIGNED_FIELD_NAMES,
  };

  fields.signature = generateEsewaSignature({
    values: fields,
    signedFieldNames: fields.signed_field_names,
    secretKey: config.secretKey,
  });

  return {
    paymentUrl: config.paymentUrl,
    statusUrl: config.statusUrl,
    fields,
  };
}

export function buildEsewaStatusUrl(input = {}) {
  const config = getEsewaConfig(input);
  const url = new URL(config.statusUrl);
  url.searchParams.set('product_code', input.productCode || input.product_code || config.productCode);
  url.searchParams.set('total_amount', formatEsewaAmount(input.totalAmount ?? input.total_amount));
  url.searchParams.set('transaction_uuid', normalizeTransactionUuid(input.transactionUuid || input.transaction_uuid));
  return url.toString();
}

export function decodeEsewaResponseData(encodedData = '') {
  const normalized = String(encodedData || '').trim();
  if (!normalized) {
    return null;
  }

  const decoded = Base64.parse(decodeURIComponent(normalized).replace(/ /g, '+')).toString(Utf8);
  return JSON.parse(decoded);
}

export function verifyEsewaResponseSignature(response = {}, options = {}) {
  const signature = String(response.signature || '').trim();
  const signedFieldNames = String(response.signed_field_names || '').trim();

  if (!signature || !signedFieldNames) {
    return false;
  }

  const expectedSignature = generateEsewaSignature({
    values: response,
    signedFieldNames,
    secretKey: options.secretKey,
    productCode: response.product_code,
  });

  return signature === expectedSignature;
}

export function mapEsewaStatusToPaymentStatus(status = '') {
  const normalized = String(status || '').trim().toUpperCase();

  if (normalized === 'COMPLETE') {
    return 'paid';
  }

  if (['PENDING', 'AMBIGUOUS'].includes(normalized)) {
    return 'pending';
  }

  if (['FULL_REFUND', 'PARTIAL_REFUND'].includes(normalized)) {
    return 'refunded';
  }

  if (['CANCELED', 'NOT_FOUND'].includes(normalized)) {
    return 'failed';
  }

  return 'failed';
}
