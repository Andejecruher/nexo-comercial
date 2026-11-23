import { describe, expect, it } from '@jest/globals';
import {
  classifyEvent,
  CriticalEventType,
  EphemeralEventType,
  RealtimeDurableEventSchema,
  SocketEventName,
} from '../../../services/realtime/realtime-event.contracts';

describe('RealtimeDurableEventSchema', () => {
  const validEvent = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    correlationId: 'corr-123',
    schemaVersion: 1,
    eventType: CriticalEventType.MessageCreated,
    socketEventName: SocketEventName.ConversationMessageNew,
    occurredAt: new Date().toISOString(),
    source: 'message.service',
    conversationId: '550e8400-e29b-41d4-a716-446655440001',
    messagePatch: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      body: 'Hello',
      direction: 'inbound',
      createdAt: new Date().toISOString(),
    },
  };

  it('accepts a valid critical event with all required fields', () => {
    const result = RealtimeDurableEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eventId).toBe(validEvent.eventId);
      expect(result.data.schemaVersion).toBe(1);
      expect(result.data.socketEventName).toBe(SocketEventName.ConversationMessageNew);
    }
  });

  it('accepts a valid event with only required fields', () => {
    const minimal = {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: 'corr-123',
      schemaVersion: 1,
      eventType: CriticalEventType.ConversationUpdated,
      socketEventName: SocketEventName.ConversationUpdated,
      occurredAt: new Date().toISOString(),
      source: 'conversations.service',
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
    };

    const result = RealtimeDurableEventSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('rejects a missing required field', () => {
    const { eventId: _eventId, ...withoutEventId } = validEvent;
    const result = RealtimeDurableEventSchema.safeParse(withoutEventId);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('eventId');
    }
  });

  it('rejects an invalid schemaVersion', () => {
    const result = RealtimeDurableEventSchema.safeParse({ ...validEvent, schemaVersion: 2 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('schemaVersion');
    }
  });

  it('rejects an unknown socket event name', () => {
    const result = RealtimeDurableEventSchema.safeParse({
      ...validEvent,
      socketEventName: 'conversation.unknown',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('socketEventName');
    }
  });

  it('rejects a non-ISO occurredAt timestamp', () => {
    const result = RealtimeDurableEventSchema.safeParse({
      ...validEvent,
      occurredAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('occurredAt');
    }
  });

  it('rejects an invalid UUID in a known field', () => {
    const result = RealtimeDurableEventSchema.safeParse({
      ...validEvent,
      eventId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('eventId');
    }
  });

  it('accepts notificationPatch carrying communicationLineId', () => {
    const communicationLineId = '550e8400-e29b-41d4-a716-4466554400aa';
    const withLine = {
      ...validEvent,
      notificationPatch: {
        type: 'message.received',
        conversationId: validEvent.conversationId,
        communicationLineId,
      },
    };

    const result = RealtimeDurableEventSchema.safeParse(withLine);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notificationPatch?.communicationLineId).toBe(communicationLineId);
    }
  });

  it('rejects notificationPatch.communicationLineId that is not a UUID', () => {
    const withBadLine = {
      ...validEvent,
      notificationPatch: {
        type: 'message.received',
        communicationLineId: '529661234567',
      },
    };

    const result = RealtimeDurableEventSchema.safeParse(withBadLine);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('notificationPatch.communicationLineId');
    }
  });

  it('accepts valid conversation and ticket patches', () => {
    const withPatches = {
      ...validEvent,
      eventType: CriticalEventType.ConversationUpdated,
      socketEventName: SocketEventName.ConversationUpdated,
      conversationPatch: {
        id: validEvent.conversationId,
        status: 'open',
        assignedUserId: '550e8400-e29b-41d4-a716-446655440003',
        updatedAt: new Date().toISOString(),
      },
      ticketPatch: {
        id: '550e8400-e29b-41d4-a716-446655440004',
        status: 'OPEN',
        priority: 'HIGH',
      },
    };

    const result = RealtimeDurableEventSchema.safeParse(withPatches);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conversationPatch).toEqual(withPatches.conversationPatch);
      expect(result.data.ticketPatch).toEqual(withPatches.ticketPatch);
    }
  });

  it('rejects a patch with an invalid enum value', () => {
    const withBadPatch = {
      ...validEvent,
      conversationPatch: {
        id: validEvent.conversationId,
        status: 'invalid_status',
      },
    };

    const result = RealtimeDurableEventSchema.safeParse(withBadPatch);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('conversationPatch.status');
    }
  });
});

describe('classifyEvent', () => {
  it('classifies all critical event types as critical', () => {
    expect(classifyEvent(CriticalEventType.MessageCreated)).toBe('critical');
    expect(classifyEvent(CriticalEventType.MessageUpdated)).toBe('critical');
    expect(classifyEvent(CriticalEventType.ConversationUpdated)).toBe('critical');
    expect(classifyEvent(CriticalEventType.ConversationHandover)).toBe('critical');
    expect(classifyEvent(CriticalEventType.TicketCreated)).toBe('critical');
    expect(classifyEvent(CriticalEventType.TicketClosed)).toBe('critical');
    expect(classifyEvent(CriticalEventType.TicketReopened)).toBe('critical');
    expect(classifyEvent(CriticalEventType.TicketAssigned)).toBe('critical');
    expect(classifyEvent(CriticalEventType.AdminNotification)).toBe('critical');
  });

  it('classifies all ephemeral event types as ephemeral', () => {
    expect(classifyEvent(EphemeralEventType.ConversationTyping)).toBe('ephemeral');
    expect(classifyEvent(EphemeralEventType.AiStreamChunk)).toBe('ephemeral');
    expect(classifyEvent(EphemeralEventType.AiStreamDone)).toBe('ephemeral');
    expect(classifyEvent(EphemeralEventType.PresenceUpdate)).toBe('ephemeral');
  });

  it('throws for unregistered event types', () => {
    expect(() => classifyEvent('custom.event')).toThrow(
      'Unknown realtime event type: custom.event',
    );
  });
});

describe('SocketEventName', () => {
  it('preserves existing frontend event names', () => {
    expect(SocketEventName.AdminNotification).toBe('admin.notification');
    expect(SocketEventName.ConversationMessageNew).toBe('conversation.message.new');
    expect(SocketEventName.ConversationUpdated).toBe('conversation.updated');
    expect(SocketEventName.ConversationHandover).toBe('conversation.handover');
    expect(SocketEventName.ConversationTyping).toBe('conversation.typing');
    expect(SocketEventName.PresenceUpdate).toBe('presence.update');
  });
});

describe('ConversationRealtimeAction and inboxPatch', () => {
  it('accepts a conversation.updated event with action and inboxPatch', () => {
    const result = RealtimeDurableEventSchema.safeParse({
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: 'corr-123',
      schemaVersion: 1,
      eventType: CriticalEventType.ConversationUpdated,
      socketEventName: SocketEventName.ConversationUpdated,
      occurredAt: new Date().toISOString(),
      source: 'conversations.service',
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      action: 'transfer',
      inboxPatch: {
        lastMessagePreview: 'Transferida a obras',
        lastMessageAt: new Date().toISOString(),
        inboxStatus: 'active',
        assignedDept: 'obras',
        unreadDelta: 0,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe('transfer');
      expect(result.data.inboxPatch?.assignedDept).toBe('obras');
    }
  });
});
