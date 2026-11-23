import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { env } from '../../../config/env.config';
import {
  LLAMA_VISION_SYSTEM_PROMPT,
  NEMOTRON_SYSTEM_PROMPT,
  NVIDIA_MODELS,
} from '../../../ai/config/multimodal-prompts';
import { AIProviderInput, AIResponse } from '../../../ai/core/types';

const createMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const constructorMock = jest.fn((_options: unknown) => ({
  chat: { completions: { create: createMock } },
}));

jest.mock('openai', () => ({
  __esModule: true,
  default: constructorMock,
}));

import { ProviderFactory } from '../../../ai/providers/provider.factory';
import { NvidiaMediaInput, NvidiaService } from '../../../ai/services/nvidia.service';

const media: NvidiaMediaInput = { bytes: Buffer.from('media'), mimeType: 'audio/ogg; codecs=opus' };
const input: AIProviderInput = {
  model: NVIDIA_MODELS.chat,
  messages: [{ role: 'user', content: 'Reporte' }],
  tools: [],
};
const response: AIResponse = { text: '¿En qué calle?', toolCalls: [], raw: {} };

Object.assign(env, {
  NVIDIA_API_KEY: env.NVIDIA_API_KEY,
});

describe('NvidiaService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.replaceProperty(env, 'NVIDIA_API_KEY', 'nvapi-test');
    constructorMock.mockClear();
    createMock.mockReset();
  });

  it('delega audio a Riva con bytes, MIME y cancelación originales', async () => {
    const transcribeAudio = jest.fn(async (_input: NvidiaMediaInput) => 'Hay una fuga de agua');
    const input = { ...media, abortSignal: new AbortController().signal };
    const service = new NvidiaService({ transcriber: { transcribeAudio } });
    expect(await service.transcribeAudio(input)).toBe('Hay una fuga de agua');
    expect(transcribeAudio).toHaveBeenCalledWith(input);
    expect(constructorMock).not.toHaveBeenCalled();
  });

  it('propaga errores de Riva al middleware para su fallback', async () => {
    const transcribeAudio = jest.fn(async () => {
      throw new Error('Riva unavailable');
    });
    await expect(
      new NvidiaService({ transcriber: { transcribeAudio } }).transcribeAudio(media),
    ).rejects.toThrow('Riva unavailable');
  });

  it('envía la imagen privada como data URI y las instrucciones en la parte de texto', async () => {
    const controller = new AbortController();
    createMock.mockResolvedValue({
      choices: [{ message: { content: '  TIPO DE REPORTE: Bache  ' } }],
    });
    const result = await new NvidiaService().analyzeImage({
      bytes: Buffer.from('image'),
      mimeType: 'image/png',
      abortSignal: controller.signal,
    });
    expect(result).toBe('TIPO DE REPORTE: Bache');
    expect(createMock).toHaveBeenCalledWith(
      {
        model: NVIDIA_MODELS.vision,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: LLAMA_VISION_SYSTEM_PROMPT },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
            ],
          },
        ],
        max_tokens: 1024,
        temperature: 0.1,
        stream: false,
      },
      { signal: controller.signal },
    );
    expect(constructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://integrate.api.nvidia.com/v1',
        apiKey: 'nvapi-test',
      }),
    );
  });

  it.each([
    { bytes: Buffer.alloc(0), mimeType: 'image/png' },
    { bytes: Buffer.alloc(5 * 1024 * 1024 + 1), mimeType: 'image/jpeg' },
    { bytes: Buffer.from('x'), mimeType: 'image/svg+xml' },
  ])('rechaza imágenes inválidas antes de invocar la API', async (image) => {
    await expect(new NvidiaService().analyzeImage(image)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rechaza análisis visuales vacíos y propaga errores HTTP', async () => {
    createMock.mockResolvedValueOnce({ choices: [] });
    await expect(
      new NvidiaService().analyzeImage({ ...media, mimeType: 'image/jpeg' }),
    ).rejects.toMatchObject({ code: 'AI_EMPTY_IMAGE_ANALYSIS' });
    createMock.mockRejectedValueOnce(new Error('429'));
    await expect(
      new NvidiaService().analyzeImage({ ...media, mimeType: 'image/jpeg' }),
    ).rejects.toThrow('429');
  });

  it('detecta la falta de NVIDIA_API_KEY', async () => {
    jest.replaceProperty(env, 'NVIDIA_API_KEY', undefined);
    await expect(
      new NvidiaService().analyzeImage({ ...media, mimeType: 'image/jpeg' }),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
  });

  it('conserva tools, streaming y cancelación al invocar Nemotron con el prompt maestro', async () => {
    const generate = jest.fn(async (_input: AIProviderInput) => response);
    const signal = new AbortController().signal;
    const enriched = {
      ...input,
      stream: true,
      abortSignal: signal,
      onChunk: jest.fn<() => void>(),
      tools: [
        {
          id: 'tool-1',
          name: 'createCitizen',
          description: 'Crear ciudadano',
          kind: 'internal' as const,
          timeoutMs: 5000,
          allowlistDomains: [],
        },
      ],
    };
    const service = new NvidiaService({ chatProvider: { generate } });
    expect(await service.chatWithNemotron(enriched)).toBe(response);
    expect(generate).toHaveBeenCalledWith({
      ...enriched,
      messages: [{ role: 'system', content: NEMOTRON_SYSTEM_PROMPT }, ...input.messages],
    });
    expect(constructorMock).not.toHaveBeenCalled();
  });

  it('despacha Nemotron por generate y conserva los demás modelos configurados', async () => {
    const generate = jest.fn(async (_input: AIProviderInput) => response);
    const service = new NvidiaService({ chatProvider: { generate } });
    await service.generate(input);
    expect(generate.mock.calls[0]?.[0].messages[0]?.content).toBe(NEMOTRON_SYSTEM_PROMPT);
    const otherInput = { ...input, model: 'another/model' };
    await service.generate(otherInput);
    expect(generate).toHaveBeenLastCalledWith(otherInput);
    expect(input.messages).toHaveLength(1);
    expect(new ProviderFactory().create('openai')).toBeInstanceOf(NvidiaService);
  });

  it('permite inyectar el cliente y propaga fallos de Nemotron', async () => {
    const createClient = jest.fn(
      () =>
        ({
          chat: { completions: { create: createMock } },
        }) as never,
    );
    createMock.mockResolvedValue({ choices: [{ message: { content: 'Una fuga' } }] });
    await new NvidiaService({ createClient }).analyzeImage({ ...media, mimeType: 'image/jpeg' });
    expect(createClient).toHaveBeenCalled();
    const generate = jest.fn(async () => {
      throw new Error('Nemotron unavailable');
    });
    await expect(new NvidiaService({ chatProvider: { generate } }).generate(input)).rejects.toThrow(
      'Nemotron unavailable',
    );
  });
});
