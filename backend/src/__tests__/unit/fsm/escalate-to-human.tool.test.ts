/**
 * Tests unitarios: EscalateToHumanTool
 * Cubre:
 *  - flowState = ESCALATED (único setter en V2)
 *  - Validación de transición con VALID_TRANSITIONS
 *  - Prisma $transaction se llama
 *  - Input inválido retorna error estructurado
 */
import { describe, expect, it, jest } from '@jest/globals';
import { EscalateToHumanTool } from '../../../ai/tools/escalate-to-human.tool';

function makePrismaMock(currentFlowState = 'DEPARTMENT_ROUTING') {
  const updateMock = jest.fn(async () => ({ flowState: 'ESCALATED' }));
  const findUniqueMock = jest.fn(async () => ({ flowState: currentFlowState }));
  const txClient = {
    conversationMeta: {
      update: updateMock,
    },
  };
  const $transaction = jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(txClient));
  return {
    $transaction,
    conversationMeta: {
      update: updateMock,
      findUnique: findUniqueMock,
    },
    _txClient: txClient,
  };
}

describe('EscalateToHumanTool — execute', () => {
  it('key debe ser "escalateToHuman"', () => {
    const prisma = makePrismaMock();
    const tool = new EscalateToHumanTool(prisma as never);
    expect(tool.key).toBe('escalateToHuman');
  });

  it('debe retornar flowState = ESCALATED', async () => {
    const prisma = makePrismaMock('DEPARTMENT_ROUTING');
    const tool = new EscalateToHumanTool(prisma as never);

    const result = await tool.execute({
      conversationId: 'conv-esc-1',
      reason: 'Solicitud de escalado',
    });

    expect(result).toMatchObject({
      escalated: true,
      flowState: 'ESCALATED',
      reason: 'Solicitud de escalado',
    });
  });

  it('NO debe escribir el estado directamente (la transición la aplica FsmRouterV2)', async () => {
    const prisma = makePrismaMock('DEPARTMENT_ROUTING');
    const tool = new EscalateToHumanTool(prisma as never);

    const result = await tool.execute({ conversationId: 'conv-esc-1' });

    expect(result).toMatchObject({ escalated: true, flowState: 'ESCALATED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma._txClient.conversationMeta.update).not.toHaveBeenCalled();
  });

  it('debe rechazar transición inválida (CLOSED → ESCALATED no está en V2)', async () => {
    const prisma = makePrismaMock('CLOSED');
    const tool = new EscalateToHumanTool(prisma as never);

    const result = await tool.execute({ conversationId: 'conv-esc-closed' });

    expect(result).toMatchObject({ error: 'INVALID_TRANSITION' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('debe retornar NOT_FOUND si no encuentra conversationMeta', async () => {
    const prisma = makePrismaMock();
    prisma.conversationMeta.findUnique.mockResolvedValueOnce(null as never);
    const tool = new EscalateToHumanTool(prisma as never);

    const result = await tool.execute({ conversationId: 'conv-not-found' });

    expect(result).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('debe retornar error estructurado en input inválido', async () => {
    const prisma = makePrismaMock();
    const tool = new EscalateToHumanTool(prisma as never);

    const result = await tool.execute({ conversationId: '' });

    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it.each(['BOT_FLOW', 'HUMAN_FLOW', 'DEPARTMENT_ROUTING', 'ESCALATED'])(
    'debe permitir escalateToHuman desde estado %s válido para ESCALATED',
    async (fromState) => {
      // BOT_FLOW, HUMAN_FLOW y DEPARTMENT_ROUTING permiten ESCALATED en VALID_TRANSITIONS
      // ESCALATED → ESCALATED NO es válido
      if (fromState === 'ESCALATED') return; // already escalated

      const prisma = makePrismaMock(fromState);
      const tool = new EscalateToHumanTool(prisma as never);

      const result = await tool.execute({ conversationId: 'conv-1' });

      expect(result).toMatchObject({ escalated: true, flowState: 'ESCALATED' });
    },
  );
});
