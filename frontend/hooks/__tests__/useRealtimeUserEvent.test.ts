import { renderHook } from '@testing-library/react';
import { EventRouter } from '@/lib/realtime/event-router';
import { RealtimeUserEvent } from '@/lib/realtime/realtime-user-events';
import type { RealtimeManager } from '@/lib/realtime/realtime-manager';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealtimeUserEvent } from '../useRealtimeUserEvent';

const managerRef = vi.hoisted(() => ({ current: undefined as RealtimeManager | undefined }));

vi.mock('@/components/providers/realtime-provider', () => ({
  useRealtimeManager: () => managerRef.current,
}));

describe('useRealtimeUserEvent', () => {
  let router: EventRouter;

  beforeEach(() => {
    router = new EventRouter();
    managerRef.current = { router } as unknown as RealtimeManager;
  });

  it('delivers payloads dispatched under the semantic id', () => {
    const handler = vi.fn();
    renderHook(() => useRealtimeUserEvent(RealtimeUserEvent.CIERRE_TICKET, handler));

    const payload = { conversationId: 'conv-1', eventType: 'ticket.closed' };
    router.dispatch(RealtimeUserEvent.CIERRE_TICKET, payload);

    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('does not fire for other semantic ids', () => {
    const handler = vi.fn();
    renderHook(() => useRealtimeUserEvent(RealtimeUserEvent.NUEVO_TICKET, handler));

    router.dispatch(RealtimeUserEvent.CIERRE_TICKET, { conversationId: 'conv-1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('scopes delivery by conversationId when provided', () => {
    const handler = vi.fn();
    renderHook(() =>
      useRealtimeUserEvent(RealtimeUserEvent.TRANSFERENCIA_TICKET, handler, {
        conversationId: 'conv-1',
      }),
    );

    router.dispatch(RealtimeUserEvent.TRANSFERENCIA_TICKET, { conversationId: 'conv-2' });
    expect(handler).not.toHaveBeenCalled();

    router.dispatch(RealtimeUserEvent.TRANSFERENCIA_TICKET, { conversationId: 'conv-1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
