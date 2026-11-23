import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MessageOrchestratorService } from '../../../services/orchestrator/message-orchestrator.service';
import { PrivateMediaStore } from '../../../services/whatsapp/private-media.store';
import { WaInboundMessage } from '../../../types/whatsapp.types';

const audio: WaInboundMessage = {
  type: 'audio',
  id: 'wa-audio',
  from: '52',
  timestamp: '1',
  audio: { id: '123', mime_type: 'audio/ogg' },
};
const image: WaInboundMessage = {
  type: 'image',
  id: 'wa-image',
  from: '52',
  timestamp: '2',
  image: { id: '456', mime_type: 'image/jpeg', caption: 'La lámpara no enciende' },
};

function setup() {
  const citizenRepo = {
    findOrCreate: jest.fn(async () => ({
      id: 'cit-1',
      name: 'Ana',
      phone: '521999888777',
      neighborhoodId: 'nbhd-1',
      neighborhood: 'Centro',
      interests: [],
    })),
  };
  const conversationRepo = {
    findOrCreateCanonical: jest.fn(async () => ({
      id: 'conv-1',
      created: false,
      reactivated: false,
    })),
    getConversationContext: jest.fn(async () => ({
      meta: { flowState: 'BOT_FLOW', version: 1 },
      attendanceMode: 'bot',
      botEnabled: true,
    })),
    findActiveCommunicationLineByExternalIdentifier: jest.fn(async () => ({ id: 'line-1' })),
    bindCommunicationLine: jest.fn(async () => undefined),
  };
  const messageRepo = {
    findByExternalId: jest.fn(async () => undefined),
    create: jest.fn(async (data: { externalMessageId: string; body: string }) => ({
      ...data,
      id: `persisted-${data.externalMessageId}`,
      createdAt: new Date(),
    })),
  };
  const handle = jest.fn(async (_input: unknown) => ({
    decision: { kind: 'ai_handled' },
    flowState: 'BOT_FLOW',
    transitioned: false,
    durationMs: 1,
  }));
  const orchestrator = new MessageOrchestratorService(
    citizenRepo as never,
    conversationRepo as never,
    messageRepo as never,
    {} as never,
    { route: jest.fn(async () => undefined) } as never,
    { markAsRead: jest.fn(async () => undefined) } as never,
    { handle } as never,
    'corr-1',
  );
  return { orchestrator, handle };
}

beforeEach(() => {
  jest.spyOn(PrivateMediaStore.prototype, 'get').mockResolvedValue(Buffer.from('media'));
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Ingreso multimedia del webhook al turno FSM', () => {
  it.each([audio, image])(
    'transporta $type sin convertirlo en un mensaje de texto',
    async (message) => {
      const { orchestrator, handle } = setup();
      await orchestrator.handleInboundMessage('521999888777', message, 'Ana', 'phone-number-id');
      expect(handle).toHaveBeenCalledWith(
        expect.objectContaining({
          inboundMessages: [message],
          lineExternalIdentifier: 'phone-number-id',
          messageId: `persisted-${message.id}`,
        }),
      );
    },
  );

  it('transporta todos los adjuntos de un lote en orden y excluye sus IDs del historial', async () => {
    const { orchestrator, handle } = setup();
    const fragments = [audio, image].map((message) => ({
      message,
      wamid: message.id,
      phone: '521999888777',
      timestamp: message.timestamp,
      createdAt: new Date(),
      inboxEventId: `inbox-${message.id}`,
      phoneNumberId: 'phone-number-id',
    }));
    await orchestrator.handleInboundBatch('521999888777', fragments, 7, 'phone-number-id');
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        inboundMessages: [audio, image],
        batchGeneration: 7,
        excludeMessageIds: ['persisted-wa-audio', 'persisted-wa-image'],
        messageId: 'persisted-wa-image',
      }),
    );
  });

  it('transporta un lote de audio sin texto al turno FSM', async () => {
    const { orchestrator, handle } = setup();
    const fragments = [audio].map((message) => ({
      message,
      wamid: message.id,
      phone: '521999888777',
      timestamp: message.timestamp,
      createdAt: new Date(),
      inboxEventId: `inbox-${message.id}`,
      phoneNumberId: 'phone-number-id',
    }));

    await orchestrator.handleInboundBatch('521999888777', fragments, 8, 'phone-number-id');

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        inboundMessages: [audio],
        batchGeneration: 8,
        excludeMessageIds: ['persisted-wa-audio'],
        messageId: 'persisted-wa-audio',
      }),
    );
  });
});
