import { normalizeNotificationEvent } from '@/lib/notifications/normalize-event';
import { RealtimeUserEvent } from '@/lib/realtime/realtime-user-events';
import { describe, expect, it } from 'vitest';

const conversationId = '550e8400-e29b-41d4-a716-446655440001';
const communicationLineId = '550e8400-e29b-41d4-a716-4466554400aa';
const slugToId = () => undefined;

describe('normalizeNotificationEvent — communicationLineId', () => {
  it('lee la línea desde el raíz de una admin notification', () => {
    const normalized = normalizeNotificationEvent(
      RealtimeUserEvent.NUEVO_MENSAJE,
      {
        type: 'message.received',
        conversationId,
        occurredAt: '2026-10-07T17:22:00.000Z',
        communicationLineId,
      },
      slugToId,
    );

    expect(normalized?.communicationLineId).toBe(communicationLineId);
  });

  it('lee la línea desde notificationPatch de un evento durable', () => {
    const normalized = normalizeNotificationEvent(
      RealtimeUserEvent.NUEVO_TICKET,
      {
        eventId: '550e8400-e29b-41d4-a716-4466554400bb',
        correlationId: 'corr-1',
        schemaVersion: 1,
        eventType: 'ticket.created',
        socketEventName: 'conversation.updated',
        occurredAt: '2026-10-07T17:22:00.000Z',
        source: 'ticket.service',
        conversationId,
        action: 'message',
        notificationPatch: {
          type: 'ticket.created',
          conversationId,
          communicationLineId,
        },
      },
      slugToId,
    );

    expect(normalized?.communicationLineId).toBe(communicationLineId);
  });

  it('tolera payloads antiguos sin línea y devuelve undefined', () => {
    const normalized = normalizeNotificationEvent(
      RealtimeUserEvent.NUEVO_MENSAJE,
      {
        type: 'message.received',
        conversationId,
        occurredAt: '2026-10-07T17:22:00.000Z',
      },
      slugToId,
    );

    expect(normalized?.communicationLineId).toBeUndefined();
  });
});
