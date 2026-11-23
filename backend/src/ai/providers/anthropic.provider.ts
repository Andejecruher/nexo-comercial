import * as crypto from 'crypto';

import { AIProviderInput, AIResponse, AIStreamChunk, AIToolCall } from '../core/types';
import { BaseProvider } from './base.provider';

export class AnthropicProvider extends BaseProvider {
  private buildMessages(input: AIProviderInput): {
    system?: string;
    messages: Array<{ role: string; content: string }>;
  } {
    const system = input.messages.find((msg) => msg.role === 'system')?.content;
    const messages = input.messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({ role: msg.role === 'tool' ? 'assistant' : msg.role, content: msg.content }));

    return { system, messages };
  }

  private async consumeStream(
    stream: AsyncIterable<unknown>,
    onChunk?: (chunk: AIStreamChunk) => Promise<void> | void,
  ): Promise<AIResponse> {
    let text = '';
    let chunkCount = 0;
    let usage: AIResponse['usage'];

    const toolStates: Record<
      number,
      { id?: string; name?: string; inputJson: string; inputObject?: Record<string, unknown> }
    > = {};

    for await (const event of stream) {
      if (!event || typeof event !== 'object') {
        continue;
      }

      const root = event as Record<string, unknown>;
      chunkCount += 1;

      const eventUsage = this.normalizeUsage(root.usage);
      if (eventUsage) {
        usage = {
          inputTokens: eventUsage.inputTokens ?? usage?.inputTokens,
          outputTokens: eventUsage.outputTokens ?? usage?.outputTokens,
          totalTokens: eventUsage.totalTokens ?? usage?.totalTokens,
        };
      }

      const type = typeof root.type === 'string' ? root.type : '';

      if (type === 'content_block_start') {
        const index = typeof root.index === 'number' ? root.index : 0;
        const block =
          root.content_block && typeof root.content_block === 'object'
            ? (root.content_block as Record<string, unknown>)
            : undefined;
        if (!block || typeof block.type !== 'string') {
          continue;
        }

        if (block.type === 'tool_use') {
          toolStates[index] = {
            id: typeof block.id === 'string' ? block.id : undefined,
            name: typeof block.name === 'string' ? block.name : undefined,
            inputJson: '',
            inputObject:
              block.input && typeof block.input === 'object' && !Array.isArray(block.input)
                ? (block.input as Record<string, unknown>)
                : undefined,
          };
        }
      }

      if (type === 'content_block_delta') {
        const index = typeof root.index === 'number' ? root.index : 0;
        const delta =
          root.delta && typeof root.delta === 'object'
            ? (root.delta as Record<string, unknown>)
            : undefined;
        if (!delta || typeof delta.type !== 'string') {
          continue;
        }

        if (
          delta.type === 'text_delta' &&
          typeof delta.text === 'string' &&
          delta.text.length > 0
        ) {
          text += delta.text;
          if (onChunk) {
            await onChunk({
              textDelta: delta.text,
              accumulatedText: text,
              raw: root,
            });
          }
        }

        if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const state = toolStates[index] ?? {
            id: undefined,
            name: undefined,
            inputJson: '',
            inputObject: undefined,
          };
          state.inputJson += delta.partial_json;
          toolStates[index] = state;
        }
      }
    }

    const toolCalls: AIToolCall[] = Object.entries(toolStates)
      .map(([index, value]) => {
        if (!value.name) {
          return undefined;
        }
        const inputValue =
          value.inputJson.length > 0
            ? this.parseToolInput(value.inputJson)
            : (value.inputObject ?? {});

        return {
          id: value.id ?? `anthropic-tool-${index}`,
          name: value.name,
          input: inputValue,
        };
      })
      .filter((value): value is AIToolCall => value !== undefined);

    return {
      text: text.trim(),
      toolCalls,
      usage,
      raw: {
        streamed: true,
        chunkCount,
      },
    };
  }

  async generate(input: AIProviderInput): Promise<AIResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return this.unavailable('ANTHROPIC_API_KEY is missing');
    }

    let AnthropicConstructor:
      | (new (params: { apiKey: string }) => {
          messages: {
            create: (
              payload: Record<string, unknown>,
              requestOptions?: { signal?: AbortSignal },
            ) => Promise<unknown>;
          };
        })
      | undefined;

    try {
      const moduleName = '@anthropic-ai/sdk';
      const mod = (await import(moduleName)) as { default?: unknown };
      if (typeof mod.default === 'function') {
        AnthropicConstructor = mod.default as new (params: { apiKey: string }) => {
          messages: {
            create: (
              payload: Record<string, unknown>,
              requestOptions?: { signal?: AbortSignal },
            ) => Promise<unknown>;
          };
        };
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return this.unavailable(`@anthropic-ai/sdk import failed: ${detail}`);
    }

    if (!AnthropicConstructor) {
      return this.unavailable('anthropic SDK export not available');
    }

    const client = new AnthropicConstructor({ apiKey });
    const { system, messages } = this.buildMessages(input);

    const payload: Record<string, unknown> = {
      model: input.model,
      max_tokens: input.maxTokens ?? 512,
      temperature: input.temperature,
      top_p: input.topP,
      top_k: input.topK,
      ...(system ? { system } : {}),
      messages,
      tools: input.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema ?? { type: 'object', additionalProperties: true },
      })),
    };

    if (input.stream) {
      payload.stream = true;
    }

    const response = input.abortSignal
      ? await client.messages.create(payload, { signal: input.abortSignal })
      : await client.messages.create(payload);

    if (input.stream) {
      if (!this.isAsyncIterable(response)) {
        return this.unavailable('Anthropic stream mode is not available for this response');
      }
      return this.consumeStream(response, input.onChunk);
    }

    const root = response as Record<string, unknown>;
    const blocks = Array.isArray(root.content) ? root.content : [];

    const textParts: string[] = [];
    const toolCalls = blocks
      .filter((block) => block && typeof block === 'object')
      .flatMap((block) => {
        const rec = block as Record<string, unknown>;
        if (rec.type === 'text' && typeof rec.text === 'string') {
          textParts.push(rec.text);
          return [];
        }

        if (rec.type === 'tool_use' && typeof rec.name === 'string') {
          return [
            {
              id: typeof rec.id === 'string' ? rec.id : crypto.randomUUID(),
              name: rec.name,
              input: this.parseToolInput(rec.input),
            },
          ];
        }

        return [];
      });

    return {
      text: textParts.join('\n').trim(),
      toolCalls,
      usage: this.normalizeUsage(root.usage),
      raw: root,
    };
  }
}
