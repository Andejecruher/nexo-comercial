import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { env } from '../../../config/env.config';
import {
  MULTIMODAL_FALLBACK_RESPONSE,
  NEMOTRON_SYSTEM_PROMPT,
  NVIDIA_MODELS,
} from '../../../ai/config/multimodal-prompts';
import { AIExecutionContext } from '../../../ai/core/types';
import type { WaInboundMessage } from '../../../types/whatsapp.types';

const createMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const transcribeMock = jest.fn<(...args: unknown[]) => Promise<string>>();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    chat: { completions: { create: createMock } },
  })),
}));

import { AIOrchestrator } from '../../../ai/orchestrator/orchestrator';
import { ProviderFactory } from '../../../ai/providers/provider.factory';
import { AIService } from '../../../ai/services/ai.service';
import { MultimodalService } from '../../../ai/services/multimodal.service';
import { NvidiaService } from '../../../ai/services/nvidia.service';

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
  image: { id: '456', mime_type: 'image/jpeg', caption: 'En calle Hidalgo' },
};

function setup() {
  const context: AIExecutionContext = {
    conversationId: 'conv-1',
    citizenId: 'cit-1',
    phone: '5210000000000',
    lineExternalIdentifier: 'phone-number-id',
    messageId: 'msg-1',
    messageText: 'En calle Hidalgo',
    flowState: 'BOT_FLOW',
    correlationId: 'corr-1',
    inboundMessages: [image],
  };
  const enqueue = jest.fn(async (..._args: unknown[]) => undefined);
  const persist = jest.fn(async (_data: unknown) => ({ id: 'out-1' }));
  const ticketMutation = jest.fn();
  const get = jest.fn(async (..._args: unknown[]) => Buffer.from('media'));
  const logger = {
    startRun: jest.fn(async () => 'run-1'),
    completeRun: jest.fn(async (..._args: unknown[]) => undefined),
    failRun: jest.fn(async (..._args: unknown[]) => undefined),
  };
  const topicRegistry = {
    resolve: jest.fn(async () => ({
      topicId: 'topic-1',
      promptId: 'prompt-1',
      promptContent: 'Atiende reportes municipales.',
    })),
  };
  const service = new AIService({
    prisma: {} as never,
    messageRepo: { create: persist, findRecentForAiContext: jest.fn(async () => []) } as never,
    conversationRepo: {} as never,
    citizenRepo: {} as never,
    ticketService: {
      getActiveTicketByConversation: jest.fn(async () => undefined),
      closeTicket: ticketMutation,
      updateTicket: ticketMutation,
    } as never,
    outboxProcessor: { enqueue } as never,
    multimodal: new MultimodalService(
      {} as never,
      new NvidiaService({ transcriber: { transcribeAudio: transcribeMock } }),
      { get },
    ),
  });
  const resolveLineAgent = jest.fn(async () => ({
    lineId: 'line-1',
    agent: {
      id: 'agent-1',
      name: 'Voz Ciudadana',
      provider: 'openai',
      model: NVIDIA_MODELS.chat,
      stream: false,
    },
  }));
  Object.assign(service, {
    agentRegistry: { resolveLineAgent },
    orchestrator: new AIOrchestrator(
      new ProviderFactory(),
      topicRegistry as never,
      { getToolsForTopic: jest.fn(async () => []) } as never,
      {} as never,
      logger as never,
    ),
  });
  return { service, context, enqueue, persist, get, logger, resolveLineAgent, ticketMutation };
}

Object.assign(env, {
  NVIDIA_API_KEY: env.NVIDIA_API_KEY,
});

beforeEach(() => {
  jest.replaceProperty(env, 'NVIDIA_API_KEY', 'nvapi-test');
  createMock.mockReset();
  transcribeMock.mockReset();
  createMock.mockImplementation(async (payload) => ({
    choices: [
      {
        message: {
          content:
            (payload as { model: string }).model === NVIDIA_MODELS.vision
              ? 'TIPO DE REPORTE: Bache\nDESCRIPCIÓN: Bache visible\nTEXTO VISIBLE: No visible\nSEVERIDAD VISUAL: Media'
              : '¿A qué altura de calle Hidalgo se encuentra el problema?',
          tool_calls: [],
        },
      },
    ],
  }));
  transcribeMock.mockResolvedValue('Hay un bache grande');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Pipeline multimedia → Nemotron → outbox', () => {
  it.each([
    { kind: 'audio', message: audio, tag: 'AUDIO_TRANSCRITO' },
    { kind: 'image', message: image, tag: 'IMAGEN_ANALIZADA' },
  ])('procesa $kind y entrega la respuesta por la línea original', async ({ message, tag }) => {
    const { service, context, enqueue, persist, logger } = setup();
    context.inboundMessages = [message];
    expect(await service.handleMessage(context)).toEqual({ handled: true, runId: 'run-1' });
    const chatPayload = createMock.mock.calls
      .map(
        ([payload]) => payload as { model: string; messages: { role: string; content: string }[] },
      )
      .find((payload) => payload.model === NVIDIA_MODELS.chat);
    expect(chatPayload?.messages[0]?.content).toBe(NEMOTRON_SYSTEM_PROMPT);
    expect(chatPayload?.messages.at(-1)?.content).toContain(`[TIPO: ${tag}]`);
    expect(chatPayload?.messages.at(-1)?.content).toContain('[MENSAJE DEL USUARIO]');
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'ai:conv-1:msg-1' }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      context.phone,
      expect.objectContaining({ type: 'text' }),
      'ai:conv-1:msg-1',
      'conv-1',
      { lineExternalIdentifier: 'phone-number-id' },
    );
    expect(logger.completeRun).toHaveBeenCalledTimes(1);
  });

  it('procesa un lote mixto y conserva su llave de idempotencia', async () => {
    const { service, context, enqueue } = setup();
    context.inboundMessages = [audio, image];
    context.batchGeneration = 42;
    await service.handleMessage(context);
    const payload = createMock.mock.calls.at(-1)?.[0] as { messages: { content: string }[] };
    expect(payload.messages.at(-1)?.content).toContain('[TIPO: AUDIO_TRANSCRITO]');
    expect(payload.messages.at(-1)?.content).toContain('[TIPO: IMAGEN_ANALIZADA]');
    expect(enqueue.mock.calls[0]?.[2]).toBe('ai:conv-1:batch:42');
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(transcribeMock).toHaveBeenCalledTimes(1);
  });

  it('envía texto directamente al orquestador sin invocar satélites', async () => {
    const { service, context, get } = setup();
    context.inboundMessages = [
      { type: 'text', id: 'wa-text', from: '52', timestamp: '1', text: { body: 'Hay un bache' } },
    ];
    await service.handleMessage(context);
    expect(get).not.toHaveBeenCalled();
    expect(transcribeMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]?.[0]).toMatchObject({ model: NVIDIA_MODELS.chat });
  });

  it('entrega fallback durable sin llamar Nemotron si falla Vision', async () => {
    const { service, context, enqueue, logger } = setup();
    createMock.mockRejectedValueOnce(new Error('Vision unavailable'));
    expect(await service.handleMessage(context)).toEqual({ handled: true, runId: undefined });
    expect(enqueue.mock.calls[0]?.[1]).toMatchObject({
      text: { body: MULTIMODAL_FALLBACK_RESPONSE },
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(logger.startRun).not.toHaveBeenCalled();
  });

  it('entrega fallback si falla Riva alojado', async () => {
    transcribeMock.mockRejectedValueOnce(new Error('Riva unavailable'));
    const { service, context, enqueue, ticketMutation } = setup();
    context.inboundMessages = [audio];
    expect(await service.handleMessage(context)).toMatchObject({ handled: true });
    expect(enqueue.mock.calls[0]?.[1]).toMatchObject({
      text: { body: MULTIMODAL_FALLBACK_RESPONSE },
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(transcribeMock).toHaveBeenCalledTimes(1);
    expect(ticketMutation).not.toHaveBeenCalled();
  });

  it('no descarga medios cuando no hay agente autorizado para la línea', async () => {
    const { service, context, get, enqueue } = setup();
    Object.assign(service, { agentRegistry: { resolveLineAgent: jest.fn(async () => undefined) } });
    expect(await service.handleMessage(context)).toEqual({ handled: false });
    expect(get).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('propaga cancelaciones sin persistir ni encolar una respuesta tardía', async () => {
    const { service, context, enqueue, persist } = setup();
    context.abortSignal = AbortSignal.abort();
    await expect(service.handleMessage(context)).rejects.toMatchObject({ name: 'AbortError' });
    expect(persist).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
