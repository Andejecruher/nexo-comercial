import { z } from 'zod';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface AdminNotificationPayload {
  eventId?: string;
  ticketId?: string;
  type: 'message.received' | 'conversation.handover';
  conversationId: string;
  occurredAt: string;
  /** Human-readable contact name (citizen name or phone if name is absent) */
  contactName?: string;
  /** E164-formatted phone number of the citizen */
  phone?: string;
  /** Truncated preview of the message text (max 120 chars) */
  messagePreview?: string;
  /** Conversation flow state at the time of the event */
  flowState?: string;
  /** Channel the conversation is on (e.g. 'whatsapp') */
  channel?: string;
  /** Ticket priority if available */
  priority?: string;
  /** Department slug for the conversation or transfer destination */
  departmentSlug?: string;
  /** UUID of the user assigned to the conversation */
  assignedUserId?: string;
  /** Internal UUID of the receiving phone line (communication_lines.id) */
  communicationLineId?: string;
}

export const adminNotificationPayloadSchema = z.object({
  eventId: z.string().optional(),
  ticketId: z.string().optional(),
  type: z.enum(['message.received', 'conversation.handover']),
  conversationId: z.string().min(1),
  occurredAt: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  messagePreview: z.string().optional(),
  flowState: z.string().optional(),
  channel: z.string().optional(),
  priority: z.string().optional(),
  departmentSlug: z.string().optional(),
  assignedUserId: z.string().optional(),
  communicationLineId: z.string().optional(),
});

export function isAdminNotificationPayload(value: unknown): value is AdminNotificationPayload {
  return adminNotificationPayloadSchema.safeParse(value).success;
}

export interface ConversationEventPayload {
  conversationId: string;
  [key: string]: unknown;
}

/**
 * Socket.IO event names preserved for frontend compatibility.
 * These MUST match the backend contract exactly.
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

export const REALTIME_DURABLE_SCHEMA_VERSION = 1 as const;

export const RealtimeDurableEventType = {
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

export type RealtimeDurableEventType =
  (typeof RealtimeDurableEventType)[keyof typeof RealtimeDurableEventType];

const realtimeMessageSenderSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().nullable(),
  email: z.string(),
});

const realtimeMessagePatchSchema = z.object({
  meta: z.record(z.unknown()).optional(),
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  ticketId: z.string().uuid().optional(),
  body: z.string(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  messageType: z.string().optional(),
  externalMessageId: z.string().optional(),
  sendByUserId: z.string().uuid().optional(),
  sender: realtimeMessageSenderSchema.optional(),
  createdAt: z.string().datetime(),
});

const realtimeMessageStatusPatchSchema = z.object({
  messageId: z.string().uuid(),
  providerMessageId: z.string().min(1),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp: z.string().datetime(),
});

const realtimeConversationMetaPatchSchema = z.object({
  lockedByUserId: z.string().uuid().nullable().optional(),
  lockedAt: z.string().datetime().nullable().optional(),
  departmentSlug: z.string().nullable().optional(),
  handoverAt: z.string().datetime().nullable().optional(),
  handoffKind: z.string().nullable().optional(),
});

const realtimeConversationPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['open', 'closed', 'in_progress', 'resolved']).optional(),
  assignedDept: z.string().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  flowState: z.string().optional(),
  meta: realtimeConversationMetaPatchSchema.optional(),
  updatedAt: z.string().datetime().optional(),
});

const realtimeTicketPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedUserId: z.string().uuid().optional(),
  departmentSlug: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
});

const realtimeNotificationPatchSchema = z.object({
  type: z.string(),
  title: z.string().optional(),
  body: z.string().optional(),
  conversationId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  messagePreview: z.string().optional(),
  flowState: z.string().optional(),
  channel: z.string().optional(),
  priority: z.string().optional(),
  departmentSlug: z.string().optional(),
  assignedUserId: z.string().uuid().optional(),
  /** Internal UUID of the receiving phone line (communication_lines.id). */
  communicationLineId: z.string().uuid().optional(),
});

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

const realtimeInboxPatchSchema = z.object({
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

export const presenceUpdatePayloadSchema = z.object({
  userId: z.string().min(1),
  status: z.enum(['online', 'offline']),
  ttlMs: z.number().int().positive().optional(),
  occurredAt: z.string().optional(),
});

export type PresenceUpdatePayload = z.infer<typeof presenceUpdatePayloadSchema>;

export function isPresenceUpdatePayload(value: unknown): value is PresenceUpdatePayload {
  return presenceUpdatePayloadSchema.safeParse(value).success;
}

export const realtimeDurableEventPayloadSchema = z.object({
  communicationLineId: z.string().uuid().optional(),
  eventId: z.string().uuid(),
  conversationVersion: z.number().int().nonnegative().optional(),
  notificationPersisted: z.boolean().optional(),
  correlationId: z.string().min(1),
  schemaVersion: z.literal(REALTIME_DURABLE_SCHEMA_VERSION),
  eventType: z.enum([
    'message.created',
    'message.updated',
    'message.status.changed',
    'conversation.updated',
    'conversation.handover',
    'ticket.created',
    'ticket.closed',
    'ticket.reopened',
    'ticket.assigned',
    'admin.notification',
  ]),
  socketEventName: z.enum([
    'admin.notification',
    'conversation.message.new',
    'conversation.updated',
    'conversation.handover',
    'conversation.typing',
    'presence.update',
    'message.status.changed',
  ]),
  occurredAt: z.string().datetime(),
  source: z.string().min(1),
  conversationId: z.string().uuid(),
  action: z.enum(['message', 'assign', 'transfer', 'close', 'reopen', 'handover']).optional(),
  messagePatch: realtimeMessagePatchSchema.optional(),
  messageStatusPatch: realtimeMessageStatusPatchSchema.optional(),
  conversationPatch: realtimeConversationPatchSchema.optional(),
  ticketPatch: realtimeTicketPatchSchema.optional(),
  notificationPatch: realtimeNotificationPatchSchema.optional(),
  inboxPatch: realtimeInboxPatchSchema.optional(),
});

export type RealtimeMessagePatch = z.infer<typeof realtimeMessagePatchSchema>;
export type RealtimeMessageStatusPatch = z.infer<typeof realtimeMessageStatusPatchSchema>;
export type RealtimeConversationPatch = z.infer<typeof realtimeConversationPatchSchema>;
export type RealtimeTicketPatch = z.infer<typeof realtimeTicketPatchSchema>;
export type RealtimeInboxPatch = z.infer<typeof realtimeInboxPatchSchema>;
export type RealtimeDurableEventPayload = z.infer<typeof realtimeDurableEventPayloadSchema>;

export function isDurableEventPayload(value: unknown): value is RealtimeDurableEventPayload {
  return realtimeDurableEventPayloadSchema.safeParse(value).success;
}

export interface EventConsumer {
  id: string;
  conversationId?: string;
  events: string[];
  handler: (event: string, payload: unknown) => void;
}
