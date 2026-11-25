'use client';

import { NotificationSettingsModal } from '@/components/shared/notification-settings-modal';
import { buildConversationsHref } from '@/lib/shared/conversations-navigation';
import {
  NOTIFICATION_CONFIG,
  formatNotifTime,
  type Notification,
  type NotificationType,
} from '@/lib/shared/mock-notifications';
import { cn } from '@/lib/shared/utils';
import {
  compareNotificationsNewestFirst,
  useNotificationStore,
  type NotificationEntry,
} from '@/store/shared/use-notification-store';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRightLeft,
  AtSign,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  ExternalLink,
  Filter,
  MessageCircle,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ElementType> = {
  MessageCircle,
  ArrowRightLeft,
  CheckCircle2,
  UserCheck,
  AtSign,
  AlertTriangle,
  UserPlus,
  CalendarClock,
};

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

type FilterTab = 'todas' | 'no_leidas' | NotificationType;

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'no_leidas', label: 'No leídas' },
  { value: 'mensaje_nuevo', label: 'Mensajes' },
  { value: 'cambio_departamento', label: 'Reasignaciones' },
  { value: 'cierre_ticket', label: 'Cierres' },
  { value: 'asignacion', label: 'Asignaciones' },
  { value: 'alerta_sistema', label: 'Sistema' },
];

// ---------------------------------------------------------------------------
// Group notifications by relative date label
// ---------------------------------------------------------------------------

function getDateLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return 'Más antiguas';
}

// ---------------------------------------------------------------------------
// Single notification card
// ---------------------------------------------------------------------------

function NotificationCard({
  notif,
  onMarkRead,
  onDelete,
}: {
  notif: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = NOTIFICATION_CONFIG[notif.type];
  const Icon = ICON_MAP[cfg.iconName] ?? Bell;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
      transition={{ duration: 0.22 }}
      className={cn(
        'group relative flex gap-4 rounded-2xl border px-5 py-4 transition-colors',
        notif.read
          ? 'bg-card border-border hover:bg-muted/40'
          : 'bg-primary/3 border-primary/20 hover:bg-primary/6',
      )}
    >
      {/* Unread dot */}
      {!notif.read && (
        <span className="absolute -left-px top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-primary" />
      )}

      {/* Icon bubble */}
      <div
        className={cn(
          'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
          cfg.bg,
        )}
      >
        <Icon className={cn('w-5 h-5', cfg.color)} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Top row: type badge + time */}
        <div className="flex items-center justify-between gap-3 mb-1">
          <span
            className={cn(
              'inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
              cfg.bg,
              cfg.color,
            )}
          >
            {cfg.label}
          </span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
            {formatNotifTime(notif.timestamp)}
          </span>
        </div>

        {/* Title */}
        <p
          className={cn(
            'text-sm leading-snug',
            notif.read ? 'text-foreground/70' : 'text-foreground font-semibold',
          )}
        >
          {notif.title}
        </p>

        {/* Description */}
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
          {notif.description}
        </p>

        {/* Meta chip */}
        {notif.meta && (
          <span className="inline-block mt-2 text-[10px] bg-muted text-muted-foreground px-2.5 py-1 rounded-lg font-medium">
            {notif.meta}
          </span>
        )}

        {/* Action row */}
        <div className="flex items-center gap-3 mt-3">
          {notif.href && (
            <a
              href={notif.href}
              onClick={() => onMarkRead(notif.id)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Ver detalle
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {!notif.read && (
            <button
              onClick={() => onMarkRead(notif.id)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Marcar como leída
            </button>
          )}
        </div>
      </div>

      {/* Delete — visible on hover */}
      <button
        onClick={() => onDelete(notif.id)}
        className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
        aria-label="Eliminar notificación"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Bell className="w-7 h-7 text-muted-foreground/40" />
      </div>
      <p className="font-semibold text-foreground/60 text-sm">
        {filtered ? 'Sin resultados para este filtro' : 'Sin notificaciones'}
      </p>
      <p className="text-xs text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
        {filtered
          ? 'Prueba seleccionando otro tipo o revisa la vista "Todas".'
          : 'Cuando haya actividad en la plataforma, las notificaciones aparecerán aquí.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

function mapRealtimeNotification(entry: NotificationEntry): Notification {
  const isHandover = entry.type === 'conversation.handover';
  const type: NotificationType = isHandover ? 'cambio_departamento' : 'mensaje_nuevo';
  const name = entry.contactName?.trim() || entry.phone || 'Ciudadano';

  return {
    id: entry.id,
    type,
    title: isHandover
      ? `${name} fue transferido`
      : entry.type === 'ticket.created'
        ? `Nuevo ticket de ${name}`
        : `${name} envió un mensaje`,
    description:
      entry.messagePreview?.trim() || (isHandover ? 'Conversación reasignada' : 'Nuevo mensaje'),
    timestamp: entry.occurredAt,
    read: entry.read,
    href: entry.ticketId
      ? `/admin/tickets/${entry.ticketId}`
      : buildConversationsHref({
          conversationId: entry.conversationId,
          communicationLineId: entry.communicationLineId,
        }),
    actor: name,
    meta: entry.departmentSlug,
  };
}

export function NotificationsView() {
  const entries = useNotificationStore((state) => state.notifications);
  const markStoreRead = useNotificationStore((state) => state.markRead);
  const markStoreAllRead = useNotificationStore((state) => state.markAllRead);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('todas');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const notifications = useMemo(
    () => [...entries].sort(compareNotificationsNewestFirst).map(mapRealtimeNotification),
    [entries],
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = useMemo(
    () =>
      notifications.filter((n) => {
        if (activeFilter === 'todas') return true;
        if (activeFilter === 'no_leidas') return !n.read;
        return n.type === activeFilter;
      }),
    [notifications, activeFilter],
  );

  // Group by date label, preserving order
  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    const order: string[] = [];
    for (const n of filtered) {
      const label = getDateLabel(n.timestamp);
      if (!map.has(label)) {
        map.set(label, []);
        order.push(label);
      }
      map.get(label)!.push(n);
    }
    return order.map((label) => ({ label, items: map.get(label)! }));
  }, [filtered]);

  const markRead = (id: string) => markStoreRead(id);
  const markAllRead = () => markStoreAllRead();
  const deleteNotif = (id: string) => removeNotification(id);

  const getCount = (value: FilterTab) => {
    if (value === 'no_leidas') return notifications.filter((n) => !n.read).length;
    if (value === 'todas') return notifications.length;
    return notifications.filter((n) => n.type === value).length;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-muted/20">
      {/* ── Sticky toolbar ─────────────────────────────────────────────────── */}
      <div className="shrink-0ard border-b border-border">
        {/* Summary bar */}
        <div className="flex items-center justify-between px-8 pt-5 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-black text-foreground">Notificaciones</h2>
              {unreadCount > 0 && (
                <span className="text-xs font-bold bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full">
                  {unreadCount} nuevas
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {unreadCount > 0
                ? `Tienes ${unreadCount} notificacion${unreadCount > 1 ? 'es' : ''} sin leer`
                : 'Estás al día con todas tus notificaciones'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
              Configurar alertas
            </button>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-2 text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/5 transition-colors px-3.5 py-2 rounded-xl"
              >
                <Check className="w-3.5 h-3.5" />
                Marcar todas como leídas
              </button>
            )}
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 px-8 pb-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0 mr-0.5" />
          {FILTER_TABS.map(({ value, label }) => {
            const count = getCount(value);
            const isActive = activeFilter === value;
            return (
              <button
                key={value}
                onClick={() => setActiveFilter(value)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground bg-muted hover:bg-muted/80 hover:text-foreground',
                )}
              >
                {label}
                <span
                  className={cn(
                    'text-[10px] font-bold px-1.5 py-px rounded-full min-w-4.5 text-center tabular-nums',
                    isActive ? 'bg-white/25 text-white' : 'bg-background text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Notification list ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState filtered={activeFilter !== 'todas'} />
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
            <AnimatePresence mode="popLayout">
              {groups.map(({ label, items }) => (
                <motion.section
                  key={label}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Date group label */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      {label}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {items.length} {items.length === 1 ? 'notificación' : 'notificaciones'}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2.5">
                    <AnimatePresence mode="popLayout">
                      {items.map((notif) => (
                        <NotificationCard
                          key={notif.id}
                          notif={notif}
                          onMarkRead={markRead}
                          onDelete={deleteNotif}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.section>
              ))}
            </AnimatePresence>

            {/* Bottom spacer */}
            <div className="h-4" />
          </div>
        )}
      </div>

      <NotificationSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
