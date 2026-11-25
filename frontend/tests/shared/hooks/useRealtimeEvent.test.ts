import { renderHook } from '@testing-library/react';
import { EventRouter } from '@/lib/shared/realtime/event-router';
import type { RealtimeManager } from '@/lib/shared/realtime/realtime-manager';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealtimeEvent } from '@/hooks/shared/useRealtimeEvent';

const managerRef = vi.hoisted(() => ({ current: undefined as RealtimeManager | undefined }));

vi.mock('@/components/shared/providers/realtime-provider', () => ({
  useRealtimeManager: () => managerRef.current,
}));

function payloadWith(conversationId: string) {
  return { conversationId, text: 'hi' };
}

describe('useRealtimeEvent', () => {
  let router: EventRouter;

  beforeEach(() => {
    router = new EventRouter();
    managerRef.current = { router } as unknown as RealtimeManager;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers on mount and unregisters on unmount (no stale consumers)', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useRealtimeEvent(['conversation.updated'], handler));

    router.dispatch('conversation.updated', payloadWith('conv-1'));
    expect(handler).toHaveBeenCalledTimes(1);

    unmount();
    router.dispatch('conversation.updated', payloadWith('conv-1'));
    expect(handler).toHaveBeenCalledTimes(1); // still 1 — the consumer died with the component
  });

  it('delivers event name and payload to the handler', () => {
    const handler = vi.fn();
    renderHook(() => useRealtimeEvent(['conversation.message.new'], handler));

    const payload = payloadWith('conv-1');
    router.dispatch('conversation.message.new', payload);

    expect(handler).toHaveBeenCalledWith('conversation.message.new', payload);
  });

  it('ignores events outside the subscription list', () => {
    const handler = vi.fn();
    renderHook(() => useRealtimeEvent(['conversation.typing'], handler));

    router.dispatch('conversation.updated', payloadWith('conv-1'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('filters delivery by conversationId when provided', () => {
    const handler = vi.fn();
    renderHook(() =>
      useRealtimeEvent(['conversation.updated'], handler, { conversationId: 'conv-1' }),
    );

    router.dispatch('conversation.updated', payloadWith('conv-2'));
    expect(handler).not.toHaveBeenCalled();

    router.dispatch('conversation.updated', payloadWith('conv-1'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('uses the latest handler without re-registering', () => {
    const first = vi.fn();
    const second = vi.fn();
    const registerSpy = vi.spyOn(router, 'register');

    const { rerender } = renderHook(
      ({ handler }) => useRealtimeEvent(['conversation.updated'], handler),
      { initialProps: { handler: first } },
    );

    rerender({ handler: second });

    // One registration for the whole lifecycle — the consumer id is stable.
    expect(registerSpy).toHaveBeenCalledTimes(1);

    router.dispatch('conversation.updated', payloadWith('conv-1'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('re-registers when the event list changes', () => {
    const handler = vi.fn();
    const { rerender } = renderHook(({ events }) => useRealtimeEvent(events, handler), {
      initialProps: { events: ['conversation.updated'] },
    });

    rerender({ events: ['conversation.typing'] });

    router.dispatch('conversation.updated', payloadWith('conv-1'));
    expect(handler).not.toHaveBeenCalled();

    router.dispatch('conversation.typing', payloadWith('conv-1'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no manager is available', () => {
    managerRef.current = undefined;
    const handler = vi.fn();

    expect(() =>
      renderHook(() => useRealtimeEvent(['conversation.updated'], handler)),
    ).not.toThrow();
  });

  it('survives a mount → unmount → mount cycle (Strict Mode shape)', () => {
    const handler = vi.fn();
    const first = renderHook(() => useRealtimeEvent(['conversation.updated'], handler));
    first.unmount();

    const second = renderHook(() => useRealtimeEvent(['conversation.updated'], handler));

    router.dispatch('conversation.updated', payloadWith('conv-1'));
    expect(handler).toHaveBeenCalledTimes(1);

    second.unmount();
    router.dispatch('conversation.updated', payloadWith('conv-1'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
