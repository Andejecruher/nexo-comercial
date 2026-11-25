'use client';

import { useRealtimeUserEvent } from '@/hooks/shared/useRealtimeUserEvent';
import {
  RealtimeUserEvent,
  type RealtimeUserEventPayload,
} from '@/lib/shared/realtime/realtime-user-events';
import { useState } from 'react';

/**
 * Example consumer: reacts to NUEVO_TICKET semantic events. Unmount-safe —
 * the subscription dies with the component. Pass { conversationId } to scope
 * delivery to a single conversation.
 */
export function NuevoTicketAlert() {
  const [count, setCount] = useState(0);
  const [lastContact, setLastContact] = useState<string | undefined>();

  useRealtimeUserEvent(RealtimeUserEvent.NUEVO_TICKET, (payload: RealtimeUserEventPayload) => {
    setCount((c) => c + 1);
    const record = payload as Record<string, unknown>;
    setLastContact(typeof record.contactName === 'string' ? record.contactName : undefined);
  });

  if (count === 0) {
    return <p className="text-xs text-muted-foreground">Esperando tickets nuevos…</p>;
  }

  return (
    <div role="status" aria-live="polite" className="text-sm font-semibold">
      {count} ticket{count === 1 ? '' : 's'} nuevo{count === 1 ? '' : 's'}
      {lastContact ? <span className="text-muted-foreground"> — último: {lastContact}</span> : null}
    </div>
  );
}
