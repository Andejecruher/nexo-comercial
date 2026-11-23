/**
 * Fase 0: la tabla de transiciones del frontend debe ser espejo exacto de
 * backend/src/config/conversation-states.ts. Cualquier divergencia hace que la
 * UI ofrezca acciones que el backend rechaza (o esconda acciones válidas).
 */
import {
  canHandoverToHuman,
  isValidFlowTransition,
  type ConversationFlowState,
} from '@/lib/conversation-fsm';
import { describe, expect, it } from 'vitest';

// Copia de la especificación autoritativa en el backend.
const BACKEND_TRANSITIONS: Record<ConversationFlowState, ConversationFlowState[]> = {
  BOT_FLOW: ['REGISTERING', 'DEPARTMENT_ROUTING', 'HUMAN_FLOW', 'ESCALATED', 'CLOSED'],
  REGISTERING: ['BOT_FLOW', 'DEPARTMENT_ROUTING', 'HUMAN_FLOW', 'CLOSED'],
  DEPARTMENT_ROUTING: ['HUMAN_FLOW', 'ESCALATED', 'CLOSED'],
  HUMAN_FLOW: ['DEPARTMENT_ROUTING', 'BOT_FLOW', 'ESCALATED', 'CLOSED'],
  ESCALATED: ['HUMAN_FLOW', 'DEPARTMENT_ROUTING', 'BOT_FLOW', 'CLOSED'],
  CLOSED: ['BOT_FLOW'],
};

const ALL_STATES = Object.keys(BACKEND_TRANSITIONS) as ConversationFlowState[];

describe('conversation-fsm sync con backend', () => {
  for (const from of ALL_STATES) {
    for (const to of ALL_STATES) {
      const shouldAllow = BACKEND_TRANSITIONS[from].includes(to);
      it(`transición ${from} → ${to} debe estar ${shouldAllow ? 'permitida' : 'bloqueada'}`, () => {
        expect(isValidFlowTransition(from, to)).toBe(shouldAllow);
      });
    }
  }

  it('DEPARTMENT_ROUTING ya no ofrece retorno a BOT_FLOW', () => {
    expect(isValidFlowTransition('DEPARTMENT_ROUTING', 'BOT_FLOW')).toBe(false);
  });

  it('HUMAN_FLOW ofrece devolución al bot y enrutamiento a departamento', () => {
    expect(isValidFlowTransition('HUMAN_FLOW', 'BOT_FLOW')).toBe(true);
    expect(isValidFlowTransition('HUMAN_FLOW', 'DEPARTMENT_ROUTING')).toBe(true);
  });

  it('REGISTERING permite escalar a HUMAN_FLOW', () => {
    expect(canHandoverToHuman('REGISTERING')).toBe(true);
  });
});
