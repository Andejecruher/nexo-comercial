import { ChatWindow } from '@/components/admin/chat-window';
import type { InboxConversation } from '@/lib/messaging-api';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/domain/messaging/MessageComposer', () => ({
  MessageComposer: () => <div>composer</div>,
}));

function chat(overrides: Partial<InboxConversation> = {}): InboxConversation {
  return {
    id: 'conv-1',
    citizen: {
      id: 'cit-1',
      name: 'María González',
      phone: '9661234567',
      colonia: 'La Candelaria',
      interests: [],
      registeredAt: '2026-09-01T10:00:00.000Z',
    },
    inboxStatus: 'active',
    conversationStatus: 'open',
    lastMessage: 'Se cortó el agua',
    lastTime: '18:05',
    unread: 0,
    updatedAt: '2026-09-20T18:05:00.000Z',
    canClose: true,
    ...overrides,
  };
}

const windowProps = {
  apiMessages: [],
  messagesLoading: false,
  sending: false,
  onSend: vi.fn(),
};

describe('ChatWindow — Cerrar Conversación', () => {
  it('desplaza solo el historial cuando llega actividad, sin mover los ancestros', () => {
    const view = render(<ChatWindow {...windowProps} chat={chat()} />);
    const history = screen.getByRole('region', { name: 'Historial de mensajes' });
    Object.defineProperty(history, 'scrollHeight', { value: 1200 });
    const scrollHistory = vi.spyOn(history, 'scrollTo');
    const scrollAncestors = vi.spyOn(Element.prototype, 'scrollIntoView');
    scrollHistory.mockClear();
    scrollAncestors.mockClear();

    view.rerender(<ChatWindow {...windowProps} chat={chat()} botTyping />);

    expect(history.scrollTop).toBe(1200);
    expect(scrollHistory).not.toHaveBeenCalled();
    expect(scrollAncestors).not.toHaveBeenCalled();
  });

  it('muestra el botón cuando la conversación se puede cerrar', () => {
    render(
      <ChatWindow
        {...windowProps}
        chat={chat()}
        onCloseConversation={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cerrar Conversación' })).toBeEnabled();
    expect(screen.getByText('Activa')).toBeInTheDocument();
  });

  it('oculta el botón cuando la conversación ya está cerrada', () => {
    render(
      <ChatWindow
        {...windowProps}
        chat={chat({ canClose: false, inboxStatus: 'inactive', conversationStatus: 'closed' })}
        onCloseConversation={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Cerrar Conversación' })).not.toBeInTheDocument();
    expect(screen.getByText('Inactiva')).toBeInTheDocument();
  });

  it('pide confirmación al hacer clic', () => {
    render(
      <ChatWindow
        {...windowProps}
        chat={chat()}
        onCloseConversation={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Conversación' }));
    expect(screen.getByText('Cerrar esta conversación')).toBeInTheDocument();
  });

  it('deshabilita el botón de cierre mientras la acción está en curso', () => {
    render(
      <ChatWindow
        {...windowProps}
        chat={chat()}
        closing
        onCloseConversation={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cerrando…' })).toBeDisabled();
  });
});
