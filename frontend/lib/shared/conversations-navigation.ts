/**
 * Rutas y query params canónicos de la bandeja de conversaciones.
 *
 * La bandeja vive en una única vista (`/admin/conversaciones`) dirigida por
 * query params; no existen rutas dinámicas por conversación. Este módulo es la
 * fuente única de verdad para construir esas URL.
 *
 * Query params soportados por el inbox (`useAdminInboxConversations`):
 * - `status`: `active` | `inactive` (estado de la bandeja).
 * - `line`: id de la línea telefónica (`communicationLineId`).
 * - `dept` / `bot_ids` / `search`: filtros adicionales.
 * - `conversation`: id de la conversación a abrir/seleccionar al entrar.
 */
export const CONVERSATIONS_PATH = '/admin/conversaciones';

/** Query param que pide abrir una conversación concreta en la bandeja. */
export const CONVERSATION_OPEN_PARAM = 'conversation';

export type ConversationsHrefStatus = 'active' | 'inactive';

export interface ConversationsHrefOptions {
  /** Conversación a seleccionar al abrir la bandeja. */
  conversationId?: string;
  /** Línea telefónica (`communicationLineId`). */
  communicationLineId?: string;
  /** Estado de la bandeja. Por defecto `active`. */
  status?: ConversationsHrefStatus;
}

/**
 * Construye la URL de la bandeja con los query params que entiende el inbox.
 *
 * La línea no se conoce en el momento del click para la mayoría de eventos de
 * tiempo real: el inbox la deriva al resolver la conversación y la refleja en la
 * URL. Por eso `communicationLineId` es opcional.
 */
export function buildConversationsHref({
  conversationId,
  communicationLineId,
  status = 'active',
}: ConversationsHrefOptions = {}): string {
  const params = new URLSearchParams();
  params.set('status', status);
  if (communicationLineId) params.set('line', communicationLineId);
  if (conversationId) params.set(CONVERSATION_OPEN_PARAM, conversationId);
  return `${CONVERSATIONS_PATH}?${params.toString()}`;
}
