/**
 * Normalización de números de teléfono a formato E.164.
 * Especializado para México / Cintalapa, Chiapas.
 *
 * Formato canónico en DB: solo dígitos, sin "+".
 * Ej: "521234567890" (no "+521234567890")
 */

/**
 * Normaliza un número de teléfono al formato canónico de almacenamiento en DB:
 * solo dígitos, sin "+", sin espacios, sin guiones.
 * Además, corrige el prefijo "521" inyectado por WhatsApp Cloud API para México.
 *
 * Este es el formato que se guarda SIEMPRE en la tabla citizens.phone.
 * Todos los lookups y creaciones deben usar esta función.
 *
 * Ejemplos:
 *   "+521 961 123 4567" (Desde Meta) -> "529611234567" (Estándar BD)
 *   "5219612345678"     (Desde Meta) -> "529612345678" (Estándar BD)
 *   "+34 600 12 34 56"  (Otro país)  -> "34600123456"  (Estándar BD, sin cambios)
 *
 * @param raw - Número crudo (con o sin +, con o sin espacios/guiones)
 * @returns Número con solo dígitos (formato DB canónico E.164 sin '+')
 */
export function normalizePhoneForStorage(raw: string): string {
  // 1. Limpiamos cualquier caracter que no sea número
  let cleaned = raw.replace(/[^\d]/g, '');

  // 2. Interceptamos el caso de Meta (México)
  // Meta envía: 521 + 10 dígitos del número = 13 dígitos de longitud total.
  // Validamos la longitud para no afectar accidentalmente números de otros países.
  if (cleaned.startsWith('521') && cleaned.length === 13) {
    // Reemplazamos el "521" inicial por "52" concatenando el resto del número
    cleaned = '52' + cleaned.substring(3);
  }

  return cleaned;
}

/**
 * Convierte un teléfono al formato que espera Meta en el campo `to`:
 * 521 + 10 dígitos = 13. Por defecto el número es mexicano.
 *
 * - 52 + 10 dígitos (12) o 521 + 10 dígitos (13) quedan en 521 + 10.
 * - 10 dígitos sin lada de país (ej. "3223188252") se prefijan con 521.
 * - Tolerante a "+", espacios y guiones.
 * - Números de otros países se devuelven sin cambios.
 *
 * Ejemplos:
 *   "529612345678"     -> "5219612345678"
 *   "5219612345678"    -> "5219612345678" (sin cambios)
 *   "+52 961 234 5678" -> "5219612345678"
 *   "3223188252"       -> "5213223188252"
 *   "34600123456"      -> "34600123456" (sin cambios)
 *
 * @param dbPhone - Número desde DB o entrada outbound (solo dígitos, o con +)
 * @returns Número listo para el campo `to` del payload a Meta
 */
export function formatPhoneForMeta(dbPhone: string): string {
  const cleaned = dbPhone.replace(/[^\d]/g, '');

  // Nacional mexicano: 10 dígitos sin 52. Meta exige el prefijo 521.
  if (cleaned.length === 10) return `521${cleaned}`;

  if (cleaned.startsWith('52')) {
    if (cleaned.length === 12) return `521${cleaned.substring(2)}`;
    if (cleaned.length === 13) return `521${cleaned.substring(3)}`;
  }
  return dbPhone;
}

/**
 * Normaliza un número de teléfono recibido de Meta a formato E.164 con "+".
 * Solo usar para envío outbound vía WhatsApp API o display al usuario.
 * NO usar para guardar en DB — usar normalizePhoneForStorage para eso.
 *
 * @param raw - Número crudo (con o sin +)
 * @returns Número normalizado en E.164 con + (ej: "+521234567890")
 */
export function normalizePhone(raw: string): string {
  // Eliminar espacios, guiones, paréntesis
  const cleaned = raw.replace(/[\s\-().]/g, '');

  // Si ya tiene + al inicio, retornar tal cual
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // Meta envía números sin +; agregar + al inicio
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    return `+${cleaned}`;
  }

  return cleaned;
}

/**
 * Verifica si un número tiene el prefijo de México (+52).
 */
export function isMexicanNumber(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return normalized.startsWith('+52');
}

/**
 * Formatea un número E.164 para mostrar al usuario.
 * Ej: +5219612345678 → +52 961 234 5678
 */
export function formatPhoneDisplay(e164: string): string {
  if (!e164.startsWith('+52') || e164.length < 13) return e164;
  const digits = e164.slice(3); // quitar +52
  if (digits.length === 10) {
    return `+52 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return e164;
}

/**
 * Enmascara un número de teléfono para logs: muestra solo los últimos 4 dígitos.
 * Ej: +521234567890 → +52*****7890
 *
 * @param phone - Número en formato E.164 u otro
 * @returns     - Número enmascarado
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length <= 4) return '****';
  const clean = phone.replace(/\D/g, '');
  const last4 = clean.slice(-4);
  const prefix = phone.startsWith('+') ? '+' : '';
  return `${prefix}${'*'.repeat(Math.max(0, clean.length - 4))}${last4}`;
}
