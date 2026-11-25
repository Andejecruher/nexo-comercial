/**
 * Macro-FSM de conversación (alineado con backend/src/config/conversation-states.ts).
 * Solo validación UI; el backend sigue siendo la fuente de verdad.
 */

export type ConversationFlowState =
  | 'BOT_FLOW'
  | 'REGISTERING'
  | 'DEPARTMENT_ROUTING'
  | 'HUMAN_FLOW'
  | 'ESCALATED'
  | 'CLOSED';

/**
 * Espejo exacto de backend/src/config/conversation-states.ts VALID_TRANSITIONS.
 * Cualquier divergencia hace que la UI ofrezca acciones que el backend rechaza.
 */
const VALID_TRANSITIONS: Record<ConversationFlowState, ConversationFlowState[]> = {
  BOT_FLOW: ['REGISTERING', 'DEPARTMENT_ROUTING', 'HUMAN_FLOW', 'ESCALATED', 'CLOSED'],
  REGISTERING: ['BOT_FLOW', 'DEPARTMENT_ROUTING', 'HUMAN_FLOW', 'CLOSED'],
  DEPARTMENT_ROUTING: ['HUMAN_FLOW', 'ESCALATED', 'CLOSED'],
  HUMAN_FLOW: ['DEPARTMENT_ROUTING', 'BOT_FLOW', 'ESCALATED', 'CLOSED'],
  ESCALATED: ['HUMAN_FLOW', 'DEPARTMENT_ROUTING', 'BOT_FLOW', 'CLOSED'],
  CLOSED: ['BOT_FLOW'],
};

export function isValidFlowTransition(
  from: ConversationFlowState,
  to: ConversationFlowState,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canCloseFromState(flowState: ConversationFlowState): boolean {
  return isValidFlowTransition(flowState, 'CLOSED');
}

export function canReopenFromState(flowState: ConversationFlowState): boolean {
  return flowState === 'CLOSED' && isValidFlowTransition('CLOSED', 'BOT_FLOW');
}

/** Handover API fuerza transición a HUMAN_FLOW */
export function canHandoverToHuman(flowState: ConversationFlowState): boolean {
  return flowState !== 'HUMAN_FLOW' && isValidFlowTransition(flowState, 'HUMAN_FLOW');
}

export const FLOW_STATE_LABELS: Record<ConversationFlowState, string> = {
  BOT_FLOW: 'Asistente',
  REGISTERING: 'Registro ciudadano',
  DEPARTMENT_ROUTING: 'Canalizado',
  HUMAN_FLOW: 'En Gestión',
  ESCALATED: 'Escalado',
  CLOSED: 'Caso Resuelto',
};
