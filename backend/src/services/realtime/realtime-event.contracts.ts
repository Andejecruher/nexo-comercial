import { z } from 'zod';

/**
 * Socket.IO event names preserved for frontend compatibility.
 * These names MUST NOT change without a coordinated frontend migration.
 */
export const SocketEventName = {
  AdminNotification: 'admin.notification',
  ConversationMessageNew: 'conversation.message.new',
  ConversationUpdated: 'conversation.updated',
  ConversationHandover: 'conversation.handover',
  ConversationTyping: 'conversation.typing',
  PresenceUpdate: 'presence.update',
  MessageStatusChanged: 'message.status.changed',
} as const;

export type SocketEventName = (typeof SocketEventName)[keyof typeof SocketEventName];

export const SocketEventNameSchema = z.enum([
  'admin.notification',
  'conversation.message.new',
  'conversation.updated',
  'conversation.handover',
  'conversation.typing',
  'presence.update',
  'message.status.changed',
]);

/**
 * Domain action encoded on durable conversation.updated events so the inbox
 * can apply last-message, transfer, and close patches without extra socket names.
 */
export const ConversationRealtimeAction = {
  Message: 'message',
  Assign: 'assign',
  Transfer: 'transfer',
  Close: 'close',
  Reopen: 'reopen',
  Handover: 'handover',
} as const;

export type ConversationRealtimeAction =
  (typeof ConversationRealtimeAction)[keyof typeof ConversationRealtimeAction];

export const ConversationRealtimeActionSchema = z.enum([
  'message',
  'assign',
  'transfer',
  'close',
  'reopen',
  'handover',
]);

/**
 * Event types that MUST be persisted to the durable RealtimeOutboxEvent table
 * and relayed through Pub/Sub + Socket.IO with at-least-once semantics.
 */
export const CriticalEventType = {
  MessageCreated: 'message.created',
  MessageUpdated: 'message.updated',
  MessageStatusChanged: 'message.status.changed',
  ConversationUpdated: 'conversation.updated',
  ConversationHandover: 'conversation.handover',
  TicketCreated: 'ticket.created',
  TicketClosed: 'ticket.closed',
  TicketReopened: 'ticket.reopened',
  TicketAssigned: 'ticket.assigned',
  AdminNotification: 'admin.notification',
} as const;

export type CriticalEventType = (typeof CriticalEventType)[keyof typeof CriticalEventType];

/**
 * Event types that bypass the Outbox and are published directly to Pub/Sub.
 * Delivery is best-effort; consumers tolerate dropped or duplicate events.
 */
export const EphemeralEventType = {
  ConversationTyping: 'conversation.typing',
  AiStreamChunk: 'conversation.ai.chunk',
  AiStreamDone: 'conversation.ai.done',
  PresenceUpdate: 'presence.update',
} as const;

export type EphemeralEventType = (typeof EphemeralEventType)[keyof typeof EphemeralEventType];

export const REALTIME_SCHEMA_VERSION = 1 as const;

const MessageSenderPatchSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().nullable(),
  email: z.string(),
});

const MessagePatchSchema = z.object({
  meta: z.record(z.string(), z.json()).optional(),
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  ticketId: z.string().uuid().optional(),
  body: z.string(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  messageType: z.string().optional(),
  externalMessageId: z.string().optional(),
  sendByUserId: z.string().uuid().optional(),
  sender: MessageSenderPatchSchema.optional(),
  createdAt: z.string().datetime(),
});

export const MessageStatusValueSchema = z.enum(['sent', 'delivered', 'read', 'failed']);

const MessageStatusPatchSchema = z.object({
  messageId: z.string().uuid(),
  providerMessageId: z.string().min(1),
  status: MessageStatusValueSchema,
  timestamp: z.string().datetime(),
});

const ConversationMetaPatchSchema = z.object({
  lockedByUserId: z.string().uuid().nullable().optional(),
  lockedAt: z.string().datetime().nullable().optional(),
  departmentSlug: z.string().nullable().optional(),
  handoverAt: z.string().datetime().nullable().optional(),
  handoffKind: z.string().nullable().optional(),
});

const ConversationPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  assignedDept: z.string().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  flowState: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
  meta: ConversationMetaPatchSchema.optional(),
});

const TicketPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedUserId: z.string().uuid().optional(),
  departmentSlug: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
});

const InboxPatchSchema = z.object({
  lastMessagePreview: z.string().nullable().optional(),
  lastMessageAt: z.string().datetime().nullable().optional(),
  lastMessageDirection: z.enum(['inbound', 'outbound']).optional(),
  inboxStatus: z.enum(['active', 'inactive']).optional(),
  unreadDelta: z.number().int().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  assignedUserName: z.string().nullable().optional(),
  assignedDept: z.string().nullable().optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  flowState: z.string().optional(),
  citizenName: z.string().optional(),
  citizenPhone: z.string().optional(),
});

const NotificationPatchSchema = z.object({
  type: z.string(),
  title: z.string().optional(),
  body: z.string().optional(),
  conversationId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  /** Human-readable contact name (citizen name or phone if name is absent) */
  contactName: z.string().optional(),
  /** E164-formatted phone number of the citizen */
  phone: z.string().optional(),
  /** Truncated preview of the message text (max 120 chars) */
  messagePreview: z.string().optional(),
  /** Conversation flow state at the time of the event */
  flowState: z.string().optional(),
  /** Channel the conversation is on (e.g. 'whatsapp') */
  channel: z.string().optional(),
  /** Ticket priority if available ('LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') */
  priority: z.string().optional(),
  /** Department slug the conversation belongs to or is being transferred to */
  departmentSlug: z.string().optional(),
  /** UUID of the user assigned to the conversation */
  assignedUserId: z.string().uuid().optional(),
  /**
   * Internal UUID of the receiving phone line (`communication_lines.id`, stored
   * as `conversation_meta.communicationLineId`). Never the phone number. Lets
   * the inbox open the line filter without deriving it from message content.
   */
  communicationLineId: z.string().uuid().optional(),
});

export const RealtimeDurableEventSchema = z.object({
  communicationLineId: z.string().uuid().optional(),
  eventId: z.string().uuid(),
  notificationPersisted: z.boolean().optional(),
  conversationVersion: z.number().int().nonnegative().optional(),
  correlationId: z.string().min(1),
  schemaVersion: z.literal(REALTIME_SCHEMA_VERSION),
  eventType: z.string(),
  socketEventName: SocketEventNameSchema,
  occurredAt: z.string().datetime(),
  source: z.string().min(1),
  conversationId: z.string().uuid(),
  action: ConversationRealtimeActionSchema.optional(),
  messagePatch: MessagePatchSchema.optional(),
  messageStatusPatch: MessageStatusPatchSchema.optional(),
  conversationPatch: ConversationPatchSchema.optional(),
  ticketPatch: TicketPatchSchema.optional(),
  notificationPatch: NotificationPatchSchema.optional(),
  inboxPatch: InboxPatchSchema.optional(),
});

export type RealtimeDurableEvent = z.infer<typeof RealtimeDurableEventSchema>;
export type RealtimeInboxPatch = NonNullable<RealtimeDurableEvent['inboxPatch']>;
export type RealtimeMessageStatusPatch = NonNullable<RealtimeDurableEvent['messageStatusPatch']>;

/**
 * Ephemeral events bypass the Outbox and are published directly to Pub/Sub.
 * They carry only enough routing metadata for the subscriber to emit them
 * through the correct Socket.IO room and event name.
 */
export const RealtimeEphemeralEventSchema = z.object({
  eventType: z.string(),
  socketEventName: SocketEventNameSchema,
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type RealtimeEphemeralEvent = z.infer<typeof RealtimeEphemeralEventSchema>;

export type EventClassification = 'critical' | 'ephemeral';

/**
 * Classify a realtime event type as critical (durable Outbox) or ephemeral
 * (direct Pub/Sub publish). Throws for unknown types to fail fast and avoid
 * silently mis-routing events.
 */
export function classifyEvent(eventType: string): EventClassification {
  const criticalValues = Object.values(CriticalEventType);
  if (criticalValues.includes(eventType as CriticalEventType)) {
    return 'critical';
  }

  const ephemeralValues = Object.values(EphemeralEventType);
  if (ephemeralValues.includes(eventType as EphemeralEventType)) {
    return 'ephemeral';
  }

  throw new Error(`Unknown realtime event type: ${eventType}`);
}

/**
 * Convenience guard for critical events.
 */
export function isCriticalEvent(eventType: string): boolean {
  try {
    return classifyEvent(eventType) === 'critical';
  } catch {
    return false;
  }
}

/**
 * Convenience guard for ephemeral events.
 */
export function isEphemeralEvent(eventType: string): boolean {
  try {
    return classifyEvent(eventType) === 'ephemeral';
  } catch {
    return false;
  }
}

export function isRealtimeDurableEvent(event: unknown): event is RealtimeDurableEvent {
  return RealtimeDurableEventSchema.safeParse(event).success;
}

export function isRealtimeEphemeralEvent(event: unknown): event is RealtimeEphemeralEvent {
  return RealtimeEphemeralEventSchema.safeParse(event).success;
}
