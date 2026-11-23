/**
 * Tests unitarios: FSM Guards
 * Cubre: canAiOperate, isAiBlocked, buildAiBlockReason, guardrails
 */
import { describe, expect, it } from '@jest/globals';
import {
  AI_ALLOWED_STATES,
  AI_BLOCKED_STATES,
  buildAiBlockReason,
  canAiOperate,
  DEFAULT_FSM_GUARDRAILS,
  isAiBlocked,
} from '../../../ai/fsm/fsm-guards';
import { ConversationFlowState } from '../../../types/whatsapp.types';

describe('fsm-guards — canAiOperate', () => {
  const allowedStates: ConversationFlowState[] = ['BOT_FLOW', 'REGISTERING', 'DEPARTMENT_ROUTING'];

  it.each(allowedStates)('debe permitir IA en estado %s', (state) => {
    expect(canAiOperate(state)).toBe(true);
  });

  const blockedStates: ConversationFlowState[] = ['HUMAN_FLOW', 'ESCALATED', 'CLOSED'];

  it.each(blockedStates)('debe bloquear IA en estado %s', (state) => {
    expect(canAiOperate(state)).toBe(false);
  });
});

describe('fsm-guards — isAiBlocked', () => {
  it('debe retornar true para HUMAN_FLOW', () => {
    expect(isAiBlocked('HUMAN_FLOW')).toBe(true);
  });

  it('debe retornar true para ESCALATED', () => {
    expect(isAiBlocked('ESCALATED')).toBe(true);
  });

  it('debe retornar true para CLOSED', () => {
    expect(isAiBlocked('CLOSED')).toBe(true);
  });

  it('debe retornar false para REGISTERING (registro unificado en IA)', () => {
    expect(isAiBlocked('REGISTERING')).toBe(false);
  });

  it('debe retornar false para BOT_FLOW', () => {
    expect(isAiBlocked('BOT_FLOW')).toBe(false);
  });
});

describe('fsm-guards — buildAiBlockReason', () => {
  it('debe construir razón para HUMAN_FLOW', () => {
    const reason = buildAiBlockReason('HUMAN_FLOW');
    expect(reason.blocked).toBe(true);
    expect(reason.state).toBe('HUMAN_FLOW');
    expect(reason.reason).toContain('agente humano');
  });

  it('debe construir razón para ESCALATED', () => {
    const reason = buildAiBlockReason('ESCALATED');
    expect(reason.blocked).toBe(true);
    expect(reason.state).toBe('ESCALATED');
  });

  it('debe construir razón para CLOSED', () => {
    const reason = buildAiBlockReason('CLOSED');
    expect(reason.blocked).toBe(true);
    expect(reason.state).toBe('CLOSED');
  });

  it('debe construir razón fallback para REGISTERING', () => {
    const reason = buildAiBlockReason('REGISTERING');
    expect(reason.blocked).toBe(true);
    expect(reason.state).toBe('REGISTERING');
    expect(reason.reason).toContain('Estado REGISTERING');
  });
});

describe('fsm-guards — sets de estados', () => {
  it('AI_ALLOWED_STATES y AI_BLOCKED_STATES no deben solaparse', () => {
    const intersection = [...AI_ALLOWED_STATES].filter((s) => AI_BLOCKED_STATES.has(s));
    expect(intersection).toHaveLength(0);
  });

  it('debe cubrir todos los estados posibles', () => {
    const allStates: ConversationFlowState[] = [
      'BOT_FLOW',
      'REGISTERING',
      'DEPARTMENT_ROUTING',
      'HUMAN_FLOW',
      'ESCALATED',
      'CLOSED',
    ];
    for (const state of allStates) {
      const covered = AI_ALLOWED_STATES.has(state) || AI_BLOCKED_STATES.has(state);
      expect(covered).toBe(true);
    }
  });
});

describe('fsm-guards — DEFAULT_FSM_GUARDRAILS', () => {
  it('debe tener valores conservadores de producción', () => {
    expect(DEFAULT_FSM_GUARDRAILS.maxToolCalls).toBeGreaterThan(0);
    expect(DEFAULT_FSM_GUARDRAILS.maxIterations).toBeGreaterThan(0);
    expect(DEFAULT_FSM_GUARDRAILS.toolTimeoutMs).toBeGreaterThan(0);
    expect(DEFAULT_FSM_GUARDRAILS.aiTimeoutMs).toBeGreaterThan(0);
    // aiTimeoutMs debe ser mayor que toolTimeoutMs
    expect(DEFAULT_FSM_GUARDRAILS.aiTimeoutMs).toBeGreaterThan(
      DEFAULT_FSM_GUARDRAILS.toolTimeoutMs,
    );
  });

  it('maxToolCalls debe mantenerse en el default operativo actual', () => {
    expect(DEFAULT_FSM_GUARDRAILS.maxToolCalls).toBe(10);
  });

  it('maxIterations debe mantenerse en el default operativo actual', () => {
    expect(DEFAULT_FSM_GUARDRAILS.maxIterations).toBe(20);
  });
});
