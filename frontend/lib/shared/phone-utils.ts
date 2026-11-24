import {
  formatPhoneNumberIntl,
  isValidPhoneNumber,
  parsePhoneNumber,
  type Country,
} from 'react-phone-number-input';

export {
  isValidPhoneNumber,
  parsePhoneNumber,
  formatPhoneNumberIntl,
} from 'react-phone-number-input';
export type { Country as PhoneCountry } from 'react-phone-number-input';

/**
 * Normaliza a solo dígitos. Soporta E.164 con `+`, nacional (10 dígitos MX),
 * o cualquier formato; el resultado es el canónico de DB: dígitos E.164 sin `+`.
 * Ej: "+529991234567" → "529991234567"
 */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

/** Convierte legado (10 dígitos / nacional) o E.164 a `+52…` cuando el número es válido. */
export function toE164Phone(value: string | undefined, defaultCountry: Country = 'MX'): string {
  if (!value?.trim()) return '';
  const trimmed = value.trim();
  if (!isValidPhoneNumber(trimmed, defaultCountry) && !isValidPhoneNumber(trimmed)) {
    return '';
  }
  const parsed = parsePhoneNumber(trimmed, defaultCountry) ?? parsePhoneNumber(trimmed);
  return parsed?.number ?? '';
}

/** Como `toE164Phone` pero sin `+`: canónico de DB (ej. "529991234567"). */
export function toDigitsE164(value: string | undefined, defaultCountry: Country = 'MX'): string {
  const e164 = toE164Phone(value, defaultCountry);
  return e164 ? e164.replace(/\D/g, '') : '';
}

/**
 * Formatea un número para display, en formato internacional (ej. "+52 999 123 4567").
 * Acepta E.164 con `+`, dígitos E.164 (canónico DB) o nacional mexicano.
 */
export function formatPhoneDisplay(value: string): string {
  if (!value?.trim()) return '';
  const trimmed = value.trim();
  if (isValidPhoneNumber(trimmed)) {
    return formatPhoneNumberIntl(trimmed);
  }
  const digits = normalizePhone(trimmed);
  if (!digits) return '';
  const prefixed = digits.length === 10 ? `+52${digits}` : `+${digits}`;
  if (isValidPhoneNumber(prefixed)) {
    return formatPhoneNumberIntl(prefixed);
  }
  return trimmed;
}

/** Devuelve los dígitos E.164 (sin `+`) de un teléfono, para wa.me / tel:.
 * Acepta E.164 (`+52…`), canónico de DB (`52…`) o nacional mexicano (10 dígitos). */
function toWaDigits(phone: string): string {
  const digits = normalizePhone(phone);
  if (!digits) return '';
  if (digits.length === 10) return `52${digits}`;
  return digits;
}

/** Los números se enlazan a WhatsApp con su código de país real en los dígitos. */
export function whatsappHref(phone: string): string {
  const digits = toWaDigits(phone);
  return digits ? `https://wa.me/${digits}` : '#';
}

export function telHref(phone: string): string {
  const digits = toWaDigits(phone);
  return digits ? `tel:+${digits}` : '#';
}
