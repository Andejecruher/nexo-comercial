import { describe, expect, it, jest } from '@jest/globals';
import { MessageDirection } from '@prisma/client';
import type { AIExecutionContext } from '../../../ai/core/types';
import { AIService } from '../../../ai/services/ai.service';

function buildContext(): AIExecutionContext {
  return {
    conversationId: 'conv-1',
    citizenId: 'citizen-1',
    phone: '5210000000000',
    messageId: 'msg-in-1',
    messageText: 'Hola',
    flowState: 'BOT_FLOW',
    correlationId: 'corr-1',
  };
}

function buildService(params: {
  run: (input: { onChunk?: (payload: unknown) => Promise<void> | void }) => Promise<{
    handled: boolean;
    responseText?: string;
    runId?: string;
  }>;
  onStreamDone?: () => Promise<void>;
  onStreamChunk?: () => Promise<void>;
}): {
  service: AIService;
  enqueue: jest.Mock;
  create: jest.Mock;
  findByIdempotencyKey: jest.Mock;
} {
  const enqueue = jest.fn(async () => undefined);
  const create = jest.fn(async () => ({ id: 'msg-out-1' }));
  const findRecent = jest.fn(async () => []);
  const findByIdempotencyKey = jest.fn(async () => null);

  const service = new AIService({
    prisma: {} as never,
    outboxProcessor: { enqueue } as never,
    messageRepo: { findRecentForAiContext: findRecent, create, findByIdempotencyKey } as never,
    citizenRepo: {} as never,
    conversationRepo: {} as never,
    ...(params.onStreamDone ? { onStreamDone: params.onStreamDone } : {}),
    ...(params.onStreamChunk ? { onStreamChunk: params.onStreamChunk } : {}),
  });

  const mocked = service as unknown as {
    orchestrator: unknown;
    agentRegistry: unknown;
  };
  mocked.orchestrator = {
    run: jest.fn(params.run),
  };
  mocked.agentRegistry = {
    resolveLineAgent: jest.fn(async () => ({
      lineId: 'line-1',
      agent: { id: 'agent-1', name: 'Asistente municipal' },
    })),
  };

  return { service, enqueue, create, findByIdempotencyKey };
}

describe('AIService batch context contracts', () => {
  it('passes excludeMessageIds to findRecentForAiContext in single-event path', async () => {
    const findRecent = jest.fn(async () => []);
    const enqueue = jest.fn(async () => undefined);
    const create = jest.fn(async () => ({ id: 'msg-out-1' }));
    const service = new AIService({
      prisma: {} as never,
      outboxProcessor: { enqueue } as never,
      messageRepo: {
        findRecentForAiContext: findRecent,
        create,
        findByIdempotencyKey: jest.fn(async () => null),
      } as never,
      citizenRepo: {} as never,
      conversationRepo: {} as never,
    });
    const mocked = service as unknown as {
      orchestrator: { run: jest.Mock };
      agentRegistry: { resolveLineAgent: jest.Mock };
    };
    mocked.orchestrator = {
      run: jest.fn(async () => ({ handled: true, responseText: 'Ok', runId: 'run-1' })),
    };
    mocked.agentRegistry = {
      resolveLineAgent: jest.fn(async () => ({
        lineId: 'line-1',
        agent: { id: 'agent-1', name: 'Asistente municipal' },
      })),
    };

    await service.handleMessage(buildContext());

    expect(findRecent).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        limit: 20,
        excludeMessageIds: ['msg-in-1'],
      }),
    );
  });

  it('passes every fragment id to findRecentForAiContext when batchGeneration is present', async () => {
    const findRecent = jest.fn(async () => []);
    const enqueue = jest.fn(async () => undefined);
    const create = jest.fn(async () => ({ id: 'msg-out-1' }));
    const service = new AIService({
      prisma: {} as never,
      outboxProcessor: { enqueue } as never,
      messageRepo: {
        findRecentForAiContext: findRecent,
        create,
        findByIdempotencyKey: jest.fn(async () => null),
      } as never,
      citizenRepo: {} as never,
      conversationRepo: {} as never,
    });
    const mocked = service as unknown as {
      orchestrator: { run: jest.Mock };
      agentRegistry: { resolveLineAgent: jest.Mock };
    };
    mocked.orchestrator = {
      run: jest.fn(async () => ({ handled: true, responseText: 'Ok', runId: 'run-2' })),
    };
    mocked.agentRegistry = {
      resolveLineAgent: jest.fn(async () => ({
        lineId: 'line-1',
        agent: { id: 'agent-1', name: 'Asistente municipal' },
      })),
    };

    await service.handleMessage({
      ...buildContext(),
      excludeMessageIds: ['msg-1', 'msg-2', 'msg-3'],
      batchGeneration: 7,
    });

    expect(findRecent).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        limit: 20,
        excludeMessageIds: ['msg-1', 'msg-2', 'msg-3'],
      }),
    );
  });

  it('uses the generation-derived outbox key for batched replies', async () => {
    const findRecent = jest.fn(async () => []);
    const enqueue = jest.fn(async () => undefined);
    const create = jest.fn(async () => ({ id: 'msg-out-1' }));
    const service = new AIService({
      prisma: {} as never,
      outboxProcessor: { enqueue } as never,
      messageRepo: {
        findRecentForAiContext: findRecent,
        create,
        findByIdempotencyKey: jest.fn(async () => null),
      } as never,
      citizenRepo: {} as never,
      conversationRepo: {} as never,
    });
    const mocked = service as unknown as {
      orchestrator: { run: jest.Mock };
      agentRegistry: { resolveLineAgent: jest.Mock };
    };
    mocked.orchestrator = {
      run: jest.fn(async () => ({ handled: true, responseText: 'Ok', runId: 'run-3' })),
    };
    mocked.agentRegistry = {
      resolveLineAgent: jest.fn(async () => ({
        lineId: 'line-1',
        agent: { id: 'agent-1', name: 'Asistente municipal' },
      })),
    };

    await service.handleMessage({
      ...buildContext(),
      messageId: 'msg-last',
      excludeMessageIds: ['msg-1', 'msg-last'],
      batchGeneration: 7,
    });

    expect(enqueue).toHaveBeenCalledWith(
      '5210000000000',
      expect.anything(),
      'ai:conv-1:batch:7',
      'conv-1',
      expect.anything(),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'ai:conv-1:batch:7',
      }),
    );
  });

  it('keeps the single-event outbox key when batchGeneration is absent', async () => {
    const findRecent = jest.fn(async () => []);
    const enqueue = jest.fn(async () => undefined);
    const create = jest.fn(async () => ({ id: 'msg-out-1' }));
    const service = new AIService({
      prisma: {} as never,
      outboxProcessor: { enqueue } as never,
      messageRepo: {
        findRecentForAiContext: findRecent,
        create,
        findByIdempotencyKey: jest.fn(async () => null),
      } as never,
      citizenRepo: {} as never,
      conversationRepo: {} as never,
    });
    const mocked = service as unknown as {
      orchestrator: { run: jest.Mock };
      agentRegistry: { resolveLineAgent: jest.Mock };
    };
    mocked.orchestrator = {
      run: jest.fn(async () => ({ handled: true, responseText: 'Ok', runId: 'run-4' })),
    };
    mocked.agentRegistry = {
      resolveLineAgent: jest.fn(async () => ({
        lineId: 'line-1',
        agent: { id: 'agent-1', name: 'Asistente municipal' },
      })),
    };

    await service.handleMessage(buildContext());

    expect(enqueue).toHaveBeenCalledWith(
      '5210000000000',
      expect.anything(),
      'ai:conv-1:msg-in-1',
      'conv-1',
      expect.anything(),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'ai:conv-1:msg-in-1',
      }),
    );
  });
});

describe('AIService resilience', () => {
  it('envía y persiste el outbound aunque la notificación de fin de stream falle', async () => {
    const { service, enqueue, create } = buildService({
      run: async () => ({ handled: true, responseText: 'Hola ciudadano', runId: 'run-1' }),
      onStreamDone: async () => {
        throw new Error('Unable to detect a Project Id in the current environment.');
      },
    });

    const result = await service.handleMessage(buildContext());

    expect(result).toEqual({ handled: true, runId: 'run-1' });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Hola ciudadano',
        direction: MessageDirection.outbound,
        idempotencyKey: 'ai:conv-1:msg-in-1',
        meta: expect.objectContaining({
          source: 'ai',
          aiRunId: 'run-1',
          aiAgentName: 'Asistente municipal',
        }),
      }),
    );
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(enqueue.mock.invocationCallOrder[0]);
  });

  it('no aborta la corrida si falla la publicación de un chunk de streaming', async () => {
    const { service, enqueue, create } = buildService({
      run: async (input) => {
        await input.onChunk?.({
          runId: 'run-2',
          provider: 'openai',
          model: 'gpt-4o-mini',
          chunk: { textDelta: 'Ho', accumulatedText: 'Ho' },
          iteration: 1,
        });
        return { handled: true, responseText: 'Hola ciudadano', runId: 'run-2' };
      },
      onStreamChunk: async () => {
        throw new Error('Unable to detect a Project Id in the current environment.');
      },
    });

    const result = await service.handleMessage(buildContext());

    expect(result).toEqual({ handled: true, runId: 'run-2' });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('no envía nada cuando el orquestador no maneja el mensaje', async () => {
    const { service, enqueue, create } = buildService({
      run: async () => ({ handled: false, runId: 'run-3' }),
      onStreamDone: async () => undefined,
    });

    const result = await service.handleMessage(buildContext());

    expect(result).toEqual({ handled: false, runId: 'run-3' });
    expect(enqueue).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('reutiliza el mensaje existente ante P2002 y sigue encolando el outbox', async () => {
    const { service, enqueue, create, findByIdempotencyKey } = buildService({
      run: async () => ({ handled: true, responseText: 'Hola ciudadano', runId: 'run-4' }),
    });
    create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }) as never,
    );
    findByIdempotencyKey.mockResolvedValueOnce({ id: 'msg-out-existing' } as never);

    const result = await service.handleMessage(buildContext());

    expect(result).toEqual({ handled: true, runId: 'run-4' });
    expect(findByIdempotencyKey).toHaveBeenCalledWith('ai:conv-1:msg-in-1');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
