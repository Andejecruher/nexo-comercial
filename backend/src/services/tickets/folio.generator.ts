/**
 * Generador de folio de ticket.
 *
 * Formato: YYYYMMDDHHMMSS_XXXX_YYYY
 *   - YYYYMMDDHHMMSS: fecha/hora de creación del ticket (UTC).
 *   - XXXX: últimos 4 dígitos de la línea de plataforma que recibió el mensaje.
 *   - YYYY: últimos 4 dígitos del teléfono del ciudadano.
 *
 * Los segmentos de 4 dígitos usan '0000' cuando el dato no está disponible,
 * de modo que el folio siempre respeta el mismo largo/formato.
 */

const FOLIO_DIGITS = 4;
const FALLBACK_DIGITS = '0000';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Últimos 4 dígitos presentes en `value`; '0000' si no hay dígitos. */
export function last4Digits(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 0) {
    return FALLBACK_DIGITS;
  }
  return digits.slice(-FOLIO_DIGITS).padStart(FOLIO_DIGITS, '0');
}

/** Timestamp del folio en formato YYYYMMDDHHMMSS (UTC). */
export function formatFolioTimestamp(date: Date): string {
  return (
    String(date.getUTCFullYear()) +
    pad2(date.getUTCMonth() + 1) +
    pad2(date.getUTCDate()) +
    pad2(date.getUTCHours()) +
    pad2(date.getUTCMinutes()) +
    pad2(date.getUTCSeconds())
  );
}

/** Construye el folio base (sin resolver colisiones). */
export function buildFolio(
  createdAt: Date,
  platformLine: string | null | undefined,
  userPhone: string | null | undefined,
): string {
  return `${formatFolioTimestamp(createdAt)}_${last4Digits(platformLine)}_${last4Digits(userPhone)}`;
}
