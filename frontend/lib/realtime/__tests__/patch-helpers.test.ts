import { describe, expect, it } from 'vitest';
import type { ConversationDetailDto, MessageWithStatusesDto } from '@/lib/conversations-api';
import type { TicketDetailDto } from '@/lib/tickets-api';
import {
  applyConversationPatch,
  applyMessagePatch,
  applyMessageStatusPatch,
  applyTicketPatch,
  tryApplyRealtimePatch,
} from '../patch-helpers';
import { REALTIME_DURABLE_SCHEMA_VERSION } from '../types';

const conversationId = '550e8400-e29b-41d4-a716-446655440001';

function createMessage(id: string, body: string, createdAt: string): MessageWithStatusesDto {
  return {
    id,
    conversationId,
    body,
    direction: 'inbound',
    messageType: 'text',
    meta: {},
    createdAt,
    statuses: [],
    attachmentsViaMessageId: [],
  };
}

function createConversation(overrides?: Partial<ConversationDetailDto>): ConversationDetailDto {
  const base: ConversationDetailDto = {
    id: conversationId,
    citizenId: 'cit-1',
    status: 'open',
    channel: 'whatsapp',
    assignedDept: undefined,
    assignedUserId: undefined,
    createdAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T10:00:00.000Z',
    meta: {
      id: 'meta-1',
      conversationId,
      flowState: 'BOT_FLOW',
      version: 1,
      createdAt: '2026-06-27T10:00:00.000Z',
      updatedAt: '2026-06-27T10:00:00.000Z',
    },
    citizen: { id: 'cit-1', phone: '123', name: 'Ana' },
  };
  return { ...base, ...overrides };
}

function makeTicket(conversation: ConversationDetailDto): TicketDetailDto {
  return {
    id: conversation.id,
    folio: '20260627100000_0000_0000',
    conversationId: conversation.id,
    citizenId: conversation.citizenId,
    citizenName: conversation.citizen?.name ?? 'Ciudadano',
    citizenPhone: conversation.citizen?.phone ?? '',
    status: 'OPEN',
    priority: 'MEDIUM',
    source: 'WHATSAPP',
    departmentSlug: conversation.assignedDept ?? undefined,
    assignedUserId: conversation.assignedUserId ?? undefined,
    flowState: conversation.meta?.flowState ?? 'BOT_FLOW',
    conversationStatus: conversation.status,
    channel: conversation.channel,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    closedAt: undefined,
    _rawDetail: conversation,
  };
}

describe('applyMessagePatch', () => {
  it('inserts a new message and sorts by createdAt', () => {
    const existing = createMessage('msg-1', 'first', '2026-06-27T12:00:00.000Z');
    const patch = {
      id: 'msg-2',
      conversationId,
      body: 'second',
      direction: 'inbound' as const,
      messageType: 'text',
      createdAt: '2026-06-27T11:00:00.000Z',
    };

    const result = applyMessagePatch([existing], patch, conversationId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].id).toBe('msg-2');
    expect(result.messages[1].id).toBe('msg-1');
  });

  it('upserts an existing message by id', () => {
    const existing = createMessage('msg-1', 'original', '2026-06-27T12:00:00.000Z');
    const patch = {
      id: 'msg-1',
      conversationId,
      body: 'updated',
      direction: 'outbound' as const,
      messageType: 'text',
      createdAt: '2026-06-27T12:00:00.000Z',
    };

    const result = applyMessagePatch([existing], patch, conversationId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].body).toBe('updated');
    expect(result.messages[0].direction).toBe('outbound');
  });

  it('fails when the patch conversationId does not match', () => {
    const patch = {
      id: 'msg-2',
      conversationId: '550e8400-e29b-41d4-a716-446655440999',
      body: 'hello',
      createdAt: '2026-06-27T12:00:00.000Z',
    };

    const result = applyMessagePatch([], patch, conversationId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('conversationId mismatch');
  });
});

describe('applyMessageStatusPatch', () => {
  const statusPatch = {
    messageId: 'msg-1',
    providerMessageId: 'wamid.HBgL123',
    status: 'delivered' as const,
    timestamp: '2026-06-27T12:05:00.000Z',
  };

  it('appends a new delivery status to the message timeline', () => {
    const message = createMessage('msg-1', 'hello', '2026-06-27T12:00:00.000Z');

    const result = applyMessageStatusPatch([message], statusPatch, conversationId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages[0].statuses).toHaveLength(1);
    expect(result.messages[0].statuses[0]).toMatchObject({
      messageId: 'msg-1',
      wamid: 'wamid.HBgL123',
      status: 'delivered',
      createdAt: '2026-06-27T12:05:00.000Z',
    });
  });

  it('correlates by externalMessageId when the internal id differs', () => {
    const message = {
      ...createMessage('msg-1', 'hello', '2026-06-27T12:00:00.000Z'),
      externalMessageId: 'wamid.HBgL123',
    };

    const result = applyMessageStatusPatch([message], statusPatch, conversationId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages[0].statuses).toHaveLength(1);
  });

  it('ignores a stale or duplicate status (rank guard)', () => {
    const message = {
      ...createMessage('msg-1', 'hello', '2026-06-27T12:00:00.000Z'),
      statuses: [
        {
          id: 'st-1',
          messageId: 'msg-1',
          wamid: 'wamid.HBgL123',
          status: 'read',
          createdAt: '2026-06-27T12:06:00.000Z',
        },
      ],
    };

    const result = applyMessageStatusPatch([message], statusPatch, conversationId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages[0].statuses).toHaveLength(1);
    expect(result.messages[0].statuses[0].status).toBe('read');
  });

  it('fails when the message is not present', () => {
    const result = applyMessageStatusPatch([], statusPatch, conversationId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('message_not_found');
  });
});

describe('applyConversationPatch', () => {
  it('merges status, assignment and flow state into the conversation', () => {
    const conversation = createConversation();
    const patch = {
      id: conversationId,
      status: 'closed' as const,
      assignedUserId: '550e8400-e29b-41d4-a716-446655440003',
      assignedDept: 'obras-publicas',
      flowState: 'HUMAN_FLOW',
      updatedAt: '2026-06-27T13:00:00.000Z',
    };

    const result = applyConversationPatch(conversation, patch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.conversation.status).toBe('closed');
    expect(result.conversation.assignedUserId).toBe(patch.assignedUserId);
    expect(result.conversation.assignedDept).toBe('obras-publicas');
    expect(result.conversation.meta.flowState).toBe('HUMAN_FLOW');
    expect(result.conversation.updatedAt).toBe('2026-06-27T13:00:00.000Z');
  });

  it('fails when the patch id does not match the conversation id', () => {
    const conversation = createConversation();
    const patch = {
      id: '550e8400-e29b-41d4-a716-446655440999',
      status: 'closed' as const,
    };

    const result = applyConversationPatch(conversation, patch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('conversation id mismatch');
  });

  it('maps in_progress and resolved statuses onto open/closed', () => {
    const conversation = createConversation();
    const inProgress = applyConversationPatch(conversation, {
      id: conversationId,
      status: 'in_progress',
    });
    expect(inProgress.ok).toBe(true);
    if (inProgress.ok) expect(inProgress.conversation.status).toBe('open');

    const resolved = applyConversationPatch(conversation, {
      id: conversationId,
      status: 'resolved',
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.conversation.status).toBe('closed');
  });

  it('fails when the patch contains an unsupported frontend status', () => {
    const conversation = createConversation();
    const patch = {
      id: conversationId,
      status: 'archived' as never,
    };

    const result = applyConversationPatch(conversation, patch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('unsupported status');
  });
});

describe('applyTicketPatch', () => {
  it('merges ticketPatch into ticket detail and keeps conversation parity', () => {
    const conversation = createConversation();
    const ticket = makeTicket(conversation);
    const patch = {
      id: conversationId,
      status: 'IN_PROGRESS' as const,
      priority: 'URGENT' as const,
      assignedUserId: '550e8400-e29b-41d4-a716-446655440003',
      departmentSlug: 'obras-publicas',
      updatedAt: '2026-06-27T13:00:00.000Z',
    };

    const result = applyTicketPatch(ticket, patch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ticket.status).toBe('IN_PROGRESS');
    expect(result.ticket.priority).toBe('URGENT');
    expect(result.ticket.assignedUserId).toBe(patch.assignedUserId);
    expect(result.ticket.departmentSlug).toBe('obras-publicas');
    expect(result.ticket.updatedAt).toBe('2026-06-27T13:00:00.000Z');
    expect(result.ticket._rawDetail.assignedDept).toBe('obras-publicas');
    expect(result.ticket._rawDetail.assignedUserId).toBe(patch.assignedUserId);
  });

  it('fails when ticketPatch id does not match the ticket id', () => {
    const conversation = createConversation();
    const ticket = makeTicket(conversation);
    const patch = {
      id: '550e8400-e29b-41d4-a716-446655440999',
      status: 'CLOSED' as const,
    };

    const result = applyTicketPatch(ticket, patch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('ticket id mismatch');
  });

  it('applies when ticket id differs from conversation id (real event shape)', () => {
    const conversation = createConversation();
    const ticket: TicketDetailDto = {
      ...makeTicket(conversation),
      id: '550e8400-e29b-41d4-a716-446655440010',
    };
    const patch = {
      id: ticket.id,
      status: 'CLOSED' as const,
    };

    const result = applyTicketPatch(ticket, patch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ticket.status).toBe('CLOSED');
  });
});

describe('tryApplyRealtimePatch', () => {
  const basePayload = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    correlationId: 'corr-1',
    schemaVersion: REALTIME_DURABLE_SCHEMA_VERSION,
    eventType: 'message.created',
    socketEventName: 'conversation.message.new' as const,
    occurredAt: '2026-06-27T12:00:00.000Z',
    source: 'message.service',
    conversationId,
  };

  it('applies a message patch for conversation.message.new', () => {
    const conversation = createConversation();
    const messages: MessageWithStatusesDto[] = [];
    const payload = {
      ...basePayload,
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId,
        body: 'hello',
        direction: 'inbound' as const,
        messageType: 'text',
        createdAt: '2026-06-27T12:00:00.000Z',
      },
    };

    const result = tryApplyRealtimePatch({
      event: 'conversation.message.new',
      payload,
      conversationId,
      conversation,
      messages,
    });

    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.messages).toHaveLength(1);
    expect(result.messages?.[0].body).toBe('hello');
  });

  it('applies a conversation patch for conversation.updated', () => {
    const conversation = createConversation();
    const payload = {
      ...basePayload,
      eventType: 'conversation.updated',
      socketEventName: 'conversation.updated' as const,
      conversationPatch: {
        id: conversationId,
        status: 'closed' as const,
        updatedAt: '2026-06-27T13:00:00.000Z',
      },
    };

    const result = tryApplyRealtimePatch({
      event: 'conversation.updated',
      payload,
      conversationId,
      conversation,
      messages: [],
    });

    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.conversation?.status).toBe('closed');
  });

  it('falls back on schema mismatch', () => {
    const result = tryApplyRealtimePatch({
      event: 'conversation.message.new',
      payload: { conversationId },
      conversationId,
      conversation: createConversation(),
      messages: [],
    });

    expect(result.applied).toBe(false);
    if (result.applied) return;
    expect(result.reason).toBe('schema_mismatch');
  });

  it('falls back when durable eventType is not part of the contract', () => {
    const payload = {
      ...basePayload,
      eventType: 'unknown.event',
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId,
        body: 'hello',
        createdAt: '2026-06-27T12:00:00.000Z',
      },
    };

    const result = tryApplyRealtimePatch({
      event: 'conversation.message.new',
      payload,
      conversationId,
      conversation: createConversation(),
      messages: [],
    });

    expect(result.applied).toBe(false);
    if (result.applied) return;
    expect(result.reason).toBe('schema_mismatch');
  });

  it('falls back when the payload conversationId does not match', () => {
    const payload = {
      ...basePayload,
      conversationId: '550e8400-e29b-41d4-a716-446655440999',
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId: '550e8400-e29b-41d4-a716-446655440999',
        body: 'hello',
        createdAt: '2026-06-27T12:00:00.000Z',
      },
    };

    const result = tryApplyRealtimePatch({
      event: 'conversation.message.new',
      payload,
      conversationId,
      conversation: createConversation(),
      messages: [],
    });

    expect(result.applied).toBe(false);
    if (result.applied) return;
    expect(result.reason).toBe('conversation_id_mismatch');
  });

  it('falls back when the conversation is not loaded', () => {
    const payload = {
      ...basePayload,
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId,
        body: 'hello',
        createdAt: '2026-06-27T12:00:00.000Z',
      },
    };

    const result = tryApplyRealtimePatch({
      event: 'conversation.message.new',
      payload,
      conversationId,
      conversation: undefined,
      messages: [],
    });

    expect(result.applied).toBe(false);
    if (result.applied) return;
    expect(result.reason).toBe('conversation_not_loaded');
  });

  it('falls back on a patch conflict', () => {
    const conversation = createConversation();
    const payload = {
      ...basePayload,
      conversationPatch: {
        id: '550e8400-e29b-41d4-a716-446655440999',
        status: 'closed' as const,
      },
    };

    const result = tryApplyRealtimePatch({
      event: 'conversation.updated',
      payload,
      conversationId,
      conversation,
      messages: [],
    });

    expect(result.applied).toBe(false);
    if (result.applied) return;
    expect(result.reason).toContain('patch_conflict');
  });

  it('applies a valid ticket patch without forcing REST refetch', () => {
    const conversation = createConversation();
    const ticket: TicketDetailDto = makeTicket(conversation);
    const payload = {
      ...basePayload,
      eventType: 'ticket.assigned',
      socketEventName: 'conversation.updated' as const,
      ticketPatch: {
        id: conversationId,
        assignedUserId: '550e8400-e29b-41d4-a716-446655440003',
      },
    };

    const result = tryApplyRealtimePatch({
      event: 'conversation.updated',
      payload,
      conversationId,
      conversation,
      messages: [],
      ticket,
    });

    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.ticket?.assignedUserId).toBe('550e8400-e29b-41d4-a716-446655440003');
  });

  it('falls back when ticket patch exists but ticket is not loaded', () => {
    const payload = {
      ...basePayload,
      eventType: 'ticket.assigned',
      socketEventName: 'conversation.updated' as const,
      ticketPatch: {
        id: conversationId,
        assignedUserId: '550e8400-e29b-41d4-a716-446655440003',
      },
    };

    const result = tryApplyRealtimePatch({
      event: 'conversation.updated',
      payload,
      conversationId,
      conversation: createConversation(),
      messages: [],
      ticket: undefined,
    });

    expect(result.applied).toBe(false);
    if (result.applied) return;
    expect(result.reason).toBe('ticket_not_loaded');
  });

  it('applies a message status patch for message.status.changed', () => {
    const messageId = '550e8400-e29b-41d4-a716-446655440002';
    const messages = [createMessage(messageId, 'hello', '2026-06-27T12:00:00.000Z')];
    const payload = {
      ...basePayload,
      eventType: 'message.status.changed',
      socketEventName: 'message.status.changed' as const,
      messageStatusPatch: {
        messageId,
        providerMessageId: 'wamid.HBgL123',
        status: 'delivered' as const,
        timestamp: '2026-06-27T12:05:00.000Z',
      },
    };

    const result = tryApplyRealtimePatch({
      event: 'message.status.changed',
      payload,
      conversationId,
      conversation: createConversation(),
      messages,
    });

    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.messages?.[0].statuses).toHaveLength(1);
  });
});
