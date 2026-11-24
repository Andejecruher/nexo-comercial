'use client';

import { NotificationSettingsModal } from '@/components/shared/notification-settings-modal';
import { buildConversationsHref } from '@/lib/shared/conversations-navigation';
import {
  NOTIFICATION_CONFIG,
  formatNotifTime,
  type Notification,
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
  ArrowRight,
  ArrowRightLeft,
  AtSign,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  MessageCircle,
  Settings2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
// Unread count formatting
// ---------------------------------------------------------------------------

function formatUnreadBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

// ---------------------------------------------------------------------------
// Map realtime notification entries to the display shape
// ---------------------------------------------------------------------------

function bellNotificationTitle(entry: NotificationEntry): string {
  if (entry.type === 'ticket.created') {
    const name = entry.contactName ?? entry.phone;
    return name ? `Nuevo ticket de ${name}` : 'Nuevo ticket recibido';
  }
  if (entry.type === 'message.received') {
    const name = entry.contactName ?? entry.phone;
    return name ? `Nuevo mensaje de ${name}` : 'Nuevo mensaje recibido';
  }
  if (entry.type === 'conversation.handover') {
    return entry.departmentSlug
      ? `Transferido → ${entry.departmentSlug}`
      : 'Conversación transferida';
  }
  return 'Nueva notificación';
}

function bellNotificationDescription(entry: NotificationEntry): string {
  const parts: string[] = [];

  if (entry.channel) {
    parts.push(entry.channel === 'whatsapp' ? 'WhatsApp' : entry.channel);
  }

  if (entry.phone) {
    parts.push(entry.phone);
  }

  if (entry.messagePreview) {
    const preview =
      entry.messagePreview.length > 80
        ? `${entry.messagePreview.slice(0, 79)}…`
        : entry.messagePreview;
    parts.push(`"${preview}"`);
  }

  if (entry.type === 'conversation.handover' && entry.departmentSlug) {
    parts.push(`Dept: ${entry.departmentSlug}`);
  }

  if (parts.length > 0) {
    parts.push(`Conv. ${entry.conversationId.slice(0, 8)}…`);
    return parts.join(' · ');
  }

  return `Conversación ${entry.conversationId.slice(0, 8)}…`;
}

function toDisplayNotification(entry: NotificationEntry): Notification {
  const type =
    entry.type === 'message.received'
      ? 'mensaje_nuevo'
      : entry.type === 'conversation.handover'
        ? 'cambio_departamento'
        : 'alerta_sistema';

  return {
    id: entry.id,
    type,
    title: bellNotificationTitle(entry),
    description: bellNotificationDescription(entry),
    timestamp: entry.occurredAt,
    read: entry.read,
    href: entry.ticketId
      ? `/admin/tickets/${entry.ticketId}`
      : buildConversationsHref({
          conversationId: entry.conversationId,
          communicationLineId: entry.communicationLineId,
        }),
  };
}

// ---------------------------------------------------------------------------
// Mini notification row inside the popover
// ---------------------------------------------------------------------------

function MiniRow({ notif, onMarkRead }: { notif: Notification; onMarkRead: (id: string) => void }) {
  const cfg = NOTIFICATION_CONFIG[notif.type];
  const Icon = ICON_MAP[cfg.iconName] ?? Bell;

  return (
    <a
      href={notif.href ?? '#'}
      onClick={() => onMarkRead(notif.id)}
      className={cn(
        'flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border last:border-0',
        !notif.read && 'bg-primary/4',
      )}
    >
      {/* Unread dot */}
      {!notif.read && (
        <span className="absolute left-2 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
      )}

      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
        <Icon className={cn('w-4 h-4', cfg.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-xs leading-snug line-clamp-1',
            notif.read ? 'text-foreground/70' : 'text-foreground font-semibold',
          )}
        >
          {notif.title}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{notif.description}</p>
        <span className="text-[10px] text-muted-foreground">
          {formatNotifTime(notif.timestamp)}
        </span>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Bell button + popover
// ---------------------------------------------------------------------------

export function NotificationsBell() {
  const rawNotifications = useNotificationStore((state) => state.notifications);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  const notifications = [...rawNotifications]
    .sort(compareNotificationsNewestFirst)
    .map(toDisplayNotification);

  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const unread = notifications.filter((n) => !n.read);
  const recent = notifications.slice(0, 5);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Position popover below the bell button
  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const popover = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 w-80 bg-card border border-border rounded-2xl shadow-xl overflow-hidden"
        >
          {/* Popover header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">Notificaciones</span>
              {unread.length > 0 && (
                <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-4.5 text-center">
                  {unread.length}
                </span>
              )}
            </div>
            {unread.length > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-[11px] text-primary font-medium hover:text-primary/80 transition-colors"
              >
                <Check className="w-3 h-3" />
                Leer todas
              </button>
            )}
          </div>

          {/* Recent notifications */}
          <div className="relative">
            {recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-xs">
                <Bell className="w-6 h-6 mb-2 opacity-30" />
                Sin notificaciones recientes
              </div>
            ) : (
              recent.map((n) => <MiniRow key={n.id} notif={n} onMarkRead={markRead} />)
            )}
          </div>

          <div className="grid grid-cols-2 border-t border-border">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 border-r border-border py-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted/40"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Configurar
            </button>
            <a
              href="/admin/notificaciones"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-primary transition-colors hover:bg-muted/40"
            >
              Ver todas
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
        aria-label={`Notificaciones${unread.length > 0 ? ` — ${unread.length} sin leer` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold border-2 border-card">
            {formatUnreadBadgeCount(unread.length)}
          </span>
        )}
      </button>

      {mounted && createPortal(popover, document.body)}
      <NotificationSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
