import {
  mapConversationToInboxUi,
  messagingApi,
  resolveInboxAttendant,
  type ConversationListItemApi,
} from '@/lib/shared/messaging-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/shared/api-client', () => ({
  apiClient: {
    get: mockGet,
  },
}));

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    ok: true,
    data: { items: [], meta: { nextCursor: undefined, hasNextPage: false } },
  });
});

function baseRow(overrides: Partial<ConversationListItemApi> = {}): ConversationListItemApi {
  return {
    id: 'conv-1',
    citizenId: 'cit-1',
    status: 'open',
    channel: 'whatsapp',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-20T18:00:00.000Z',
    meta: {
      id: 'meta-1',
      conversationId: 'conv-1',
      flowState: 'HUMAN_FLOW',
      version: 2,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-20T18:00:00.000Z',
    },
    citizen: { id: 'cit-1', phone: '9661234567', name: 'María', lastName: 'González' },
    ...overrides,
  };
}

describe('mapConversationToInboxUi', () => {
  it('mapea último mensaje, estado derivado y responsable del agente', () => {
    const mapped = mapConversationToInboxUi(
      baseRow({
        inboxStatus: 'active',
        lastMessagePreview: 'Se cortó el agua en la colonia',
        lastMessageAt: '2026-09-20T18:05:00.000Z',
        assignedUser: { id: 'agent-1', fullName: 'Ana López', email: 'ana@voz.test' },
        assignedUserId: 'agent-1',
        assignedDept: 'obras',
      }),
    );

    expect(mapped.citizen.name).toBe('María González');
    expect(mapped.lastMessage).toBe('Se cortó el agua en la colonia');
    expect(mapped.inboxStatus).toBe('active');
    expect(mapped.assignedUserName).toBe('Ana López');
    expect(mapped.canClose).toBe(true);
    expect(resolveInboxAttendant(mapped).kind).toBe('agent');
  });

  it('usa departamento cuando no hay agente y Bot cuando no hay asignación', () => {
    const withDept = mapConversationToInboxUi(
      baseRow({
        inboxStatus: 'active',
        assignedDept: 'agua',
        lastMessagePreview: 'Hola',
      }),
    );
    expect(resolveInboxAttendant(withDept, 'Agua y Saneamiento')).toEqual({
      kind: 'department',
      label: 'Agua y Saneamiento',
    });

    const withBot = mapConversationToInboxUi(
      baseRow({
        inboxStatus: 'inactive',
        status: 'closed',
        meta: {
          id: 'meta-1',
          conversationId: 'conv-1',
          flowState: 'CLOSED',
          version: 3,
          createdAt: '2026-09-01T10:00:00.000Z',
          updatedAt: '2026-09-20T18:00:00.000Z',
        },
      }),
    );
    expect(withBot.canClose).toBe(false);
    expect(withBot.inboxStatus).toBe('inactive');
    expect(resolveInboxAttendant(withBot)).toEqual({ kind: 'bot', label: 'Bot' });
  });

  it('mapea botAgent cuando la conversación la atiende un agente IA', () => {
    const mapped = mapConversationToInboxUi(
      baseRow({ botAgent: { id: 'agent-1', name: 'Bot Agua' } }),
    );

    expect(mapped.botAgent).toEqual({ id: 'agent-1', name: 'Bot Agua' });
  });

  it('normaliza botAgent ausente a null', () => {
    const mapped = mapConversationToInboxUi(baseRow());

    expect(mapped.botAgent).toBeNull();
  });
});

describe('messagingApi.listConversations', () => {
  it('envía múltiples department_id como query params repetidos', async () => {
    await messagingApi.listConversations({
      status: 'active',
      departmentIds: ['dept-1', 'dept-2'],
      communicationLineId: 'line-1',
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/conversations?status=active&department_id=dept-1&department_id=dept-2&phone_line_id=line-1',
    );
  });

  it('envía bot_ids con all cuando el filtro es "todos los bots" (null)', async () => {
    await messagingApi.listConversations({ status: 'active', botIds: [null] });

    expect(mockGet).toHaveBeenCalledWith('/conversations?status=active&bot_ids=all');
  });

  it('envía bot_ids cuando el filtro son agentes específicos', async () => {
    await messagingApi.listConversations({ botIds: ['agent-9'] });

    expect(mockGet).toHaveBeenCalledWith('/conversations?bot_ids=agent-9');
  });

  it('combina department_ids y bot_ids sin exclusión mutua', async () => {
    await messagingApi.listConversations({
      departmentIds: ['dept-1'],
      botIds: ['agent-9', null, 'agent-2'],
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/conversations?department_id=dept-1&bot_ids=agent-9&bot_ids=all&bot_ids=agent-2',
    );
  });
});

describe('messagingApi.getAiAgents', () => {
  it('lista agentes activos leyendo la respuesta envuelta body.agents', async () => {
    mockGet.mockResolvedValue({
      ok: true,
      data: {
        agents: [
          {
            id: 'agent-1',
            name: 'Bot Agua',
            lines: [{ id: 'line-1', name: 'Atención Ciudadana' }],
          },
        ],
      },
    });

    const result = await messagingApi.getAiAgents();

    expect(mockGet).toHaveBeenCalledWith('/ai-agents');
    expect(result.ok && result.data.agents[0]?.name).toBe('Bot Agua');
  });

  it('filtra por línea con el query param lineId', async () => {
    await messagingApi.getAiAgents('line-1');

    expect(mockGet).toHaveBeenCalledWith('/ai-agents?lineId=line-1');
  });
});
