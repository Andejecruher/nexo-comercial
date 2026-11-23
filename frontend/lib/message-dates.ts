export const MESSAGE_TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || 'America/Mexico_City';
export function messageDay(value: string, timeZone = MESSAGE_TIME_ZONE) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'unknown';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export function messageDayLabel(value: string, now = new Date(), timeZone = MESSAGE_TIME_ZONE) {
  if (messageDay(value, timeZone) === 'unknown') return 'Fecha desconocida';
  if (messageDay(value, timeZone) === messageDay(now.toISOString(), timeZone)) return 'Hoy';
  const yesterday = new Date(now.getTime() - 86400000);
  if (messageDay(value, timeZone) === messageDay(yesterday.toISOString(), timeZone)) return 'Ayer';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}
