import { ChatList } from '@/components/conversaciones/chat-list';
import type { InboxListFilters } from '@/hooks/conversaciones/useAdminInboxConversations';
import type { InboxConversation } from '@/lib/shared/messaging-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/messaging-api', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    messagingApi: {
      ...(actual.messagingApi as Record<string, unknown>),
      getAiAgents: vi.fn(async () => ({
        ok: true as const,
        data: {
          agents: [
            {
              id: 'agent-1',
              name: 'Bot Agua',
              lines: [{ id: 'line-1', name: 'Atención Ciudadana' }],
            },
            { id: 'agent-2', name: 'Bot Obras', lines: [{ id: 'line-2', name: 'Línea 2' }] },
          ],
        },
      })),
    },
  };
});

vi.mock('@/components/conversaciones/start-conversation-dialog', () => ({
  StartConversationDialog: () => null,
}));

vi.mock('@/hooks/conversaciones/usePhoneLines', () => ({
  usePhoneLines: () => ({
    lines: [
      {
        id: 'line-1',
        channel: 'whatsapp',
        externalIdentifier: 'phone-id-1',
        phoneNumber: '529661234567',
        displayName: 'Atención Ciudadana',
        isActive: true,
        isDefault: true,
        aiEnabled: true,
        metadata: {},
        createdAt: '2026-09-20T00:00:00.000Z',
        updatedAt: '2026-09-20T00:00:00.000Z',
      },
      {
        id: 'line-2',
        channel: 'whatsapp',
        externalIdentifier: 'phone-id-2',
        phoneNumber: '529669876543',
        displayName: '',
        isActive: true,
        isDefault: false,
        aiEnabled: true,
        metadata: {},
        createdAt: '2026-09-20T00:00:00.000Z',
        updatedAt: '2026-09-20T00:00:00.000Z',
      },
    ],
  }),
}));

vi.mock('@/hooks/shared/useDepartments', () => ({
  useDepartments: () => ({
    departments: [
      { id: 'dept-1', slug: 'agua', name: 'Agua', isActive: true },
      { id: 'dept-2', slug: 'obras', name: 'Obras', isActive: true },
    ],
  }),
}));

function baseConversation(overrides: Partial<InboxConversation> = {}): InboxConversation {
  return {
    id: 'conv-1',
    citizen: {
      id: 'cit-1',
      name: 'María González',
      phone: '9661234567',
      colonia: 'Centro',
      interests: [],
      registeredAt: '2026-09-20T10:00:00.000Z',
    },
    inboxStatus: 'active',
    conversationStatus: 'open',
    lastMessage: 'Hola',
    lastTime: '10:00',
    unread: 0,
    updatedAt: '2026-09-20T18:00:00.000Z',
    canClose: true,
    ...overrides,
  };
}

function renderList(
  onApplyFilters = vi.fn(),
  filters: InboxListFilters = { inboxStatus: 'active' },
  conversations: InboxConversation[] = [],
) {
  render(
    <ChatList
      selectedId={null}
      onSelect={vi.fn()}
      conversations={conversations}
      filters={filters}
      search=""
      onSearchChange={vi.fn()}
      onApplyFilters={onApplyFilters}
    />,
  );
  return onApplyFilters;
}

describe('ChatList — filtros', () => {
  it('selecciona la primera línea y muestra su nombre como valor principal', async () => {
    const onApplyFilters = renderList();

    expect(screen.getByText('Atención Ciudadana')).toBeInTheDocument();
    await waitFor(() => {
      expect(onApplyFilters).toHaveBeenCalledWith({ communicationLineId: 'line-1' });
    });
  });

  it('respeta una línea explícita del catálogo sin auto-seleccionar la primera', async () => {
    const onApplyFilters = renderList(vi.fn(), {
      inboxStatus: 'active',
      communicationLineId: 'line-2',
    });

    expect(onApplyFilters).not.toHaveBeenCalledWith({ communicationLineId: 'line-1' });
  });

  it('muestra "Línea no disponible" y no pisa una línea explícita ausente del catálogo', async () => {
    const onApplyFilters = renderList(vi.fn(), {
      inboxStatus: 'active',
      communicationLineId: 'line-not-in-catalog',
    });

    expect(screen.getByText('Línea no disponible')).toBeInTheDocument();
    expect(onApplyFilters).not.toHaveBeenCalledWith(
      expect.objectContaining({ communicationLineId: 'line-1' }),
    );
  });

  it('permite combinar múltiples departamentos', async () => {
    const onApplyFilters = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar departamentos' }));

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Agua' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Obras' }));

    expect(onApplyFilters).toHaveBeenCalledWith({ departmentIds: ['dept-1'] });
    expect(onApplyFilters).toHaveBeenCalledWith({ departmentIds: ['dept-1', 'dept-2'] });
  });

  it('muestra el grupo "Agentes de IA" con "Todos los bots" y los agentes activos', async () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar departamentos' }));

    expect(await screen.findByText('Agentes de IA')).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: 'Todos los bots' })).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: 'Bot Agua' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Bot Obras' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Agentes de IA' })).toBeInTheDocument();
  });

  it('seleccionar "Todos los bots" conserva los departamentos (OR)', async () => {
    const onApplyFilters = renderList(vi.fn(), {
      inboxStatus: 'active',
      departmentIds: ['dept-1'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar departamentos' }));

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Todos los bots' }));

    expect(onApplyFilters).toHaveBeenCalledWith({ botIds: [null] });
    expect(onApplyFilters).not.toHaveBeenCalledWith(expect.objectContaining({ departmentIds: [] }));
  });

  it('seleccionar un agente específico envía su id como botIds (null = todos)', async () => {
    const onApplyFilters = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar departamentos' }));

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Bot Agua' }));

    expect(onApplyFilters).toHaveBeenCalledWith({ botIds: ['agent-1'] });
  });

  it('seleccionar un departamento conserva el filtro de bot (OR)', async () => {
    const onApplyFilters = renderList(vi.fn(), {
      inboxStatus: 'active',
      botIds: [null],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar departamentos' }));

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Agua' }));

    expect(onApplyFilters).toHaveBeenCalledWith({ departmentIds: ['dept-1'] });
    expect(onApplyFilters).not.toHaveBeenCalledWith(expect.objectContaining({ botIds: [] }));
  });

  it('combinar botIds da un resumen con la cantidad de bots', async () => {
    renderList(vi.fn(), {
      inboxStatus: 'active',
      botIds: ['agent-1', null],
    });

    expect(screen.getByText('2 bots')).toBeInTheDocument();
  });

  it('muestra el ícono de bot junto al nombre cuando botAgent no es null', async () => {
    renderList(vi.fn(), { inboxStatus: 'active' }, [
      baseConversation({ botAgent: { id: 'agent-1', name: 'Bot Agua' } }),
    ]);

    expect(await screen.findByRole('img', { name: 'Atendido por Bot Agua' })).toBeInTheDocument();
  });

  it('no muestra ícono de bot cuando botAgent es null', () => {
    renderList(vi.fn(), { inboxStatus: 'active' }, [baseConversation({ botAgent: null })]);

    expect(screen.queryByRole('img', { name: /Atendido por/ })).not.toBeInTheDocument();
  });

  it('empty state específico cuando hay filtros de bot activos', () => {
    renderList(vi.fn(), { inboxStatus: 'active', botIds: [null] });

    expect(
      screen.getByText('Sin conversaciones para los filtros seleccionados'),
    ).toBeInTheDocument();
  });

  it('empty state genérico sin filtros activos', () => {
    renderList();

    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });

  it('muestra un resumen combinado de departamentos y bots en el trigger', () => {
    renderList(vi.fn(), {
      inboxStatus: 'active',
      departmentIds: ['dept-1'],
      botIds: ['agent-1', null],
    });

    expect(screen.getByText('Agua · 2 bots')).toBeInTheDocument();
  });

  it('centra el empty state de filtros activos', () => {
    renderList(vi.fn(), { inboxStatus: 'active', botIds: [null] });

    const message = screen.getByText('Sin conversaciones para los filtros seleccionados');
    const container = message.closest('div');
    expect(container).toHaveClass('flex-1');
    expect(container).toHaveClass('items-center');
    expect(container).toHaveClass('justify-center');
  });
});
