import {
  formatRelativeShort,
  type InboxConversation,
  type InboxStatus,
} from '@/lib/shared/messaging-api';
import type { ConversationRealtimeAction, RealtimeInboxPatch } from '@/lib/shared/realtime/types';

const REFETCH_ACTIONS = new Set<ConversationRealtimeAction>([
  'assign',
  'transfer',
  'handover',
  'reopen',
]);

export interface InboxListSnapshot {
  conversations: InboxConversation[];
  needsRefetch: boolean;
  removedId?: string;
}

export interface ApplyInboxEventInput {
  conversations: InboxConversation[];
  conversationId: string;
  action?: string;
  inboxPatch?: RealtimeInboxPatch;
  selectedId?: string;
  filters: {
    inboxStatus: InboxStatus;
    departmentIds?: string[];
    communicationLineId?: string;
  };
  departmentSlugById?: Record<string, string>;
}

export function applyInboxEvent(input: ApplyInboxEventInput): InboxListSnapshot {
  const { conversations, conversationId, action, inboxPatch, selectedId, filters } = input;
  const index = conversations.findIndex((item) => item.id === conversationId);
  const typedAction = action as ConversationRealtimeAction | undefined;

  if (index < 0) {
    return { conversations, needsRefetch: true };
  }

  const current = conversations[index];
  const next = applyInboxPatchToConversation(current, inboxPatch, selectedId === conversationId);

  if (shouldDropFromFilter(next, typedAction, filters, input.departmentSlugById)) {
    return {
      conversations: conversations.filter((item) => item.id !== conversationId),
      needsRefetch: false,
      removedId: conversationId,
    };
  }

  const without = conversations.filter((item) => item.id !== conversationId);
  const reordered =
    typedAction === 'message' || Boolean(inboxPatch?.lastMessageAt)
      ? [next, ...without]
      : [...without.slice(0, index), next, ...without.slice(index)];

  return {
    conversations: reordered,
    needsRefetch: typedAction !== undefined && REFETCH_ACTIONS.has(typedAction),
  };
}

export function applyInboxPatchToConversation(
  current: InboxConversation,
  patch: RealtimeInboxPatch | undefined,
  isSelected: boolean,
): InboxConversation {
  if (!patch) return current;

  const conversationClosed =
    patch.status === 'closed' || patch.flowState === 'CLOSED' || patch.inboxStatus === 'inactive';
  const unreadDelta = patch.unreadDelta ?? 0;
  const lastMessageAt = patch.lastMessageAt ?? undefined;

  return {
    ...current,
    lastMessage: patch.lastMessagePreview?.trim() || current.lastMessage,
    lastTime: lastMessageAt ? formatRelativeShort(lastMessageAt) : current.lastTime,
    updatedAt: lastMessageAt ?? current.updatedAt,
    unread: isSelected ? 0 : Math.max(0, current.unread + unreadDelta),
    inboxStatus: patch.inboxStatus ?? (conversationClosed ? 'inactive' : current.inboxStatus),
    conversationStatus: patch.status ?? current.conversationStatus,
    assignedUserId:
      patch.assignedUserId === undefined
        ? current.assignedUserId
        : (patch.assignedUserId ?? undefined),
    assignedUserName:
      patch.assignedUserName === undefined
        ? current.assignedUserName
        : (patch.assignedUserName ?? undefined),
    departmentSlug:
      patch.assignedDept === undefined ? current.departmentSlug : (patch.assignedDept ?? undefined),
    canClose: conversationClosed ? false : current.canClose,
    citizen: {
      ...current.citizen,
      ...(patch.citizenName ? { name: patch.citizenName } : {}),
      ...(patch.citizenPhone ? { phone: patch.citizenPhone } : {}),
    },
  };
}

function shouldDropFromFilter(
  conversation: InboxConversation,
  action: ConversationRealtimeAction | undefined,
  filters: ApplyInboxEventInput['filters'],
  departmentSlugById?: Record<string, string>,
): boolean {
  if (conversation.inboxStatus !== filters.inboxStatus) return true;
  if (action === 'close' && filters.inboxStatus === 'active') return true;
  if (action === 'reopen' && filters.inboxStatus === 'inactive') return true;

  if (filters.departmentIds && filters.departmentIds.length > 0) {
    const allowedSlugs = new Set(
      filters.departmentIds
        .map((id) => departmentSlugById?.[id])
        .filter((slug): slug is string => Boolean(slug)),
    );
    if (allowedSlugs.size > 0 && conversation.departmentSlug) {
      return !allowedSlugs.has(conversation.departmentSlug);
    }
  }

  if (filters.communicationLineId && conversation.communicationLineId) {
    return conversation.communicationLineId !== filters.communicationLineId;
  }

  return false;
}
