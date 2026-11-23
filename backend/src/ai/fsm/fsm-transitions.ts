/**
 * FSM Transitions — mapa explícito de transiciones de estado producidas por tools.
 *
 * Principio: las tools son el ÚNICO mecanismo de transición de estado.
 * Ninguna respuesta textual de IA puede cambiar el flowState.
 *
 * Transiciones habilitadas:
 *   confirmCitizenRegistration : REGISTERING → CLOSED
 *   assignDepartment           : * → DEPARTMENT_ROUTING
 *   escalateToHuman            : * → ESCALATED
 *   closeConversation          : * → CLOSED
 */
import { VALID_TRANSITIONS } from '../../config/conversation-states';
import { ConversationFlowState } from '../../types/whatsapp.types';

/** Tool keys que pueden producir transiciones de estado */
export type TransitionToolKey =
  | 'confirmCitizenRegistration'
  | 'assignDepartment'
  | 'escalateToHuman'
  | 'closeConversation';

/** Tool keys que pueden producir transiciones de estado (fuente única). */
export const TRANSITION_TOOL_KEYS: ReadonlySet<string> = new Set<TransitionToolKey>([
  'confirmCitizenRegistration',
  'assignDepartment',
  'escalateToHuman',
  'closeConversation',
]);

/** Resultado de evaluar si una tool debe disparar una transición */
export type TransitionResult =
  | { shouldTransition: true; toState: ConversationFlowState; toolKey: TransitionToolKey }
  | { shouldTransition: false };

/**
 * Transiciones de estado fijas por tool.
 * '*' indica que la transición aplica desde cualquier estado.
 */
export const TOOL_TRANSITIONS: Record<
  TransitionToolKey,
  { from: ConversationFlowState[] | '*'; to: ConversationFlowState }
> = {
  confirmCitizenRegistration: {
    from: ['REGISTERING'],
    to: 'CLOSED',
  },
  assignDepartment: {
    from: '*',
    to: 'DEPARTMENT_ROUTING',
  },
  escalateToHuman: {
    from: '*',
    to: 'ESCALATED',
  },
  closeConversation: {
    from: '*',
    to: 'CLOSED',
  },
};

/** Error de transición inválida (no debe propagarse al ciudadano) */
export class InvalidFsmTransitionError extends Error {
  constructor(
    public readonly fromState: ConversationFlowState,
    public readonly toState: ConversationFlowState,
    public readonly toolKey: string,
  ) {
    super(`Transición inválida por tool '${toolKey}': ${fromState} → ${toState}`);
    this.name = 'InvalidFsmTransitionError';
  }
}

/**
 * Determina si una tool debe disparar una transición de estado.
 *
 * @param toolKey     - Key de la tool ejecutada
 * @param currentState - Estado actual de la conversación
 * @returns TransitionResult con la transición a ejecutar (o no)
 */
export function resolveToolTransition(
  toolKey: string,
  currentState: ConversationFlowState,
): TransitionResult {
  const rule = TOOL_TRANSITIONS[toolKey as TransitionToolKey];
  if (!rule) {
    return { shouldTransition: false };
  }

  // Verificar si aplica desde el estado actual
  const fromMatches = rule.from === '*' || rule.from.includes(currentState);
  if (!fromMatches) {
    return { shouldTransition: false };
  }

  return {
    shouldTransition: true,
    toState: rule.to,
    toolKey: toolKey as TransitionToolKey,
  };
}

/**
 * Valida una transición de estado contra el mapa de transiciones válidas.
 * Lanza InvalidFsmTransitionError si no es válida.
 *
 * @param from    - Estado origen
 * @param to      - Estado destino
 * @param toolKey - Tool que disparó la transición (para el error)
 */
export function assertValidTransition(
  from: ConversationFlowState,
  to: ConversationFlowState,
  toolKey: string,
): void {
  const allowed = VALID_TRANSITIONS[from]?.includes(to) ?? false;
  if (!allowed) {
    throw new InvalidFsmTransitionError(from, to, toolKey);
  }
}
