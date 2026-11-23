import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AIProviderInput } from '../../../ai/core/types';

const openAiCreateMock = jest.fn(async () => ({}));
const OpenAiConstructorMock = jest.fn(() => ({
  chat: {
    completions: {
      create: openAiCreateMock,
    },
  },
}));

jest.mock('../../../config/env.config', () => ({
  env: {
    NVIDIA_API_KEY: 'nvapi-test-key',
    OPENAI_API_KEY: undefined,
    OPENAI_BASE_URL: undefined,
  },
}));

jest.mock('openai', () => ({
  __esModule: true,
  default: OpenAiConstructorMock,
}));

import { OpenAIProvider } from '../../../ai/providers/openai.provider';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

function makeInput(overrides?: Partial<AIProviderInput>): AIProviderInput {
  return {
    model: 'deepseek-ai/deepseek-v4-pro',
    temperature: 0.7,
    maxTokens: 512,
    topP: 0.91,
    frequencyPenalty: 0.25,
    presencePenalty: 0.1,
    chatTemplateKwargs: { thinking: false },
    messages: [
      { role: 'system', content: 'Sos un asistente municipal' },
      { role: 'user', content: 'Hola' },
    ],
    tools: [
      {
        id: 'tool-1',
        name: 'assignDepartment',
        description: 'Asigna conversacion',
        kind: 'internal',
        timeoutMs: 5000,
        allowlistDomains: [],
        inputSchema: {
          type: 'object',
          properties: {
            citizenId: { type: 'string' },
          },
        },
      },
    ],
    ...overrides,
  };
}

async function* makeOpenAiStream(): AsyncGenerator<unknown> {
  yield {
    choices: [
      {
        delta: {
          content: 'Ho',
        },
      },
    ],
  };

  yield {
    choices: [
      {
        delta: {
          content: 'la',
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              function: {
                name: 'assignDepartment',
                arguments: '{"citizenId":"',
              },
            },
          ],
        },
      },
    ],
  };

  yield {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              function: {
                arguments: 'citizen-1"}',
              },
            },
          ],
        },
      },
    ],
    usage: {
      prompt_tokens: 8,
      completion_tokens: 5,
      total_tokens: 13,
    },
  };
}

async function* makeStreamWithReasoning(): AsyncGenerator<unknown> {
  yield {
    choices: [
      {
        delta: {
          reasoning_content: 'thinking...',
        },
      },
    ],
  };

  yield {
    choices: [
      {
        delta: {
          content: 'answer',
        },
      },
    ],
  };
}

describe('OpenAIProvider', () => {
  beforeEach(() => {
    openAiCreateMock.mockReset();
    OpenAiConstructorMock.mockClear();
  });

  it('usa NVIDIA_API_KEY y la base URL de NVIDIA NIM', async () => {
    openAiCreateMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok', tool_calls: [] } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    const provider = new OpenAIProvider();
    await provider.generate(makeInput({ stream: false, tools: [] }));

    expect(OpenAiConstructorMock).toHaveBeenCalledWith({
      apiKey: 'nvapi-test-key',
      baseURL: NVIDIA_BASE_URL,
    });
  });

  it('lanza error si baseURL no es la de NVIDIA NIM', async () => {
    const provider = new OpenAIProvider({ baseURL: 'https://api.openai.com/v1' });
    await expect(provider.generate(makeInput())).rejects.toThrow('baseURL must be exactly');
  });

  it('mapea payload sync con parametros avanzados y normaliza usage/tool calls', async () => {
    openAiCreateMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'Respuesta final',
            tool_calls: [
              {
                id: 'call_sync_1',
                function: {
                  name: 'assignDepartment',
                  arguments: '{"citizenId":"citizen-1"}',
                },
              },
            ],
          },
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 7,
        total_tokens: 19,
      },
    });

    const provider = new OpenAIProvider();
    const response = await provider.generate(makeInput());

    expect(openAiCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'deepseek-ai/deepseek-v4-pro',
        top_p: 0.91,
        frequency_penalty: 0.25,
        presence_penalty: 0.1,
        chat_template_kwargs: { thinking: false },
      }),
    );

    expect(response.text).toBe('Respuesta final');
    expect(response.toolCalls).toEqual([
      {
        id: 'call_sync_1',
        name: 'assignDepartment',
        input: { citizenId: 'citizen-1' },
      },
    ]);
    expect(response.usage).toEqual({
      inputTokens: 12,
      outputTokens: 7,
      totalTokens: 19,
    });
  });

  it('no fuerza stream=true cuando input.stream es false/undefined', async () => {
    openAiCreateMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok', tool_calls: [] } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    const provider = new OpenAIProvider();
    await provider.generate(makeInput({ stream: false }));

    expect(openAiCreateMock).toHaveBeenCalledWith(expect.objectContaining({ stream: false }));
  });

  it('consume stream incremental, emite chunks y reconstruye tool call parcial', async () => {
    openAiCreateMock.mockResolvedValueOnce(makeOpenAiStream());

    const streamedChunks: Array<{ textDelta: string; accumulatedText: string }> = [];
    const onChunk: NonNullable<AIProviderInput['onChunk']> = (chunk) => {
      streamedChunks.push({ textDelta: chunk.textDelta, accumulatedText: chunk.accumulatedText });
    };
    const provider = new OpenAIProvider();

    const response = await provider.generate(
      makeInput({
        stream: true,
        onChunk,
      }),
    );

    expect(openAiCreateMock).toHaveBeenCalledWith(expect.objectContaining({ stream: true }));
    expect(streamedChunks).toEqual([
      { textDelta: 'Ho', accumulatedText: 'Ho' },
      { textDelta: 'la', accumulatedText: 'Hola' },
    ]);

    expect(response.text).toBe('Hola');
    expect(response.toolCalls).toEqual([
      {
        id: 'call_1',
        name: 'assignDepartment',
        input: { citizenId: 'citizen-1' },
      },
    ]);
    expect(response.usage).toEqual({
      inputTokens: 8,
      outputTokens: 5,
      totalTokens: 13,
    });
  });

  it('emite reasoning_content antes que content en el stream', async () => {
    openAiCreateMock.mockResolvedValueOnce(makeStreamWithReasoning());

    const streamedChunks: Array<{ textDelta: string }> = [];
    const onChunk: NonNullable<AIProviderInput['onChunk']> = (chunk) => {
      streamedChunks.push({ textDelta: chunk.textDelta });
    };
    const provider = new OpenAIProvider();

    await provider.generate(makeInput({ stream: true, onChunk, tools: [] }));

    expect(streamedChunks[0]).toEqual({ textDelta: 'thinking...' });
    expect(streamedChunks[1]).toEqual({ textDelta: 'answer' });
  });

  it('retorna providerUnavailable si stream=true pero la respuesta no es async iterable', async () => {
    openAiCreateMock.mockResolvedValueOnce({ choices: [] });

    const provider = new OpenAIProvider();
    const response = await provider.generate(makeInput({ stream: true }));

    expect(response.providerUnavailable).toBe(true);
    expect(response.raw).toEqual(
      expect.objectContaining({
        reason: 'OpenAI stream mode is not available for this response',
      }),
    );
  });

  it('re-lanza errores de chat.completions.create (no los traga)', async () => {
    const error = new Error('Connection refused');
    openAiCreateMock.mockRejectedValueOnce(error);

    const provider = new OpenAIProvider();
    await expect(provider.generate(makeInput({ stream: false, tools: [] }))).rejects.toThrow(
      'Connection refused',
    );
  });

  it('propaga abort signal al SDK cuando existe', async () => {
    openAiCreateMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok', tool_calls: [] } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    const provider = new OpenAIProvider();
    const controller = new AbortController();

    await provider.generate(
      makeInput({ stream: false, tools: [], abortSignal: controller.signal }),
    );

    expect(openAiCreateMock).toHaveBeenCalledWith(expect.any(Object), {
      signal: controller.signal,
    });
  });

  it('loguea debug info en errores 403 y re-lanza', async () => {
    const error = Object.assign(new Error('Forbidden'), { status: 403, headers: { 'x-req': '1' } });
    openAiCreateMock.mockRejectedValueOnce(error);

    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

    const provider = new OpenAIProvider();
    await expect(provider.generate(makeInput({ stream: false, tools: [] }))).rejects.toThrow(
      'Forbidden',
    );

    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('403'));
    debugSpy.mockRestore();
  });
});
