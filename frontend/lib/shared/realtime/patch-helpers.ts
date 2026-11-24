import type { ConversationDetailDto, MessageWithStatusesDto } from '@/lib/shared/conversations-api';
import type { ConversationFlowState } from '@/lib/shared/conversation-fsm';
import type { MessageStatusValueApi } from '@/lib/shared/messaging-api';
import { rebaseTicketDetail, type TicketDetailDto } from '@/lib/shared/tickets-api';
import {
  isDurableEventPayload,
  REALTIME_DURABLE_SCHEMA_VERSION,
  type RealtimeConversationPatch,
  type RealtimeMessagePatch,
  type RealtimeMessageStatusPatch,
  type RealtimeTicketPatch,
} from '@/lib/shared/realtime/types';

type ApplyMessagePatchResult =
  | { ok: true; messages: MessageWithStatusesDto[] }
  | { ok: false; reason: string };

type ApplyConversationPatchResult =
  | { ok: true; conversation: ConversationDetailDto }
  | { ok: false; reason: string };

type ApplyTicketPatchResult = { ok: true; ticket: TicketDetailDto } | { ok: false; reason: string };

/** Orden de avance de los estados de entrega de WhatsApp. `failed` es terminal. */
const MESSAGE_STATUS_RANK: Record<MessageStatusValueApi, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

function messageStatusRank(status: string): number {
  return MESSAGE_STATUS_RANK[status as MessageStatusValueApi] ?? 0;
}

/**
 * Aplica un status de entrega a la timeline del mensaje correlacionado.
 * Idempotencia por rango: ignora status iguales o anteriores al máximo ya
 * presente. Correlaciona por id interno o por `externalMessageId` (wamid).
 */
export function applyMessageStatusPatch(
  messages: MessageWithStatusesDto[],
  patch: RealtimeMessageStatusPatch,
  expectedConversationId: string,
): ApplyMessagePatchResult {
  const index = messages.findIndex(
    (m) => m.id === patch.messageId || m.externalMessageId === patch.providerMessageId,
  );
  if (index < 0) {
    return { ok: false, reason: 'message_not_found' };
  }

  const existing = messages[index];
  if (existing.conversationId !== expectedConversationId) {
    return { ok: false, reason: 'messageStatusPatch conversationId mismatch' };
  }

  const statuses = existing.statuses ?? [];
  const maxRank = statuses.reduce(
    (max, status) => Math.max(max, messageStatusRank(status.status)),
    0,
  );
  if (messageStatusRank(patch.status) <= maxRank) {
    return { ok: true, messages };
  }

  const nextStatus = {
    id: `${patch.messageId}:${patch.status}:${patch.timestamp}`,
    messageId: patch.messageId,
    wamid: patch.providerMessageId,
    status: patch.status,
    createdAt: patch.timestamp,
  };

  const patched: MessageWithStatusesDto = {
    ...existing,
    statuses: [...statuses.filter((s) => s.status !== patch.status), nextStatus],
  };

  const next = [...messages];
  next[index] = patched;

  return { ok: true, messages: next };
}

export function applyMessagePatch(
  messages: MessageWithStatusesDto[],
  patch: RealtimeMessagePatch,
  expectedConversationId: string,
): ApplyMessagePatchResult {
  if (patch.conversationId !== expectedConversationId) {
    return { ok: false, reason: 'messagePatch conversationId mismatch' };
  }

  const index = messages.findIndex((m) => m.id === patch.id);
  const existing = index >= 0 ? messages[index] : undefined;

  const patched: MessageWithStatusesDto = {
    id: patch.id,
    conversationId: patch.conversationId,
    body: patch.body,
    direction: patch.direction ?? existing?.direction ?? 'inbound',
    messageType: patch.messageType ?? existing?.messageType ?? 'text',
    externalMessageId: patch.externalMessageId ?? existing?.externalMessageId,
    sendByUserId: patch.sendByUserId ?? existing?.sendByUserId,
    sender: patch.sender ?? existing?.sender,
    meta: patch.meta ?? existing?.meta ?? {},
    createdAt: patch.createdAt,
    statuses: existing?.statuses ?? [],
    attachmentsViaMessageId: existing?.attachmentsViaMessageId ?? [],
  };

  const next = [...messages];
  if (index >= 0) {
    next[index] = patched;
  } else {
    next.push(patched);
  }

  return { ok: true, messages: next.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) };
}

export function applyConversationPatch(
  conversation: ConversationDetailDto,
  patch: RealtimeConversationPatch,
): ApplyConversationPatchResult {
  if (patch.id !== conversation.id) {
    return { ok: false, reason: 'conversation id mismatch' };
  }

  if (
    patch.status !== undefined &&
    patch.status !== 'open' &&
    patch.status !== 'closed' &&
    patch.status !== 'in_progress' &&
    patch.status !== 'resolved'
  ) {
    return { ok: false, reason: `unsupported status: ${patch.status}` };
  }

  const next: ConversationDetailDto = {
    ...conversation,
    ...(patch.status !== undefined && {
      status: patch.status === 'closed' || patch.status === 'resolved' ? 'closed' : 'open',
    }),
    ...(patch.assignedDept !== undefined && { assignedDept: patch.assignedDept }),
    ...(patch.assignedUserId !== undefined && { assignedUserId: patch.assignedUserId }),
    meta: {
      ...conversation.meta,
      ...(patch.flowState !== undefined && { flowState: patch.flowState as ConversationFlowState }),
      ...(patch.meta?.lockedByUserId !== undefined && {
        lockedByUserId: patch.meta.lockedByUserId,
      }),
      ...(patch.meta?.lockedAt !== undefined && { lockedAt: patch.meta.lockedAt }),
      ...(patch.meta?.departmentSlug !== undefined && {
        departmentSlug: patch.meta.departmentSlug,
      }),
      ...(patch.meta?.handoverAt !== undefined && { handoverAt: patch.meta.handoverAt }),
      ...(patch.meta?.handoffKind !== undefined && { handoffKind: patch.meta.handoffKind }),
      ...(patch.updatedAt !== undefined && { updatedAt: patch.updatedAt }),
    },
    ...(patch.updatedAt !== undefined && { updatedAt: patch.updatedAt }),
  };

  return { ok: true, conversation: next };
}

export function applyTicketPatch(
  ticket: TicketDetailDto,
  patch: RealtimeTicketPatch,
): ApplyTicketPatchResult {
  if (patch.id !== ticket.id) {
    return { ok: false, reason: 'ticket id mismatch' };
  }

  const patchedRawDetail: ConversationDetailDto = {
    ...ticket._rawDetail,
    ...(patch.assignedUserId !== undefined && { assignedUserId: patch.assignedUserId }),
    ...(patch.departmentSlug !== undefined && { assignedDept: patch.departmentSlug }),
    ...(patch.updatedAt !== undefined && { updatedAt: patch.updatedAt }),
    ...(patch.status !== undefined && {
      status: patch.status === 'CLOSED' || patch.status === 'RESOLVED' ? 'closed' : 'open',
    }),
    meta: {
      ...ticket._rawDetail.meta,
      ...(patch.departmentSlug !== undefined && { departmentSlug: patch.departmentSlug }),
      ...(patch.updatedAt !== undefined && { updatedAt: patch.updatedAt }),
    },
  };

  // Preserve the real ticket identity (id/folio/conversationId) while refreshing
  // the conversation-derived fields, then overlay the ticket-level patch fields.
  const rebased = rebaseTicketDetail(ticket, patchedRawDetail);

  return {
    ok: true,
    ticket: {
      ...rebased,
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.assignedUserId !== undefined && { assignedUserId: patch.assignedUserId }),
      ...(patch.departmentSlug !== undefined && { departmentSlug: patch.departmentSlug }),
      ...(patch.updatedAt !== undefined && { updatedAt: patch.updatedAt }),
    },
  };
}

export interface TryApplyRealtimePatchInput {
  event: string;
  payload: unknown;
  conversationId: string;
  conversation: ConversationDetailDto | undefined;
  messages: MessageWithStatusesDto[];
  ticket?: TicketDetailDto;
}

export interface RealtimePatchSuccess {
  applied: true;
  conversation?: ConversationDetailDto;
  messages?: MessageWithStatusesDto[];
  ticket?: TicketDetailDto;
}

export interface RealtimePatchFailure {
  applied: false;
  reason: string;
}

export type TryApplyRealtimePatchResult = RealtimePatchSuccess | RealtimePatchFailure;

export function tryApplyRealtimePatch(
  input: TryApplyRealtimePatchInput,
): TryApplyRealtimePatchResult {
  const { event, payload, conversationId, conversation, messages, ticket } = input;

  if (!isDurableEventPayload(payload)) {
    return { applied: false, reason: 'schema_mismatch' };
  }

  if (payload.schemaVersion !== REALTIME_DURABLE_SCHEMA_VERSION) {
    return { applied: false, reason: 'unsupported_schema_version' };
  }

  if (payload.conversationId !== conversationId) {
    return { applied: false, reason: 'conversation_id_mismatch' };
  }

  let nextConversation = conversation;
  let nextMessages = messages;

  switch (event) {
    case 'conversation.message.new': {
      if (!conversation || !payload.messagePatch) {
        return { applied: false, reason: 'conversation_not_loaded' };
      }

      const result = applyMessagePatch(messages, payload.messagePatch, conversationId);
      if (!result.ok) {
        return { applied: false, reason: `patch_conflict: ${result.reason}` };
      }

      nextMessages = result.messages;
      break;
    }

    case 'message.status.changed': {
      if (!payload.messageStatusPatch) {
        return { applied: false, reason: 'message_status_patch_missing' };
      }

      const result = applyMessageStatusPatch(messages, payload.messageStatusPatch, conversationId);
      if (!result.ok) {
        return { applied: false, reason: `patch_conflict: ${result.reason}` };
      }

      nextMessages = result.messages;
      break;
    }

    case 'conversation.updated':
    case 'conversation.handover': {
      if (payload.conversationPatch) {
        if (!conversation) {
          return { applied: false, reason: 'conversation_not_loaded' };
        }

        const result = applyConversationPatch(conversation, payload.conversationPatch);
        if (!result.ok) {
          return { applied: false, reason: `patch_conflict: ${result.reason}` };
        }

        nextConversation = result.conversation;
        break;
      }

      if (!payload.ticketPatch) {
        return { applied: false, reason: 'conversation_not_loaded' };
      }

      break;
    }

    default:
      return { applied: false, reason: 'unsupported_event' };
  }

  let nextTicket: TicketDetailDto | undefined = undefined;

  if (ticket && nextConversation) {
    nextTicket = rebaseTicketDetail(ticket, nextConversation);
  }

  if (payload.ticketPatch) {
    if (!nextTicket) {
      return { applied: false, reason: 'ticket_not_loaded' };
    }

    const ticketResult = applyTicketPatch(nextTicket, payload.ticketPatch);
    if (!ticketResult.ok) {
      return { applied: false, reason: `patch_conflict: ${ticketResult.reason}` };
    }

    nextTicket = ticketResult.ticket;
  }

  return {
    applied: true,
    conversation: nextConversation,
    messages: nextMessages,
    ...(nextTicket && { ticket: nextTicket }),
  };
}
