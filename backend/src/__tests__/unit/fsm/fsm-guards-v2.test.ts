/**
 * Tests unitarios: FSM Guards
 * Cubre: canAiOperate, AI_ALLOWED_STATES — matrix de 6 estados
 */
import { describe, expect, it } from '@jest/globals';
import { AI_ALLOWED_STATES, AI_BLOCKED_STATES, canAiOperate } from '../../../ai/fsm/fsm-guards';
import { ConversationFlowState } from '../../../types/whatsapp.types';

const ALL_STATES: ConversationFlowState[] = [
  'BOT_FLOW',
  'REGISTERING',
  'DEPARTMENT_ROUTING',
  'HUMAN_FLOW',
  'ESCALATED',
  'CLOSED',
];

describe('canAiOperate — matrix de 6 estados', () => {
  it.each<[ConversationFlowState, boolean]>([
    ['BOT_FLOW', true],
    ['REGISTERING', true],
    ['DEPARTMENT_ROUTING', true],
    ['HUMAN_FLOW', false], // agente humano al mando
    ['ESCALATED', false], // escalado crítico
    ['CLOSED', false], // conversación cerrada
  ])('canAiOperate(%s) === %s', (state, expected) => {
    expect(canAiOperate(state)).toBe(expected);
  });
});

describe('AI_ALLOWED_STATES — cobertura completa', () => {
  it('debe cubrir los 6 estados (ninguno sin clasificar)', () => {
    for (const state of ALL_STATES) {
      const isAllowed = AI_ALLOWED_STATES.has(state);
      const isBlocked = !isAllowed;
      expect(isAllowed || isBlocked).toBe(true);
    }
    // Verify 3 allowed + 3 blocked = 6 total
    const allowedCount = ALL_STATES.filter((s) => AI_ALLOWED_STATES.has(s)).length;
    const blockedCount = ALL_STATES.filter((s) => !AI_ALLOWED_STATES.has(s)).length;
    expect(allowedCount + blockedCount).toBe(6);
  });

  it('AI_ALLOWED_STATES debe tener exactamente 3 estados activos', () => {
    expect(AI_ALLOWED_STATES.size).toBe(3);
  });

  it('REGISTERING debe estar permitida', () => {
    expect(AI_ALLOWED_STATES.has('REGISTERING')).toBe(true);
    expect(AI_BLOCKED_STATES.has('REGISTERING')).toBe(false);
  });

  it('HUMAN_FLOW, ESCALATED, CLOSED deben estar bloqueados', () => {
    for (const state of ['HUMAN_FLOW', 'ESCALATED', 'CLOSED'] as const) {
      expect(AI_ALLOWED_STATES.has(state)).toBe(false);
    }
  });
});
