import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/api-client', () => ({
  apiClient: { post: vi.fn() },
}));

import { apiClient } from '@/lib/shared/api-client';
import {
  isTicketLifecyclePayload,
  reportRealtimeTelemetry,
  reportTicketLifecycle,
} from '@/lib/shared/realtime/telemetry';

const mockPost = apiClient.post as ReturnType<typeof vi.fn>;

const CONVERSATION_ID = '550e8400-e29b-41d4-a716-446655440001';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440010';
const EVENT_ID_APPLIED = '550e8400-e29b-41d4-a716-446655440011';

function durableLifecycle(overrides: Record<string, unknown> = {}) {
  return {
    eventId: EVENT_ID,
    correlationId: 'corr-1',
    schemaVersion: 1 as const,
    eventType: 'ticket.closed',
    socketEventName: 'conversation.updated',
    occurredAt: '2026-06-27T12:00:00.000Z',
    source: 'conversations.service',
    conversationId: CONVERSATION_ID,
    ...overrides,
  };
}

beforeEach(() => {
  mockPost.mockClear();
});

describe('isTicketLifecyclePayload', () => {
  it('clasifica eventType ticket.closed', () => {
    expect(isTicketLifecyclePayload(durableLifecycle())).toBe('ticket.closed');
  });

  it('clasifica eventType ticket.created', () => {
    expect(isTicketLifecyclePayload(durableLifecycle({ eventType: 'ticket.created' }))).toBe(
      'ticket.created',
    );
  });

  it('clasifica eventType conversation.handover', () => {
    expect(isTicketLifecyclePayload(durableLifecycle({ eventType: 'conversation.handover' }))).toBe(
      'conversation.handover',
    );
  });

  it('clasifica action transfer como ticket.transferred', () => {
    expect(
      isTicketLifecyclePayload(
        durableLifecycle({ eventType: 'conversation.updated', action: 'transfer' }),
      ),
    ).toBe('ticket.transferred');
  });

  it('clasifica action close como ticket.closed', () => {
    expect(
      isTicketLifecyclePayload(
        durableLifecycle({ eventType: 'conversation.updated', action: 'close' }),
      ),
    ).toBe('ticket.closed');
  });

  it('clasifica eventos de mensajería para medir latencia', () => {
    expect(isTicketLifecyclePayload(durableLifecycle({ eventType: 'message.created' }))).toBe(
      'message.created',
    );
  });

  it('devuelve null para payloads no durables', () => {
    expect(isTicketLifecyclePayload({ hello: 'world' })).toBeNull();
  });
});

describe('reportRealtimeTelemetry', () => {
  it('publica un beacon al backend', () => {
    reportRealtimeTelemetry({
      eventType: 'ticket.closed',
      status: 'received',
      conversationId: CONVERSATION_ID,
      eventId: EVENT_ID,
      socketEventName: 'conversation.updated',
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/realtime/telemetry', {
      eventType: 'ticket.closed',
      status: 'received',
      conversationId: CONVERSATION_ID,
      eventId: EVENT_ID,
      socketEventName: 'conversation.updated',
    });
  });

  it('deduplica el mismo eventId+status en una sesión', () => {
    const input = {
      eventType: 'ticket.closed' as const,
      status: 'applied' as const,
      eventId: EVENT_ID,
    };

    reportRealtimeTelemetry(input);
    reportRealtimeTelemetry(input);

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('omite eventos sin eventId', () => {
    reportRealtimeTelemetry({
      eventType: 'ticket.closed',
      status: 'received',
      conversationId: CONVERSATION_ID,
    });

    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('reportTicketLifecycle', () => {
  it('reports applied messages as well as ticket lifecycle with correlation timestamps', () => {
    reportTicketLifecycle(
      durableLifecycle({ eventType: 'ticket.closed', eventId: EVENT_ID_APPLIED }),
      'applied',
    );
    reportTicketLifecycle(
      durableLifecycle({
        eventType: 'message.created',
        eventId: '550e8400-e29b-41d4-a716-446655440012',
      }),
      'applied',
    );
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost).toHaveBeenCalledWith(
      '/realtime/telemetry',
      expect.objectContaining({
        eventType: 'message.created',
        status: 'applied',
        correlationId: expect.any(String),
        browserTimestamp: expect.any(String),
        occurredAt: expect.any(String),
      }),
    );
  });
});
