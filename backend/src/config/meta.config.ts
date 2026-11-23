/**
 * Configuración específica de Meta WhatsApp Business Cloud API.
 * Solo contiene constantes globales no sensibles.
 */
export const META_API_VERSION = process.env.META_API_VERSION ?? 'v23.0';
if (!/^v\d+\.0$/.test(META_API_VERSION)) throw new Error('META_API_VERSION inválida');
export const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/** Timeout HTTP por defecto para llamadas a Meta API (ms) */
export const DEFAULT_META_HTTP_TIMEOUT_MS = 10_000;

/** Tiempo de vida de la ventana de conversación activa (24h en segundos) */
export const CONVERSATION_WINDOW_SECONDS = 86_400;

export function buildMetaMessagesUrl(phoneNumberId: string): string {
  return `${META_GRAPH_BASE_URL}/${phoneNumberId}/messages`;
}

export function buildMetaMediaUrl(phoneNumberId: string): string {
  return `${META_GRAPH_BASE_URL}/${phoneNumberId}/media`;
}
