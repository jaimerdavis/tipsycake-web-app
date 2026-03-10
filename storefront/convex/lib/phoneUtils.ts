/**
 * US phone number validation and E.164 normalization.
 * Enforces +1 followed by 10 digits (NXX-NXX-XXXX).
 */

/**
 * Normalize phone to E.164 for US: +1XXXXXXXXXX.
 * Accepts: 10 digits, or 11 digits starting with 1.
 * Rejects: international, invalid length, non-digits.
 */
export function normalizePhoneToE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && /^\d{10}$/.test(digits)) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1") && /^1\d{10}$/.test(digits)) {
    return `+${digits}`;
  }
  return null;
}

/**
 * Validate US phone: 10 digits or +1 + 10 digits.
 * Returns true if the input can be normalized to E.164.
 */
export function isValidUSPhone(phone: string): boolean {
  return normalizePhoneToE164(phone.trim()) !== null;
}
