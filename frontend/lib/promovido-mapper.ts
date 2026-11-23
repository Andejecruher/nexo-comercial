import {
  normalizeBirthDate,
  normalizePhone,
  toE164Phone,
  type PromovidoFormValues,
} from '@/lib/promovido-schema';
import type { PromovidoListItem, PromovidoSex } from '@/lib/promovidos-api';

export function promovidoPhone(item: PromovidoListItem): string | undefined {
  const raw = item.data.phone ?? item.data.manualPhone ?? item.citizen?.phone ?? undefined;
  if (!raw) return undefined;
  const digits = normalizePhone(raw);
  return digits || undefined;
}

export function promovidoSex(item: PromovidoListItem): PromovidoSex | undefined {
  const raw = item.data.sex?.trim().toUpperCase();
  if (raw === 'H' || raw === 'HOMBRE') return 'H';
  if (raw === 'M' || raw === 'MUJER') return 'M';
  return undefined;
}

export function promovidoFullName(item: PromovidoListItem): string {
  const fromData = [
    item.data.firstName,
    item.data.paternalLastName,
    item.data.maternalLastName,
  ].filter(Boolean);
  if (fromData.length) return fromData.join(' ');
  return [item.citizen?.name, item.citizen?.lastName].filter(Boolean).join(' ');
}

/** Edad cumplida a partir de la fecha de nacimiento almacenada, en cualquier formato conocido. */
export function promovidoAge(item: PromovidoListItem): number | undefined {
  const iso = normalizeBirthDate(item.data.birthDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const birth = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : undefined;
}

export function formatBirthDate(item: PromovidoListItem): string | undefined {
  const iso = normalizeBirthDate(item.data.birthDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return item.data.birthDate || undefined;
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** `dd/mm/aaaa - HH:MM hrs`, el formato usado en las fichas del sistema. */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const stamp = date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return `${stamp} - ${time} hrs`;
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

/**
 * Los identificadores de la relación (`section.id`, `leader.id`) son la fuente
 * confiable: `data.electoralSection` solo trae el código de sección ("0199"),
 * que nunca coincide con el value de las opciones del selector.
 */
export function mapPromovidoToFormValues(item: PromovidoListItem): Partial<PromovidoFormValues> {
  const { data } = item;
  const phone = promovidoPhone(item);

  return {
    firstName: data.firstName ?? item.citizen?.name ?? '',
    paternalLastName: data.paternalLastName ?? '',
    maternalLastName: data.maternalLastName ?? '',
    birthDate: normalizeBirthDate(data.birthDate),
    sex: promovidoSex(item),
    curp: data.curp ?? '',
    voterKey: data.voterKey ?? '',
    address: data.address ?? '',
    neighborhood: data.neighborhood ?? '',
    neighborhoodId: data.neighborhoodId ?? '',
    locality: data.locality ?? '',
    municipality: data.municipality ?? '',
    state: data.state ?? '',
    sectionId: data.sectionId ?? item.section?.id ?? '',
    leaderId: data.leaderId ?? item.leader?.id ?? '',
    phone: toE164Phone(phone),
    isActive: data.isActive ?? item.isActive,
    observations: data.observations ?? '',
  };
}
