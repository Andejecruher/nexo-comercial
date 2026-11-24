import type { InboxConversation } from '@/lib/shared/messaging-api';
import { describe, expect, it } from 'vitest';
import { applyInboxEvent } from '@/lib/shared/realtime/inbox-sync';

const CONVERSATION_ID = '550e8400-e29b-41d4-a716-446655440001';

function chat(overrides: Partial<InboxConversation> = {}): InboxConversation {
  return {
    id: CONVERSATION_ID,
    citizen: {
      id: 'cit-1',
      name: 'María',
      phone: '9661234567',
      colonia: 'Centro',
      interests: [],
      registeredAt: '2026-09-20T18:00:00.000Z',
    },
    inboxStatus: 'active',
    conversationStatus: 'open',
    lastMessage: 'Hola',
    lastTime: '12:00',
    unread: 1,
    updatedAt: '2026-09-20T18:00:00.000Z',
    canClose: true,
    ...overrides,
  };
}

describe('applyInboxEvent', () => {
  it('updates last message, increments unread and reorders to the top', () => {
    const older = chat({ id: 'other', lastMessage: 'viejo' });
    const result = applyInboxEvent({
      conversations: [older, chat()],
      conversationId: CONVERSATION_ID,
      action: 'message',
      inboxPatch: {
        lastMessagePreview: 'Nuevo mensaje',
        lastMessageAt: '2026-09-23T18:00:00.000Z',
        unreadDelta: 1,
      },
      filters: { inboxStatus: 'active' },
    });

    expect(result.conversations[0]?.id).toBe(CONVERSATION_ID);
    expect(result.conversations[0]?.lastMessage).toBe('Nuevo mensaje');
    expect(result.conversations[0]?.unread).toBe(2);
    expect(result.needsRefetch).toBe(false);
  });

  it('does not increment unread for the selected conversation', () => {
    const result = applyInboxEvent({
      conversations: [chat({ unread: 3 })],
      conversationId: CONVERSATION_ID,
      action: 'message',
      inboxPatch: { unreadDelta: 1, lastMessagePreview: 'ping' },
      selectedId: CONVERSATION_ID,
      filters: { inboxStatus: 'active' },
    });

    expect(result.conversations[0]?.unread).toBe(0);
  });

  it('removes a closed conversation from the active filter', () => {
    const result = applyInboxEvent({
      conversations: [chat()],
      conversationId: CONVERSATION_ID,
      action: 'close',
      inboxPatch: { inboxStatus: 'inactive', status: 'closed' },
      filters: { inboxStatus: 'active' },
    });

    expect(result.conversations).toHaveLength(0);
    expect(result.removedId).toBe(CONVERSATION_ID);
  });

  it('requests a refetch when the conversation is not on the current page', () => {
    const result = applyInboxEvent({
      conversations: [chat({ id: 'other' })],
      conversationId: CONVERSATION_ID,
      action: 'message',
      inboxPatch: { lastMessagePreview: 'hola' },
      filters: { inboxStatus: 'active' },
    });

    expect(result.needsRefetch).toBe(true);
    expect(result.conversations).toHaveLength(1);
  });

  it('requests a refetch after a transfer of a listed conversation', () => {
    const result = applyInboxEvent({
      conversations: [chat()],
      conversationId: CONVERSATION_ID,
      action: 'transfer',
      inboxPatch: { assignedUserId: 'agent-2', assignedUserName: 'Ana' },
      filters: { inboxStatus: 'active' },
    });

    expect(result.needsRefetch).toBe(true);
    expect(result.conversations[0]?.assignedUserId).toBe('agent-2');
  });
});
