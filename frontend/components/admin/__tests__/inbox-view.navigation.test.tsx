import { InboxView } from '@/components/admin/inbox-view';
import type { InboxConversation } from '@/lib/messaging-api';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inbox: vi.fn(),
  messages: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'agent-1' } }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ roles: [] }) }));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ departments: [] }) }));
vi.mock('@/hooks/useAdminInboxConversations', () => ({ useAdminInboxConversations: mocks.inbox }));
vi.mock('@/hooks/useConversationMessages', () => ({ useConversationMessages: mocks.messages }));
vi.mock('@/components/admin/chat-list', () => ({
  ChatList: ({
    conversations,
    onSelect,
  }: {
    conversations: InboxConversation[];
    onSelect: (chat: InboxConversation) => void;
  }) => (
    <div>
      {conversations.map((chat) => (
        <button key={chat.id} onClick={() => onSelect(chat)}>
          Abrir {chat.citizen.name}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('@/components/admin/citizen-profile', () => ({
  CitizenProfile: ({ citizenId }: { citizenId?: string }) => <div>Ciudadano {citizenId}</div>,
}));
vi.mock('@/components/domain/messaging/MessageComposer', () => ({
  MessageComposer: function Composer() {
    const [draft, setDraft] = useState('');
    return (
      <input
        aria-label="Mensaje"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  },
}));

const conversation: InboxConversation = {
  id: 'conv-1',
  citizen: {
    id: 'cit-1',
    name: 'María',
    phone: '9661234567',
    colonia: 'Centro',
    interests: [],
    registeredAt: '2026-09-01T10:00:00.000Z',
  },
  inboxStatus: 'active',
  conversationStatus: 'open',
  lastMessage: 'Hola',
  lastTime: '10:00',
  unread: 0,
  updatedAt: '2026-09-01T10:00:00.000Z',
  canClose: true,
};

let desktop = false;
let onBreakpointChange: () => void;
let inboxState: ReturnType<typeof createInboxState>;
function createInboxState() {
  return {
    conversations: [conversation],
    loading: false,
    filters: {},
    searchInput: '',
    setSearchInput: vi.fn(),
    applyFilters: vi.fn(),
    upsertConversation: vi.fn(),
    closeConversation: vi.fn(),
    markConversationRead: vi.fn(),
    setSelectedConversationId: mocks.select,
    requestedConversationId: undefined,
    clearRequestedConversation: vi.fn(),
    refresh: vi.fn(),
  };
}

beforeEach(() => {
  desktop = false;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    get matches() {
      return desktop;
    },
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event, callback) => {
      onBreakpointChange = callback as () => void;
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  inboxState = createInboxState();
  mocks.inbox.mockImplementation(() => inboxState);
  mocks.messages.mockReturnValue({
    messages: [],
    loading: false,
    sending: false,
    socketConnected: true,
    sendMessageSafe: vi.fn(),
    sendAudioSafe: vi.fn(),
  });
});

function openChat() {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir María' }));
}

describe('InboxView navigation', () => {
  it('starts without a selection and clears the active subscription when going back', () => {
    render(<InboxView />);
    expect(
      screen.queryByRole('button', { name: 'Volver a conversaciones' }),
    ).not.toBeInTheDocument();
    openChat();
    expect(mocks.select).toHaveBeenLastCalledWith('conv-1');
    expect(mocks.messages).toHaveBeenLastCalledWith('conv-1');
    fireEvent.click(screen.getByRole('button', { name: 'Volver a conversaciones' }));
    expect(mocks.select).toHaveBeenLastCalledWith(undefined);
    expect(mocks.messages).toHaveBeenLastCalledWith(undefined);
    expect(screen.queryByRole('textbox', { name: 'Mensaje' })).not.toBeInTheDocument();
  });

  it('keeps the composer draft and restores focus after closing the profile', async () => {
    render(<InboxView />);
    openChat();
    fireEvent.change(screen.getByRole('textbox', { name: 'Mensaje' }), {
      target: { value: 'Borrador pendiente' },
    });
    const trigger = screen.getByRole('button', { name: 'Ver perfil' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Perfil del ciudadano' });
    expect(within(dialog).getByText('Ciudadano cit-1')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Mensaje' })).toHaveValue('Borrador pendiente');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes the profile and clears the chat when filters remove the selection', () => {
    const view = render(<InboxView />);
    openChat();
    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil' }));
    inboxState = { ...inboxState, conversations: [] };
    view.rerender(<InboxView />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.select).toHaveBeenLastCalledWith(undefined);
    expect(mocks.messages).toHaveBeenLastCalledWith(undefined);
  });

  it('closes the drawer on desktop and preserves the active chat across breakpoints', () => {
    render(<InboxView />);
    openChat();
    fireEvent.change(screen.getByRole('textbox', { name: 'Mensaje' }), {
      target: { value: 'Conservar al redimensionar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil' }));
    act(() => {
      desktop = true;
      onBreakpointChange();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      desktop = false;
      onBreakpointChange();
    });
    expect(screen.getByRole('textbox', { name: 'Mensaje' })).toHaveValue(
      'Conservar al redimensionar',
    );
    expect(mocks.messages).toHaveBeenLastCalledWith('conv-1');
  });
});
