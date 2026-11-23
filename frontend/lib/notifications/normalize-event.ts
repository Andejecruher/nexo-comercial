import {
  RealtimeUserEvent,
  type RealtimeUserEventId,
  type RealtimeUserEventPayload,
} from '@/lib/realtime/realtime-user-events';
import { isAdminNotificationPayload } from '@/lib/realtime/types';
import type { NotificationEventKey } from '@/stores/use-notification-preferences-store';
import type { NormalizedNotificationEvent } from './should-notify';

const EVENT_KEY_MAP: Record<RealtimeUserEventId, NotificationEventKey> = {
  [RealtimeUserEvent.NUEVO_MENSAJE]: 'newMessage',
  [RealtimeUserEvent.CIERRE_TICKET]: 'ticketClosed',
  [RealtimeUserEvent.TRANSFERENCIA_TICKET]: 'departmentTransfer',
  [RealtimeUserEvent.NUEVO_TICKET]: 'newMessage',
};

function readDepartmentSlug(
  eventId: RealtimeUserEventId,
  payload: RealtimeUserEventPayload,
): string | undefined {
  if (eventId === RealtimeUserEvent.NUEVO_MENSAJE) {
    if (isAdminNotificationPayload(payload)) {
      return payload.departmentSlug;
    }
    return undefined;
  }

  if (eventId === RealtimeUserEvent.TRANSFERENCIA_TICKET) {
    if ('notificationPatch' in payload && payload.notificationPatch?.departmentSlug) {
      return payload.notificationPatch.departmentSlug;
    }
    if ('conversationPatch' in payload && payload.conversationPatch?.assignedDept) {
      return payload.conversationPatch.assignedDept;
    }
    return undefined;
  }

  if (eventId === RealtimeUserEvent.CIERRE_TICKET) {
    if ('notificationPatch' in payload && payload.notificationPatch?.departmentSlug) {
      return payload.notificationPatch.departmentSlug;
    }
    if ('ticketPatch' in payload && payload.ticketPatch?.departmentSlug) {
      return payload.ticketPatch.departmentSlug;
    }
    return undefined;
  }

  if (eventId === RealtimeUserEvent.NUEVO_TICKET) {
    if ('notificationPatch' in payload && payload.notificationPatch?.departmentSlug) {
      return payload.notificationPatch.departmentSlug;
    }
    return undefined;
  }

  return undefined;
}

function readConversationId(payload: RealtimeUserEventPayload): string | undefined {
  if ('conversationId' in payload && typeof payload.conversationId === 'string') {
    return payload.conversationId;
  }
  return undefined;
}

/**
 * Línea telefónica receptora (UUID interno). En admin notifications viaja en
 * el raíz del payload; en eventos durable vive en `notificationPatch`.
 */
function readCommunicationLineId(payload: RealtimeUserEventPayload): string | undefined {
  if (isAdminNotificationPayload(payload) && payload.communicationLineId) {
    return payload.communicationLineId;
  }
  if ('notificationPatch' in payload && payload.notificationPatch?.communicationLineId) {
    return payload.notificationPatch.communicationLineId;
  }
  return undefined;
}

/**
 * Convierte un evento semántico en un documento plano con el departamento
 * resuelto preferentemente por destino (transferencia) o por el ticket/mensaje.
 */
export function normalizeNotificationEvent(
  eventId: RealtimeUserEventId,
  payload: RealtimeUserEventPayload,
  slugToId: (slug: string) => string | undefined,
): NormalizedNotificationEvent | undefined {
  const eventType = EVENT_KEY_MAP[eventId];
  if (!eventType) return undefined;

  const departmentSlug = readDepartmentSlug(eventId, payload);
  const departmentId = departmentSlug ? slugToId(departmentSlug) : undefined;

  let contactName: string | undefined;
  let messagePreview: string | undefined;

  if (isAdminNotificationPayload(payload)) {
    contactName = payload.contactName;
    messagePreview = payload.messagePreview;
  } else if ('notificationPatch' in payload && payload.notificationPatch) {
    contactName = payload.notificationPatch.contactName ?? undefined;
    messagePreview = payload.notificationPatch.messagePreview ?? undefined;
  }

  return {
    eventType,
    conversationId: readConversationId(payload),
    communicationLineId: readCommunicationLineId(payload),
    ticketId: isAdminNotificationPayload(payload)
      ? payload.ticketId
      : (payload.ticketPatch?.id ?? payload.notificationPatch?.ticketId),
    departmentSlug,
    departmentId,
    contactName,
    messagePreview,
  };
}
