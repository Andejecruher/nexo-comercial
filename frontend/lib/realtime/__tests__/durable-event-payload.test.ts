import { describe, expect, it } from 'vitest';
import {
  isDurableEventPayload,
  REALTIME_DURABLE_SCHEMA_VERSION,
  type RealtimeDurableEventPayload,
} from '../types';

const baseDurablePayload = {
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  correlationId: 'corr-1',
  schemaVersion: REALTIME_DURABLE_SCHEMA_VERSION,
  eventType: 'message.created',
  socketEventName: 'conversation.message.new',
  occurredAt: '2026-06-27T12:00:00.000Z',
  source: 'message.service',
  conversationId: '550e8400-e29b-41d4-a716-446655440001',
} satisfies Partial<RealtimeDurableEventPayload>;

describe('isDurableEventPayload', () => {
  it('accepts a valid durable payload with a message patch', () => {
    const payload: RealtimeDurableEventPayload = {
      ...baseDurablePayload,
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId: baseDurablePayload.conversationId,
        body: 'hello',
        direction: 'inbound',
        messageType: 'text',
        createdAt: '2026-06-27T12:00:00.000Z',
      },
    };

    expect(isDurableEventPayload(payload)).toBe(true);
  });

  it('accepts a valid durable payload with a conversation patch', () => {
    const payload: RealtimeDurableEventPayload = {
      ...baseDurablePayload,
      eventType: 'conversation.updated',
      socketEventName: 'conversation.updated',
      conversationPatch: {
        id: baseDurablePayload.conversationId,
        status: 'open',
        assignedUserId: '550e8400-e29b-41d4-a716-446655440003',
        updatedAt: '2026-06-27T12:00:00.000Z',
      },
    };

    expect(isDurableEventPayload(payload)).toBe(true);
  });

  it('accepts a valid durable payload with a ticket event type', () => {
    const payload: RealtimeDurableEventPayload = {
      ...baseDurablePayload,
      eventType: 'ticket.assigned',
      socketEventName: 'conversation.updated',
      ticketPatch: {
        id: baseDurablePayload.conversationId,
        assignedUserId: '550e8400-e29b-41d4-a716-446655440003',
      },
    };

    expect(isDurableEventPayload(payload)).toBe(true);
  });

  it('accepts action and inboxPatch on conversation.updated', () => {
    const payload: RealtimeDurableEventPayload = {
      ...baseDurablePayload,
      eventType: 'conversation.updated',
      socketEventName: 'conversation.updated',
      action: 'close',
      inboxPatch: {
        inboxStatus: 'inactive',
        status: 'closed',
        unreadDelta: 0,
      },
    };

    expect(isDurableEventPayload(payload)).toBe(true);
  });

  it('accepts a valid durable payload with a message status patch', () => {
    const payload: RealtimeDurableEventPayload = {
      ...baseDurablePayload,
      eventType: 'message.status.changed',
      socketEventName: 'message.status.changed',
      messageStatusPatch: {
        messageId: '550e8400-e29b-41d4-a716-446655440002',
        providerMessageId: 'wamid.HBgL123',
        status: 'delivered',
        timestamp: '2026-06-27T12:00:00.000Z',
      },
    };

    expect(isDurableEventPayload(payload)).toBe(true);
  });

  it('rejects a message status patch with an unknown status', () => {
    const payload = {
      ...baseDurablePayload,
      eventType: 'message.status.changed',
      socketEventName: 'message.status.changed',
      messageStatusPatch: {
        messageId: baseDurablePayload.conversationId,
        providerMessageId: 'wamid.HBgL123',
        status: 'seen',
        timestamp: '2026-06-27T12:00:00.000Z',
      },
    };

    expect(isDurableEventPayload(payload)).toBe(false);
  });

  it('rejects a payload with an unsupported schema version', () => {
    const payload = {
      ...baseDurablePayload,
      schemaVersion: 2,
    };

    expect(isDurableEventPayload(payload)).toBe(false);
  });

  it('rejects a payload with a missing eventId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { eventId, ...payload } = baseDurablePayload;

    expect(isDurableEventPayload(payload)).toBe(false);
  });

  it('rejects a payload with an invalid socket event name', () => {
    const payload = {
      ...baseDurablePayload,
      socketEventName: 'conversation.unknown',
    };

    expect(isDurableEventPayload(payload)).toBe(false);
  });

  it('rejects a payload with an unknown durable eventType', () => {
    const payload = {
      ...baseDurablePayload,
      eventType: 'unknown.event',
    };

    expect(isDurableEventPayload(payload)).toBe(false);
  });

  it('rejects a payload with a malformed message patch', () => {
    const payload = {
      ...baseDurablePayload,
      messagePatch: {
        id: 'not-a-uuid',
        conversationId: baseDurablePayload.conversationId,
        body: 'hello',
        createdAt: 'not-a-date',
      },
    };

    expect(isDurableEventPayload(payload)).toBe(false);
  });

  it('rejects non-object values', () => {
    expect(isDurableEventPayload(null)).toBe(false);
    expect(isDurableEventPayload('string')).toBe(false);
    expect(isDurableEventPayload(42)).toBe(false);
  });
});
