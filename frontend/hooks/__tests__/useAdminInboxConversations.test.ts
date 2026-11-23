import {
  INBOX_FILTER_STORAGE_KEY,
  inboxFiltersFromUrl,
  mergeInboxFilters,
  parseInboxFilters,
  readStoredInboxFilters,
  resolveInboxSocketUpdate,
  writeInboxFiltersToParams,
} from '@/hooks/useAdminInboxConversations';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/admin/conversaciones',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  window.localStorage.clear();
});

describe('filtros de bandeja en URL', () => {
  it('usa Activas por defecto y conserva línea, departamento y búsqueda', () => {
    const parsed = parseInboxFilters(
      new URLSearchParams('status=inactive&line=line-1&dept=dept-1&dept=dept-2&search=juan'),
    );

    expect(parsed).toEqual({
      inboxStatus: 'inactive',
      communicationLineId: 'line-1',
      departmentIds: ['dept-1', 'dept-2'],
      search: 'juan',
      botIds: undefined,
    });
  });

  it('serializa los query params que consume el backend', () => {
    const params = writeInboxFiltersToParams(new URLSearchParams(), {
      inboxStatus: 'active',
      communicationLineId: 'line-1',
      departmentIds: ['dept-1', 'dept-2'],
      search: 'juan',
    });

    expect(params.get('status')).toBe('active');
    expect(params.get('line')).toBe('line-1');
    expect(params.getAll('dept')).toEqual(['dept-1', 'dept-2']);
    expect(params.get('search')).toBe('juan');
  });
});

describe('filtro por agentes de IA (botIds multi-select)', () => {
  it('parsea bot_ids=all como null y conserva los departamentos', () => {
    const parsed = parseInboxFilters(new URLSearchParams('dept=dept-1&bot_ids=all'));

    expect(parsed.botIds).toEqual([null]);
    expect(parsed.departmentIds).toEqual(['dept-1']);
  });

  it('parsea varios bot_ids y los combina con dept (OR)', () => {
    const parsed = parseInboxFilters(
      new URLSearchParams('dept=dept-1&bot_ids=agent-9&bot_ids=all'),
    );

    expect(parsed.botIds).toEqual(['agent-9', null]);
    expect(parsed.departmentIds).toEqual(['dept-1']);
  });

  it('migra el param legacy bot a botIds', () => {
    const parsed = parseInboxFilters(new URLSearchParams('status=active&bot=all-bots'));

    expect(parsed.botIds).toEqual([null]);
    expect(parsed.inboxStatus).toBe('active');
  });

  it('sin params de bot, botIds es undefined', () => {
    const parsed = parseInboxFilters(new URLSearchParams('status=active'));

    expect(parsed.botIds).toBeUndefined();
  });

  it('inboxFiltersFromUrl reconoce una URL que solo tiene bot_ids', () => {
    expect(inboxFiltersFromUrl(new URLSearchParams('bot_ids=all'))).not.toBeNull();
    expect(inboxFiltersFromUrl(new URLSearchParams())).toBeNull();
  });

  it('serializa bot_ids (all para null) y conserva dept sin exclusión', () => {
    const params = writeInboxFiltersToParams(new URLSearchParams(), {
      inboxStatus: 'active',
      departmentIds: ['dept-1', 'dept-2'],
      botIds: [null, 'agent-9'],
    });

    expect(params.getAll('bot_ids')).toEqual(['all', 'agent-9']);
    expect(params.getAll('dept')).toEqual(['dept-1', 'dept-2']);
  });

  it('elimina el param bot_ids cuando no hay filtro de bot', () => {
    const params = writeInboxFiltersToParams(new URLSearchParams('bot_ids=all'), {
      inboxStatus: 'active',
    });

    expect(params.has('bot_ids')).toBe(false);
  });

  it('lee filtros guardados antiguos sin el campo botIds', () => {
    window.localStorage.setItem(
      INBOX_FILTER_STORAGE_KEY,
      JSON.stringify({ inboxStatus: 'active', departmentIds: ['dept-1'] }),
    );

    expect(readStoredInboxFilters()).toEqual({
      inboxStatus: 'active',
      communicationLineId: undefined,
      departmentIds: ['dept-1'],
      search: undefined,
      botIds: undefined,
    });
  });

  it('migra botFilter legacy guardado a botIds y conserva departamentos', () => {
    window.localStorage.setItem(
      INBOX_FILTER_STORAGE_KEY,
      JSON.stringify({
        inboxStatus: 'inactive',
        departmentIds: ['dept-1'],
        botFilter: 'agent-9',
      }),
    );

    const stored = readStoredInboxFilters();
    expect(stored?.botIds).toEqual(['agent-9']);
    expect(stored?.departmentIds).toEqual(['dept-1']);
  });
});

describe('mergeInboxFilters — OR entre grupos (sin exclusión mutua)', () => {
  it('seleccionar bots conserva los departamentos', () => {
    const next = mergeInboxFilters(
      { inboxStatus: 'active', departmentIds: ['dept-1'] },
      { botIds: [null] },
    );

    expect(next.botIds).toEqual([null]);
    expect(next.departmentIds).toEqual(['dept-1']);
  });

  it('seleccionar departamentos conserva el filtro de bot', () => {
    const next = mergeInboxFilters(
      { inboxStatus: 'active', botIds: ['agent-9'] },
      { departmentIds: ['dept-1'] },
    );

    expect(next.botIds).toEqual(['agent-9']);
    expect(next.departmentIds).toEqual(['dept-1']);
  });

  it('botIds vacío explícito limpia el filtro de bot sin tocar departamentos', () => {
    const next = mergeInboxFilters(
      { inboxStatus: 'active', departmentIds: ['dept-1'], botIds: [null, 'agent-9'] },
      { botIds: [] },
    );

    expect(next.botIds).toBeUndefined();
    expect(next.departmentIds).toEqual(['dept-1']);
  });

  it('dedupe y normaliza botIds combinados', () => {
    const next = mergeInboxFilters(
      { inboxStatus: 'active', botIds: ['agent-9'] },
      { botIds: ['agent-9', null, 'agent-9'] },
    );

    expect(next.botIds).toEqual(['agent-9', null]);
  });
});

describe('resolveInboxSocketUpdate', () => {
  const conversationId = '550e8400-e29b-41d4-a716-446655440001';

  it('acepta conversation.updated legacy con state-transition a CLOSED', () => {
    expect(
      resolveInboxSocketUpdate({
        conversationId,
        action: 'state-transition',
        flowState: 'CLOSED',
        triggeredBy: 'system',
        occurredAt: '2026-10-07T17:22:00.000Z',
      }),
    ).toEqual({
      conversationId,
      action: 'close',
      inboxPatch: {
        flowState: 'CLOSED',
        inboxStatus: 'inactive',
        status: 'closed',
      },
    });
  });

  it('acepta el sobre durable de conversation.updated', () => {
    const eventId = '550e8400-e29b-41d4-a716-446655440000';
    const occurredAt = '2026-10-07T17:22:00.000Z';

    expect(
      resolveInboxSocketUpdate({
        eventId,
        correlationId: 'corr-1',
        schemaVersion: 1,
        eventType: 'conversation.updated',
        socketEventName: 'conversation.updated',
        occurredAt,
        source: 'message.service',
        conversationId,
        action: 'message',
        conversationPatch: { id: conversationId, updatedAt: occurredAt },
        inboxPatch: {
          lastMessagePreview: 'hola',
          lastMessageAt: occurredAt,
          lastMessageDirection: 'inbound',
          unreadDelta: 1,
        },
      }),
    ).toMatchObject({
      conversationId,
      action: 'message',
      eventId,
      inboxPatch: { lastMessagePreview: 'hola', unreadDelta: 1 },
    });
  });

  it('rechaza un payload que no coincide con ninguna de las dos formas', () => {
    expect(resolveInboxSocketUpdate({ conversationId, text: 'hola' })).toBeNull();
  });
});
