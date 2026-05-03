import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isValidNepalPhoneNumber, toNepalE164Phone } from './auth.js';

describe('Nepal phone validation', () => {
  it('requires exactly 10 national digits', () => {
    assert.equal(isValidNepalPhoneNumber('9800000000'), true);
    assert.equal(isValidNepalPhoneNumber('+9779800000000'), true);
    assert.equal(isValidNepalPhoneNumber('980000000'), false);
    assert.equal(isValidNepalPhoneNumber('98000000000'), false);
  });

  it('keeps valid national number in Nepal E.164 format', () => {
    assert.equal(toNepalE164Phone('9800000000'), '+9779800000000');
    assert.equal(toNepalE164Phone('+9779800000000'), '+9779800000000');
  });
});
