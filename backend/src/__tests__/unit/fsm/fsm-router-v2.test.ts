/**
 * Tests unitarios: FsmRouterV2
 * Cubre:
 *  - Bloqueo de IA según estado (REGISTERING → AI activa)
 *  - assignDepartment → DEPARTMENT_ROUTING (no HUMAN_FLOW)
 *  - escalateToHuman → ESCALATED (único setter)
 *  - Compat fallback: HUMAN_FLOW sin assignedUserId → DEPARTMENT_ROUTING
 *  - Transición inválida lanza InvalidFsmTransitionError
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FsmRouterV2, getFsmV2Metrics, resetFsmV2Metrics } from '../../../ai/fsm/fsm-router-v2';
import { FsmRouterInput } from '../../../ai/fsm/fsm-router.types';
import { InvalidFsmTransitionError } from '../../../ai/fsm/fsm-transitions';

// ─── Mocks ────────────────────────────────────────────────────────────────────

function makeConversationRepoMock() {
  return {
    getConversationContext: jest.fn<() => Promise<unknown>>(),
    findOrCreateOpen: jest.fn(),
    updateFlowState: jest.fn(),
    closeInactive: jest.fn(),
    updateConversationStatus: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    transferToDepartment: jest.fn(async () => undefined),
  };
}

function makeStateMachineMock() {
  return {
    transition: jest.fn(),
    isValidTransition: jest.fn(),
  };
}

function makeFsmLockMock() {
  return {
    acquire: jest.fn(async () => 'lock-token-1'),
    release: jest.fn(async () => true),
  };
}

function makeAiServiceMock() {
  return {
    handleMessage: jest.fn(async (_context?: { abortSignal?: AbortSignal }) => ({
      handled: true,
      runId: 'run-v2-123',
    })),
  };
}

function makeInput(overrides?: Partial<FsmRouterInput>): FsmRouterInput {
  return {
    conversationId: 'conv-1',
    citizenId: 'citizen-1',
    phone: '5491100001111',
    messageId: 'msg-v2-1',
    waMessageId: 'wamid-v2-1',
    messageText: 'Hola',
    correlationId: 'corr-v2-1',
    ...overrides,
  };
}

function makeMetaContext(flowState: string, version = 0, assignedUserId?: string) {
  return {
    id: 'conv-1',
    assignedUserId,
    meta: { flowState, version, id: 'meta-1', conversationId: 'conv-1' },
    citizen: { id: 'citizen-1', phone: '5491100001111', name: 'Test', leadStatus: 'new' },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FsmRouterV2 — AI active/blocked matrix', () => {
  let conversationRepo: ReturnType<typeof makeConversationRepoMock>;
  let stateMachine: ReturnType<typeof makeStateMachineMock>;
  let fsmLock: ReturnType<typeof makeFsmLockMock>;
  let aiService: ReturnType<typeof makeAiServiceMock>;
  let router: FsmRouterV2;

  beforeEach(() => {
    conversationRepo = makeConversationRepoMock();
    stateMachine = makeStateMachineMock();
    fsmLock = makeFsmLockMock();
    aiService = makeAiServiceMock();
    resetFsmV2Metrics();

    router = new FsmRouterV2(
      conversationRepo as never,
      stateMachine as never,
      fsmLock as never,
      aiService as never,
    );
  });

  const aiActiveStates = ['BOT_FLOW', 'DEPARTMENT_ROUTING', 'REGISTERING'];

  it.each(aiActiveStates)('debe invocar IA en estado %s (V2 ai-active)', async (state) => {
    conversationRepo.getConversationContext.mockResolvedValue(
      makeMetaContext(state, 0, 'user-abc'),
    );

    const result = await router.handle(makeInput());

    expect(result.decision.kind).toBe('ai_handled');
    expect(aiService.handleMessage).toHaveBeenCalledTimes(1);
  });

  const aiBlockedStates = ['HUMAN_FLOW', 'ESCALATED', 'CLOSED'];

  it('transporta adjuntos hasta el servicio IA dentro del turno protegido', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('BOT_FLOW'));
    const inboundMessages = [
      {
        type: 'audio' as const,
        id: 'wa-audio',
        from: '52',
        timestamp: '1',
        audio: { id: '123', mime_type: 'audio/ogg' },
      },
    ];
    await router.handle(makeInput({ inboundMessages }));
    expect(aiService.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        inboundMessages,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it.each(aiBlockedStates)('debe bloquear IA en estado %s', async (state) => {
    conversationRepo.getConversationContext.mockResolvedValue(
      makeMetaContext(state, 0, 'user-assigned-123'),
    );

    const result = await router.handle(makeInput());

    expect(result.decision.kind).toBe('ai_blocked');
    expect(aiService.handleMessage).not.toHaveBeenCalled();
  });
});

describe('FsmRouterV2 — DEPARTMENT_ROUTING: handoff a departamento silencia IA (opción A) y conserva contexto', () => {
  let conversationRepo: ReturnType<typeof makeConversationRepoMock>;
  let stateMachine: ReturnType<typeof makeStateMachineMock>;
  let fsmLock: ReturnType<typeof makeFsmLockMock>;
  let aiService: ReturnType<typeof makeAiServiceMock>;
  let router: FsmRouterV2;

  beforeEach(() => {
    conversationRepo = makeConversationRepoMock();
    stateMachine = makeStateMachineMock();
    fsmLock = makeFsmLockMock();
    aiService = makeAiServiceMock();
    resetFsmV2Metrics();

    router = new FsmRouterV2(
      conversationRepo as never,
      stateMachine as never,
      fsmLock as never,
      aiService as never,
    );
  });

  it('debe invocar IA cuando estado es DEPARTMENT_ROUTING', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(
      makeMetaContext('DEPARTMENT_ROUTING', 1, 'dept-user'),
    );

    const result = await router.handle(makeInput());

    expect(result.decision.kind).toBe('ai_handled');
    expect(aiService.handleMessage).toHaveBeenCalledTimes(1);
    expect(result.flowState).toBe('DEPARTMENT_ROUTING');
  });

  it('executeToolTransition: assignDepartment → DEPARTMENT_ROUTING (nunca HUMAN_FLOW)', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('BOT_FLOW', 0));

    await router.executeToolTransition('conv-1', 'assignDepartment', 'corr-v2');

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'conv-1',
      'DEPARTMENT_ROUTING', // ← V2: nunca HUMAN_FLOW
      expect.any(Number),
      expect.any(Object),
    );
  });

  it('opción A: assignDepartment delega en transferToDepartment (handoff humano) y conserva el contexto de routing', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('BOT_FLOW', 0));

    await router.executeToolTransition('conv-1', 'assignDepartment', 'corr-v2', {
      departmentSlug: 'agua',
    });

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'conv-1',
      'DEPARTMENT_ROUTING',
      expect.any(Number),
      expect.objectContaining({ departmentSlug: 'agua' }),
    );
    // El handoff silencia al bot vía el método unificado, no escribiendo campos a ciegas.
    expect(conversationRepo.transferToDepartment).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      departmentSlug: 'agua',
      transferredBy: 'bot',
      reason: 'assignDepartment',
      // El repositorio fija assignedDept + attendanceMode=human + botEnabled=false
      // + transferredAt/By/Reason + evento de auditoría en una sola transacción.
    });
  });

  it('opción A: re-asignación desde DEPARTMENT_ROUTING también silencia vía transferToDepartment', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(
      makeMetaContext('DEPARTMENT_ROUTING', 1),
    );

    await router.executeToolTransition('conv-1', 'assignDepartment', 'corr-v2', {
      departmentSlug: 'obras_publicas',
    });

    expect(conversationRepo.transferToDepartment).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      departmentSlug: 'obras_publicas',
      transferredBy: 'bot',
      reason: 'assignDepartment',
    });
  });

  it('executeToolTransition: assignDepartment nunca llama HUMAN_FLOW', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('BOT_FLOW', 0));

    await router.executeToolTransition('conv-1', 'assignDepartment', 'corr-v2');

    const calls = (stateMachine.transition as jest.Mock).mock.calls;
    const humanFlowCall = calls.find((c) => c[1] === 'HUMAN_FLOW');
    expect(humanFlowCall).toBeUndefined();
  });

  it('metrics.transitionCount se incrementa', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('BOT_FLOW', 0));
    resetFsmV2Metrics();

    await router.executeToolTransition('conv-1', 'assignDepartment', 'corr-v2');

    expect(getFsmV2Metrics().transitionCount).toBe(1);
  });
});

describe('FsmRouterV2 — escalateToHuman: único setter de ESCALATED', () => {
  let conversationRepo: ReturnType<typeof makeConversationRepoMock>;
  let stateMachine: ReturnType<typeof makeStateMachineMock>;
  let fsmLock: ReturnType<typeof makeFsmLockMock>;
  let aiService: ReturnType<typeof makeAiServiceMock>;
  let router: FsmRouterV2;

  beforeEach(() => {
    conversationRepo = makeConversationRepoMock();
    stateMachine = makeStateMachineMock();
    fsmLock = makeFsmLockMock();
    aiService = makeAiServiceMock();
    resetFsmV2Metrics();

    router = new FsmRouterV2(
      conversationRepo as never,
      stateMachine as never,
      fsmLock as never,
      aiService as never,
    );
  });

  it('escalateToHuman → ESCALATED desde DEPARTMENT_ROUTING', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(
      makeMetaContext('DEPARTMENT_ROUTING', 1),
    );

    await router.executeToolTransition('conv-1', 'escalateToHuman', 'corr-v2');

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'conv-1',
      'ESCALATED',
      expect.any(Number),
      expect.any(Object),
    );
  });

  it('transición inválida lanza InvalidFsmTransitionError', async () => {
    // CLOSED → ESCALATED no está permitido en V2
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('CLOSED', 0));

    await expect(
      router.executeToolTransition('conv-1', 'escalateToHuman', 'corr-v2'),
    ).rejects.toBeInstanceOf(InvalidFsmTransitionError);

    expect(getFsmV2Metrics().invalidTransitionCount).toBe(1);
  });
});

describe('FsmRouterV2 — Transición inválida DEPARTMENT_ROUTING → BOT_FLOW', () => {
  let conversationRepo: ReturnType<typeof makeConversationRepoMock>;
  let stateMachine: ReturnType<typeof makeStateMachineMock>;
  let fsmLock: ReturnType<typeof makeFsmLockMock>;
  let aiService: ReturnType<typeof makeAiServiceMock>;
  let router: FsmRouterV2;

  beforeEach(() => {
    conversationRepo = makeConversationRepoMock();
    stateMachine = makeStateMachineMock();
    fsmLock = makeFsmLockMock();
    aiService = makeAiServiceMock();
    resetFsmV2Metrics();

    router = new FsmRouterV2(
      conversationRepo as never,
      stateMachine as never,
      fsmLock as never,
      aiService as never,
    );
  });

  it('DEPARTMENT_ROUTING → BOT_FLOW debe fallar, incrementar invalidTransitionCount y emitir fsm_v2.tool_transition.invalid', async () => {
    // Given: conversación en DEPARTMENT_ROUTING
    conversationRepo.getConversationContext.mockResolvedValue(
      makeMetaContext('DEPARTMENT_ROUTING', 1),
    );

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    // When: se intenta transicionar a ESCALATED desde DEPARTMENT_ROUTING (assignDepartment
    // intenta ir a DEPARTMENT_ROUTING desde DEPARTMENT_ROUTING — auto-transición inválida).
    // Para cubrir el scenario exacto del spec (DEPT_ROUTING → BOT_FLOW), usamos un toolKey
    // ficticio que apunta a BOT_FLOW para verificar que assertValidTransition rechaza.
    // El router invoca resolveToolTransition → si no hay regla no transiciona.
    // Por eso probamos la función de bajo nivel assertValidTransition directamente:
    const { assertValidTransition, InvalidFsmTransitionError: IFE } =
      await import('../../../ai/fsm/fsm-transitions');

    expect(() =>
      assertValidTransition('DEPARTMENT_ROUTING', 'BOT_FLOW', 'synthetic_back_tool'),
    ).toThrow(IFE);

    // And: confirmamos el log de inconsistencia a través del router cuando la tool
    // hace una transición inválida (CLOSED → ESCALATED es el caso equivalente ya cubierto
    // en el suite de escalateToHuman). Verificar que invalidTransitionCount sube:
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('CLOSED', 0));
    await expect(
      router.executeToolTransition('conv-1', 'escalateToHuman', 'corr-v2-invalid'),
    ).rejects.toBeInstanceOf(InvalidFsmTransitionError);

    expect(getFsmV2Metrics().invalidTransitionCount).toBe(1);

    // The structured log with fsm_v2.tool_transition.invalid MUST have been emitted
    const logCalls = consoleSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const invalidLog = logCalls.find((entry) => entry?.event === 'fsm_v2.tool_transition.invalid');
    expect(invalidLog).toBeDefined();
    expect(invalidLog?.fsmVersion).toBe('v2');

    consoleSpy.mockRestore();
  });
});

describe('FsmRouterV2 — closeConversation: CLOSED + status=closed', () => {
  let conversationRepo: ReturnType<typeof makeConversationRepoMock>;
  let stateMachine: ReturnType<typeof makeStateMachineMock>;
  let fsmLock: ReturnType<typeof makeFsmLockMock>;
  let router: FsmRouterV2;

  beforeEach(() => {
    conversationRepo = makeConversationRepoMock();
    stateMachine = makeStateMachineMock();
    fsmLock = makeFsmLockMock();
    resetFsmV2Metrics();

    router = new FsmRouterV2(
      conversationRepo as never,
      stateMachine as never,
      fsmLock as never,
      makeAiServiceMock() as never,
    );
  });

  it('closeConversation transiciona FSM a CLOSED', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('BOT_FLOW', 1));

    const result = await router.executeToolTransition('conv-1', 'closeConversation', 'corr-close');

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'conv-1',
      'CLOSED',
      expect.any(Number),
      expect.any(Object),
    );
    expect(result).toBe('CLOSED');
  });

  it('closeConversation delega el cierre de status/tickets a la ConversationStateMachine (no lo hace directamente)', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('BOT_FLOW', 1));

    await router.executeToolTransition('conv-1', 'closeConversation', 'corr-close');

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'conv-1',
      'CLOSED',
      expect.any(Number),
      expect.any(Object),
    );
    expect(conversationRepo.updateConversationStatus).not.toHaveBeenCalled();
  });

  it('confirmCitizenRegistration transiciona a CLOSED delegando el cierre en la state machine', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('REGISTERING', 1));

    await router.executeToolTransition('conv-1', 'confirmCitizenRegistration', 'corr-reg');

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'conv-1',
      'CLOSED',
      expect.any(Number),
      expect.any(Object),
    );
    expect(conversationRepo.updateConversationStatus).not.toHaveBeenCalled();
  });

  it('assignDepartment NO llama updateConversationStatus (no cierra la conversación)', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('BOT_FLOW', 1));

    await router.executeToolTransition('conv-1', 'assignDepartment', 'corr-dept');

    expect(conversationRepo.updateConversationStatus).not.toHaveBeenCalled();
  });
});

describe('FsmRouterV2 — idempotencia de transition-tools (re-invocación sobre estado destino)', () => {
  let conversationRepo: ReturnType<typeof makeConversationRepoMock>;
  let stateMachine: ReturnType<typeof makeStateMachineMock>;
  let fsmLock: ReturnType<typeof makeFsmLockMock>;
  let router: FsmRouterV2;

  beforeEach(() => {
    conversationRepo = makeConversationRepoMock();
    stateMachine = makeStateMachineMock();
    fsmLock = makeFsmLockMock();
    resetFsmV2Metrics();

    router = new FsmRouterV2(
      conversationRepo as never,
      stateMachine as never,
      fsmLock as never,
      makeAiServiceMock() as never,
    );
  });

  function parseStructuredLogs(consoleSpy: jest.SpiedFunction<typeof console.log>) {
    return consoleSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  it('closeConversation desde CLOSED es no-op idempotente: no lanza, no valida grafo ni transiciona', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('CLOSED', 2));
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await router.executeToolTransition(
      'conv-1',
      'closeConversation',
      'corr-idem-close',
    );

    // No-op exitoso: retorna el estado actual, sin tocar el state machine
    expect(result).toBe('CLOSED');
    expect(stateMachine.transition).not.toHaveBeenCalled();
    // No cuenta como transición inválida ni como transición aplicada
    expect(getFsmV2Metrics().invalidTransitionCount).toBe(0);
    expect(getFsmV2Metrics().transitionCount).toBe(0);

    const idempotentLog = parseStructuredLogs(consoleSpy).find(
      (entry) => entry?.event === 'fsm_v2.tool_transition.idempotent',
    );
    expect(idempotentLog).toBeDefined();
    expect(idempotentLog?.toolKey).toBe('closeConversation');
    expect(idempotentLog?.currentState).toBe('CLOSED');

    consoleSpy.mockRestore();
  });

  it('escalateToHuman desde ESCALATED es no-op idempotente: retorna ESCALATED sin transicionar', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('ESCALATED', 3));
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await router.executeToolTransition(
      'conv-1',
      'escalateToHuman',
      'corr-idem-escalate',
    );

    expect(result).toBe('ESCALATED');
    expect(stateMachine.transition).not.toHaveBeenCalled();
    expect(getFsmV2Metrics().invalidTransitionCount).toBe(0);
    expect(getFsmV2Metrics().transitionCount).toBe(0);

    const idempotentLog = parseStructuredLogs(consoleSpy).find(
      (entry) => entry?.event === 'fsm_v2.tool_transition.idempotent',
    );
    expect(idempotentLog).toBeDefined();
    expect(idempotentLog?.toolKey).toBe('escalateToHuman');
    expect(idempotentLog?.currentState).toBe('ESCALATED');

    consoleSpy.mockRestore();
  });
});

describe('FsmRouterV2 — timeout y cancelación de IA', () => {
  let conversationRepo: ReturnType<typeof makeConversationRepoMock>;
  let stateMachine: ReturnType<typeof makeStateMachineMock>;
  let fsmLock: ReturnType<typeof makeFsmLockMock>;
  let aiService: ReturnType<typeof makeAiServiceMock>;
  let router: FsmRouterV2;

  beforeEach(() => {
    conversationRepo = makeConversationRepoMock();
    stateMachine = makeStateMachineMock();
    fsmLock = makeFsmLockMock();
    aiService = makeAiServiceMock();

    router = new FsmRouterV2(
      conversationRepo as never,
      stateMachine as never,
      fsmLock as never,
      aiService as never,
      {
        aiTimeoutMs: 20,
      },
    );
  });

  it('retorna error de timeout y aborta la señal para la corrida de IA', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('BOT_FLOW', 0));

    let capturedSignal: AbortSignal | undefined;
    aiService.handleMessage.mockImplementation(async (context?: { abortSignal?: AbortSignal }) => {
      capturedSignal = context?.abortSignal;
      return await new Promise<{ handled: boolean; runId: string }>(() => {
        // Simula llamada colgada: solo puede cortarse por timeout externo.
      });
    });

    const result = await router.handle(makeInput());

    expect(result.decision.kind).toBe('error');
    if (result.decision.kind === 'error') {
      expect(result.decision.error).toContain('AI timeout after 20ms');
    }
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(true);
  });
});

describe('FsmRouterV2 — conversation lease ownership', () => {
  let conversationRepo: ReturnType<typeof makeConversationRepoMock>;
  let stateMachine: ReturnType<typeof makeStateMachineMock>;
  let fsmLock: ReturnType<typeof makeFsmLockMock>;
  let aiService: ReturnType<typeof makeAiServiceMock>;
  let router: FsmRouterV2;

  beforeEach(() => {
    conversationRepo = makeConversationRepoMock();
    stateMachine = makeStateMachineMock();
    fsmLock = makeFsmLockMock();
    aiService = makeAiServiceMock();
    resetFsmV2Metrics();

    router = new FsmRouterV2(
      conversationRepo as never,
      stateMachine as never,
      fsmLock as never,
      aiService as never,
    );
  });

  it('acquires the lease on conversation.id and always releases it', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('BOT_FLOW', 0));

    await router.handle(makeInput());

    expect(fsmLock.acquire).toHaveBeenCalledTimes(1);
    expect(fsmLock.acquire).toHaveBeenCalledWith('conv-1', expect.any(Number));
    expect(fsmLock.release).toHaveBeenCalledWith('conv-1', expect.any(String));
    expect(aiService.handleMessage).toHaveBeenCalledTimes(1);
  });

  it('propagates excludeMessageIds and batchGeneration to AIService', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('BOT_FLOW', 0));

    await router.handle(
      makeInput({
        excludeMessageIds: ['msg-1', 'msg-2'],
        batchGeneration: 3,
      }),
    );

    expect(aiService.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeMessageIds: ['msg-1', 'msg-2'],
        batchGeneration: 3,
      }),
    );
  });

  it('does not run the AI turn when the lease is already held', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeMetaContext('BOT_FLOW', 0));
    fsmLock.acquire.mockResolvedValue(null as never);

    const result = await router.handle(makeInput());

    expect(result.decision).toEqual({ kind: 'lock_conflict', conversationId: 'conv-1' });
    expect(aiService.handleMessage).not.toHaveBeenCalled();
    expect(fsmLock.release).not.toHaveBeenCalled();
  });
});

describe('FsmRouterV2 — gate de atención (attendanceMode/botEnabled)', () => {
  let conversationRepo: ReturnType<typeof makeConversationRepoMock>;
  let stateMachine: ReturnType<typeof makeStateMachineMock>;
  let fsmLock: ReturnType<typeof makeFsmLockMock>;
  let aiService: ReturnType<typeof makeAiServiceMock>;
  let router: FsmRouterV2;

  beforeEach(() => {
    conversationRepo = makeConversationRepoMock();
    stateMachine = makeStateMachineMock();
    fsmLock = makeFsmLockMock();
    aiService = makeAiServiceMock();
    resetFsmV2Metrics();

    router = new FsmRouterV2(
      conversationRepo as never,
      stateMachine as never,
      fsmLock as never,
      aiService as never,
    );
  });

  it('department transferido por plataforma (attendance human) BLOQUEA la IA aunque flowState sea DEPARTMENT_ROUTING', async () => {
    conversationRepo.getConversationContext.mockResolvedValue({
      id: 'conv-1',
      attendanceMode: 'human',
      botEnabled: false,
      assignedUserId: null,
      meta: {
        flowState: 'DEPARTMENT_ROUTING',
        version: 0,
        id: 'meta-1',
        conversationId: 'conv-1',
      },
      citizen: { id: 'citizen-1', phone: '5491100001111', name: 'Test', leadStatus: 'new' },
    } as never);

    const result = await router.handle(makeInput());

    expect(result.decision.kind).toBe('ai_blocked');
    expect(aiService.handleMessage).not.toHaveBeenCalled();
  });

  it('DEPARTMENT_ROUTING con botEnabled=false BLOQUEA la IA', async () => {
    conversationRepo.getConversationContext.mockResolvedValue({
      id: 'conv-1',
      attendanceMode: 'bot',
      botEnabled: false,
      assignedUserId: null,
      meta: {
        flowState: 'DEPARTMENT_ROUTING',
        version: 0,
        id: 'meta-1',
        conversationId: 'conv-1',
      },
      citizen: { id: 'citizen-1', phone: '5491100001111', name: 'Test', leadStatus: 'new' },
    } as never);

    const result = await router.handle(makeInput());

    expect(result.decision.kind).toBe('ai_blocked');
    expect(aiService.handleMessage).not.toHaveBeenCalled();
  });

  it('DEPARTMENT_ROUTING con attendance bot (routing autónomo) sigue invocando IA', async () => {
    conversationRepo.getConversationContext.mockResolvedValue({
      id: 'conv-1',
      attendanceMode: 'bot',
      botEnabled: true,
      assignedUserId: null,
      meta: {
        flowState: 'DEPARTMENT_ROUTING',
        version: 0,
        id: 'meta-1',
        conversationId: 'conv-1',
      },
      citizen: { id: 'citizen-1', phone: '5491100001111', name: 'Test', leadStatus: 'new' },
    } as never);

    const result = await router.handle(makeInput());

    expect(result.decision.kind).toBe('ai_handled');
    expect(aiService.handleMessage).toHaveBeenCalledTimes(1);
  });
});
