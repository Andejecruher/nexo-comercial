/**
 * Tests unitarios: FSM Transitions
 * Cubre: resolveToolTransition, assertValidTransition, InvalidFsmTransitionError
 */
import { describe, expect, it } from '@jest/globals';
import {
  assertValidTransition,
  InvalidFsmTransitionError,
  resolveToolTransition,
  TOOL_TRANSITIONS,
  TRANSITION_TOOL_KEYS,
} from '../../../ai/fsm/fsm-transitions';
import { ConversationFlowState } from '../../../types/whatsapp.types';

describe('fsm-transitions — resolveToolTransition', () => {
  describe('confirmCitizenRegistration', () => {
    it('debe retornar transición a CLOSED desde REGISTERING (registro completa y cierra la conversación)', () => {
      const result = resolveToolTransition('confirmCitizenRegistration', 'REGISTERING');
      expect(result.shouldTransition).toBe(true);
      if (result.shouldTransition) {
        expect(result.toState).toBe('CLOSED');
        expect(result.toolKey).toBe('confirmCitizenRegistration');
      }
    });

    it('no debe transicionar desde BOT_FLOW (no aplica)', () => {
      const result = resolveToolTransition('confirmCitizenRegistration', 'BOT_FLOW');
      expect(result.shouldTransition).toBe(false);
    });

    it('no debe transicionar desde HUMAN_FLOW', () => {
      const result = resolveToolTransition('confirmCitizenRegistration', 'HUMAN_FLOW');
      expect(result.shouldTransition).toBe(false);
    });
  });

  describe('assignDepartment', () => {
    const states: ConversationFlowState[] = [
      'BOT_FLOW',
      'REGISTERING',
      'DEPARTMENT_ROUTING',
      'HUMAN_FLOW',
      'ESCALATED',
    ];

    it.each(states)(
      'debe transicionar a DEPARTMENT_ROUTING desde cualquier estado (%s)',
      (state) => {
        const result = resolveToolTransition('assignDepartment', state);
        expect(result.shouldTransition).toBe(true);
        if (result.shouldTransition) {
          expect(result.toState).toBe('DEPARTMENT_ROUTING');
        }
      },
    );
  });

  describe('escalateToHuman', () => {
    it('debe transicionar a ESCALATED desde cualquier estado', () => {
      const result = resolveToolTransition('escalateToHuman', 'BOT_FLOW');
      expect(result.shouldTransition).toBe(true);
      if (result.shouldTransition) {
        expect(result.toState).toBe('ESCALATED');
      }
    });
  });

  describe('closeConversation', () => {
    it('debe transicionar a CLOSED desde cualquier estado', () => {
      const result = resolveToolTransition('closeConversation', 'HUMAN_FLOW');
      expect(result.shouldTransition).toBe(true);
      if (result.shouldTransition) {
        expect(result.toState).toBe('CLOSED');
      }
    });
  });

  it('no debe transicionar para tools desconocidas', () => {
    const result = resolveToolTransition('unknownTool', 'BOT_FLOW');
    expect(result.shouldTransition).toBe(false);
  });

  it('no debe transicionar para string vacío', () => {
    const result = resolveToolTransition('', 'BOT_FLOW');
    expect(result.shouldTransition).toBe(false);
  });
});

describe('fsm-transitions — assertValidTransition', () => {
  it('debe pasar para BOT_FLOW → REGISTERING', () => {
    expect(() => assertValidTransition('BOT_FLOW', 'REGISTERING', 'test')).not.toThrow();
  });

  it('debe lanzar InvalidFsmTransitionError para CLOSED → ESCALATED', () => {
    expect(() => assertValidTransition('CLOSED', 'ESCALATED', 'someKey')).toThrow(
      InvalidFsmTransitionError,
    );
  });

  it('el error debe incluir from, to y toolKey', () => {
    let threw = false;
    try {
      assertValidTransition('CLOSED', 'HUMAN_FLOW', 'myTool');
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(InvalidFsmTransitionError);
      const typed = err as InvalidFsmTransitionError;
      expect(typed.fromState).toBe('CLOSED');
      expect(typed.toState).toBe('HUMAN_FLOW');
      expect(typed.toolKey).toBe('myTool');
    }
    expect(threw).toBe(true);
  });
});

describe('fsm-transitions — TOOL_TRANSITIONS cobertura', () => {
  it('debe definir regla para confirmCitizenRegistration', () => {
    expect(TOOL_TRANSITIONS['confirmCitizenRegistration']).toBeDefined();
  });

  it('debe definir regla para assignDepartment', () => {
    expect(TOOL_TRANSITIONS['assignDepartment']).toBeDefined();
  });

  it('debe definir regla para escalateToHuman', () => {
    expect(TOOL_TRANSITIONS['escalateToHuman']).toBeDefined();
  });

  it('debe definir regla para closeConversation', () => {
    expect(TOOL_TRANSITIONS['closeConversation']).toBeDefined();
  });

  it('assignDepartment y escalateToHuman deben aceptar desde cualquier estado (*)', () => {
    expect(TOOL_TRANSITIONS['assignDepartment'].from).toBe('*');
    expect(TOOL_TRANSITIONS['assignDepartment'].to).toBe('DEPARTMENT_ROUTING');
    expect(TOOL_TRANSITIONS['escalateToHuman'].from).toBe('*');
    expect(TOOL_TRANSITIONS['closeConversation'].from).toBe('*');
  });
});

describe('fsm-transitions — TRANSITION_TOOL_KEYS', () => {
  it('debe contener exactamente las 4 transition-tool keys (fuente única)', () => {
    expect([...TRANSITION_TOOL_KEYS].sort()).toEqual([
      'assignDepartment',
      'closeConversation',
      'confirmCitizenRegistration',
      'escalateToHuman',
    ]);
  });
});
