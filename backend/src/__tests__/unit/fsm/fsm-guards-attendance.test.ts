/**
 * Tests unitarios: isBotAllowed — gate centralizado bot silenciado.
 * Cubre la matriz attendanceMode × botEnabled × flowState.
 */
import { describe, expect, it } from '@jest/globals';
import {
  buildBotBlockReason,
  isBotAllowed,
} from '../../../ai/fsm/fsm-guards';
import { ConversationFlowState } from '../../../types/whatsapp.types';

describe('isBotAllowed — matriz de atención humana y kill-switch', () => {
  it('bloquea siempre que attendanceMode = human aunque flowState permita IA', () => {
    // Caso central del bug: DEPARTMENT_ROUTING por transfer de plataforma
    // (IA activa por estado, pero atención humana → bot debe callar).
    expect(
      isBotAllowed({
        flowState: 'DEPARTMENT_ROUTING',
        attendanceMode: 'human',
        botEnabled: false,
      }),
    ).toBe(false);
    expect(
      isBotAllowed({
        flowState: 'DEPARTMENT_ROUTING',
        attendanceMode: 'human',
        botEnabled: undefined,
      }),
    ).toBe(false);
  });

  it('bloquea siempre que botEnabled = false', () => {
    expect(
      isBotAllowed({ flowState: 'BOT_FLOW', attendanceMode: 'bot', botEnabled: false }),
    ).toBe(false);
    expect(
      isBotAllowed({ flowState: 'REGISTERING', attendanceMode: undefined, botEnabled: false }),
    ).toBe(false);
  });

  it('permite la IA en DEPARTMENT_ROUTING con attendance bot (routing autónomo del bot)', () => {
    expect(
      isBotAllowed({ flowState: 'DEPARTMENT_ROUTING', attendanceMode: 'bot', botEnabled: true }),
    ).toBe(true);
  });

  it('permite flows activos con attendance bot por defecto', () => {
    for (const flowState of ['BOT_FLOW', 'REGISTERING', 'DEPARTMENT_ROUTING'] as const) {
      expect(
        isBotAllowed({ flowState, attendanceMode: 'bot', botEnabled: true }),
      ).toBe(true);
      expect(isBotAllowed({ flowState })).toBe(true);
    }
  });

  it('bloquea flows no activos por estado', () => {
    for (const flowState of ['HUMAN_FLOW', 'ESCALATED', 'CLOSED'] as const) {
      expect(isBotAllowed({ flowState, attendanceMode: 'bot', botEnabled: true })).toBe(false);
    }
  });
});

describe('buildBotBlockReason — motivo estructurado', () => {
  it('reporta atención humana cuando attendanceMode = human', () => {
    const reason = buildBotBlockReason({
      flowState: 'DEPARTMENT_ROUTING',
      attendanceMode: 'human',
      botEnabled: true,
    });
    expect(reason.blocked).toBe(true);
    expect(reason.state).toBe('DEPARTMENT_ROUTING');
    expect(reason.reason.toLowerCase()).toContain('humana');
  });

  it('reporta bot deshabilitado cuando botEnabled = false', () => {
    const reason = buildBotBlockReason({
      flowState: 'BOT_FLOW',
      attendanceMode: 'bot',
      botEnabled: false,
    });
    expect(reason.blocked).toBe(true);
    expect(reason.reason.toLowerCase()).toContain('botenabled');
  });
});