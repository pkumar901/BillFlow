/** Field validators shared by the Worker API and the React frontend. */

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidGstin(value?: string | null): boolean {
  if (!value) return true; // optional field
  return GSTIN_REGEX.test(value.trim().toUpperCase());
}

export function isValidPan(value?: string | null): boolean {
  if (!value) return true;
  return PAN_REGEX.test(value.trim().toUpperCase());
}

export function isValidPincode(value?: string | null): boolean {
  if (!value) return true;
  return PINCODE_REGEX.test(value.trim());
}

export function isValidEmail(value?: string | null): boolean {
  if (!value) return true;
  return EMAIL_REGEX.test(value.trim());
}

/** Accepts 10-digit Indian mobiles with optional +91 / 0 prefix, or any 8-15 digit international number. */
export function isValidPhone(value?: string | null): boolean {
  if (!value) return true;
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length < 8 || digits.length > 15) return false;
  if (digits.length === 10) return /^[6-9][0-9]{9}$/.test(digits);
  return true;
}

export function isValidIfsc(value?: string | null): boolean {
  if (!value) return true;
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.trim().toUpperCase());
}

/**
 * Business logo values are stored as an image data URL (or a normal http(s) address).
 * The logo is down-scaled in the browser before upload, but a data URL is still far
 * longer than a plain address, so it gets its own (much larger) limit.
 */
export const MAX_LOGO_CHARS = 600_000;

export function isValidLogoValue(value?: string | null): boolean {
  if (!value) return true;
  const v = value.trim();
  if (/^https?:\/\/\S+$/i.test(v)) return true;
  return /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(v);
}

/** Standard GST rates offered in the UI (custom rates are also allowed). */
export const GST_RATES = [0, 5, 12, 18, 28];

export function isValidGstRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0 && rate <= 100;
}
