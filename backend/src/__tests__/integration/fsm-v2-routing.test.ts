/**
 * Integration test: fsm-v2-routing
 *
 * Verifica que InboxProcessorService.buildOrchestrator() use únicamente
 * FsmRouterV2 + ConversationStateMachine con tabla FSM activa.
 *
 * Estrategia: usa dynamic import spies + constructor mocks para interceptar
 * qué clase fue instanciada en buildOrchestrator, sin ejecutar I/O real.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// ─── Mocks de dependencias pesadas (antes de any import) ─────────────────────

jest.mock('../../ai/services/ai.service', () => ({
  AIService: jest.fn().mockImplementation(() => ({
    toolRunner: { setFsmRouter: jest.fn() },
  })),
}));

jest.mock('../../ai/fsm/fsm-guards', () => ({
  DEFAULT_FSM_GUARDRAILS: {},
}));

// Spy-able constructors
const mockFsmRouterV2Constructor = jest.fn();

jest.mock('../../ai/fsm/fsm-router-v2', () => ({
  FsmRouterV2: mockFsmRouterV2Constructor,
}));

// Mock repositories + downstream services
jest.mock('../../repositories/citizen.repository', () => ({
  CitizenRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../repositories/conversation.repository', () => ({
  ConversationRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../repositories/message.repository', () => ({
  MessageRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../services/orchestrator/department-router.strategy', () => ({
  DepartmentRouterStrategy: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../services/conversations.service', () => ({
  ConversationsService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../services/orchestrator/message-orchestrator.service', () => ({
  MessageOrchestratorService: jest.fn().mockImplementation(() => ({})),
}));

const MockConversationStateMachine = jest.fn().mockImplementation(() => ({ _version: 'v2' }));
jest.mock('../../services/orchestrator/conversation-state-machine', () => ({
  ConversationStateMachine: MockConversationStateMachine,
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { InboxProcessorService } from '../../services/events/inbox-processor.service';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeService(realtimeNotifier?: unknown): InboxProcessorService {
  const prisma = { _type: 'PrismaService' } as never;
  const whatsapp = {} as never;
  const outbox = {} as never;
  return new InboxProcessorService(
    prisma,
    whatsapp,
    outbox,
    realtimeNotifier as never,
    undefined,
    undefined,
    undefined,
    { pollIntervalMs: 1000 },
  );
}

// buildOrchestrator es privado → lo invocamos via cast
async function callBuildOrchestrator(service: InboxProcessorService): Promise<void> {
  await (
    service as unknown as { buildOrchestrator(id: string): Promise<unknown> }
  ).buildOrchestrator('test-corr-id');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InboxProcessorService.buildOrchestrator — FSM V2 only', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('instancia FsmRouterV2 y ConversationStateMachine', async () => {
    const service = makeService();

    await callBuildOrchestrator(service);

    expect(mockFsmRouterV2Constructor).toHaveBeenCalledTimes(1);
    expect(MockConversationStateMachine).toHaveBeenCalledTimes(1);
  });

  it('pasa FsmRouterV2 a toolRunner.setFsmRouter y MessageOrchestratorService', async () => {
    const fsmRouterV2Instance = { _type: 'FsmRouterV2' };
    mockFsmRouterV2Constructor.mockReturnValueOnce(fsmRouterV2Instance);

    const { AIService } = await import('../../ai/services/ai.service');
    const mockSetFsmRouter = jest.fn();
    (AIService as jest.MockedClass<typeof AIService>).mockImplementationOnce(
      () =>
        ({
          toolRunner: { setFsmRouter: mockSetFsmRouter },
        }) as never,
    );

    const service = makeService();
    await callBuildOrchestrator(service);

    expect(mockSetFsmRouter).toHaveBeenCalledWith(fsmRouterV2Instance);

    const { MessageOrchestratorService } =
      await import('../../services/orchestrator/message-orchestrator.service');
    const calls = (
      MessageOrchestratorService as jest.MockedClass<typeof MessageOrchestratorService>
    ).mock.calls;
    // El 6º argumento (índice 6) es fsmRouter
    expect(calls[0]?.[6]).toBe(fsmRouterV2Instance);
  });

  it('inyecta realtimeNotifier y prisma al MessageOrchestratorService cuando se proveen', async () => {
    const realtimeNotifier = { isEnabled: jest.fn(() => true) };
    const service = makeService(realtimeNotifier);

    await callBuildOrchestrator(service);

    const { MessageOrchestratorService } =
      await import('../../services/orchestrator/message-orchestrator.service');
    const calls = (
      MessageOrchestratorService as jest.MockedClass<typeof MessageOrchestratorService>
    ).mock.calls;

    // índice 9 = realtimeNotifier, índice 10 = prisma
    expect(calls[0]?.[9]).toBe(realtimeNotifier);
    expect(calls[0]?.[10]).toEqual(expect.objectContaining({ _type: 'PrismaService' }));
  });

  it('mantiene fallback legacy cuando no se provee realtimeNotifier', async () => {
    const service = makeService();

    await callBuildOrchestrator(service);

    const { MessageOrchestratorService } =
      await import('../../services/orchestrator/message-orchestrator.service');
    const calls = (
      MessageOrchestratorService as jest.MockedClass<typeof MessageOrchestratorService>
    ).mock.calls;

    expect(calls[0]?.[9]).toBeUndefined();
  });
});
