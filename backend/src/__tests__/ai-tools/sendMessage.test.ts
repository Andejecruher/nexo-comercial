/**
 * Unit tests: SendMessageTool
 *
 * Casos:
 *  - Input inválido → error INVALID_INPUT
 *  - Ciudadano no encontrado → error CITIZEN_NOT_FOUND
 *  - Envío exitoso: crea mensaje + encola outbox
 *  - Idempotencia: si idempotencyKey se repite, outboxProcessor.enqueue deduplica (early return)
 *  - conversationId existente: usa el provisto sin llamar findOrCreateCanonical
 *  - conversationId no provisto: llama findOrCreateCanonical
 *  - [Ticket] envío exitoso: llama attachMessageToTicket si hay ticket activo
 *  - [Ticket] replay: NO llama attachMessageToTicket si isReplay=true
 *  - [Ticket] falla en attachMessageToTicket: no aborta el send (best-effort)
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MessageDirection, MessageType } from '@prisma/client';
import { SendMessageTool } from '../../ai/tools/send-message.tool';
import { TicketStatus } from '../../services/tickets/ticket.types';
import { withEnv } from '../helpers/with-env';

function makeTicketServiceMock() {
  return {
    getActiveTicketByConversation:
      jest.fn<() => Promise<{ id: string; status: TicketStatus } | undefined>>(),
    attachMessageToTicket: jest.fn<() => Promise<{ id: string }>>(),
  };
}

function makeCitizenRepoMock() {
  return {
    findByPhone: jest.fn<() => Promise<object | null>>(),
    findOrCreate: jest.fn<() => Promise<object>>(),
    giveConsent: jest.fn<() => Promise<object>>(),
    updateLeadStatus: jest.fn<() => Promise<object>>(),
  };
}

function makeConversationRepoMock() {
  return {
    findOrCreateCanonical: jest.fn<() => Promise<{ id: string; status: string }>>(),
    getCommunicationLineContext:
      jest.fn<
        () => Promise<{ communicationLineId: string | null; externalIdentifier: string | null }>
      >(),
  };
}

function makeOutboxProcessorMock() {
  return {
    enqueue: jest.fn<() => Promise<void>>(),
  };
}

function makePrismaMock() {
  const tx = {
    outboxEvent: {
      findUnique: jest.fn<() => Promise<object | null>>(),
      create: jest.fn<() => Promise<object>>(),
    },
    message: {
      findFirst: jest.fn<() => Promise<object | null>>(),
      findUnique: jest.fn<() => Promise<object | null>>(),
      create: jest.fn<() => Promise<object>>(),
    },
  };

  return {
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    __tx: tx,
  };
}

const BASE_CITIZEN = {
  id: 'cit-001',
  phone: '521234567890',
  name: 'Ana',
  lastName: 'Lopez',
  consentGiven: true,
};

const BASE_CONVERSATION = { id: 'conv-001', status: 'open' };

const BASE_MESSAGE = {
  id: 'msg-001',
  conversationId: 'conv-001',
  body: 'Hola ciudadano',
  direction: MessageDirection.outbound,
  messageType: MessageType.text,
  createdAt: new Date(),
  externalMessageId: undefined,
  meta: {},
};

describe('SendMessageTool', () => {
  let citizenRepo: ReturnType<typeof makeCitizenRepoMock>;
  let conversationRepo: ReturnType<typeof makeConversationRepoMock>;
  let outboxProcessor: ReturnType<typeof makeOutboxProcessorMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let tool: SendMessageTool;

  beforeEach(() => {
    citizenRepo = makeCitizenRepoMock();
    conversationRepo = makeConversationRepoMock();
    outboxProcessor = makeOutboxProcessorMock();
    prisma = makePrismaMock();

    conversationRepo.getCommunicationLineContext.mockResolvedValue({
      communicationLineId: null,
      externalIdentifier: null,
    });

    tool = new SendMessageTool(
      // @ts-ignore — mock parcial
      citizenRepo,
      // @ts-ignore
      conversationRepo,
      // @ts-ignore
      outboxProcessor,
      // @ts-ignore
      prisma,
    );
  });

  it('devuelve INVALID_INPUT cuando phone está ausente', async () => {
    const result = await tool.execute({ body: 'Hola' });
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('devuelve INVALID_INPUT cuando body está vacío', async () => {
    const result = await tool.execute({ phone: '521234567890', body: '' });
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('devuelve CITIZEN_NOT_FOUND cuando no existe el ciudadano', async () => {
    citizenRepo.findByPhone.mockResolvedValue(null);

    const result = await tool.execute({ phone: '521234567890', body: 'Hola' });

    expect(result).toMatchObject({ error: 'CITIZEN_NOT_FOUND', phone: '521234567890' });
  });

  it('rechaza ciudadanos sin teléfono antes de crear el mensaje', async () => {
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue({ ...BASE_CITIZEN, phone: null });

    const result = await tool.execute({ phone: '521234567890', body: 'Hola' });

    expect(result).toMatchObject({ error: 'CITIZEN_PHONE_MISSING', citizenId: 'cit-001' });
    expect(conversationRepo.findOrCreateCanonical).not.toHaveBeenCalled();
    expect(prisma.__tx.message.create).not.toHaveBeenCalled();
    expect(outboxProcessor.enqueue).not.toHaveBeenCalled();
  });

  it('envío exitoso: crea mensaje y encola en outbox', async () => {
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue(BASE_CITIZEN);
    conversationRepo.findOrCreateCanonical.mockResolvedValue(BASE_CONVERSATION);
    // @ts-ignore
    prisma.__tx.outboxEvent.findUnique.mockResolvedValue(null);
    // @ts-ignore
    prisma.__tx.outboxEvent.create.mockResolvedValue({ id: 'outbox-001' });
    // @ts-ignore
    prisma.__tx.message.create.mockResolvedValue(BASE_MESSAGE);
    outboxProcessor.enqueue.mockResolvedValue(undefined);

    const result = await tool.execute({ phone: '521234567890', body: 'Hola ciudadano' });

    expect(prisma.__tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv-001',
          body: 'Hola ciudadano',
          direction: MessageDirection.outbound,
          messageType: MessageType.text,
          idempotencyKey: expect.any(String),
        }),
      }),
    );
    expect(prisma.__tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          externalMessageId: expect.any(String),
        }),
      }),
    );

    expect(outboxProcessor.enqueue).toHaveBeenCalledWith(
      '521234567890',
      expect.objectContaining({ to: '521234567890', type: 'text' }),
      expect.any(String),
      'conv-001',
      expect.any(Object),
    );

    expect(result).toMatchObject({
      messageId: 'msg-001',
      conversationId: 'conv-001',
      isReplay: false,
    });
  });

  it('does not expose phone or message body in debug logs', async () => {
    const restore = withEnv({ LOG_LEVEL: 'debug' });
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue(BASE_CITIZEN);
    conversationRepo.findOrCreateCanonical.mockResolvedValue(BASE_CONVERSATION);
    // @ts-ignore
    prisma.__tx.outboxEvent.findUnique.mockResolvedValue(null);
    // @ts-ignore
    prisma.__tx.outboxEvent.create.mockResolvedValue({ id: 'outbox-001' });
    // @ts-ignore
    prisma.__tx.message.create.mockResolvedValue(BASE_MESSAGE);
    outboxProcessor.enqueue.mockResolvedValue(undefined);

    try {
      await tool.execute({ phone: '521234567890', body: 'Hola ciudadano' });

      const serializedLogs = debugSpy.mock.calls.map(([entry]) => String(entry)).join('\n');
      expect(serializedLogs).toContain('send_message.success');
      expect(serializedLogs).not.toContain('521234567890');
      expect(serializedLogs).not.toContain('Hola ciudadano');
    } finally {
      debugSpy.mockRestore();
      restore();
    }
  });

  it('usa conversationId provisto sin llamar findOrCreateCanonical', async () => {
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue(BASE_CITIZEN);
    // @ts-ignore
    prisma.__tx.outboxEvent.findUnique.mockResolvedValue(null);
    // @ts-ignore
    prisma.__tx.outboxEvent.create.mockResolvedValue({ id: 'outbox-001' });
    // @ts-ignore
    prisma.__tx.message.create.mockResolvedValue(BASE_MESSAGE);
    outboxProcessor.enqueue.mockResolvedValue(undefined);

    const existingConvId = 'a1b2c3d4-e5f6-4a1b-8c2d-e3f4a5b6c7d8';

    await tool.execute({
      phone: '521234567890',
      body: 'Hola ciudadano',
      conversationId: existingConvId,
    });

    expect(conversationRepo.findOrCreateCanonical).not.toHaveBeenCalled();
    expect(prisma.__tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conversationId: existingConvId }),
      }),
    );
  });

  it('idempotencia: replay con mismo idempotencyKey no crea duplicados', async () => {
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue(BASE_CITIZEN);
    conversationRepo.findOrCreateCanonical.mockResolvedValue(BASE_CONVERSATION);
    // @ts-ignore
    prisma.__tx.outboxEvent.findUnique.mockResolvedValue({ id: 'outbox-existing' });
    // @ts-ignore
    prisma.__tx.message.findUnique.mockResolvedValue(BASE_MESSAGE);
    outboxProcessor.enqueue.mockResolvedValue(undefined);

    const myKey = 'my-custom-key-123';
    const result = await tool.execute({
      phone: '521234567890',
      body: 'Hola',
      idempotencyKey: myKey,
    });

    expect(prisma.__tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(prisma.__tx.message.create).not.toHaveBeenCalled();

    expect(outboxProcessor.enqueue).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      myKey,
      expect.any(String),
      expect.any(Object),
    );

    expect(result).toMatchObject({ isReplay: true, idempotencyKey: myKey, messageId: 'msg-001' });
  });

  it('replay legado encuentra el mensaje por externalMessageId', async () => {
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue(BASE_CITIZEN);
    conversationRepo.findOrCreateCanonical.mockResolvedValue(BASE_CONVERSATION);
    // @ts-ignore
    prisma.__tx.outboxEvent.findUnique.mockResolvedValue({ id: 'outbox-existing' });
    // @ts-ignore
    prisma.__tx.message.findUnique.mockResolvedValue(null);
    // @ts-ignore
    prisma.__tx.message.findFirst.mockResolvedValue(BASE_MESSAGE);
    outboxProcessor.enqueue.mockResolvedValue(undefined);

    const myKey = 'legacy-key-123';
    const result = await tool.execute({
      phone: '521234567890',
      body: 'Hola',
      idempotencyKey: myKey,
    });

    expect(prisma.__tx.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: 'conv-001',
          direction: MessageDirection.outbound,
          externalMessageId: myKey,
        }),
      }),
    );
    expect(prisma.__tx.message.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ isReplay: true, idempotencyKey: myKey, messageId: 'msg-001' });
  });

  it('devuelve UNSUPPORTED_MESSAGE_TYPE para tipos aún no implementados', async () => {
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue(BASE_CITIZEN);
    conversationRepo.findOrCreateCanonical.mockResolvedValue(BASE_CONVERSATION);

    const result = await tool.execute({
      phone: '521234567890',
      body: 'Hola',
      messageType: 'template',
    });

    expect(result).toMatchObject({ error: 'UNSUPPORTED_MESSAGE_TYPE', messageType: 'template' });
  });

  it('devuelve EXECUTION_ERROR si el repo falla', async () => {
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue(BASE_CITIZEN);
    conversationRepo.findOrCreateCanonical.mockRejectedValue(new Error('DB timeout'));

    const result = await tool.execute({ phone: '521234567890', body: 'Hola' });

    expect(result).toMatchObject({ error: 'EXECUTION_ERROR', message: 'DB timeout' });
  });

  describe('[Ticket] attachMessageToTicket', () => {
    function makeToolWithTicket(ticketService: ReturnType<typeof makeTicketServiceMock>) {
      return new SendMessageTool(
        // @ts-ignore
        citizenRepo,
        // @ts-ignore
        conversationRepo,
        // @ts-ignore
        outboxProcessor,
        // @ts-ignore
        prisma,
        // @ts-ignore
        ticketService,
      );
    }

    beforeEach(() => {
      // @ts-ignore
      citizenRepo.findByPhone.mockResolvedValue(BASE_CITIZEN);
      conversationRepo.findOrCreateCanonical.mockResolvedValue(BASE_CONVERSATION);
      conversationRepo.getCommunicationLineContext.mockResolvedValue({
        communicationLineId: null,
        externalIdentifier: null,
      });
      // @ts-ignore
      prisma.__tx.outboxEvent.findUnique.mockResolvedValue(null);
      // @ts-ignore
      prisma.__tx.outboxEvent.create.mockResolvedValue({ id: 'outbox-001' });
      // @ts-ignore
      prisma.__tx.message.create.mockResolvedValue(BASE_MESSAGE);
      outboxProcessor.enqueue.mockResolvedValue(undefined);
    });

    it('llama attachMessageToTicket cuando hay ticket activo y no es replay', async () => {
      const ticketService = makeTicketServiceMock();
      ticketService.getActiveTicketByConversation.mockResolvedValue({
        id: 'ticket-1',
        status: TicketStatus.OPEN,
      });
      ticketService.attachMessageToTicket.mockResolvedValue({ id: 'tm-001' });

      const toolWithTicket = makeToolWithTicket(ticketService);
      const result = await toolWithTicket.execute({
        phone: '521234567890',
        body: 'Hola ciudadano',
      });

      expect(ticketService.getActiveTicketByConversation).toHaveBeenCalledWith('conv-001');
      expect(ticketService.attachMessageToTicket).toHaveBeenCalledWith('ticket-1', 'msg-001');
      expect(result).toMatchObject({ isReplay: false });
    });

    it('NO llama attachMessageToTicket cuando isReplay=true', async () => {
      const ticketService = makeTicketServiceMock();

      // Simular outbox existente → replay path
      // @ts-ignore
      prisma.__tx.outboxEvent.findUnique.mockResolvedValue({ id: 'outbox-existing' });
      // @ts-ignore
      prisma.__tx.message.findFirst.mockResolvedValue(BASE_MESSAGE);

      const toolWithTicket = makeToolWithTicket(ticketService);
      const result = await toolWithTicket.execute({
        phone: '521234567890',
        body: 'Hola ciudadano',
        idempotencyKey: 'replay-key-123',
      });

      expect(ticketService.attachMessageToTicket).not.toHaveBeenCalled();
      expect(result).toMatchObject({ isReplay: true });
    });

    it('no aborta el send si attachMessageToTicket falla (best-effort)', async () => {
      const ticketService = makeTicketServiceMock();
      ticketService.getActiveTicketByConversation.mockResolvedValue({
        id: 'ticket-1',
        status: TicketStatus.OPEN,
      });
      ticketService.attachMessageToTicket.mockRejectedValue(new Error('DB error in ticket'));

      const toolWithTicket = makeToolWithTicket(ticketService);
      const result = await toolWithTicket.execute({
        phone: '521234567890',
        body: 'Hola ciudadano',
      });

      // El send debe completarse exitosamente a pesar del error de ticket
      expect(result).toMatchObject({ messageId: 'msg-001', isReplay: false });
    });
  });
});
