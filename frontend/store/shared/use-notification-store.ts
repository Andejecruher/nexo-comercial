import { create } from 'zustand';

export interface NotificationEntry {
  id: string;
  eventId?: string;
  ticketId?: string;
  type: string;
  conversationId: string;
  occurredAt: string;
  read: boolean;
  contactName?: string;
  phone?: string;
  messagePreview?: string;
  flowState?: string;
  channel?: string;
  priority?: string;
  departmentSlug?: string;
  assignedUserId?: string;
  /** UUID interno de la línea receptora (communication_lines.id), si el evento lo porta. */
  communicationLineId?: string;
}

interface NotificationState {
  notifications: NotificationEntry[];
  addNotification: (n: NotificationEntry) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  unreadCount: () => number;
}

function notificationTime(entry: NotificationEntry): number {
  const time = Date.parse(entry.occurredAt);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/** Más reciente primero. Empates conservan el orden previo (la recién llegada queda adelante). */
export function compareNotificationsNewestFirst(
  a: NotificationEntry,
  b: NotificationEntry,
): number {
  return notificationTime(b) - notificationTime(a);
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  addNotification: (n) =>
    set((state) => ({
      notifications: state.notifications.some(
        (item) => (n.eventId && item.eventId === n.eventId) || item.id === n.id,
      )
        ? state.notifications
        : [n, ...state.notifications].sort(compareNotificationsNewestFirst),
    })),

  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}));
