'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { useDepartmentCatalog } from '@/hooks/useDepartmentCatalog';
import { useRealtimeEvent } from '@/hooks/useRealtimeEvent';
import { buildConversationsHref, CONVERSATIONS_PATH } from '@/lib/conversations-navigation';
import { normalizeNotificationEvent } from '@/lib/notifications/normalize-event';
import { shouldNotify } from '@/lib/notifications/should-notify';
import {
  buildEventStableId,
  claimNotificationDelivery,
} from '@/lib/notifications/tab-delivery-coordinator';
import {
  RealtimeUserEvent,
  type RealtimeUserEventId,
  type RealtimeUserEventPayload,
} from '@/lib/realtime/realtime-user-events';
import { realtimeSoundPlayer } from '@/lib/realtime/sound-player';
import { useActiveConversationStore } from '@/stores/use-active-conversation-store';
import {
  useNotificationPreferencesStore,
  type NotificationEventKey,
} from '@/stores/use-notification-preferences-store';
import { useSoundPreferencesStore } from '@/stores/use-sound-preferences-store';

const TICKET_DETAIL_PREFIX = '/admin/tickets/';

const SOUND_EVENT_MAP: Record<NotificationEventKey, RealtimeUserEventId> = {
  newMessage: RealtimeUserEvent.NUEVO_MENSAJE,
  departmentTransfer: RealtimeUserEvent.TRANSFERENCIA_TICKET,
  ticketClosed: RealtimeUserEvent.CIERRE_TICKET,
};

function isOnTicketDetail(pathname: string, ticketId: string | undefined): boolean {
  if (!ticketId) return false;
  return (
    pathname === `${TICKET_DETAIL_PREFIX}${ticketId}` ||
    pathname.startsWith(`${TICKET_DETAIL_PREFIX}${ticketId}/`)
  );
}

/**
 * Evita toasts redundantes cuando el usuario ya tiene abierta esa conversación
 * en la bandeja. La selección activa vive en `useActiveConversationStore`,
 * mantenida por `useAdminInboxConversations`.
 */
function isViewingConversation(pathname: string, conversationId: string | undefined): boolean {
  if (!conversationId || pathname !== CONVERSATIONS_PATH) return false;
  return useActiveConversationStore.getState().activeConversationId === conversationId;
}

function showDesktopNotification(title: string, body: string, tag: string): void {
  const { desktopNotificationsEnabled } = useSoundPreferencesStore.getState();
  if (
    !desktopNotificationsEnabled ||
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    window.Notification.permission !== 'granted' ||
    !document.hidden
  ) {
    return;
  }

  try {
    new window.Notification(title, { body, tag });
  } catch {
    // Las notificaciones del sistema son best-effort.
  }
}

function playEventSound(eventKey: NotificationEventKey): boolean {
  const { muted, volume, events } = useSoundPreferencesStore.getState();
  if (muted) return false;

  const soundEventId = SOUND_EVENT_MAP[eventKey];
  const prefs = events[soundEventId];
  if (!prefs || prefs.muted) return false;

  return realtimeSoundPlayer.play(prefs.sound, volume);
}

/**
 * Dispatcher central de notificaciones realtime.
 *
 * - Normaliza eventos semánticos a un documento común.
 * - Aplica preferencias del usuario + filtro activo de conversaciones.
 * - Ejecuta sonido y toast solo en la pestaña ganadora del coordinador.
 * - Muestra notificación del sistema cuando la pestaña no es visible.
 */
export function useRealtimeNotifications(): void {
  const router = useRouter();
  const pathname = usePathname();
  const { slugToId } = useDepartmentCatalog();
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    void useNotificationPreferencesStore.getState().load();
  }, []);

  const handleEvent = useCallback(
    async (eventId: RealtimeUserEventId, payload: unknown) => {
      const normalized = normalizeNotificationEvent(
        eventId,
        payload as RealtimeUserEventPayload,
        slugToId,
      );
      if (!normalized) return;

      const preferences = useNotificationPreferencesStore.getState().preferences();
      const decision = shouldNotify(normalized, preferences);

      if (!decision.sound && !decision.toast) return;

      const stableId = buildEventStableId(eventId, payload);
      const canDeliver = await claimNotificationDelivery(stableId);
      if (!canDeliver) return;

      if (decision.sound) {
        playEventSound(normalized.eventType);
      }

      if (
        decision.toast &&
        !isViewingConversation(pathname, normalized.conversationId) &&
        !isOnTicketDetail(pathname, normalized.ticketId)
      ) {
        const conversationId = normalized.conversationId ?? 'unknown';
        const handleOpenConversation = () => {
          if (!normalized.conversationId) return;
          const href = buildConversationsHref({
            conversationId: normalized.conversationId,
            communicationLineId: normalized.communicationLineId,
          });
          router.push(href);
        };
        switch (normalized.eventType) {
          case 'newMessage': {
            const description = normalized.contactName
              ? `${normalized.contactName} envió un mensaje nuevo.`
              : 'Tenés un mensaje nuevo.';
            toast.info(
              eventId === RealtimeUserEvent.NUEVO_TICKET
                ? 'Nuevo ticket recibido'
                : 'Nuevo mensaje',
              {
                id: `msg-${conversationId}`,
                duration: 6_000,
                description,
                action: normalized.conversationId
                  ? {
                      label: 'Ver',
                      onClick: handleOpenConversation,
                    }
                  : undefined,
              },
            );
            showDesktopNotification(
              'Nuevo mensaje en Voz Ciudadana',
              description,
              `vc-message-${conversationId}`,
            );
            break;
          }
          case 'departmentTransfer': {
            const description = normalized.departmentSlug
              ? `La conversación pasó al departamento ${normalized.departmentSlug}.`
              : 'La conversación fue transferida a otro departamento.';
            toast.warning('Transferencia de departamento', {
              id: `transfer-${conversationId}`,
              duration: Infinity,
              description,
              action: normalized.conversationId
                ? {
                    label: 'Ver',
                    onClick: handleOpenConversation,
                  }
                : undefined,
            });
            break;
          }
          case 'ticketClosed': {
            toast.success('Ticket cerrado', {
              id: `close-${conversationId}`,
              duration: Infinity,
              description:
                'El ticket fue cerrado. Confirmá con el ciudadano si precisa seguimiento.',
              action: normalized.conversationId
                ? {
                    label: 'Ver',
                    onClick: handleOpenConversation,
                  }
                : undefined,
            });
            break;
          }
        }
      }
    },
    [pathname, router, slugToId],
  );

  useRealtimeEvent(
    [
      RealtimeUserEvent.NUEVO_MENSAJE,
      RealtimeUserEvent.NUEVO_TICKET,
      RealtimeUserEvent.TRANSFERENCIA_TICKET,
      RealtimeUserEvent.CIERRE_TICKET,
    ],
    (event, payload) => {
      void handleEvent(event as RealtimeUserEventId, payload);
    },
  );
}
