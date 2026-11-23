/**
 * Event Bus interno — implementación liviana usando Node.js EventEmitter.
 * Permite desacoplar componentes sin dependencia externa.
 *
 * Eventos principales:
 * - message.received     → nuevo mensaje inbound persistido
 * - message.status       → status de entrega (sent/delivered/read/failed)
 * - conversation.handover → cambio de estado BOT→HUMAN o viceversa
 * - outbox.enqueued      → nuevo evento outbound encolado
 */
import { EventEmitter } from 'events';
import type { RealtimeDurableEvent } from '../realtime/realtime-event.contracts';
import { ConversationFlowState, WaInboundMessage, WaStatus } from '../../types/whatsapp.types';

// ─── Tipos de eventos ─────────────────────────────────────────────────────────

export interface MessageReceivedEvent {
  wamid: string;
  phone: string;
  conversationId: string;
  citizenId: string;
  message: WaInboundMessage;
  correlationId: string;
}

export interface MessageStatusEvent {
  wamid: string;
  status: WaStatus['status'];
  phone: string;
  errorCode?: number;
  errorTitle?: string;
}

export interface ConversationHandoverEvent {
  conversationId: string;
  fromState: ConversationFlowState;
  toState: ConversationFlowState;
  triggeredBy: 'bot' | 'user' | 'agent' | 'system';
  agentId?: string;
  departmentSlug?: string;
  correlationId?: string;
}

export interface OutboxEnqueuedEvent {
  outboxId: string;
  phone: string;
  correlationId: string;
}

export interface MessageCreatedEvent {
  messageId: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  messageType: string;
  body: string;
  createdAt: string;
  externalMessageId?: string;
}

export interface ConversationTypingEvent {
  conversationId: string;
  /** true = activar indicador de escritura; false = desactivar */
  typing: boolean;
  /** TTL en ms: si el cliente no recibe 'false' antes de este tiempo, desactiva solo */
  ttlMs: number;
}

export interface ConversationUpdatedEvent {
  conversationId: string;
  action: 'state-transition' | 'assign' | 'transfer' | 'handover' | 'close' | 'reopen' | 'message';
  flowState?: ConversationFlowState;
  status?: 'open' | 'closed';
  triggeredBy?: 'bot' | 'user' | 'agent' | 'system';
  actorId?: string;
  occurredAt: string;
}

// ─── Tipos del mapa de eventos ────────────────────────────────────────────────

export type EventMap = {
  'message.received': MessageReceivedEvent;
  'message.status': MessageStatusEvent;
  'message.created': MessageCreatedEvent;
  'conversation.updated': ConversationUpdatedEvent;
  'conversation.handover': ConversationHandoverEvent;
  'conversation.typing': ConversationTypingEvent;
  'outbox.enqueued': OutboxEnqueuedEvent;
  /**
   * Envelope durable de cambio de status de entrega. En el puente legacy
   * (`REALTIME_DURABLE_ENABLED=false`) el webhook lo emite por este bus en
   * lugar del Outbox para que el gateway lo enrute a la room de la conversación;
   * el payload que llega al socket es idéntico al del path durable.
   */
  'message.status.changed': RealtimeDurableEvent;
  /**
   * Envelope durable de mutación de un mensaje existente (p. ej. una reacción).
   * Igual que `message.status.changed`, el webhook lo emite por este bus cuando
   * el path durable está deshabilitado, y el payload que llega al socket es
   * idéntico al del Outbox.
   */
  'message.updated': RealtimeDurableEvent;
};

// ─── EventBusService ─────────────────────────────────────────────────────────

export class EventBusService extends EventEmitter {
  /** Emitir un evento tipado */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): boolean {
    return super.emit(event, payload);
  }

  /** Suscribirse a un evento tipado */
  on<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): this {
    return super.on(event, listener);
  }

  /** Suscripción de un solo uso */
  once<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): this {
    return super.once(event, listener);
  }

  /** Desuscribirse */
  off<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): this {
    return super.off(event, listener);
  }
}

/** Singleton del bus de eventos */
export const eventBus = new EventBusService();
// Aumentar límite para evitar warnings en producción con muchos listeners
eventBus.setMaxListeners(50);
