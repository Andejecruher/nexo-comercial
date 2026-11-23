import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { env } from '../../../config/env.config';
import { MULTIMODAL_FALLBACK_RESPONSE } from '../../../ai/config/multimodal-prompts';
import { AIExecutionContext } from '../../../ai/core/types';
import { MultimodalService } from '../../../ai/services/multimodal.service';
import { NvidiaMediaInput } from '../../../ai/services/nvidia.service';
import { WaInboundMessage } from '../../../types/whatsapp.types';

const audio: WaInboundMessage = {
  type: 'audio',
  id: 'wa-1',
  from: '5210000000000',
  timestamp: '1',
  audio: { id: '123', mime_type: 'audio/ogg' },
};
const image: WaInboundMessage = {
  type: 'image',
  id: 'wa-2',
  from: '5210000000000',
  timestamp: '2',
  image: { id: '456', mime_type: 'image/jpeg', caption: 'Aquí está la fuga' },
};

function makeContext(inboundMessages?: WaInboundMessage[]): AIExecutionContext {
  return {
    conversationId: 'conv-1',
    citizenId: 'cit-1',
    messageId: 'msg-1',
    phone: '5210000000000',
    messageText: 'Aquí está la fuga',
    flowState: 'BOT_FLOW',
    correlationId: 'corr-1',
    inboundMessages,
  };
}

function setup() {
  const get = jest.fn(
    async (_id: string, _provider: unknown, _context: unknown): Promise<Buffer> =>
      Buffer.from('media'),
  );
  const nvidia = {
    transcribeAudio: jest.fn(async (_input: NvidiaMediaInput) => 'Hay una fuga de agua'),
    analyzeImage: jest.fn(async (_input: NvidiaMediaInput) => 'TIPO DE REPORTE: Fuga'),
  };
  const provider = {} as never;
  return { get, nvidia, provider, service: new MultimodalService(provider, nvidia, { get }) };
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('MultimodalService', () => {
  it('no descarga medios ni invoca satélites para mensajes de texto', async () => {
    const { service, get, nvidia } = setup();
    const text: WaInboundMessage = {
      type: 'text',
      id: 'wa-text',
      from: '5210000000000',
      timestamp: '1',
      text: { body: 'Hay una fuga' },
    };
    const result = await service.prepare(makeContext([text]), 'line-1');
    expect(result).toMatchObject({
      status: 'ready',
      messageText: expect.stringContaining('[TIPO: TEXTO]'),
    });
    expect(get).not.toHaveBeenCalled();
    expect(nvidia.transcribeAudio).not.toHaveBeenCalled();
    expect(nvidia.analyzeImage).not.toHaveBeenCalled();
  });

  it('transcribe audio usando el almacén privado y la línea resuelta', async () => {
    const { service, get, nvidia, provider } = setup();
    const result = await service.prepare(makeContext([audio]), 'line-1');
    expect(get).toHaveBeenCalledWith('123', provider, { lineId: 'line-1' });
    expect(nvidia.transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: Buffer.from('media'),
        mimeType: 'audio/ogg',
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(result).toMatchObject({
      status: 'ready',
      messageText: expect.stringContaining('[TIPO: AUDIO_TRANSCRITO]'),
    });
  });

  it('analiza imágenes conservando la leyenda y el orden de lotes mixtos', async () => {
    const { service, nvidia } = setup();
    const result = await service.prepare(makeContext([audio, image]), 'line-1');
    expect(nvidia.analyzeImage).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/jpeg' }),
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected ready');
    expect(result.messageText).toContain('Aquí está la fuga');
    expect(result.messageText).toContain('TIPO DE REPORTE: Fuga');
    expect(result.messageText.indexOf('[TIPO: AUDIO_TRANSCRITO]')).toBeLessThan(
      result.messageText.indexOf('[TIPO: IMAGEN_ANALIZADA]'),
    );
  });

  it.each(['audio', 'image', 'download', 'empty'] as const)(
    'devuelve fallback si falla %s',
    async (failure) => {
      const { service, nvidia, get } = setup();
      if (failure === 'audio') nvidia.transcribeAudio.mockRejectedValueOnce(new Error('ASR down'));
      if (failure === 'image') nvidia.analyzeImage.mockRejectedValueOnce(new Error('Vision down'));
      if (failure === 'download') get.mockRejectedValueOnce(new Error('Media expired'));
      if (failure === 'empty') nvidia.analyzeImage.mockResolvedValueOnce(' ');
      const result = await service.prepare(
        makeContext([failure === 'audio' ? audio : image]),
        'line-1',
      );
      expect(result).toEqual({ status: 'fallback', responseText: MULTIMODAL_FALLBACK_RESPONSE });
    },
  );

  it('mantiene compatibles entradas sin adjuntos y tipos no soportados', async () => {
    const { service, get } = setup();
    expect(await service.prepare(makeContext(), 'line-1')).toMatchObject({ status: 'ready' });
    const video: WaInboundMessage = {
      type: 'video',
      id: 'wa-video',
      from: '52',
      timestamp: '1',
      video: { id: '789', mime_type: 'video/mp4' },
    };
    expect(await service.prepare(makeContext([video]), 'line-1')).toMatchObject({
      status: 'ready',
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('limita el tiempo total incluso si la descarga queda pendiente y evita invocaciones tardías', async () => {
    jest.useFakeTimers();
    jest.replaceProperty(env, 'NVIDIA_MULTIMODAL_TIMEOUT_MS', 100);
    const { service, get, nvidia } = setup();
    let finishDownload: ((bytes: Buffer) => void) | undefined;
    get.mockImplementationOnce(
      () =>
        new Promise<Buffer>((resolve) => {
          finishDownload = resolve;
        }),
    );
    const pending = service.prepare(makeContext([audio]), 'line-1');
    await jest.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ status: 'fallback' });
    finishDownload?.(Buffer.from('late media'));
    await Promise.resolve();
    expect(nvidia.transcribeAudio).not.toHaveBeenCalled();
  });

  it('propaga la cancelación de la FSM sin enviar el fallback después de cerrar el turno', async () => {
    const { service, nvidia } = setup();
    nvidia.transcribeAudio.mockImplementationOnce(() => new Promise<string>(() => {}));
    const controller = new AbortController();
    const pending = service.prepare(
      { ...makeContext([audio]), abortSignal: controller.signal },
      'line-1',
    );
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    expect(nvidia.transcribeAudio).toHaveBeenCalledTimes(1);
    controller.abort();
    await assertion;
    expect(nvidia.transcribeAudio.mock.calls[0]?.[0].abortSignal?.aborted).toBe(true);
    expect(nvidia.analyzeImage).not.toHaveBeenCalled();
    await expect(
      service.prepare({ ...makeContext([audio]), abortSignal: controller.signal }, 'line-1'),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
