/**
 * Tests unitarios: ToolRunner
 * Cubre: timeout por tool, integración FSM post-ejecución, fallback si fsmRouter falla.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ToolRunner, ToolRunnerContext } from '../../../ai/runners/tool.runner';
import { AIToolCall, AIToolDefinition } from '../../../ai/core/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTool(overrides?: Partial<AIToolDefinition>): AIToolDefinition {
  return {
    id: 'tool-1',
    name: 'createCitizen',
    description: 'Crea ciudadano',
    kind: 'internal',
    internalKey: 'createCitizen',
    timeoutMs: 5000,
    allowlistDomains: [],
    ...overrides,
  };
}

function makeCall(overrides?: Partial<AIToolCall>): AIToolCall {
  return {
    id: 'call-1',
    name: 'createCitizen',
    input: { phone: '5491100001111' },
    ...overrides,
  };
}

function makeContext(overrides?: Partial<ToolRunnerContext>): ToolRunnerContext {
  return {
    conversationId: 'conv-1',
    correlationId: 'corr-1',
    ...overrides,
  };
}

function makeInternalRunnerMock() {
  return {
    execute: jest.fn(async () => ({ citizenId: 'c-1', created: true })),
  };
}

function makeExternalRunnerMock() {
  return {
    execute: jest.fn(async () => ({})),
  };
}

function makeLoggerMock() {
  return {
    startToolCall: jest.fn(async () => 'callId-1'),
    completeToolCall: jest.fn(async () => {}),
    failToolCall: jest.fn(async () => {}),
  };
}

function makeFsmRouterMock() {
  return {
    executeToolTransition: jest.fn(async () => {}),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ToolRunner — ejecución básica', () => {
  it('debe ejecutar tool interna y retornar resultado', async () => {
    const internal = makeInternalRunnerMock();
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();

    const runner = new ToolRunner(internal as never, external as never, logger as never);
    const tool = makeTool();
    const call = makeCall();

    const result = await runner.execute('run-1', call, [tool]);

    expect(result).toMatchObject({ citizenId: 'c-1' });
    expect(internal.execute).toHaveBeenCalledWith('createCitizen', call.input);
  });

  it('debe lanzar error si tool no está en allowedTools', async () => {
    const internal = makeInternalRunnerMock();
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();

    const runner = new ToolRunner(internal as never, external as never, logger as never);
    const call = makeCall({ name: 'unknownTool' });

    await expect(runner.execute('run-1', call, [])).rejects.toThrow('not allowed');
  });
});

describe('ToolRunner — timeout por tool', () => {
  it('debe lanzar error de timeout si la tool tarda más de timeoutMs', async () => {
    const internal = {
      execute: jest.fn(
        () => new Promise<Record<string, unknown>>((resolve) => setTimeout(() => resolve({}), 500)),
      ),
    };
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();

    const runner = new ToolRunner(internal as never, external as never, logger as never);
    const tool = makeTool({ timeoutMs: 50 }); // 50ms timeout, tool tarda 500ms
    const call = makeCall();

    await expect(runner.execute('run-1', call, [tool])).rejects.toThrow(/timed out/);
    expect(logger.failToolCall).toHaveBeenCalledTimes(1);
  }, 2000);

  it('debe completar normalmente si la tool termina antes del timeout', async () => {
    const internal = makeInternalRunnerMock();
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();

    const runner = new ToolRunner(internal as never, external as never, logger as never);
    const tool = makeTool({ timeoutMs: 5000 });
    const call = makeCall();

    const result = await runner.execute('run-1', call, [tool]);
    expect(result).toBeDefined();
    expect(logger.completeToolCall).toHaveBeenCalledTimes(1);
  });
});

describe('ToolRunner — integración FSM post-ejecución', () => {
  it('debe llamar executeToolTransition para confirmCitizenRegistration cuando hay contexto', async () => {
    const internal = {
      execute: jest.fn(async () => ({ confirmed: true })),
    };
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();
    const fsmRouter = makeFsmRouterMock();

    const runner = new ToolRunner(
      internal as never,
      external as never,
      logger as never,
      fsmRouter as never,
    );
    const tool = makeTool({
      name: 'confirmCitizenRegistration',
      internalKey: 'confirmCitizenRegistration',
    });
    const call = makeCall({ name: 'confirmCitizenRegistration' });
    const ctx = makeContext();

    await runner.execute('run-1', call, [tool], ctx);

    expect(fsmRouter.executeToolTransition).toHaveBeenCalledWith(
      'conv-1',
      'confirmCitizenRegistration',
      'corr-1',
    );
  });

  it('NO debe llamar executeToolTransition para confirmCitizenRegistration si confirmed=false', async () => {
    const internal = {
      execute: jest.fn(async () => ({ confirmed: false, error: 'INCOMPLETE_PROFILE' })),
    };
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();
    const fsmRouter = makeFsmRouterMock();

    const runner = new ToolRunner(
      internal as never,
      external as never,
      logger as never,
      fsmRouter as never,
    );
    const tool = makeTool({
      name: 'confirmCitizenRegistration',
      internalKey: 'confirmCitizenRegistration',
    });
    const call = makeCall({ name: 'confirmCitizenRegistration' });
    const ctx = makeContext();

    await runner.execute('run-1', call, [tool], ctx);

    expect(fsmRouter.executeToolTransition).not.toHaveBeenCalled();
  });

  it('debe llamar executeToolTransition para closeConversation', async () => {
    const internal = {
      execute: jest.fn(async () => ({ conversationId: 'conv-1', closed: true })),
    };
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();
    const fsmRouter = makeFsmRouterMock();

    const runner = new ToolRunner(
      internal as never,
      external as never,
      logger as never,
      fsmRouter as never,
    );
    const tool = makeTool({ name: 'closeConversation', internalKey: 'closeConversation' });
    const call = makeCall({ name: 'closeConversation', input: { conversationId: 'conv-1' } });
    const ctx = makeContext();

    await runner.execute('run-1', call, [tool], ctx);

    expect(fsmRouter.executeToolTransition).toHaveBeenCalledWith(
      'conv-1',
      'closeConversation',
      'corr-1',
    );
  });

  it('closeConversation: el resultado que ve el orquestador incluye flowState cuando la transición devuelve estado', async () => {
    const internal = {
      execute: jest.fn(async () => ({ conversationId: 'conv-1', closed: true })),
    };
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();
    const fsmRouter = {
      executeToolTransition: jest.fn(async () => 'CLOSED'),
    };

    const runner = new ToolRunner(
      internal as never,
      external as never,
      logger as never,
      fsmRouter as never,
    );
    const tool = makeTool({ name: 'closeConversation', internalKey: 'closeConversation' });
    const call = makeCall({ name: 'closeConversation', input: { conversationId: 'conv-1' } });
    const ctx = makeContext();

    const result = await runner.execute('run-1', call, [tool], ctx);

    // El modelo recibe el estado efectivo en el mensaje role:'tool'
    expect(result).toMatchObject({ closed: true, flowState: 'CLOSED' });
    // El log de la tool registra el resultado original, antes de fusionar flowState
    expect(logger.completeToolCall).toHaveBeenCalledWith(
      'callId-1',
      { conversationId: 'conv-1', closed: true },
      expect.any(Number),
    );
  });

  it('NO debe llamar executeToolTransition para tools que no son de transición', async () => {
    const internal = makeInternalRunnerMock();
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();
    const fsmRouter = makeFsmRouterMock();

    const runner = new ToolRunner(
      internal as never,
      external as never,
      logger as never,
      fsmRouter as never,
    );
    const tool = makeTool({ name: 'sendMessage', internalKey: 'sendMessage' });
    const call = makeCall({ name: 'sendMessage' });
    const ctx = makeContext();

    await runner.execute('run-1', call, [tool], ctx);

    expect(fsmRouter.executeToolTransition).not.toHaveBeenCalled();
  });

  it('tool sin transición (p. ej. getMunicipalInfo): el resultado no incluye flowState', async () => {
    const internal = {
      execute: jest.fn(async () => ({ found: true, items: [] })),
    };
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();
    const fsmRouter = makeFsmRouterMock();

    const runner = new ToolRunner(
      internal as never,
      external as never,
      logger as never,
      fsmRouter as never,
    );
    const tool = makeTool({ name: 'getMunicipalInfo', internalKey: 'getMunicipalInfo' });
    const call = makeCall({ name: 'getMunicipalInfo', input: { category: 'servicios' } });
    const ctx = makeContext();

    const result = await runner.execute('run-1', call, [tool], ctx);

    expect(result).toMatchObject({ found: true });
    expect(result).not.toHaveProperty('flowState');
    expect(fsmRouter.executeToolTransition).not.toHaveBeenCalled();
  });

  it('NO debe llamar executeToolTransition si no hay context', async () => {
    const internal = makeInternalRunnerMock();
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();
    const fsmRouter = makeFsmRouterMock();

    const runner = new ToolRunner(
      internal as never,
      external as never,
      logger as never,
      fsmRouter as never,
    );
    const tool = makeTool({
      name: 'confirmCitizenRegistration',
      internalKey: 'confirmCitizenRegistration',
    });
    const call = makeCall({ name: 'confirmCitizenRegistration' });

    // Sin context → no llama transición
    await runner.execute('run-1', call, [tool]);

    expect(fsmRouter.executeToolTransition).not.toHaveBeenCalled();
  });

  it('debe completar la ejecución aunque executeToolTransition falle (non-fatal)', async () => {
    // La tool confirma el registro para que la transición FSM efectivamente se dispare
    // (con confirmed=false la transición no se ejecutaría y el test no cubriría el rechazo).
    const internal = {
      execute: jest.fn(async () => ({ confirmed: true })),
    };
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();
    const fsmRouter = {
      executeToolTransition: jest.fn(async () => {
        throw new Error('Redis down');
      }),
    };

    const runner = new ToolRunner(
      internal as never,
      external as never,
      logger as never,
      fsmRouter as never,
    );
    const tool = makeTool({
      name: 'confirmCitizenRegistration',
      internalKey: 'confirmCitizenRegistration',
    });
    const call = makeCall({ name: 'confirmCitizenRegistration' });
    const ctx = makeContext();

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    // No debe lanzar error aunque la transición FSM falle
    const result = await runner.execute('run-1', call, [tool], ctx);

    expect(result).toBeDefined();
    // Sin estado efectivo → el resultado no lleva flowState
    expect(result).not.toHaveProperty('flowState');
    expect(logger.completeToolCall).toHaveBeenCalledTimes(1);

    // El fallo de la transición FSM queda logueado
    const failureLog = consoleSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .find((entry) => entry?.event === 'tool_runner.fsm_transition.failed');
    expect(failureLog).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('debe funcionar con setFsmRouter (inyección diferida)', async () => {
    const internal = makeInternalRunnerMock();
    const external = makeExternalRunnerMock();
    const logger = makeLoggerMock();
    const fsmRouter = makeFsmRouterMock();

    const runner = new ToolRunner(internal as never, external as never, logger as never);
    runner.setFsmRouter(fsmRouter as never);

    const tool = makeTool({ name: 'escalateToHuman', internalKey: 'escalateToHuman' });
    const call = makeCall({ name: 'escalateToHuman' });
    const ctx = makeContext();

    await runner.execute('run-1', call, [tool], ctx);

    expect(fsmRouter.executeToolTransition).toHaveBeenCalledWith(
      'conv-1',
      'escalateToHuman',
      'corr-1',
    );
  });
});
