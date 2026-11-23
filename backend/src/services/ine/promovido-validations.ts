import { generateBlindIndex, normalizePhone as normalizePhoneIndex } from '../../utils/hmac-index';

export type ValidationResult = { valid: true } | { valid: false; code: string; message: string };

function ok(): ValidationResult {
  return { valid: true };
}

function fail(code: string, message: string): ValidationResult {
  return { valid: false, code, message };
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function accentFold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeVoterKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function validateVoterKey(value: string | null | undefined): ValidationResult {
  const normalized = normalizeVoterKey(value);
  if (!normalized) return fail('VOTER_KEY_REQUIRED', 'La clave de elector es obligatoria.');
  if (!/^[A-Z0-9]{12,24}$/.test(normalized)) {
    return fail(
      'VOTER_KEY_FORMAT_INVALID',
      'La clave de elector debe tener entre 12 y 24 caracteres alfanuméricos.',
    );
  }
  return ok();
}

export function normalizeCurp(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

function curpCheckDigit(curp: string): boolean | undefined {
  if (!/^[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d$/.test(curp)) return undefined;
  const alphabet = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
  const sum = curp
    .slice(0, 17)
    .split('')
    .reduce((total, char, index) => total + alphabet.indexOf(char) * (18 - index), 0);
  return (10 - (sum % 10)) % 10 === Number(curp[17]);
}

function hasValidCurpDate(value: string): boolean {
  const year = Number(value.slice(4, 6));
  const month = Number(value.slice(6, 8));
  const day = Number(value.slice(8, 10));
  return [1900 + year, 2000 + year].some((fullYear) => {
    const date = new Date(Date.UTC(fullYear, month - 1, day));
    return (
      date.getUTCFullYear() === fullYear &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  });
}

export function validateCurp(value: string | null | undefined): ValidationResult {
  const normalized = normalizeCurp(value);
  if (!normalized) return fail('CURP_REQUIRED', 'La CURP es obligatoria.');
  if (!/^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(normalized)) {
    return fail('CURP_STRUCTURE_INVALID', 'La CURP no tiene la estructura esperada.');
  }
  if (!hasValidCurpDate(normalized)) {
    return fail('CURP_DATE_INVALID', 'La fecha de nacimiento de la CURP no es válida.');
  }
  if (curpCheckDigit(normalized) === false) {
    return fail('CURP_CHECK_DIGIT_INVALID', 'El dígito verificador de la CURP no coincide.');
  }
  return ok();
}

export function normalizeSex(value: string | null | undefined): 'H' | 'M' | null {
  if (!value) return null;
  const v = collapseWhitespace(accentFold(value)).toUpperCase();
  if (v.startsWith('H') || v === 'MASCULINO' || v === 'MASC') return 'H';
  if (v.startsWith('M') || v === 'FEMENINO' || v === 'FEM') return 'M';
  return null;
}

/**
 * Blind index del sexo: normaliza a la forma canónica ('H' / 'M') antes de
 * hashear, así "Hombre", "h" y "H" resuelven al mismo hash y las consultas por
 * sexo se pueden hacer en SQL sin descifrar `dataEncrypted`.
 */
export function sexBlindIndex(value: string | null | undefined): string | null {
  const normalized = normalizeSex(value);
  if (!normalized) return null;
  return generateBlindIndex(normalized);
}

export function validateCurpAgainstSexAndBirthDate(
  curp: string | null | undefined,
  sex: string | null | undefined,
  birthDate: string | null | undefined,
): ValidationResult {
  const normalized = normalizeCurp(curp);
  const curpResult = validateCurp(normalized);
  if (!curpResult.valid) return curpResult;

  const expectedSex = normalizeSex(sex);
  if (expectedSex && normalized[10] !== expectedSex) {
    return fail('CURP_SEX_MISMATCH', 'La CURP no coincide con el sexo seleccionado.');
  }

  if (birthDate) {
    const date = new Date(birthDate);
    if (!Number.isNaN(date.getTime())) {
      const yy = String(date.getUTCFullYear()).slice(-2).padStart(2, '0');
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(date.getUTCDate()).padStart(2, '0');
      if (`${yy}${mm}${dd}` !== normalized.slice(4, 10)) {
        return fail('CURP_BIRTH_DATE_MISMATCH', 'La CURP no coincide con la fecha de nacimiento.');
      }
    }
  }

  return ok();
}

export { normalizePhoneIndex as normalizePhone };

export function validatePhone(value: string | null | undefined): ValidationResult {
  const normalized = normalizePhoneIndex(value);
  if (!normalized) {
    return fail('PHONE_INVALID', 'El teléfono no es válido. Ingresá un número con su código de país.');
  }
  return ok();
}

export function normalizeName(value: string | null | undefined): string {
  return collapseWhitespace(accentFold(value ?? '').toUpperCase());
}

export function validateName(
  firstName: string | null | undefined,
  paternalLastName: string | null | undefined,
): ValidationResult {
  if (!normalizeName(firstName)) {
    return fail('FIRST_NAME_REQUIRED', 'El nombre es obligatorio.');
  }
  if (!normalizeName(paternalLastName)) {
    return fail('PATERNAL_LAST_NAME_REQUIRED', 'El apellido paterno es obligatorio.');
  }
  return ok();
}
