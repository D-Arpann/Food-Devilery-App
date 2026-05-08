import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEsewaPaymentRequest,
  decodeEsewaResponseData,
  generateEsewaSignature,
  verifyEsewaResponseSignature,
} from './esewa.js';

describe('eSewa ePay v2 helpers', () => {
  it('generates the sandbox HMAC signature from the signed fields in order', () => {
    const signature = generateEsewaSignature({
      totalAmount: '100',
      transactionUuid: '11-201-13',
      productCode: 'EPAYTEST',
      secretKey: '8gBm/:&EnhH.1/q',
    });

    assert.equal(signature, '5DZywcrTKD0gia/rsSMcrRHmJl+4Tbol6S+lWgdJ94E=');
  });

  it('builds the POST form fields eSewa requires for sandbox checkout', () => {
    const request = buildEsewaPaymentRequest({
      subtotal: 360,
      deliveryFee: 90,
      transactionUuid: 'order-123',
      successUrl: 'https://example.test/success',
      failureUrl: 'https://example.test/failure',
    });

    assert.equal(request.paymentUrl, 'https://rc-epay.esewa.com.np/api/epay/main/v2/form');
    assert.deepEqual(request.fields, {
      amount: '360',
      tax_amount: '0',
      total_amount: '450',
      transaction_uuid: 'order-123',
      product_code: 'EPAYTEST',
      product_service_charge: '0',
      product_delivery_charge: '90',
      success_url: 'https://example.test/success',
      failure_url: 'https://example.test/failure',
      signed_field_names: 'total_amount,transaction_uuid,product_code',
      signature: 'GzjYdMqS0mGT94PdwVhxl4CBh/0tKc3QDRXq7wAD5Bs=',
    });
  });

  it('decodes and verifies eSewa success response data', () => {
    const response = {
      transaction_code: '0004T5I',
      status: 'COMPLETE',
      total_amount: '450',
      transaction_uuid: 'order-123',
      product_code: 'EPAYTEST',
      signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
    };
    response.signature = generateEsewaSignature({
      values: response,
      signedFieldNames: response.signed_field_names,
      secretKey: '8gBm/:&EnhH.1/q',
    });
    const encoded = Buffer.from(JSON.stringify(response), 'utf8').toString('base64');

    assert.deepEqual(decodeEsewaResponseData(encoded), response);
    assert.deepEqual(decodeEsewaResponseData(encoded.replace(/\+/g, ' ')), response);
    assert.equal(verifyEsewaResponseSignature(response), true);
  });
});
