'use client';

import { useRealtimeManager } from '@/components/shared/providers/realtime-provider';
import { useEffect, useRef } from 'react';

export interface UseRealtimeEventOptions {
  /** Restricts delivery to a single conversation (room) when provided. */
  conversationId?: string;
}

type RealtimeEventHandler = (event: string, payload: unknown) => void;

let consumerSeq = 0;

/**
 * Generic pub/sub subscription over the RealtimeManager router.
 *
 * Leak-safety contract:
 * - Registers on mount, unregisters on unmount — the consumer dies with the
 *   component, so the router map never accumulates stale entries.
 * - The handler is kept in a ref: replacing it never re-registers the
 *   consumer, so callbacks always see fresh closures without resubscribing.
 * - Survives React Strict Mode double-invocation (register → unregister →
 *   register) because each effect instance owns a unique consumer id.
 */
export function useRealtimeEvent(
  events: string[],
  handler: RealtimeEventHandler,
  options: UseRealtimeEventOptions = {},
): void {
  const manager = useRealtimeManager();
  const handlerRef = useRef(handler);

  // Keep the ref fresh without re-registering the consumer on every render.
  // Assigned inside an effect (never during render) per react-hooks/refs.
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const { conversationId } = options;
  const eventKey = events.join(',');

  useEffect(() => {
    if (!manager) return;

    const consumerId = `useRealtimeEvent:${eventKey}:${++consumerSeq}`;

    manager.router.register({
      id: consumerId,
      conversationId,
      events: eventKey.split(',').filter(Boolean),
      handler: (event, payload) => handlerRef.current(event, payload),
    });

    return () => {
      manager.router.unregister(consumerId);
    };
  }, [manager, eventKey, conversationId]);
}
