/**
 * Tests unitarios: AIOrchestrator — guardrails maxIterations y maxToolCalls
 *
 * Verifica que:
 * 1. maxIterations corta el loop ReAct y retorna guardReason='max_iterations'
 * 2. maxToolCalls corta el loop y retorna guardReason='max_tool_calls'
 * 3. Sin llegar al límite no hay guardReason
 * 4. Los límites se configuran vía constructor (no hardcodeados)
 */
import { describe, expect, it, jest } from '@jest/globals';
import { AIExecutionContext } from '../../../ai/core/types';
import { AIOrchestrator } from '../../../ai/orchestrator/orchestrator';

// ─── Mocks ────────────────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<AIExecutionContext>): AIExecutionContext {
  return {
    conversationId: 'conv-1',
    citizenId: 'citizen-1',
    phone: '5491100001111',
    messageId: 'msg-1',
    messageText: 'Hola',
    flowState: 'BOT_FLOW',
    correlationId: 'corr-1',
    ...overrides,
  };
}

function makeLoggerMock() {
  return {
    startRun: jest.fn(async () => 'run-1'),
    completeRun: jest.fn(async () => {}),
    failRun: jest.fn(async () => {}),
    skipRun: jest.fn(async () => {}),
    markOutputGuardrail: jest.fn(async () => {}),
    startToolCall: jest.fn(async () => 'call-1'),
    completeToolCall: jest.fn(async () => {}),
    failToolCall: jest.fn(async () => {}),
  };
}

function makeTopicRegistryMock(prompt = 'Sos un asistente') {
  return {
    resolve: jest.fn(async () => ({
      topicId: 'topic-1',
      promptId: 'prompt-1',
      promptContent: prompt,
    })),
  };
}

function makeToolRegistryMock() {
  return {
    getToolsForTopic: jest.fn(async () => [
      {
        id: 'tool-1',
        name: 'createCitizen',
        description: 'Crea ciudadano',
        kind: 'internal' as const,
        internalKey: 'createCitizen',
        timeoutMs: 5000,
        allowlistDomains: [],
      },
    ]),
  };
}

function makeToolRunnerMock() {
  return {
    execute: jest.fn(async () => ({ citizenId: 'c-1' })),
  };
}

/** Registry con transition-tools para los tests del guard de estado terminal. */
function makeTransitionToolRegistryMock() {
  return {
    getToolsForTopic: jest.fn(async () => [
      {
        id: 'tool-close',
        name: 'closeConversation',
        description: 'Cierra la conversación',
        kind: 'internal' as const,
        internalKey: 'closeConversation',
        timeoutMs: 5000,
        allowlistDomains: [],
      },
      {
        id: 'tool-assign',
        name: 'assignDepartment',
        description: 'Deriva a departamento',
        kind: 'internal' as const,
        internalKey: 'assignDepartment',
        timeoutMs: 5000,
        allowlistDomains: [],
      },
    ]),
  };
}

/**
 * Provider factory que captura tools y messages de cada llamada a generate,
 * para verificar el steering post-transición (tools=[] y nota [SISTEMA]).
 */
function makeCapturingProviderFactoryMock(
  responses: Array<{
    text?: string;
    toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  }>,
) {
  let callIndex = 0;
  const calls: Array<{
    tools: Array<{ name: string }>;
    messages: Array<{ role: string; content: string; name?: string; toolCallId?: string }>;
  }> = [];
  const factory = {
    create: jest.fn(() => ({
      generate: jest.fn(
        async (input: {
          tools: Array<{ name: string }>;
          messages: Array<{ role: string; content: string; name?: string; toolCallId?: string }>;
        }) => {
          // Snapshot superficial: los mensajes no se mutan después del push
          calls.push({ tools: input.tools, messages: [...input.messages] });
          const response = responses[callIndex] ?? { text: 'respuesta final', toolCalls: [] };
          callIndex++;
          return {
            text: response.text ?? '',
            toolCalls: response.toolCalls ?? [],
            raw: {},
            providerUnavailable: false,
          };
        },
      ),
    })),
  };
  return { factory, calls };
}

function makeProviderFactoryMock(
  responses: Array<{
    text?: string;
    toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  }>,
) {
  let callIndex = 0;
  return {
    create: jest.fn(() => ({
      generate: jest.fn(async () => {
        const response = responses[callIndex] ?? { text: 'respuesta final', toolCalls: [] };
        callIndex++;
        return {
          text: response.text ?? '',
          toolCalls: response.toolCalls ?? [],
          raw: {},
          providerUnavailable: false,
        };
      }),
    })),
  };
}

const BASE_INPUT = {
  context: makeContext(),
  lineId: 'line-1',
  agent: {
    id: 'agent-1',
    provider: 'openai' as const,
    model: 'gpt-4o',
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AIOrchestrator — maxIterations guardrail', () => {
  it('debe cortar el loop y retornar guardReason=max_iterations cuando se agotan las iteraciones', async () => {
    // Cada llamada al provider devuelve tool calls (nunca texto final)
    // → el loop se ejecuta maxIterations veces y se corta
    const toolCall = { id: 'tc-1', name: 'createCitizen', input: { phone: '5491100001111' } };
    const responses = [
      { toolCalls: [toolCall] },
      { toolCalls: [toolCall] },
      { toolCalls: [toolCall] },
      { toolCalls: [toolCall] }, // nunca llega aquí con maxIterations=2
    ];

    const providerFactory = makeProviderFactoryMock(responses);
    const topicRegistry = makeTopicRegistryMock();
    const toolRegistry = makeToolRegistryMock();
    const toolRunner = makeToolRunnerMock();
    const logger = makeLoggerMock();

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      topicRegistry as never,
      toolRegistry as never,
      toolRunner as never,
      logger as never,
      { maxIterations: 2, maxToolCalls: 10 }, // límite bajo para test
    );

    const result = await orchestrator.run(BASE_INPUT);

    expect(result.guardReason).toBe('max_iterations');
    // factory.create es llamado una vez por iteración
    expect(providerFactory.create).toHaveBeenCalledTimes(2);
  });

  it('NO debe retornar guardReason si el loop termina naturalmente (sin tools)', async () => {
    const providerFactory = makeProviderFactoryMock([
      { text: 'Hola, ¿en qué te puedo ayudar?', toolCalls: [] },
    ]);
    const topicRegistry = makeTopicRegistryMock();
    const toolRegistry = makeToolRegistryMock();
    const toolRunner = makeToolRunnerMock();
    const logger = makeLoggerMock();

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      topicRegistry as never,
      toolRegistry as never,
      toolRunner as never,
      logger as never,
      { maxIterations: 3, maxToolCalls: 10 },
    );

    const result = await orchestrator.run(BASE_INPUT);

    expect(result.guardReason).toBeUndefined();
    expect(result.handled).toBe(true);
  });

  it('debe respetar maxIterations=1 (una sola llamada al provider)', async () => {
    const toolCall = { id: 'tc-1', name: 'createCitizen', input: {} };
    const providerFactory = makeProviderFactoryMock([
      { toolCalls: [toolCall] },
      { toolCalls: [toolCall] }, // no debería ejecutarse
    ]);
    const topicRegistry = makeTopicRegistryMock();
    const toolRegistry = makeToolRegistryMock();
    const toolRunner = makeToolRunnerMock();
    const logger = makeLoggerMock();

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      topicRegistry as never,
      toolRegistry as never,
      toolRunner as never,
      logger as never,
      { maxIterations: 1, maxToolCalls: 10 },
    );

    await orchestrator.run(BASE_INPUT);

    // Solo 1 instancia de provider creada (factory.create llamado 1 vez)
    expect(providerFactory.create).toHaveBeenCalledTimes(1);
  });
});

describe('AIOrchestrator — maxToolCalls guardrail', () => {
  it('debe cortar y retornar guardReason=max_tool_calls cuando se superan las tool calls', async () => {
    const toolCall = { id: 'tc-1', name: 'createCitizen', input: {} };
    // Provider siempre devuelve 3 tool calls en cada iteración
    const responses = [
      { toolCalls: [toolCall, toolCall, toolCall] },
      { toolCalls: [toolCall, toolCall, toolCall] },
    ];

    const providerFactory = makeProviderFactoryMock(responses);
    const topicRegistry = makeTopicRegistryMock();
    const toolRegistry = makeToolRegistryMock();
    const toolRunner = makeToolRunnerMock();
    const logger = makeLoggerMock();

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      topicRegistry as never,
      toolRegistry as never,
      toolRunner as never,
      logger as never,
      { maxIterations: 5, maxToolCalls: 2 }, // máximo 2 tool calls
    );

    const result = await orchestrator.run(BASE_INPUT);

    expect(result.guardReason).toBe('max_tool_calls');
    // Solo ejecutó 2 tools antes de cortar
    expect(toolRunner.execute).toHaveBeenCalledTimes(2);
  });

  it('NO debe retornar guardReason si las tool calls están dentro del límite', async () => {
    const toolCall = { id: 'tc-1', name: 'createCitizen', input: {} };
    const providerFactory = makeProviderFactoryMock([
      { toolCalls: [toolCall] },
      { text: 'Listo, ciudadano creado.', toolCalls: [] },
    ]);
    const topicRegistry = makeTopicRegistryMock();
    const toolRegistry = makeToolRegistryMock();
    const toolRunner = makeToolRunnerMock();
    const logger = makeLoggerMock();

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      topicRegistry as never,
      toolRegistry as never,
      toolRunner as never,
      logger as never,
      { maxIterations: 5, maxToolCalls: 3 }, // límite 3, solo usa 1
    );

    const result = await orchestrator.run(BASE_INPUT);

    expect(result.guardReason).toBeUndefined();
    expect(toolRunner.execute).toHaveBeenCalledTimes(1);
  });

  it('debe cortar loop de tool duplicada y responder fallback para no quedar en silencio', async () => {
    const toolCall = { id: 'tc-dup-1', name: 'createCitizen', input: { phone: '5213223188252' } };
    const providerFactory = makeProviderFactoryMock([
      { toolCalls: [toolCall] },
      { toolCalls: [toolCall] },
      { toolCalls: [toolCall] },
      { toolCalls: [toolCall] },
    ]);
    const topicRegistry = makeTopicRegistryMock();
    const toolRegistry = makeToolRegistryMock();
    const toolRunner = makeToolRunnerMock();
    const logger = makeLoggerMock();

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      topicRegistry as never,
      toolRegistry as never,
      toolRunner as never,
      logger as never,
      { maxIterations: 10, maxToolCalls: 10 },
    );

    const result = await orchestrator.run(BASE_INPUT);

    expect(result.guardReason).toBe('max_tool_calls');
    expect(result.handled).toBe(true);
    expect(result.responseText).toContain('me quedé sin contexto');
    // Se ejecuta solo 2 veces; la 3ra repetición activa el guard antes de ejecutar la tool.
    expect(toolRunner.execute).toHaveBeenCalledTimes(2);
  });

  it('permite ajustar duplicateToolLoopThreshold para tolerar más reintentos legítimos', async () => {
    const toolCall = { id: 'tc-dup-1', name: 'createCitizen', input: { phone: '5213223188252' } };
    const providerFactory = makeProviderFactoryMock([
      { toolCalls: [toolCall] },
      { toolCalls: [toolCall] },
      { toolCalls: [toolCall] },
      { text: 'Listo, registro completado.', toolCalls: [] },
    ]);
    const topicRegistry = makeTopicRegistryMock();
    const toolRegistry = makeToolRegistryMock();
    const toolRunner = makeToolRunnerMock();
    const logger = makeLoggerMock();

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      topicRegistry as never,
      toolRegistry as never,
      toolRunner as never,
      logger as never,
      { maxIterations: 10, maxToolCalls: 10, duplicateToolLoopThreshold: 4 },
    );

    const result = await orchestrator.run(BASE_INPUT);

    expect(result.guardReason).toBeUndefined();
    expect(result.handled).toBe(true);
    expect(result.responseText).toContain('registro completado');
    expect(toolRunner.execute).toHaveBeenCalledTimes(3);
  });
});

describe('AIOrchestrator — coherencia con DEFAULT_LIMITS', () => {
  it('debe usar DEFAULT_LIMITS si no se pasan limits al constructor', async () => {
    // Sin limits → defaults: maxIterations=4, maxToolCalls=6
    const providerFactory = makeProviderFactoryMock([{ text: 'Hola', toolCalls: [] }]);
    const topicRegistry = makeTopicRegistryMock();
    const toolRegistry = makeToolRegistryMock();
    const toolRunner = makeToolRunnerMock();
    const logger = makeLoggerMock();

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      topicRegistry as never,
      toolRegistry as never,
      toolRunner as never,
      logger as never,
      // sin limits
    );

    const result = await orchestrator.run(BASE_INPUT);
    expect(result.handled).toBe(true);
    expect(result.guardReason).toBeUndefined();
  });
});

describe('AIOrchestrator — historyMessages injection', () => {
  it('debe incluir historyMessages entre el system prompt y el mensaje del usuario', async () => {
    let capturedMessages: unknown[] = [];
    let firstCall = true;
    const providerFactory = {
      create: jest.fn(() => ({
        generate: jest.fn(async (input: { messages: unknown[] }) => {
          if (firstCall) {
            capturedMessages = [...input.messages];
            firstCall = false;
          }
          return { text: 'ok', toolCalls: [], raw: {}, providerUnavailable: false };
        }),
      })),
    };

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      makeTopicRegistryMock() as never,
      makeToolRegistryMock() as never,
      makeToolRunnerMock() as never,
      makeLoggerMock() as never,
      { maxIterations: 3, maxToolCalls: 10 },
    );

    const history = [
      { role: 'user' as const, content: 'Primer mensaje del ciudadano' },
      { role: 'assistant' as const, content: 'Primera respuesta del bot' },
    ];

    await orchestrator.run({ ...BASE_INPUT, historyMessages: history });

    // system → history[0] → history[1] → user actual
    expect(capturedMessages).toHaveLength(4);
    expect((capturedMessages[0] as { role: string }).role).toBe('system');
    expect(capturedMessages[1]).toEqual(history[0]);
    expect(capturedMessages[2]).toEqual(history[1]);
    expect((capturedMessages[3] as { role: string; content: string }).role).toBe('user');
    expect((capturedMessages[3] as { role: string; content: string }).content).toBe(
      BASE_INPUT.context.messageText,
    );
  });

  it('sin historyMessages debe mantener solo system + user actual', async () => {
    let capturedMessages: unknown[] = [];
    let firstCall = true;
    const providerFactory = {
      create: jest.fn(() => ({
        generate: jest.fn(async (input: { messages: unknown[] }) => {
          if (firstCall) {
            capturedMessages = [...input.messages];
            firstCall = false;
          }
          return { text: 'ok', toolCalls: [], raw: {}, providerUnavailable: false };
        }),
      })),
    };

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      makeTopicRegistryMock() as never,
      makeToolRegistryMock() as never,
      makeToolRunnerMock() as never,
      makeLoggerMock() as never,
    );

    await orchestrator.run(BASE_INPUT);

    expect(capturedMessages).toHaveLength(2);
    expect((capturedMessages[0] as { role: string }).role).toBe('system');
    expect((capturedMessages[1] as { role: string }).role).toBe('user');
  });
});

describe('AIOrchestrator — prompt and output guardrails', () => {
  it('inyecta guardrails de system prompt antes del prompt de negocio', async () => {
    let systemPrompt = '';
    const providerFactory = {
      create: jest.fn(() => ({
        generate: jest.fn(async (input: { messages: Array<{ role: string; content: string }> }) => {
          systemPrompt = input.messages[0]?.content ?? '';
          return { text: 'ok', toolCalls: [], raw: {}, providerUnavailable: false };
        }),
      })),
    };

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      makeTopicRegistryMock('PROMPT DE NEGOCIO') as never,
      makeToolRegistryMock() as never,
      makeToolRunnerMock() as never,
      makeLoggerMock() as never,
    );

    await orchestrator.run(BASE_INPUT);

    expect(systemPrompt).toContain('Control Estricto de Contexto para Agente IA Voz Ciudadana');
    expect(systemPrompt).toContain('PROMPT DE NEGOCIO');
  });

  it('si flowState=REGISTERING inyecta instrucción temporal para mantener foco', async () => {
    let systemPrompt = '';
    const providerFactory = {
      create: jest.fn(() => ({
        generate: jest.fn(async (input: { messages: Array<{ role: string; content: string }> }) => {
          systemPrompt = input.messages[0]?.content ?? '';
          return { text: 'ok', toolCalls: [], raw: {}, providerUnavailable: false };
        }),
      })),
    };

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      makeTopicRegistryMock() as never,
      makeToolRegistryMock() as never,
      makeToolRunnerMock() as never,
      makeLoggerMock() as never,
    );

    await orchestrator.run({
      ...BASE_INPUT,
      context: makeContext({ flowState: 'REGISTERING' }),
    });

    expect(systemPrompt).toContain('proceso de registro crítico');
  });

  it('bloquea salida prohibida, reemplaza respuesta y registra incidente', async () => {
    const logger = makeLoggerMock();
    const providerFactory = makeProviderFactoryMock([
      { text: '```ts\nfunction hack(){ return 1 }\n```', toolCalls: [] },
    ]);

    const orchestrator = new AIOrchestrator(
      providerFactory as never,
      makeTopicRegistryMock() as never,
      makeToolRegistryMock() as never,
      makeToolRunnerMock() as never,
      logger as never,
    );

    const result = await orchestrator.run(BASE_INPUT);

    expect(result.handled).toBe(true);
    expect(result.responseText).toContain('problema técnico');
    expect(logger.markOutputGuardrail).toHaveBeenCalledTimes(1);
  });
});

describe('AIOrchestrator — guard de estado terminal (AI-bloqueado)', () => {
  it('al recibir flowState CLOSED: la siguiente iteración recibe tools=[] y UNA sola nota [SISTEMA]', async () => {
    const closeCall = {
      id: 'tc-close-1',
      name: 'closeConversation',
      input: { conversationId: 'conv-1' },
    };
    const { factory, calls } = makeCapturingProviderFactoryMock([
      { toolCalls: [closeCall] },
      { text: 'Listo, cierro tu consulta. ¡Que tengas buen día!', toolCalls: [] },
    ]);
    const toolRunner = {
      execute: jest.fn(async () => ({ closed: true, flowState: 'CLOSED' })),
    };
    const logger = makeLoggerMock();

    const orchestrator = new AIOrchestrator(
      factory as never,
      makeTopicRegistryMock() as never,
      makeTransitionToolRegistryMock() as never,
      toolRunner as never,
      logger as never,
      { maxIterations: 5, maxToolCalls: 10 },
    );

    const result = await orchestrator.run(BASE_INPUT);

    // El run completa normalmente con el texto final del modelo
    expect(result.guardReason).toBeUndefined();
    expect(result.handled).toBe(true);
    expect(result.responseText).toContain('cierro tu consulta');

    // La iteración post-cierre no anuncia tools
    expect(calls).toHaveLength(2);
    expect(calls[1]?.tools).toEqual([]);

    // Exactamente UNA nota [SISTEMA] como mensaje user en todo el historial
    const sistemaNotes = (calls[1]?.messages ?? []).filter(
      (m) => m.role === 'user' && m.content.startsWith('[SISTEMA]'),
    );
    expect(sistemaNotes).toHaveLength(1);
    expect(sistemaNotes[0]?.content).toContain('CLOSED');
  });

  it('skipea sin ejecutar una tool call alucinada después del estado terminal', async () => {
    const closeCall = {
      id: 'tc-close-1',
      name: 'closeConversation',
      input: { conversationId: 'conv-1' },
    };
    const hallucinatedCall = {
      id: 'tc-hack-1',
      name: 'createCitizen',
      input: { phone: '5491100001111' },
    };
    const { factory, calls } = makeCapturingProviderFactoryMock([
      { toolCalls: [closeCall] },
      { toolCalls: [hallucinatedCall] },
      { text: 'Cierre cordial.', toolCalls: [] },
    ]);
    const toolRunner = {
      execute: jest.fn(async () => ({ closed: true, flowState: 'CLOSED' })),
    };
    const logger = makeLoggerMock();

    const orchestrator = new AIOrchestrator(
      factory as never,
      makeTopicRegistryMock() as never,
      makeTransitionToolRegistryMock() as never,
      toolRunner as never,
      logger as never,
      { maxIterations: 6, maxToolCalls: 10 },
    );

    const result = await orchestrator.run(BASE_INPUT);

    // La tool alucinada NO se ejecuta: sólo corrió closeConversation
    expect(toolRunner.execute).toHaveBeenCalledTimes(1);
    expect(toolRunner.execute).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ name: 'closeConversation' }),
      expect.any(Array),
      expect.any(Object),
    );

    // Se empuja un mensaje role:'tool' con skipped:true para la call alucinada
    const lastCall = calls[calls.length - 1];
    const skippedMessage = lastCall?.messages.find(
      (m) => m.role === 'tool' && m.toolCallId === 'tc-hack-1',
    );
    expect(skippedMessage).toBeDefined();
    if (!skippedMessage) {
      throw new Error('skipped tool message missing');
    }
    const payload = JSON.parse(skippedMessage.content) as Record<string, unknown>;
    expect(payload).toMatchObject({
      skipped: true,
      reason: 'AI_BLOCKED_STATE',
      flowState: 'CLOSED',
    });

    // El skip no incrementa el contador de tool calls (completeRun recibe toolCalls=1)
    expect(logger.completeRun).toHaveBeenCalledWith('run-1', 'Cierre cordial.', 3, 1);
    expect(result.guardReason).toBeUndefined();
  });

  it('corta la 2ª invocación idéntica de una transition-tool (threshold 2) ANTES de ejecutarla', async () => {
    // assignDepartment con DEPARTMENT_ROUTING NO es AI-bloqueado: el corte es por
    // threshold de duplicados (2 para transition-tools), no por estado terminal.
    const assignCall = {
      id: 'tc-assign-1',
      name: 'assignDepartment',
      input: { departmentSlug: 'obras' },
    };
    const assignCallRepeated = {
      id: 'tc-assign-2',
      name: 'assignDepartment',
      input: { departmentSlug: 'obras' },
    };
    const { factory } = makeCapturingProviderFactoryMock([
      { toolCalls: [assignCall] },
      { toolCalls: [assignCallRepeated] },
      { text: 'no debe llegar', toolCalls: [] },
    ]);
    const toolRunner = {
      execute: jest.fn(async () => ({ assigned: true, flowState: 'DEPARTMENT_ROUTING' })),
    };
    const logger = makeLoggerMock();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const orchestrator = new AIOrchestrator(
      factory as never,
      makeTopicRegistryMock() as never,
      makeTransitionToolRegistryMock() as never,
      toolRunner as never,
      logger as never,
      { maxIterations: 10, maxToolCalls: 10 },
    );

    const result = await orchestrator.run(BASE_INPUT);

    // La 2ª firma idéntica corta ANTES de ejecutarse
    expect(toolRunner.execute).toHaveBeenCalledTimes(1);
    expect(result.guardReason).toBe('max_tool_calls');

    // El warn registra el threshold efectivo (2 para transition-tools)
    const duplicateWarn = warnSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .find((entry) => entry?.event === 'orchestrator.guard.duplicate_tool_loop');
    expect(duplicateWarn).toBeDefined();
    expect(duplicateWarn).toMatchObject({
      toolName: 'assignDepartment',
      repeatedCount: 2,
      threshold: 2,
    });

    warnSpy.mockRestore();
  });

  it('flowState DEPARTMENT_ROUTING (no AI-bloqueado) no steerea: conserva tools y no agrega nota', async () => {
    const assignCall = {
      id: 'tc-assign-1',
      name: 'assignDepartment',
      input: { departmentSlug: 'obras' },
    };
    const { factory, calls } = makeCapturingProviderFactoryMock([
      { toolCalls: [assignCall] },
      { text: 'Ya derivé tu consulta al área correspondiente.', toolCalls: [] },
    ]);
    const toolRunner = {
      execute: jest.fn(async () => ({ assigned: true, flowState: 'DEPARTMENT_ROUTING' })),
    };

    const orchestrator = new AIOrchestrator(
      factory as never,
      makeTopicRegistryMock() as never,
      makeTransitionToolRegistryMock() as never,
      toolRunner as never,
      makeLoggerMock() as never,
      { maxIterations: 5, maxToolCalls: 10 },
    );

    const result = await orchestrator.run(BASE_INPUT);

    expect(result.guardReason).toBeUndefined();
    expect(calls).toHaveLength(2);
    // La iteración siguiente conserva la lista completa de tools
    expect(calls[1]?.tools.map((t) => t.name)).toEqual(['closeConversation', 'assignDepartment']);
    // No se agregó ninguna nota [SISTEMA]
    const sistemaNotes = (calls[1]?.messages ?? []).filter(
      (m) => m.role === 'user' && m.content.startsWith('[SISTEMA]'),
    );
    expect(sistemaNotes).toHaveLength(0);
  });
});
