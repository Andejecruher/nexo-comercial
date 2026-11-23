import { beforeEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from '../use-notification-store';

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] });
  });

  it('starts with an empty notification list', () => {
    expect(useNotificationStore.getState().notifications).toEqual([]);
    expect(useNotificationStore.getState().unreadCount()).toBe(0);
  });

  it('addNotification stores a notification and unreadCount reflects it', () => {
    const { addNotification } = useNotificationStore.getState();

    addNotification({
      id: 'n1',
      type: 'message.received',
      conversationId: 'conv-1',
      occurredAt: new Date().toISOString(),
      read: false,
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].id).toBe('n1');
    expect(state.unreadCount()).toBe(1);
  });

  it('markRead marks a single notification as read', () => {
    const { addNotification, markRead } = useNotificationStore.getState();

    addNotification({
      id: 'n1',
      type: 'message.received',
      conversationId: 'conv-1',
      occurredAt: new Date().toISOString(),
      read: false,
    });
    addNotification({
      id: 'n2',
      type: 'conversation.handover',
      conversationId: 'conv-2',
      occurredAt: new Date().toISOString(),
      read: false,
    });

    markRead('n1');

    const state = useNotificationStore.getState();
    expect(state.notifications.find((n) => n.id === 'n1')?.read).toBe(true);
    expect(state.notifications.find((n) => n.id === 'n2')?.read).toBe(false);
    expect(state.unreadCount()).toBe(1);
  });

  it('markAllRead marks every notification as read', () => {
    const { addNotification, markAllRead } = useNotificationStore.getState();

    addNotification({
      id: 'n1',
      type: 'message.received',
      conversationId: 'conv-1',
      occurredAt: new Date().toISOString(),
      read: false,
    });
    addNotification({
      id: 'n2',
      type: 'conversation.handover',
      conversationId: 'conv-2',
      occurredAt: new Date().toISOString(),
      read: false,
    });

    markAllRead();

    const state = useNotificationStore.getState();
    expect(state.notifications.every((n) => n.read)).toBe(true);
    expect(state.unreadCount()).toBe(0);
  });

  it('unreadCount only counts notifications where read is false', () => {
    const { addNotification } = useNotificationStore.getState();

    addNotification({
      id: 'n1',
      type: 'message.received',
      conversationId: 'conv-1',
      occurredAt: new Date().toISOString(),
      read: false,
    });
    addNotification({
      id: 'n2',
      type: 'message.received',
      conversationId: 'conv-1',
      occurredAt: new Date().toISOString(),
      read: true,
    });

    expect(useNotificationStore.getState().unreadCount()).toBe(1);
  });

  it('keeps notifications newest-first, including a notification that just arrived', () => {
    const { addNotification } = useNotificationStore.getState();

    addNotification({
      id: 'older',
      type: 'message.received',
      conversationId: 'conv-1',
      occurredAt: '2026-10-19T12:00:00.000Z',
      read: false,
    });
    addNotification({
      id: 'newest',
      type: 'message.received',
      conversationId: 'conv-2',
      occurredAt: '2026-10-19T18:00:00.000Z',
      read: false,
    });
    addNotification({
      id: 'middle',
      type: 'message.received',
      conversationId: 'conv-3',
      occurredAt: '2026-10-19T15:00:00.000Z',
      read: false,
    });

    expect(useNotificationStore.getState().notifications.map((n) => n.id)).toEqual([
      'newest',
      'middle',
      'older',
    ]);
  });

  it('places a notification with the same timestamp ahead of the previous one', () => {
    const { addNotification } = useNotificationStore.getState();
    const occurredAt = '2026-10-19T18:00:00.000Z';

    addNotification({
      id: 'first',
      type: 'message.received',
      conversationId: 'conv-1',
      occurredAt,
      read: false,
    });
    addNotification({
      id: 'just-arrived',
      type: 'message.received',
      conversationId: 'conv-2',
      occurredAt,
      read: false,
    });

    expect(useNotificationStore.getState().notifications.map((n) => n.id)).toEqual([
      'just-arrived',
      'first',
    ]);
  });

  it('removeNotification deletes an entry', () => {
    const { addNotification, removeNotification } = useNotificationStore.getState();
    addNotification({
      id: 'n-del',
      type: 'message.received',
      conversationId: 'conv-1',
      occurredAt: new Date().toISOString(),
      read: false,
    });
    removeNotification('n-del');
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('preserves enriched context fields on notification entries', () => {
    const { addNotification } = useNotificationStore.getState();

    addNotification({
      id: 'n-rich',
      type: 'message.received',
      conversationId: 'conv-rich',
      occurredAt: new Date().toISOString(),
      read: false,
      contactName: 'Laura Torres',
      phone: '+521555123456',
      messagePreview: 'Hola, tengo un problema',
      flowState: 'HUMAN_FLOW',
      channel: 'whatsapp',
      priority: 'HIGH',
      departmentSlug: 'atencion-ciudadana',
    });

    const entry = useNotificationStore.getState().notifications[0];
    expect(entry.contactName).toBe('Laura Torres');
    expect(entry.phone).toBe('+521555123456');
    expect(entry.messagePreview).toBe('Hola, tengo un problema');
    expect(entry.flowState).toBe('HUMAN_FLOW');
    expect(entry.channel).toBe('whatsapp');
    expect(entry.priority).toBe('HIGH');
    expect(entry.departmentSlug).toBe('atencion-ciudadana');
  });
});
