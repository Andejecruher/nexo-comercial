/**
 * Unit tests: ConversationStateMachine — validación de transiciones
 * Cubre: transiciones válidas, transiciones inválidas, anti-loop, handover completo.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VALID_TRANSITIONS } from '../../config/conversation-states';
import { ConversationFlowState } from '../../types/whatsapp.types';

describe('VALID_TRANSITIONS — transiciones de estado', () => {
  const validPairs: Array<[ConversationFlowState, ConversationFlowState]> = [
    ['BOT_FLOW', 'REGISTERING'],
    ['REGISTERING', 'DEPARTMENT_ROUTING'],
    ['DEPARTMENT_ROUTING', 'HUMAN_FLOW'],
    ['HUMAN_FLOW', 'CLOSED'],
    ['HUMAN_FLOW', 'ESCALATED'],
    ['HUMAN_FLOW', 'DEPARTMENT_ROUTING'], // transferencia manual a departamento
    ['HUMAN_FLOW', 'BOT_FLOW'], // transferencia manual a IA
    ['ESCALATED', 'CLOSED'],
    ['ESCALATED', 'HUMAN_FLOW'],
    ['ESCALATED', 'DEPARTMENT_ROUTING'], // transferencia manual a departamento
    ['ESCALATED', 'BOT_FLOW'], // transferencia manual a IA
  ];

  it.each(validPairs)('debe permitir %s → %s', (from, to) => {
    expect(VALID_TRANSITIONS[from]?.includes(to)).toBe(true);
  });

  // Transiciones que definitivamente no deben estar permitidas
  const invalidPairs: Array<[ConversationFlowState, ConversationFlowState]> = [
    ['CLOSED', 'HUMAN_FLOW'], // CLOSED solo puede ir a BOT_FLOW
    ['HUMAN_FLOW', 'HUMAN_FLOW'], // auto-transición
  ];

  it.each(invalidPairs)('debe rechazar %s → %s como inválido', (from, to) => {
    expect(VALID_TRANSITIONS[from]?.includes(to) ?? false).toBe(false);
  });

  it('HUMAN_FLOW no debe permitir auto-transición (anti-loop)', () => {
    expect(VALID_TRANSITIONS['HUMAN_FLOW']?.includes('HUMAN_FLOW') ?? false).toBe(false);
  });

  it('CLOSED solo puede transicionar a BOT_FLOW (re-abrir)', () => {
    expect(VALID_TRANSITIONS['CLOSED']).toEqual(['BOT_FLOW']);
  });
});

describe('ConversationStateMachine — isValidTransition', () => {
  // Importamos ConversationStateMachine con un mock de repo
  const mockRepo = {
    getConversationContext: jest.fn(),
    updateFlowState: jest.fn(),
    findOrCreateOpen: jest.fn(),
  };

  // Importar clase directamente
  const {
    ConversationStateMachine,
  } = require('../../services/orchestrator/conversation-state-machine');
  const machine = new ConversationStateMachine(mockRepo);

  it('debe retornar true para transición BOT_FLOW → REGISTERING', () => {
    expect(machine.isValidTransition('BOT_FLOW', 'REGISTERING')).toBe(true);
  });

  it('debe retornar false para transición CLOSED → HUMAN_FLOW', () => {
    expect(machine.isValidTransition('CLOSED', 'HUMAN_FLOW')).toBe(false);
  });

  it('debe retornar false para transición de estado a sí mismo', () => {
    expect(machine.isValidTransition('HUMAN_FLOW', 'HUMAN_FLOW')).toBe(false);
  });
});

describe('ConversationStateMachine — transition with transaction', () => {
  const mockRepo = {
    getConversationContext: jest.fn<() => Promise<Record<string, unknown> | null>>(),
    getConversationContextInTransaction: jest.fn<() => Promise<Record<string, unknown> | null>>(),
    updateFlowState: jest.fn<() => Promise<void>>(),
    updateFlowStateInTransaction: jest.fn<() => Promise<void>>(),
    updateConversationStatus: jest.fn<() => Promise<void>>(),
    updateConversationStatusInTransaction: jest.fn<() => Promise<void>>(),
    closeActiveTickets: jest.fn<() => Promise<number>>(),
    closeActiveTicketsInTransaction: jest.fn<() => Promise<number>>(),
  };

  const {
    ConversationStateMachine,
  } = require('../../services/orchestrator/conversation-state-machine');

  const tx = { tx: true };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.getConversationContextInTransaction.mockResolvedValue({
      meta: { flowState: 'HUMAN_FLOW', version: 2 },
    });
    mockRepo.updateFlowStateInTransaction.mockResolvedValue(undefined);
    mockRepo.updateConversationStatusInTransaction.mockResolvedValue(undefined);
    mockRepo.closeActiveTicketsInTransaction.mockResolvedValue(1);
  });

  it('reads context inside the transaction when tx is provided', async () => {
    const machine = new ConversationStateMachine(mockRepo);

    await machine.transition('conv-1', 'CLOSED', 2, { suppressEventBus: true }, tx as never);

    expect(mockRepo.getConversationContextInTransaction).toHaveBeenCalledWith(tx, 'conv-1');
    expect(mockRepo.getConversationContext).not.toHaveBeenCalled();
    expect(mockRepo.updateFlowStateInTransaction).toHaveBeenCalledWith(
      tx,
      'conv-1',
      'CLOSED',
      2,
      expect.any(Object),
    );
  });

  it('al llegar a CLOSED cierra también el status y los tickets activos (punto único)', async () => {
    const machine = new ConversationStateMachine(mockRepo);

    await machine.transition('conv-1', 'CLOSED', 2, { suppressEventBus: true }, tx as never);

    expect(mockRepo.updateConversationStatusInTransaction).toHaveBeenCalledWith(
      tx,
      'conv-1',
      'closed',
    );
    expect(mockRepo.closeActiveTicketsInTransaction).toHaveBeenCalledWith(
      tx,
      'conv-1',
      'conversation_closed',
    );
  });

  it('una transición que no es CLOSED no toca status ni tickets', async () => {
    mockRepo.getConversationContextInTransaction.mockResolvedValue({
      meta: { flowState: 'BOT_FLOW', version: 0 },
    });
    const machine = new ConversationStateMachine(mockRepo);

    await machine.transition('conv-1', 'REGISTERING', 0, { suppressEventBus: true }, tx as never);

    expect(mockRepo.updateConversationStatusInTransaction).not.toHaveBeenCalled();
    expect(mockRepo.closeActiveTicketsInTransaction).not.toHaveBeenCalled();
  });

  it('sin transacción, cierra status y tickets por las rutas no-tx', async () => {
    mockRepo.getConversationContext.mockResolvedValue({
      meta: { flowState: 'ESCALATED', version: 5 },
    });
    mockRepo.updateFlowState.mockResolvedValue(undefined);
    mockRepo.updateConversationStatus.mockResolvedValue(undefined);
    mockRepo.closeActiveTickets.mockResolvedValue(1);
    const machine = new ConversationStateMachine(mockRepo);

    await machine.transition('conv-2', 'CLOSED', 5, { suppressEventBus: true });

    expect(mockRepo.updateConversationStatus).toHaveBeenCalledWith('conv-2', 'closed');
    expect(mockRepo.closeActiveTickets).toHaveBeenCalledWith('conv-2', 'conversation_closed');
  });
});
