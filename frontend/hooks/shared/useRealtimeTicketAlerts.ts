'use client';

import { useRealtimeUserEvent } from '@/hooks/shared/useRealtimeUserEvent';
import {
  RealtimeUserEvent,
  type RealtimeUserEventPayload,
} from '@/lib/shared/realtime/realtime-user-events';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';

const TICKET_DETAIL_PREFIX = '/admin/tickets/';
const NEW_TICKET_TOAST_MS = 6_000;

function isOnTicketDetail(pathname: string, conversationId: string): boolean {
  return (
    pathname === `${TICKET_DETAIL_PREFIX}${conversationId}` ||
    pathname.startsWith(`${TICKET_DETAIL_PREFIX}${conversationId}/`)
  );
}

function readDepartmentSlug(payload: RealtimeUserEventPayload): string | undefined {
  if ('conversationPatch' in payload) {
    return payload.conversationPatch?.assignedDept ?? undefined;
  }
  if ('notificationPatch' in payload) {
    return payload.notificationPatch?.departmentSlug;
  }
  return undefined;
}

function readContactName(payload: RealtimeUserEventPayload): string | undefined {
  if ('notificationPatch' in payload) {
    return payload.notificationPatch?.contactName;
  }
  if ('inboxPatch' in payload) {
    return payload.inboxPatch?.citizenName;
  }
  return undefined;
}

/**
 * Global realtime ticket alerts. Mounted once (like the sound layer) inside the
 * admin layout, next to the socket provider.
 *
 * - Nuevo ticket: transient informational toast.
 * - Cierre de ticket: sticky toast (duration: Infinity) that only disappears
 *   when the user dismisses it — the agent must acknowledge the closure.
 * - Asignación/transferencia a departamento: sticky toast (duration: Infinity)
 *   so a department handover is never missed.
 *
 * A toast is suppressed while the user is already on that ticket's detail view
 * (they can see the state directly), avoiding stale persisted alerts. Each
 * event carries a fixed Sonner id per conversation, so replays and repeats
 * update the existing toast instead of stacking duplicates.
 */
export function useRealtimeTicketAlerts(): void {
  const router = useRouter();
  const pathname = usePathname();

  useRealtimeUserEvent(RealtimeUserEvent.NUEVO_TICKET, (payload) => {
    const conversationId = payload.conversationId;
    if (!conversationId || isOnTicketDetail(pathname, conversationId)) return;

    const contactName = readContactName(payload);
    toast.info('Nuevo ticket recibido', {
      id: `ticket-open-${conversationId}`,
      duration: NEW_TICKET_TOAST_MS,
      description: contactName
        ? `${contactName} inició una nueva conversación.`
        : 'Hay una nueva conversación por atender.',
      action: {
        label: 'Ver ticket',
        onClick: () => router.push(`${TICKET_DETAIL_PREFIX}${conversationId}`),
      },
    });
  });

  useRealtimeUserEvent(RealtimeUserEvent.CIERRE_TICKET, (payload) => {
    const conversationId = payload.conversationId;
    if (!conversationId || isOnTicketDetail(pathname, conversationId)) return;

    toast.success('Ticket cerrado', {
      id: `ticket-close-${conversationId}`,
      duration: Infinity,
      description: 'El ticket fue cerrado. Confirmá con el ciudadano si precisa seguimiento.',
      action: {
        label: 'Ver ticket',
        onClick: () => router.push(`${TICKET_DETAIL_PREFIX}${conversationId}`),
      },
    });
  });

  useRealtimeUserEvent(RealtimeUserEvent.TRANSFERENCIA_TICKET, (payload) => {
    const conversationId = payload.conversationId;
    if (!conversationId || isOnTicketDetail(pathname, conversationId)) return;

    const departmentSlug = readDepartmentSlug(payload);
    toast.warning(
      departmentSlug
        ? `Ticket asignado al departamento ${departmentSlug}`
        : 'Ticket asignado a un departamento',
      {
        id: `ticket-transfer-${conversationId}`,
        duration: Infinity,
        description:
          'La conversación queda a cargo del flujo del departamento. Revisá el ticket para darle seguimiento.',
        action: {
          label: 'Ver ticket',
          onClick: () => router.push(`${TICKET_DETAIL_PREFIX}${conversationId}`),
        },
      },
    );
  });
}
