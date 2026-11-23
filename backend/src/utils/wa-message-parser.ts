/**
 * Parser de payloads de webhook de Meta WhatsApp.
 * Extrae y normaliza mensajes, statuses y contactos del payload crudo.
 */
import { WaInboundMessage, WaStatus, WaWebhookPayload } from '../types/whatsapp.types';
import { normalizePhoneForStorage } from './phone-normalizer';

export interface ParsedWebhookMessage {
  wamid: string;
  phone: string; // número del remitente normalizado
  timestamp: string;
  profileName?: string;
  phoneNumberId: string;
  message: WaInboundMessage;
}

export interface ParsedWebhookStatus {
  wamid: string;
  recipientPhone: string;
  status: WaStatus['status'];
  timestamp: string;
  errorCode?: number;
  errorTitle?: string;
}

/**
 * Reacción inbound (type: "reaction").
 *
 * No representa un mensaje propio: es una mutación sobre un mensaje ya
 * persistido (`targetMessageId` es el wamid del mensaje reaccionado).
 * Por eso se parsea aparte de `messages` y nunca crea un mensaje nuevo.
 */
export interface ParsedWebhookReaction {
  /** wamid del evento de reacción — clave de dedupe/auditoría. */
  wamid: string;
  /** wamid del mensaje reaccionado. */
  targetMessageId: string;
  /** Emoji aplicado. Ausente cuando el ciudadano retira su reacción. */
  emoji?: string;
  /** Teléfono del ciudadano que reacciona, normalizado. */
  phone: string;
  timestamp: string;
  phoneNumberId: string;
}

export interface ParsedWebhookResult {
  messages: ParsedWebhookMessage[];
  statuses: ParsedWebhookStatus[];
  reactions: ParsedWebhookReaction[];
  phoneNumberId: string;
  businessAccountId: string;
}

/**
 * Parsea un payload completo del webhook de Meta.
 * Retorna mensajes y statuses separados.
 */
export function parseWebhookPayload(payload: WaWebhookPayload): ParsedWebhookResult {
  const messages: ParsedWebhookMessage[] = [];
  const statuses: ParsedWebhookStatus[] = [];
  const reactions: ParsedWebhookReaction[] = [];
  let phoneNumberId = '';
  const businessAccountId = payload.entry[0]?.id ?? '';

  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    if (!entry || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes ?? []) {
      if (change?.field !== 'messages') continue;

      const value = change?.value;
      if (!value || typeof value !== 'object') continue;
      phoneNumberId = value.metadata?.phone_number_id ?? '';

      // Procesar mensajes inbound
      for (const msg of Array.isArray(value.messages) ? value.messages : []) {
        if (
          !msg ||
          typeof msg.id !== 'string' ||
          typeof msg.from !== 'string' ||
          !/^\d+$/.test(msg.from) ||
          typeof msg.type !== 'string' ||
          !/^\d+$/.test(msg.timestamp)
        )
          continue;

        // Las reacciones NO son mensajes: mutan un mensaje existente y se
        // procesan aparte para no crear un mensaje nuevo en la conversación.
        if (msg.type === 'reaction') {
          const reaction = msg.reaction;
          if (!reaction || typeof reaction.message_id !== 'string') continue;
          const emoji =
            typeof reaction.emoji === 'string' && reaction.emoji.trim().length > 0
              ? reaction.emoji
              : undefined;
          reactions.push({
            wamid: msg.id,
            targetMessageId: reaction.message_id,
            ...(emoji ? { emoji } : {}),
            phone: normalizePhoneForStorage(msg.from),
            timestamp: msg.timestamp,
            phoneNumberId,
          });
          continue;
        }

        const profileName = (Array.isArray(value.contacts) ? value.contacts : []).find(
          (c) => c?.wa_id === msg.from,
        )?.profile?.name;

        messages.push({
          wamid: msg.id,
          phone: normalizePhoneForStorage(msg.from),
          timestamp: msg.timestamp,
          profileName,
          phoneNumberId,
          message: msg,
        });
      }

      // Procesar delivery statuses
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        if (
          !status ||
          typeof status.id !== 'string' ||
          !['sent', 'delivered', 'read', 'failed'].includes(status.status) ||
          !/^\d+$/.test(status.timestamp)
        )
          continue;
        statuses.push({
          wamid: status.id,
          recipientPhone: status.recipient_id,
          status: status.status,
          timestamp: status.timestamp,
          errorCode: status.errors?.[0]?.code,
          errorTitle: status.errors?.[0]?.title,
        });
      }
    }
  }

  return { messages, statuses, reactions, phoneNumberId, businessAccountId };
}

/**
 * Extrae el texto de un mensaje inbound (si aplica).
 */
export function extractMessageText(msg: WaInboundMessage): string | undefined {
  switch (msg.type) {
    case 'text':
      return msg.text?.body;
    case 'image':
      return msg.image?.caption;
    case 'video':
      return msg.video?.caption;
    case 'document':
      return msg.document?.caption;
    case 'contacts':
      return Array.isArray(msg.contacts)
        ? msg.contacts.map((c) => c?.name?.formatted_name ?? '').join(', ')
        : undefined;
    case 'interactive':
      return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title;
    default:
      return undefined;
  }
}

/**
 * Sanitiza el contenido de un mensaje para logs (elimina PII).
 */
export function sanitizeForLog(msg: WaInboundMessage): Record<string, unknown> {
  return {
    type: msg.type,
    id: msg.id,
    from: `${msg.from.slice(0, 5)}****`,
    timestamp: msg.timestamp,
  };
}
