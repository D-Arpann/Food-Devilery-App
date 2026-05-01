export const AUTH_OTP_LENGTH = 6;
export const NEPAL_COUNTRY_CODE = '+977';

export function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

export function hasMinDigits(value, minDigits = 6) {
  return onlyDigits(value).length >= minDigits;
}

export function getNepalNationalPhoneDigits(value = '') {
  const digits = onlyDigits(value);
  if (digits.startsWith('977')) {
    return digits.slice(3);
  }
  return digits;
}

export function isValidNepalPhoneNumber(value = '') {
  return getNepalNationalPhoneDigits(value).length === 10;
}

export function toE164Phone(value, countryCode) {
  const phoneDigits = onlyDigits(value);
  const countryDigits = onlyDigits(countryCode) || '977';

  if (phoneDigits.startsWith(countryDigits)) {
    return `+${phoneDigits}`;
  }

  return `+${countryDigits}${phoneDigits}`;
}

export function toNepalE164Phone(value) {
  const nationalDigits = getNepalNationalPhoneDigits(value);
  return toE164Phone(nationalDigits, NEPAL_COUNTRY_CODE);
}
