import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MessageOrchestratorService } from '../../services/orchestrator/message-orchestrator.service';

/**
 * Estados de registro legacy del bot. El orquestador ya no depende de BotService;
 * se conservan como constantes locales para los fixtures de sesión de estas pruebas.
 */
const BotFsmState = {
  NAME: 'NAME',
  AWAITING_INTERESTS: 'AWAITING_INTERESTS',
  COMPLETED: 'COMPLETED',
} as const;

function makeInboundText(text: string) {
  return {
    type: 'text' as const,
    id: 'wamid-1',
    from: '521999888777',
    timestamp: '1700000000',
    text: { body: text },
  };
}

function makePersistedMessage() {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    body: 'hola',
    direction: 'inbound',
    messageType: 'text',
    externalMessageId: 'wamid-1',
    meta: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'sent',
  };
}

/** Sesión de bot con todos los campos requeridos para pasar validación */
function makeCompletedSession() {
  return {
    state: BotFsmState.COMPLETED,
    name: 'Ana',
    neighborhoodId: 'nbhd-1',
    interests: ['agua_servicios'],
  };
}

describe('MessageOrchestratorService', () => {
  const citizenRepo: any = {
    findOrCreate: jest.fn(),
  };

  const conversationRepo: any = {
    findOrCreateCanonical: jest.fn(),
    getConversationContext: jest.fn(),
    findActiveCommunicationLineByExternalIdentifier: jest.fn(),
    bindCommunicationLine: jest.fn(),
  };

  const messageRepo: any = {
    create: jest.fn(),
    findByExternalId: jest.fn(),
  };

  const stateMachine: any = {
    transition: jest.fn(),
  };

  const deptRouter: any = {
    route: jest.fn(),
  };

  const botService: any = {
    handleMessage: jest.fn(),
    handleNonTextMessage: jest.fn(),
    getSession: jest.fn(),
  };

  const whatsappProvider: any = {
    markAsRead: jest.fn(),
  };

  const fsmRouter: any = {
    handle: jest.fn(),
  };

  const redis: any = {
    incr: jest.fn(),
    del: jest.fn(),
  };

  function makeOrchestrator() {
    return new MessageOrchestratorService(
      citizenRepo as never,
      conversationRepo as never,
      messageRepo as never,
      stateMachine as never,
      deptRouter as never,
      whatsappProvider as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    stateMachine.transition.mockReset();
    stateMachine.transition.mockResolvedValue(undefined);

    citizenRepo.findOrCreate.mockResolvedValue({
      id: 'cit-1',
      phone: '521999888777',
      name: 'Ana',
      email: null,
      neighborhoodId: 'nbhd-1',
      neighborhood: 'Centro',
      interests: ['agua_servicios'],
    });
    conversationRepo.findOrCreateCanonical.mockResolvedValue({ id: 'conv-1' });
    conversationRepo.findActiveCommunicationLineByExternalIdentifier.mockResolvedValue(null);
    conversationRepo.bindCommunicationLine.mockResolvedValue(undefined);
    conversationRepo.getConversationContext.mockResolvedValue({
      meta: { flowState: 'BOT_FLOW', version: 0 },
    });
    messageRepo.create.mockResolvedValue(makePersistedMessage());
    messageRepo.findByExternalId.mockResolvedValue(null);
    whatsappProvider.markAsRead.mockResolvedValue(undefined);
    deptRouter.route.mockResolvedValue(undefined);
    botService.handleMessage.mockResolvedValue(undefined);
    botService.handleNonTextMessage.mockResolvedValue(undefined);
    botService.getSession.mockResolvedValue(makeCompletedSession());
    redis.incr.mockResolvedValue(1);
    redis.del.mockResolvedValue(undefined);
  });

  describe('cierre de registro', () => {
    it('al completar registro en REGISTERING vuelve a BOT_FLOW', async () => {
      conversationRepo.getConversationContext.mockResolvedValue({
        meta: { flowState: 'REGISTERING', version: 3 },
      });
      // Primera llamada: bot aún procesando (AWAITING_INTERESTS)
      // Segunda llamada: bot completó (COMPLETED) — para cerrar el registro
      // Tercera llamada: validateRegistrationFields (getSession de nuevo)
      botService.getSession
        .mockResolvedValueOnce({ state: BotFsmState.AWAITING_INTERESTS })
        .mockResolvedValueOnce(makeCompletedSession())
        .mockResolvedValueOnce(makeCompletedSession());

      await makeOrchestrator().handleInboundMessage('521999888777', makeInboundText('1,2'), 'Ana');

      expect(stateMachine.transition).not.toHaveBeenCalledWith(
        'conv-1',
        'BOT_FLOW',
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('no transiciona a BOT_FLOW si faltan campos requeridos del registro', async () => {
      conversationRepo.getConversationContext.mockResolvedValue({
        meta: { flowState: 'REGISTERING', version: 3 },
      });
      // Bot reporta COMPLETED pero la sesión no tiene neighborhoodId ni interests
      botService.getSession
        .mockResolvedValueOnce({ state: BotFsmState.AWAITING_INTERESTS })
        .mockResolvedValueOnce({ state: BotFsmState.COMPLETED, name: 'Ana' }) // sin neighborhoodId/interests
        .mockResolvedValueOnce({ state: BotFsmState.COMPLETED, name: 'Ana' }); // validate

      await makeOrchestrator().handleInboundMessage('521999888777', makeInboundText('1,2'), 'Ana');

      // No debe transicionar a BOT_FLOW
      expect(stateMachine.transition).not.toHaveBeenCalledWith(
        'conv-1',
        'BOT_FLOW',
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('reintenta con nueva versión en conflicto de versión al cerrar registro', async () => {
      // Primera llamada: lectura inicial en handleInboundMessage
      // Segunda llamada: re-read dentro del retry de closeRegistration
      conversationRepo.getConversationContext
        .mockResolvedValueOnce({ meta: { flowState: 'REGISTERING', version: 3 } })
        .mockResolvedValueOnce({ meta: { flowState: 'REGISTERING', version: 4 } });

      botService.getSession
        .mockResolvedValueOnce({ state: BotFsmState.AWAITING_INTERESTS })
        .mockResolvedValueOnce(makeCompletedSession())
        .mockResolvedValueOnce(makeCompletedSession());

      // Primer intento falla con conflicto de versión, retry tiene éxito
      stateMachine.transition
        .mockRejectedValueOnce(new Error('Optimistic lock failed'))
        .mockResolvedValue(undefined);

      await makeOrchestrator().handleInboundMessage('521999888777', makeInboundText('1,2'), 'Ana');

      expect(stateMachine.transition).not.toHaveBeenCalledWith(
        'conv-1',
        'BOT_FLOW',
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('no ejecuta IA antes de confirmar transición REGISTERING→BOT_FLOW', async () => {
      conversationRepo.getConversationContext.mockResolvedValue({
        meta: { flowState: 'REGISTERING', version: 3 },
      });
      botService.getSession
        .mockResolvedValueOnce({ state: BotFsmState.AWAITING_INTERESTS })
        .mockResolvedValueOnce(makeCompletedSession())
        .mockResolvedValueOnce(makeCompletedSession());

      const fsmHandleMock = jest.fn() as any;
      fsmHandleMock.mockResolvedValue({
        decision: { kind: 'ai_blocked', reason: { blocked: true, state: 'BOT_FLOW', reason: '' } },
        flowState: 'BOT_FLOW',
        transitioned: false,
        durationMs: 10,
      });
      const fsmRouter: any = { handle: fsmHandleMock };
      const orchestrator = new MessageOrchestratorService(
        citizenRepo as never,
        conversationRepo as never,
        messageRepo as never,
        stateMachine as never,
        deptRouter as never,
        whatsappProvider as never,
        fsmRouter as never,
      );

      await orchestrator.handleInboundMessage('521999888777', makeInboundText('1,2'), 'Ana');

      expect(stateMachine.transition).not.toHaveBeenCalledWith(
        'conv-1',
        'BOT_FLOW',
        expect.any(Number),
        expect.any(Object),
      );
      // FsmRouter se invoca DESPUÉS del cierre de registro (post-handleBotFlow en handleInboundMessage)
      expect(fsmRouter.handle).toHaveBeenCalledTimes(1);
    });

    it('relee meta y pasa estado fresco al fsmRouter después de BOT_FLOW→REGISTERING', async () => {
      citizenRepo.findOrCreate.mockResolvedValue({
        id: 'cit-1',
        phone: '521999888777',
        name: undefined,
        email: null,
        neighborhoodId: undefined,
        neighborhood: undefined,
        interests: [],
      });

      conversationRepo.getConversationContext
        .mockResolvedValueOnce({
          meta: { flowState: 'BOT_FLOW', version: 0 },
          assignedUserId: null,
        })
        .mockResolvedValueOnce({
          meta: { flowState: 'REGISTERING', version: 1 },
          assignedUserId: null,
        });

      const fsmHandleMock = jest.fn() as any;
      fsmHandleMock.mockResolvedValue({
        decision: { kind: 'ai_handled' },
        flowState: 'REGISTERING',
        transitioned: false,
        durationMs: 5,
      });

      const fsmRouter: any = { handle: fsmHandleMock };
      const orchestrator = new MessageOrchestratorService(
        citizenRepo as never,
        conversationRepo as never,
        messageRepo as never,
        stateMachine as never,
        deptRouter as never,
        whatsappProvider as never,
        fsmRouter as never,
      );

      await orchestrator.handleInboundMessage('521999888777', makeInboundText('hola'), 'Ana');

      expect(stateMachine.transition).toHaveBeenCalledWith('conv-1', 'REGISTERING', 0, {
        triggeredBy: 'system',
      });

      expect(fsmHandleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          waMessageId: 'wamid-1',
          metaOverride: {
            flowState: 'REGISTERING',
            version: 1,
            assignedUserId: undefined,
          },
        }),
      );
    });
  });

  describe('reglas post-registro en BOT_FLOW', () => {
    it('hace handoff a humano por solicitud explícita en BOT_FLOW', async () => {
      await makeOrchestrator().handleInboundMessage(
        '521999888777',
        makeInboundText('quiero hablar con un agente humano'),
        'Ana',
      );

      expect(stateMachine.transition).toHaveBeenCalledWith('conv-1', 'HUMAN_FLOW', 0, {
        triggeredBy: 'user',
      });
    });

    it('hace handoff inmediato por señal de frustración directa', async () => {
      await makeOrchestrator().handleInboundMessage(
        '521999888777',
        makeInboundText('me cansé, no funciona nada'),
        'Ana',
      );

      expect(stateMachine.transition).toHaveBeenCalledWith('conv-1', 'HUMAN_FLOW', 0, {
        triggeredBy: 'system',
      });
    });

    it('hace handoff por complejidad acumulada tras 2 intentos con routing intent', async () => {
      // El contador de complejidad es in-memory por instancia del orquestador.
      // 2 mensajes con routing intent en la MISMA instancia → al segundo se escala.
      const orchestrator = makeOrchestrator();

      await orchestrator.handleInboundMessage(
        '521999888777',
        makeInboundText('tengo un reclamo'),
        'Ana',
      );
      await orchestrator.handleInboundMessage(
        '521999888777',
        makeInboundText('sigo con el reclamo'),
        'Ana',
      );

      expect(stateMachine.transition).toHaveBeenCalledTimes(1);
      expect(stateMachine.transition).toHaveBeenCalledWith('conv-1', 'HUMAN_FLOW', 0, {
        triggeredBy: 'system',
      });
    });

    it('hace routing por keyword y mantiene DEPARTMENT_ROUTING con departamento', async () => {
      deptRouter.route.mockResolvedValue('obras');
      conversationRepo.getConversationContext.mockResolvedValue({
        meta: { flowState: 'BOT_FLOW', version: 5 },
      });

      await makeOrchestrator().handleInboundMessage(
        '521999888777',
        makeInboundText('hay un bache'),
        'Ana',
      );

      expect(stateMachine.transition).toHaveBeenNthCalledWith(
        1,
        'conv-1',
        'DEPARTMENT_ROUTING',
        5,
        {
          triggeredBy: 'system',
          departmentSlug: 'obras',
        },
      );
      expect(stateMachine.transition).toHaveBeenCalledTimes(1);
    });

    it('pasa citizenInterests al deptRouter en BOT_FLOW', async () => {
      citizenRepo.findOrCreate.mockResolvedValue({
        id: 'cit-1',
        phone: '521999888777',
        name: 'Ana',
        email: null,
        neighborhoodId: 'nbhd-1',
        neighborhood: 'Centro',
        interests: ['agua_servicios', 'seguridad_publica'],
      });
      deptRouter.route.mockResolvedValue('agua');
      conversationRepo.getConversationContext.mockResolvedValue({
        meta: { flowState: 'BOT_FLOW', version: 0 },
      });

      await makeOrchestrator().handleInboundMessage(
        '521999888777',
        makeInboundText('problema con el agua'),
        'Ana',
      );

      expect(deptRouter.route).toHaveBeenCalledWith(
        expect.objectContaining({
          citizenInterests: ['agua_servicios', 'seguridad_publica'],
        }),
      );
    });

    it('solicitud de humano durante REGISTERING transiciona a HUMAN_FLOW inmediato sin procesar bot', async () => {
      conversationRepo.getConversationContext.mockResolvedValue({
        meta: { flowState: 'REGISTERING', version: 2 },
      });
      // Bot está en AWAITING_INTERESTS (no completado)
      botService.getSession.mockResolvedValue({ state: BotFsmState.AWAITING_INTERESTS });

      await makeOrchestrator().handleInboundMessage(
        '521999888777',
        makeInboundText('quiero hablar con un humano'),
        'Ana',
      );

      // Debe transicionar a HUMAN_FLOW inmediatamente
      expect(stateMachine.transition).toHaveBeenCalledWith('conv-1', 'HUMAN_FLOW', 2, {
        triggeredBy: 'user',
      });
      // El bot NO debe haber procesado el mensaje (retornó antes de handleMessage)
      expect(botService.handleMessage).not.toHaveBeenCalled();
    });
  });

  describe('citizen ya registrado en DB — sesión Redis expirada', () => {
    /**
     * Bug reportado: al cambiar manualmente HUMAN_FLOW → BOT_FLOW,
     * el siguiente mensaje vuelve a REGISTERING porque la sesión Redis
     * del bot no está COMPLETED (expiró). El fix: si el ciudadano ya tiene
     * los datos de registro completos en DB, no re-iniciar el flujo.
     */
    it('NO transiciona a REGISTERING cuando el ciudadano ya está registrado en DB aunque sesión Redis sea NAME', async () => {
      // Ciudadano con todos los campos de registro completos en DB
      citizenRepo.findOrCreate.mockResolvedValue({
        id: 'cit-1',
        name: 'Ana',
        phone: '521999888777',
        email: null,
        neighborhoodId: 'nbhd-1',
        neighborhood: 'Centro',
        interests: ['agua_servicios'],
      });
      conversationRepo.getConversationContext.mockResolvedValue({
        meta: { flowState: 'BOT_FLOW', version: 0 },
      });
      // Sesión Redis expirada → retorna estado inicial NAME
      botService.getSession.mockResolvedValue({ state: BotFsmState.NAME });

      await makeOrchestrator().handleInboundMessage(
        '521999888777',
        makeInboundText('hola, necesito ayuda'),
        'Ana',
      );

      // NO debe transicionar a REGISTERING — el ciudadano ya está registrado
      expect(stateMachine.transition).not.toHaveBeenCalledWith(
        'conv-1',
        'REGISTERING',
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('mantiene BOT_FLOW y permite que la IA opere cuando ciudadano registrado y sesión Redis expirada', async () => {
      // Ciudadano registrado en DB
      citizenRepo.findOrCreate.mockResolvedValue({
        id: 'cit-1',
        name: 'Ana',
        phone: '521999888777',
        email: null,
        neighborhoodId: 'nbhd-1',
        neighborhood: 'Centro',
        interests: ['agua_servicios'],
      });
      conversationRepo.getConversationContext.mockResolvedValue({
        meta: { flowState: 'BOT_FLOW', version: 2 },
      });
      // Sesión Redis expirada → NAME (como si nunca hubiera existido)
      botService.getSession.mockResolvedValue({ state: BotFsmState.NAME });
      // Sin keywords de routing/frustración → flujo normal
      deptRouter.route.mockResolvedValue(undefined);

      const fsmHandleMock = jest.fn() as any;
      fsmHandleMock.mockResolvedValue({
        decision: { kind: 'ai_handled' },
        flowState: 'BOT_FLOW',
        transitioned: false,
        durationMs: 5,
      });
      const fsmRouter: any = { handle: fsmHandleMock };
      const orchestrator = new MessageOrchestratorService(
        citizenRepo as never,
        conversationRepo as never,
        messageRepo as never,
        stateMachine as never,
        deptRouter as never,
        whatsappProvider as never,
        fsmRouter as never,
      );

      await orchestrator.handleInboundMessage('521999888777', makeInboundText('hola'), 'Ana');

      // FsmRouter debe haberse invocado (IA habilitada en BOT_FLOW)
      expect(fsmHandleMock).toHaveBeenCalledTimes(1);
      // NO debe haber transicionado a REGISTERING
      expect(stateMachine.transition).not.toHaveBeenCalledWith(
        'conv-1',
        'REGISTERING',
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('SÍ transiciona a REGISTERING cuando ciudadano NO registrado en DB y sesión Redis es NAME', async () => {
      // Ciudadano sin datos de registro (nuevo)
      citizenRepo.findOrCreate.mockResolvedValue({
        id: 'cit-1',
        name: undefined,
        phone: '521999888777',
        email: null,
        neighborhoodId: undefined,
        neighborhood: undefined,
        interests: [],
      });
      conversationRepo.getConversationContext.mockResolvedValue({
        meta: { flowState: 'BOT_FLOW', version: 0 },
      });
      // Sesión Redis vacía → NAME
      botService.getSession.mockResolvedValue({ state: BotFsmState.NAME });

      await makeOrchestrator().handleInboundMessage(
        '521999888777',
        makeInboundText('hola'),
        'Nuevo',
      );

      // SÍ debe transicionar a REGISTERING — ciudadano nuevo sin datos
      expect(stateMachine.transition).toHaveBeenCalledWith('conv-1', 'REGISTERING', 0, {
        triggeredBy: 'system',
      });
    });
  });

  describe('salvaguarda de despedida (FAREWELL_REGEX)', () => {
    /** Ciudadano completamente registrado */
    const registeredCitizen = {
      id: 'cit-registered',
      phone: '521999888777',
      name: 'Ana',
      email: null,
      neighborhoodId: 'nbhd-1',
      neighborhood: 'Centro',
      interests: ['agua_servicios'],
    };

    function makeOrchestratorWithTicket(ticketService: any) {
      return new MessageOrchestratorService(
        citizenRepo as never,
        conversationRepo as never,
        messageRepo as never,
        stateMachine as never,
        deptRouter as never,
        whatsappProvider as never,
        undefined,
        'corr-farewell',
        ticketService,
      );
    }

    const mockFn = <T>() => jest.fn<() => Promise<T>>();

    beforeEach(() => {
      citizenRepo.findOrCreate.mockResolvedValue(registeredCitizen);
      conversationRepo.getConversationContext.mockResolvedValue({
        meta: { flowState: 'BOT_FLOW', version: 2 },
      });
      conversationRepo.updateConversationStatus = mockFn<void>().mockResolvedValue(undefined);
    });

    it('despedida en BOT_FLOW (ciudadano registrado) cierra SOLO el ticket activo (conversación continua)', async () => {
      const activeTicket = { id: 'ticket-fare-1', status: 'OPEN' };
      const ticketService: any = {
        getOrCreateActiveTicket: mockFn<unknown>().mockResolvedValue({
          ticket: activeTicket,
          created: false,
        }),
        attachMessageToTicket: mockFn<unknown>().mockResolvedValue({}),
        getActiveTicketByConversation: mockFn<unknown>().mockResolvedValue(activeTicket),
        closeTicket: mockFn<unknown>().mockResolvedValue({ id: 'ticket-fare-1', status: 'CLOSED' }),
      };

      await makeOrchestratorWithTicket(ticketService).handleInboundMessage(
        '521999888777',
        makeInboundText('adiós, muchas gracias'),
      );

      expect(ticketService.closeTicket).toHaveBeenCalledWith(
        'ticket-fare-1',
        expect.objectContaining({ reason: 'resolved' }),
      );
      expect(stateMachine.transition).not.toHaveBeenCalledWith(
        'conv-1',
        'CLOSED',
        expect.any(Number),
        expect.any(Object),
      );
      expect(conversationRepo.updateConversationStatus).not.toHaveBeenCalled();
    });

    it('despedida en BOT_FLOW NO invoca el fsmRouter (IA omitida)', async () => {
      const fsmRouter: any = {
        handle: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          decision: { kind: 'ai_handled' },
          flowState: 'BOT_FLOW',
          transitioned: false,
          durationMs: 0,
        }),
      };
      const ticketService: any = {
        getOrCreateActiveTicket: mockFn<unknown>().mockResolvedValue({
          ticket: { id: 't-1' },
          created: false,
        }),
        attachMessageToTicket: mockFn<unknown>().mockResolvedValue({}),
        getActiveTicketByConversation: mockFn<unknown>().mockResolvedValue({
          id: 't-1',
          status: 'OPEN',
        }),
        closeTicket: mockFn<unknown>().mockResolvedValue({}),
      };

      const orchestrator = new MessageOrchestratorService(
        citizenRepo as never,
        conversationRepo as never,
        messageRepo as never,
        stateMachine as never,
        deptRouter as never,
        whatsappProvider as never,
        fsmRouter as never,
        'corr-farewell-fsmrouter',
        ticketService,
      );

      await orchestrator.handleInboundMessage('521999888777', makeInboundText('hasta luego'));

      expect(fsmRouter.handle).not.toHaveBeenCalled();
    });

    it('mensaje normal (no despedida) en BOT_FLOW invoca el fsmRouter normalmente', async () => {
      const fsmRouter: any = {
        handle: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          decision: { kind: 'ai_handled' },
          flowState: 'BOT_FLOW',
          transitioned: false,
          durationMs: 0,
        }),
      };

      const orchestrator = new MessageOrchestratorService(
        citizenRepo as never,
        conversationRepo as never,
        messageRepo as never,
        stateMachine as never,
        deptRouter as never,
        whatsappProvider as never,
        fsmRouter as never,
      );

      await orchestrator.handleInboundMessage('521999888777', makeInboundText('tengo una duda'));

      expect(fsmRouter.handle).toHaveBeenCalled();
    });

    it('despedida en REGISTERING (ciudadano no registrado aún) NO cierra la conversación', async () => {
      // En REGISTERING no aplica la salvaguarda (ciudadano no está completamente registrado)
      citizenRepo.findOrCreate.mockResolvedValue({
        ...registeredCitizen,
        name: null, // sin nombre → no está registrado
        neighborhoodId: null,
        interests: [],
      });
      conversationRepo.getConversationContext.mockResolvedValue({
        meta: { flowState: 'REGISTERING', version: 1 },
      });

      const fsmRouter: any = {
        handle: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          decision: { kind: 'ai_handled' },
          flowState: 'REGISTERING',
          transitioned: false,
          durationMs: 0,
        }),
      };

      const orchestrator = new MessageOrchestratorService(
        citizenRepo as never,
        conversationRepo as never,
        messageRepo as never,
        stateMachine as never,
        deptRouter as never,
        whatsappProvider as never,
        fsmRouter as never,
      );

      await orchestrator.handleInboundMessage('521999888777', makeInboundText('adios'));

      // La IA debe seguir atendiendo durante el registro aunque haya despedida
      expect(fsmRouter.handle).toHaveBeenCalled();
      expect(stateMachine.transition).not.toHaveBeenCalledWith(
        expect.anything(),
        'CLOSED',
        expect.anything(),
        expect.anything(),
      );
    });
  });
});

describe('MessageOrchestratorService.handleInboundBatch', () => {
  const citizenRepo: any = { findOrCreate: jest.fn() };
  const conversationRepo: any = {
    findOrCreateCanonical: jest.fn(),
    getConversationContext: jest.fn(),
    findActiveCommunicationLineByExternalIdentifier: jest.fn(),
    bindCommunicationLine: jest.fn(),
  };
  const messageRepo: any = {
    create: jest.fn(),
    findByExternalId: jest.fn(),
  };
  const stateMachine: any = { transition: jest.fn() };
  const deptRouter: any = { route: jest.fn() };
  const whatsappProvider: any = { markAsRead: jest.fn() };
  const fsmRouter: any = { handle: jest.fn() };

  function makeFragment(
    overrides: { id?: string; text?: string; createdAt?: Date; inboxEventId?: string } = {},
  ) {
    return {
      inboxEventId: overrides.inboxEventId ?? 'ie-1',
      wamid: overrides.id ?? 'wamid-1',
      phone: '521999888777',
      timestamp: '1700000000',
      phoneNumberId: 'phone-number-id-1',
      profileName: 'Ana',
      message: {
        id: overrides.id ?? 'wamid-1',
        type: 'text' as const,
        from: '521999888777',
        timestamp: '1700000000',
        text: { body: overrides.text ?? 'hola' },
      },
      createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    };
  }

  function makePersistedMessage(
    overrides: { id?: string; externalMessageId?: string; body?: string } = {},
  ) {
    return {
      id: overrides.id ?? 'msg-1',
      conversationId: 'conv-1',
      body: overrides.body ?? 'hola',
      direction: 'inbound',
      messageType: 'text',
      externalMessageId: overrides.externalMessageId ?? 'wamid-1',
      meta: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'sent',
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    citizenRepo.findOrCreate.mockResolvedValue({
      id: 'cit-1',
      phone: '521999888777',
      name: 'Ana',
      email: null,
      neighborhoodId: 'nbhd-1',
      neighborhood: 'Centro',
      interests: ['agua_servicios'],
    });
    conversationRepo.findOrCreateCanonical.mockResolvedValue({ id: 'conv-1' });
    conversationRepo.getConversationContext.mockResolvedValue({
      meta: { flowState: 'BOT_FLOW', version: 0 },
    });
    conversationRepo.findActiveCommunicationLineByExternalIdentifier.mockResolvedValue({
      id: 'line-1',
    });
    conversationRepo.bindCommunicationLine.mockResolvedValue(undefined);
    messageRepo.findByExternalId.mockResolvedValue(null);
    fsmRouter.handle.mockResolvedValue({
      decision: { kind: 'ai_handled' },
      flowState: 'BOT_FLOW',
      transitioned: false,
      durationMs: 5,
    });
    whatsappProvider.markAsRead.mockResolvedValue(undefined);
    stateMachine.transition.mockResolvedValue(undefined);
    deptRouter.route.mockResolvedValue(undefined);
  });

  it('splits a same-contact batch into independent AI turns and message histories by receiving line', async () => {
    conversationRepo.findActiveCommunicationLineByExternalIdentifier.mockImplementation(
      async (external: string) => ({ id: external }),
    );
    conversationRepo.findOrCreateCanonical.mockImplementation(
      async (_citizen: string, opts: { communicationLineId: string }) => ({
        id: `conv-${opts.communicationLineId}`,
      }),
    );
    messageRepo.create.mockImplementation(async (data: Record<string, unknown>) => ({
      ...makePersistedMessage(),
      ...data,
      id: `msg-${String(data.externalMessageId)}`,
    }));
    const orchestrator = new MessageOrchestratorService(
      citizenRepo,
      conversationRepo,
      messageRepo,
      stateMachine,
      deptRouter,
      whatsappProvider,
      fsmRouter,
    );
    await orchestrator.handleInboundBatch(
      '521999888777',
      [
        { ...makeFragment({ id: 'a1', text: 'private A' }), phoneNumberId: 'line-A' },
        { ...makeFragment({ id: 'b1', text: 'private B' }), phoneNumberId: 'line-B' },
        { ...makeFragment({ id: 'a2', text: 'again A' }), phoneNumberId: 'line-A' },
      ],
      1,
    );
    expect(fsmRouter.handle).toHaveBeenCalledTimes(2);
    expect(fsmRouter.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-line-A',
        lineExternalIdentifier: 'line-A',
        messageText: 'private A\nagain A',
        excludeMessageIds: ['msg-a1', 'msg-a2'],
      }),
    );
    expect(fsmRouter.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-line-B',
        lineExternalIdentifier: 'line-B',
        messageText: 'private B',
        excludeMessageIds: ['msg-b1'],
      }),
    );
    expect(messageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-line-B', externalMessageId: 'b1' }),
    );
  });

  it('persists fragments, joins text with newline, and calls the FSM once', async () => {
    const fragments = [
      makeFragment({
        id: 'wamid-1',
        text: 'hola',
        createdAt: new Date('2026-01-01T00:00:01.000Z'),
      }),
      makeFragment({
        id: 'wamid-2',
        text: 'tengo una duda',
        createdAt: new Date('2026-01-01T00:00:02.000Z'),
      }),
      makeFragment({
        id: 'wamid-3',
        text: 'sobre mi factura',
        createdAt: new Date('2026-01-01T00:00:03.000Z'),
      }),
    ];
    messageRepo.create
      .mockResolvedValueOnce(
        makePersistedMessage({ id: 'msg-1', externalMessageId: 'wamid-1', body: 'hola' }),
      )
      .mockResolvedValueOnce(
        makePersistedMessage({ id: 'msg-2', externalMessageId: 'wamid-2', body: 'tengo una duda' }),
      )
      .mockResolvedValueOnce(
        makePersistedMessage({
          id: 'msg-3',
          externalMessageId: 'wamid-3',
          body: 'sobre mi factura',
        }),
      );

    const orchestrator = new MessageOrchestratorService(
      citizenRepo as never,
      conversationRepo as never,
      messageRepo as never,
      stateMachine as never,
      deptRouter as never,
      whatsappProvider as never,
      fsmRouter as never,
    );

    await orchestrator.handleInboundBatch('521999888777', fragments, 7, 'line-1');

    expect(messageRepo.create).toHaveBeenCalledTimes(3);
    expect(fsmRouter.handle).toHaveBeenCalledTimes(1);
    const fsmInput = fsmRouter.handle.mock.calls[0][0];
    expect(fsmInput.messageText).toBe('hola\ntengo una duda\nsobre mi factura');
    expect(fsmInput.messageId).toBe('msg-3');
    expect(fsmInput.waMessageId).toBe('wamid-3');
    expect(fsmInput.excludeMessageIds).toEqual(['msg-1', 'msg-2', 'msg-3']);
    expect(fsmInput.batchGeneration).toBe(7);
    // El lock lo toma el FSM sobre conversation.id; el orchestrator no le pasa token.
    expect(fsmRouter.handle.mock.calls[0][1]).toBeUndefined();
  });

  it('reuses existing messages by wamid and still includes them in exclusion', async () => {
    const fragments = [
      makeFragment({
        id: 'wamid-1',
        text: 'hola',
        createdAt: new Date('2026-01-01T00:00:01.000Z'),
      }),
      makeFragment({
        id: 'wamid-2',
        text: 'tengo una duda',
        createdAt: new Date('2026-01-01T00:00:02.000Z'),
      }),
    ];
    messageRepo.findByExternalId
      .mockResolvedValueOnce(
        makePersistedMessage({ id: 'msg-1', externalMessageId: 'wamid-1', body: 'hola' }),
      )
      .mockResolvedValueOnce(null);
    messageRepo.create.mockResolvedValueOnce(
      makePersistedMessage({ id: 'msg-2', externalMessageId: 'wamid-2', body: 'tengo una duda' }),
    );

    const orchestrator = new MessageOrchestratorService(
      citizenRepo as never,
      conversationRepo as never,
      messageRepo as never,
      stateMachine as never,
      deptRouter as never,
      whatsappProvider as never,
      fsmRouter as never,
    );

    await orchestrator.handleInboundBatch('521999888777', fragments, 2);

    expect(messageRepo.create).toHaveBeenCalledTimes(1);
    const fsmInput = fsmRouter.handle.mock.calls[0][0];
    expect(fsmInput.excludeMessageIds).toEqual(['msg-1', 'msg-2']);
  });

  it('calls markAsRead once per fragment wamid', async () => {
    const fragments = [
      makeFragment({ id: 'wamid-1', text: 'hola' }),
      makeFragment({ id: 'wamid-2', text: 'adios' }),
    ];
    messageRepo.create
      .mockResolvedValueOnce(makePersistedMessage({ id: 'msg-1', externalMessageId: 'wamid-1' }))
      .mockResolvedValueOnce(makePersistedMessage({ id: 'msg-2', externalMessageId: 'wamid-2' }));

    const orchestrator = new MessageOrchestratorService(
      citizenRepo as never,
      conversationRepo as never,
      messageRepo as never,
      stateMachine as never,
      deptRouter as never,
      whatsappProvider as never,
      fsmRouter as never,
    );

    await orchestrator.handleInboundBatch('521999888777', fragments, 1);

    expect(whatsappProvider.markAsRead).toHaveBeenCalledTimes(2);
    expect(whatsappProvider.markAsRead).toHaveBeenCalledWith(
      'wamid-1',
      expect.objectContaining({ allowDefault: true }),
    );
    expect(whatsappProvider.markAsRead).toHaveBeenCalledWith(
      'wamid-2',
      expect.objectContaining({ allowDefault: true }),
    );
  });

  it('preserves deterministic pre-AI guards and does not call handle on farewell', async () => {
    const fragments = [makeFragment({ id: 'wamid-1', text: 'adiós, muchas gracias' })];
    messageRepo.create.mockResolvedValueOnce(
      makePersistedMessage({
        id: 'msg-1',
        externalMessageId: 'wamid-1',
        body: 'adiós, muchas gracias',
      }),
    );

    const orchestrator = new MessageOrchestratorService(
      citizenRepo as never,
      conversationRepo as never,
      messageRepo as never,
      stateMachine as never,
      deptRouter as never,
      whatsappProvider as never,
      fsmRouter as never,
      'corr-batch-farewell',
      {
        getOrCreateActiveTicket: jest.fn(
          async () => ({ ticket: { id: 't-1' }, created: false }) as never,
        ),
        getActiveTicketByConversation: jest.fn(async () => null),
        attachMessageToTicket: jest.fn(async () => ({ id: 'tm-1' }) as never),
      } as never,
    );

    await orchestrator.handleInboundBatch('521999888777', fragments, 1);

    expect(fsmRouter.handle).not.toHaveBeenCalled();
  });
});
