import { Prisma } from '@prisma/client';
import { aiRunIdsMissingAgentName, mergeAiAgentNames } from '../../repositories/message.repository';

describe('nombre del agente IA en meta de mensaje', () => {
  const runId = '11111111-1111-1111-1111-111111111111';

  it('pide el run solo cuando el mensaje no trae aiAgentName', () => {
    const metas: Prisma.JsonValue[] = [
      { source: 'ai', aiRunId: runId },
      { source: 'ai', aiRunId: runId, aiAgentName: 'Ya resuelto' },
      { source: 'ai-tool' },
      { aiRunId: '   ' },
    ];

    expect(aiRunIdsMissingAgentName(metas)).toEqual([runId]);
  });

  it('copia el nombre del agente y no pisa uno ya guardado', () => {
    const items = [
      { id: 'a', meta: { source: 'ai', aiRunId: runId } as Prisma.JsonValue },
      {
        id: 'b',
        meta: { source: 'ai', aiRunId: runId, aiAgentName: 'Nombre histórico' } as Prisma.JsonValue,
      },
    ];

    const merged = mergeAiAgentNames(items, new Map([[runId, 'Asistente municipal']]));

    expect(merged[0]?.meta).toEqual({
      source: 'ai',
      aiRunId: runId,
      aiAgentName: 'Asistente municipal',
    });
    expect(merged[1]?.meta).toEqual({
      source: 'ai',
      aiRunId: runId,
      aiAgentName: 'Nombre histórico',
    });
  });
});
