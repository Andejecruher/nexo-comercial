import {
  formatPhoneNumberIntl,
  isValidPhoneNumber,
  parsePhoneNumber,
  type Country,
} from 'react-phone-number-input';
import { z } from 'zod';

export {
  isValidPhoneNumber,
  parsePhoneNumber,
  formatPhoneNumberIntl,
} from 'react-phone-number-input';
export type { Country as PhoneCountry } from 'react-phone-number-input';

export const promovidoSchema = z
  .object({
    firstName: z.string().trim().min(1, 'El nombre es obligatorio.').max(100),
    paternalLastName: z.string().trim().min(1, 'El apellido paterno es obligatorio.').max(100),
    maternalLastName: z.string().trim().max(100).optional(),
    birthDate: z.string().trim().max(20).optional(),
    sex: z.enum(['H', 'M']).optional(),
    curp: z
      .string()
      .trim()
      .min(18, 'La CURP debe tener 18 caracteres.')
      .max(18, 'La CURP debe tener 18 caracteres.')
      .regex(
        /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/,
        'La CURP no tiene la estructura esperada.',
      ),
    voterKey: z
      .string()
      .trim()
      .min(12, 'La clave de elector debe tener al menos 12 caracteres.')
      .max(24, 'La clave de elector no puede tener más de 24 caracteres.')
      .regex(
        /[A-Z]{6}[0-9]{8}[A-Z]{1}[0-9]{3}/,
        'Asegurate de que la clave de elector sea igual a la de la credencial.',
      ),
    address: z.string().trim().max(500).optional(),
    neighborhood: z.string().trim().max(255).optional(),
    neighborhoodId: z
      .string({ required_error: 'Seleccioná una colonia del catálogo.' })
      .uuid('Seleccioná una colonia del catálogo.'),
    locality: z.string().trim().max(255).optional(),
    municipality: z.string().trim().max(255).optional(),
    state: z.string().trim().max(120).optional(),
    sectionId: z.string().uuid('Seleccioná una sección válida.'),
    leaderId: z.string().uuid('Seleccioná un líder válido.'),
    phone: z
      .string()
      .trim()
      .max(16)
      .optional()
      .refine((value) => !value || isValidPhoneNumber(value), 'Ingresá un teléfono válido.'),
    isActive: z.boolean().default(true),
    observations: z.string().trim().max(2000).optional(),
  })
  .refine(
    (data) => {
      if (!data.birthDate || !data.curp) return true;
      const iso = normalizeBirthDate(data.birthDate);
      if (!iso) return true;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return true;
      const yy = String(date.getUTCFullYear()).slice(-2).padStart(2, '0');
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(date.getUTCDate()).padStart(2, '0');
      return `${yy}${mm}${dd}` === data.curp.slice(4, 10);
    },
    {
      message: 'La CURP no coincide con la fecha de nacimiento.',
      path: ['curp'],
    },
  )
  .refine(
    (data) => {
      if (!data.sex || !data.curp) return true;
      return data.curp[10] === data.sex;
    },
    {
      message: 'La CURP no coincide con el sexo seleccionado.',
      path: ['curp'],
    },
  );

export type PromovidoFormValues = z.infer<typeof promovidoSchema>;

export function normalizeVoterKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function normalizeCurp(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function normalizeBirthDate(value: string | undefined): string {
  if (!value) return '';
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return value;
  const dmy = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return value;
}

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
