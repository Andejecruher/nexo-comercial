// ---------------------------------------------------------------------------
// Notification types & mock data
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'mensaje_nuevo' // Ciudadano envió un mensaje
  | 'cambio_departamento' // Ticket reasignado a otro departamento
  | 'cierre_ticket' // Ticket marcado como resuelto
  | 'asignacion' // Ticket asignado a un agente
  | 'mencion' // Agente fue mencionado en una conversación
  | 'alerta_sistema' // Aviso del sistema (backup, mantenimiento, etc.)
  | 'nuevo_ciudadano' // Nuevo ciudadano registrado
  | 'evento_proximo'; // Recordatorio de evento próximo

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: string; // ISO 8601
  read: boolean;
  href?: string; // Enlace de acción
  actor?: string; // Quién generó la notificación
  meta?: string; // Dato extra (nombre de departamento, evento, etc.)
}

export const NOTIFICATION_CONFIG: Record<
  NotificationType,
  { label: string; color: string; bg: string; iconName: string }
> = {
  mensaje_nuevo: {
    label: 'Mensaje nuevo',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    iconName: 'MessageCircle',
  },
  cambio_departamento: {
    label: 'Cambio de área',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    iconName: 'ArrowRightLeft',
  },
  cierre_ticket: {
    label: 'Ticket cerrado',
    color: 'text-green-600',
    bg: 'bg-green-50',
    iconName: 'CheckCircle2',
  },
  asignacion: {
    label: 'Asignación',
    color: 'text-primary',
    bg: 'bg-primary/5',
    iconName: 'UserCheck',
  },
  mencion: { label: 'Mención', color: 'text-violet-600', bg: 'bg-violet-50', iconName: 'AtSign' },
  alerta_sistema: {
    label: 'Sistema',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    iconName: 'AlertTriangle',
  },
  nuevo_ciudadano: {
    label: 'Nuevo ciudadano',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    iconName: 'UserPlus',
  },
  evento_proximo: {
    label: 'Evento próximo',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    iconName: 'CalendarClock',
  },
};

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    type: 'mensaje_nuevo',
    title: 'María González envió un mensaje',
    description: 'Llevamos 3 días sin agua en toda La Candelaria. ¿Cuándo viene el técnico?',
    timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    read: false,
    href: '/admin',
    actor: 'María González Ruiz',
    meta: 'La Candelaria',
  },
  {
    id: 'n2',
    type: 'asignacion',
    title: 'Ticket asignado a ti',
    description: 'El ticket #C4 de Roberto Mendoza fue asignado a tu cuenta.',
    timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    read: false,
    href: '/admin',
    actor: 'Admin sistema',
    meta: 'Ticket #C4',
  },
  {
    id: 'n3',
    type: 'cambio_departamento',
    title: 'Ticket reasignado',
    description: 'El ticket de Carlos Herrera fue movido de Atención Ciudadana a Desarrollo Rural.',
    timestamp: new Date(Date.now() - 47 * 60 * 1000).toISOString(),
    read: false,
    href: '/admin',
    actor: 'Luis Martínez',
    meta: 'Desarrollo Rural',
  },
  {
    id: 'n4',
    type: 'cierre_ticket',
    title: 'Ticket cerrado exitosamente',
    description: 'El ticket de Sofía Ramírez fue marcado como resuelto por el agente Juan López.',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: true,
    href: '/admin',
    actor: 'Juan López',
    meta: 'Ticket #C3',
  },
  {
    id: 'n5',
    type: 'mencion',
    title: 'Te mencionaron en una conversación',
    description: '@tu-usuario revisa el caso de Ana Castillo — camino rural dañado al ejido.',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    read: true,
    href: '/admin',
    actor: 'Patricia Ruiz',
    meta: 'Ticket #C5',
  },
  {
    id: 'n6',
    type: 'nuevo_ciudadano',
    title: 'Nuevo ciudadano registrado',
    description: 'Lupita Flores Mendoza se registró desde La Joya, Cintalapa.',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    read: true,
    href: '/admin/ciudadanos',
    actor: 'Sistema',
    meta: 'La Joya',
  },
  {
    id: 'n7',
    type: 'evento_proximo',
    title: 'Recordatorio: Brigada comunitaria',
    description: 'La brigada en Colonia Morelos comienza mañana a las 9:00 a.m.',
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    read: true,
    href: '/admin/eventos',
    actor: 'Sistema',
    meta: 'Col. Morelos',
  },
  {
    id: 'n8',
    type: 'mensaje_nuevo',
    title: 'Ana Castillo envió un mensaje',
    description: 'Adjunto las fotos del camino dañado, espero pronta respuesta.',
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    read: true,
    href: '/admin',
    actor: 'Ana Castillo Domínguez',
    meta: 'Centro',
  },
  {
    id: 'n9',
    type: 'alerta_sistema',
    title: 'Respaldo automático completado',
    description: 'El respaldo de datos del sistema se completó sin errores a las 3:00 a.m.',
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString(),
    read: true,
    actor: 'Sistema',
  },
  {
    id: 'n10',
    type: 'cambio_departamento',
    title: 'Ticket reasignado a Salud',
    description: 'El ticket de Lupita Flores fue movido a Salud por reporte de agua contaminada.',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    read: true,
    href: '/admin',
    actor: 'Dr. Ramírez',
    meta: 'Salud',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatNotifTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  if (hrs < 24) return `Hace ${hrs} h`;
  if (days === 1) return 'Ayer';
  return `Hace ${days} días`;
}
