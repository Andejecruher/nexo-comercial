import { useNotificationStore } from '@/stores/use-notification-store';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationsBell } from '../notifications-bell';

function seedNotifications(
  count: number,
  read = false,
  extra: Partial<ReturnType<typeof useNotificationStore.getState>['notifications'][number]> = {},
) {
  const notifications = Array.from({ length: count }, (_, i) => ({
    id: `n-${i}`,
    type: 'message.received' as const,
    conversationId: `conv-${i}`,
    occurredAt: new Date(Date.now() - i * 60000).toISOString(),
    read,
    ...extra,
  }));
  useNotificationStore.setState({ notifications });
}

describe('NotificationsBell', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] });
  });

  it('opens the real ticket from a ticket-created notification', () => {
    seedNotifications(1, false, { type: 'ticket.created', ticketId: 'ticket-42' });
    render(<NotificationsBell />);
    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }));
    expect(screen.getByRole('link', { name: /Nuevo ticket recibido/i })).toHaveAttribute(
      'href',
      '/admin/tickets/ticket-42',
    );
  });

  it('shows numeric unread badge count on the bell', () => {
    seedNotifications(3, false);
    render(<NotificationsBell />);

    expect(screen.getByText('3')).toBeVisible();
  });

  it('caps unread badge at 99+', () => {
    seedNotifications(105, false);
    render(<NotificationsBell />);

    expect(screen.getByText('99+')).toBeVisible();
  });

  it('lists the newest notifications first in the popover', () => {
    useNotificationStore.setState({
      notifications: [
        {
          id: 'older',
          type: 'message.received',
          conversationId: 'conv-older',
          occurredAt: '2026-10-19T12:00:00.000Z',
          read: false,
          contactName: 'Ana Antigua',
        },
        {
          id: 'newest',
          type: 'message.received',
          conversationId: 'conv-newest',
          occurredAt: '2026-10-19T18:00:00.000Z',
          read: false,
          contactName: 'Zoe Reciente',
        },
      ],
    });
    render(<NotificationsBell />);

    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }));

    const titles = screen.getAllByText(/Nuevo mensaje de /).map((node) => node.textContent);
    expect(titles).toEqual(['Nuevo mensaje de Zoe Reciente', 'Nuevo mensaje de Ana Antigua']);
  });

  it('lists unread notifications in the popover', () => {
    seedNotifications(3, false);
    render(<NotificationsBell />);

    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }));

    expect(screen.getByText('Notificaciones')).toBeInTheDocument();
    expect(screen.getAllByText('Nuevo mensaje recibido')).toHaveLength(3);
  });

  it('shows citizen name in notification title when available', () => {
    seedNotifications(1, false, { contactName: 'Juan Pérez', phone: '+521999888777' });
    render(<NotificationsBell />);

    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }));

    expect(screen.getByText('Nuevo mensaje de Juan Pérez')).toBeInTheDocument();
  });

  it('shows phone in title and description when citizen name is unavailable', () => {
    seedNotifications(1, false, { phone: '+521234567890' });
    render(<NotificationsBell />);

    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }));

    expect(screen.getByText('Nuevo mensaje de +521234567890')).toBeInTheDocument();
    expect(screen.getAllByText(/\+521234567890/)).toHaveLength(2);
  });

  it('shows message preview in description when available', () => {
    seedNotifications(1, false, { messagePreview: 'Quiero reportar un problema' });
    render(<NotificationsBell />);

    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }));

    expect(screen.getByText(/Quiero reportar un problema/)).toBeInTheDocument();
  });

  it('shows department in handover notification title', () => {
    const notifications = [
      {
        id: 'n-0',
        type: 'conversation.handover' as const,
        conversationId: 'conv-0',
        occurredAt: new Date().toISOString(),
        read: false,
        departmentSlug: 'obras-publicas',
      },
    ];
    useNotificationStore.setState({ notifications });
    render(<NotificationsBell />);

    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }));

    expect(screen.getByText('Transferido → obras-publicas')).toBeInTheDocument();
  });

  it('falls back to conversation id in description when no context', () => {
    seedNotifications(1, false);
    render(<NotificationsBell />);

    fireEvent.click(screen.getByRole('button', { name: /notificaciones/i }));

    expect(screen.getByText(/Conversación conv-0/)).toBeInTheDocument();
  });
});
