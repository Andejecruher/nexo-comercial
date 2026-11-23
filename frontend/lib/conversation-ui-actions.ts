/**
 * Reglas de UI para acciones de conversación: FSM + rol + asignación.
 * No reemplaza validación del servidor.
 */

import {
  canCloseFromState,
  canHandoverToHuman,
  canReopenFromState,
  type ConversationFlowState,
} from '@/lib/conversation-fsm';
import type { ConversationStatus } from '@/lib/conversations-api';

export interface ConversationActionContext {
  flowState: ConversationFlowState;
  status: ConversationStatus;
  assignedUserId: string | undefined;
  currentUserId: string | undefined;
  isSupervisor: boolean;
}

export interface ConversationActionFlags {
  canAssignSelf: boolean;
  canAssignOther: boolean;
  canTransfer: boolean;
  canHandover: boolean;
  canClose: boolean;
  canReopen: boolean;
  canSendMessage: boolean;
}

function isMineOrUnassigned(
  assignedUserId: string | undefined,
  currentUserId: string | undefined,
): boolean {
  if (!assignedUserId) return true;
  if (!currentUserId) return false;
  return assignedUserId === currentUserId;
}

export function getConversationActionFlags(
  ctx: ConversationActionContext,
): ConversationActionFlags {
  const { flowState, status, assignedUserId, currentUserId, isSupervisor } = ctx;

  const closedFlow = flowState === 'CLOSED';
  const openConv = status === 'open';

  const canOperateAsAgent = isSupervisor || isMineOrUnassigned(assignedUserId, currentUserId);

  const canAssignSelf =
    openConv &&
    !closedFlow &&
    canOperateAsAgent &&
    Boolean(currentUserId) &&
    (isSupervisor || !assignedUserId || assignedUserId === currentUserId);

  const canAssignOther = isSupervisor && openConv && !closedFlow;

  const canTransfer = isSupervisor && openConv && !closedFlow;

  const canHandover =
    openConv &&
    canHandoverToHuman(flowState) &&
    Boolean(currentUserId) &&
    (isSupervisor || isMineOrUnassigned(assignedUserId, currentUserId));

  const canClose = openConv && canCloseFromState(flowState) && (isSupervisor || canOperateAsAgent);

  const canReopen = canReopenFromState(flowState) && isSupervisor;

  const canSendMessage =
    openConv &&
    flowState !== 'CLOSED' &&
    (isSupervisor || isMineOrUnassigned(assignedUserId, currentUserId));

  return {
    canAssignSelf,
    canAssignOther,
    canTransfer,
    canHandover,
    canClose,
    canReopen,
    canSendMessage,
  };
}
