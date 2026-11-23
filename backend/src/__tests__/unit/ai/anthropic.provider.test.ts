import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AIProviderInput } from '../../../ai/core/types';
import { withEnv } from '../../helpers/with-env';

const anthropicCreateMock = jest.fn(async () => ({}));
const AnthropicConstructorMock = jest.fn(() => ({
  messages: {
    create: anthropicCreateMock,
  },
}));

jest.mock(
  '@anthropic-ai/sdk',
  () => ({
    __esModule: true,
    default: AnthropicConstructorMock,
  }),
  { virtual: true },
);

import { AnthropicProvider } from '../../../ai/providers/anthropic.provider';

function makeInput(overrides?: Partial<AIProviderInput>): AIProviderInput {
  return {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.5,
    maxTokens: 400,
    topP: 0.85,
    topK: 32,
    messages: [
      { role: 'system', content: 'Sos asistente cívico' },
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
            departmentId: { type: 'string' },
          },
        },
      },
    ],
    ...overrides,
  };
}

async function* makeAnthropicStream(): AsyncGenerator<unknown> {
  yield {
    type: 'content_block_start',
    index: 0,
    content_block: {
      type: 'tool_use',
      id: 'tool_1',
      name: 'assignDepartment',
    },
  };

  yield {
    type: 'content_block_delta',
    index: 1,
    delta: {
      type: 'text_delta',
      text: 'Ho',
    },
    usage: {
      input_tokens: 5,
    },
  };

  yield {
    type: 'content_block_delta',
    index: 0,
    delta: {
      type: 'input_json_delta',
      partial_json: '{"departmentId":"dep-',
    },
  };

  yield {
    type: 'content_block_delta',
    index: 1,
    delta: {
      type: 'text_delta',
      text: 'la',
    },
    usage: {
      output_tokens: 3,
      total_tokens: 8,
    },
  };

  yield {
    type: 'content_block_delta',
    index: 0,
    delta: {
      type: 'input_json_delta',
      partial_json: '1"}',
    },
  };
}

describe('AnthropicProvider', () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    anthropicCreateMock.mockReset();
    AnthropicConstructorMock.mockClear();
    restore = withEnv({ ANTHROPIC_API_KEY: 'test-anthropic-key' });
  });

  afterEach(() => {
    restore?.();
  });

  it('mapea payload sync y normaliza usage + tool calls', async () => {
    anthropicCreateMock.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'Respuesta Anthropic' },
        {
          type: 'tool_use',
          id: 'tool_sync_1',
          name: 'assignDepartment',
          input: { departmentId: 'dep-99' },
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 6,
        total_tokens: 16,
      },
    });

    const provider = new AnthropicProvider();
    const response = await provider.generate(makeInput());

    expect(AnthropicConstructorMock).toHaveBeenCalledWith({ apiKey: 'test-anthropic-key' });
    expect(anthropicCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-3-5-sonnet-20241022',
        top_p: 0.85,
        top_k: 32,
      }),
    );

    expect(response.text).toBe('Respuesta Anthropic');
    expect(response.toolCalls).toEqual([
      {
        id: 'tool_sync_1',
        name: 'assignDepartment',
        input: { departmentId: 'dep-99' },
      },
    ]);
    expect(response.usage).toEqual({
      inputTokens: 10,
      outputTokens: 6,
      totalTokens: 16,
    });
  });

  it('consume stream incremental y reconstruye tool_use por eventos parciales', async () => {
    anthropicCreateMock.mockResolvedValueOnce(makeAnthropicStream());
    const streamedChunks: Array<{ textDelta: string; accumulatedText: string }> = [];
    const onChunk: NonNullable<AIProviderInput['onChunk']> = (chunk) => {
      streamedChunks.push({ textDelta: chunk.textDelta, accumulatedText: chunk.accumulatedText });
    };

    const provider = new AnthropicProvider();
    const response = await provider.generate(
      makeInput({
        stream: true,
        onChunk,
      }),
    );

    expect(anthropicCreateMock).toHaveBeenCalledWith(expect.objectContaining({ stream: true }));
    expect(streamedChunks).toEqual([
      { textDelta: 'Ho', accumulatedText: 'Ho' },
      { textDelta: 'la', accumulatedText: 'Hola' },
    ]);

    expect(response.text).toBe('Hola');
    expect(response.toolCalls).toEqual([
      {
        id: 'tool_1',
        name: 'assignDepartment',
        input: { departmentId: 'dep-1' },
      },
    ]);
    expect(response.usage).toEqual({
      inputTokens: 5,
      outputTokens: 3,
      totalTokens: 8,
    });
  });
});
