import type {
  NotificationEventKey,
  UserNotificationPreferences,
} from '@/stores/use-notification-preferences-store';

export interface NormalizedNotificationEvent {
  eventType: NotificationEventKey;
  conversationId?: string;
  ticketId?: string;
  /** UUID interno de la línea receptora (communication_lines.id). */
  communicationLineId?: string;
  departmentSlug?: string;
  departmentId?: string;
  contactName?: string;
  messagePreview?: string;
}

export interface NotifyDecision {
  sound: boolean;
  toast: boolean;
}

/**
 * Decide qué canales de un evento deben entregarse según las preferencias del
 * usuario. El alcance de notificaciones y el filtro de conversaciones ahora son
 * el mismo dato: `preferences.scope.departmentIds`. Un array vacío equivale a
 * "todas las áreas".
 *
 * NOTA: `preferences.scope.agentIds` se persiste y valida en el backend (alcance
 * de agentes IA), pero el filtrado en tiempo real todavía es solo por
 * departamento: los eventos realtime no portean el agente que atendió la
 * conversación. El filtrado por agente requiere portear el agente en el evento
 * y aplicar `agentIds` acá — trabajo de dominio pendiente (PR aparte).
 *
 * Reglas aplicadas en orden:
 * 1. Master switch apagado -> nada.
 * 2. Evento desconocido o ambos canales apagados -> nada.
 * 3. Canal global apagado -> ese canal queda apagado aunque el evento lo pida.
 * 4. Sin restricción de alcance (departmentIds vacío) -> entregar canales restantes.
 * 5. Evento sin departamento pero hay restricción -> nada.
 * 6. Si el departamento del evento no está en el alcance -> nada.
 */
export function shouldNotify(
  event: NormalizedNotificationEvent,
  preferences: UserNotificationPreferences,
): NotifyDecision {
  const decision: NotifyDecision = { sound: false, toast: false };

  if (!preferences.enabled) return decision;

  const eventPrefs = preferences.events[event.eventType];
  if (!eventPrefs) return decision;

  if (preferences.soundEnabled && eventPrefs.sound) {
    decision.sound = true;
  }
  if (preferences.toastEnabled && eventPrefs.toast) {
    decision.toast = true;
  }

  if (!decision.sound && !decision.toast) return decision;

  const scopeIds = preferences.scope.departmentIds;
  if (scopeIds.length === 0) {
    return decision;
  }

  if (!event.departmentId) {
    return { sound: false, toast: false };
  }

  if (!scopeIds.includes(event.departmentId)) {
    return { sound: false, toast: false };
  }

  return decision;
}
