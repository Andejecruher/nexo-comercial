import { env } from '../../config/env.config';
import { AIProviderInput, AIResponse, AIStreamChunk, AIToolCall } from '../core/types';
import { BaseProvider } from './base.provider';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export class OpenAIProvider extends BaseProvider {
  constructor(
    private readonly config: {
      baseURL?: string;
    } = {},
  ) {
    super();
  }

  private buildBasePayload(input: AIProviderInput): Record<string, unknown> {
    const chatTemplateKwargs =
      input.chatTemplateKwargs && Object.keys(input.chatTemplateKwargs).length > 0
        ? input.chatTemplateKwargs
        : undefined;

    return {
      model: input.model,
      temperature: input.temperature || 1,
      top_p: input.topP || 1,
      frequency_penalty: input.frequencyPenalty || 0,
      presence_penalty: input.presencePenalty || 0,
      max_tokens: input.maxTokens,
      messages: input.messages.map((m) => ({
        role: m.role === 'tool' ? 'tool' : m.role,
        content: m.content,
        ...(m.role === 'tool' && m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        ...(m.name ? { name: m.name } : {}),
      })),
      chat_template_kwargs: chatTemplateKwargs,
      stream: input.stream === true,
      tools: input.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema ?? { type: 'object', additionalProperties: true },
        },
      })),
      tool_choice: input.tools.length > 0 ? 'auto' : undefined,
    };
  }

  private extractMessageResponse(root: Record<string, unknown>): AIResponse {
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const first =
      choices[0] && typeof choices[0] === 'object'
        ? (choices[0] as Record<string, unknown>)
        : undefined;
    const message =
      first?.message && typeof first.message === 'object'
        ? (first.message as Record<string, unknown>)
        : undefined;

    return {
      text: this.toText(message?.content),
      toolCalls: this.normalizeToolCalls(message?.tool_calls),
      usage: this.normalizeUsage(root.usage),
      raw: root,
    };
  }

  private async consumeStream(
    stream: AsyncIterable<unknown>,
    onChunk?: (chunk: AIStreamChunk) => Promise<void> | void,
  ): Promise<AIResponse> {
    let text = '';
    let lastChunk: Record<string, unknown> | undefined;
    let chunkCount = 0;

    const toolStates: Record<number, { id?: string; name?: string; argumentsText: string }> = {};

    for await (const chunk of stream) {
      if (!chunk || typeof chunk !== 'object') {
        continue;
      }

      const root = chunk as Record<string, unknown>;
      lastChunk = root;
      chunkCount += 1;

      const choices = Array.isArray(root.choices) ? root.choices : [];
      for (const choice of choices) {
        if (!choice || typeof choice !== 'object') continue;
        const choiceRecord = choice as Record<string, unknown>;
        const delta =
          choiceRecord.delta && typeof choiceRecord.delta === 'object'
            ? (choiceRecord.delta as Record<string, unknown>)
            : undefined;

        if (!delta) continue;

        // Emit reasoning_content first (NVIDIA NIM extended field)
        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
          text += delta.reasoning_content;
          if (onChunk) {
            await onChunk({
              textDelta: delta.reasoning_content,
              accumulatedText: text,
              raw: root,
            });
          }
        }

        if (typeof delta.content === 'string' && delta.content.length > 0) {
          text += delta.content;
          if (onChunk) {
            await onChunk({
              textDelta: delta.content,
              accumulatedText: text,
              raw: root,
            });
          }
        }

        const deltaToolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
        for (const item of deltaToolCalls) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          const index = typeof rec.index === 'number' ? rec.index : 0;
          const state = toolStates[index] ?? {
            id: undefined,
            name: undefined,
            argumentsText: '',
          };

          if (typeof rec.id === 'string') {
            state.id = rec.id;
          }

          const fn =
            rec.function && typeof rec.function === 'object'
              ? (rec.function as Record<string, unknown>)
              : undefined;

          if (fn) {
            if (typeof fn.name === 'string') {
              state.name = fn.name;
            }
            if (typeof fn.arguments === 'string') {
              state.argumentsText += fn.arguments;
            }
          }

          toolStates[index] = state;
        }
      }
    }

    const toolCalls: AIToolCall[] = Object.entries(toolStates)
      .map(([index, value]) => {
        if (!value.name) {
          return undefined;
        }
        return {
          id: value.id ?? `stream-tool-${index}`,
          name: value.name,
          input: this.parseToolInput(value.argumentsText),
        };
      })
      .filter((value): value is AIToolCall => value !== undefined);

    return {
      text: text.trim(),
      toolCalls,
      usage: this.normalizeUsage(lastChunk?.usage),
      raw: {
        streamed: true,
        chunkCount,
        lastChunk: lastChunk ?? {},
      },
    };
  }

  async generate(input: AIProviderInput): Promise<AIResponse> {
    const apiKey = env.NVIDIA_API_KEY;
    if (!apiKey) {
      return this.unavailable('NVIDIA_API_KEY is missing');
    }

    const baseURL = this.config.baseURL ?? NVIDIA_BASE_URL;
    if (baseURL !== NVIDIA_BASE_URL) {
      throw new Error(
        `OpenAIProvider: baseURL must be exactly "${NVIDIA_BASE_URL}", got "${baseURL}"`,
      );
    }

    let OpenAIConstructor:
      | (new (params: { apiKey: string; baseURL?: string }) => {
          chat: {
            completions: {
              create: (
                payload: Record<string, unknown>,
                requestOptions?: { signal?: AbortSignal },
              ) => Promise<unknown>;
            };
          };
        })
      | undefined;

    try {
      const moduleName = 'openai';
      const mod = (await import(moduleName)) as { default?: unknown };
      if (typeof mod.default === 'function') {
        OpenAIConstructor = mod.default as new (params: { apiKey: string; baseURL?: string }) => {
          chat: {
            completions: {
              create: (
                payload: Record<string, unknown>,
                requestOptions?: { signal?: AbortSignal },
              ) => Promise<unknown>;
            };
          };
        };
      }
    } catch (err) {
      console.log('[OpenAIProvider] Failed to import openai SDK:', err);
      const detail = err instanceof Error ? err.message : String(err);
      return this.unavailable(`openai SDK import failed: ${detail}`);
    }

    if (!OpenAIConstructor) {
      return this.unavailable('openai SDK export not available');
    }

    const client = new OpenAIConstructor({ apiKey, baseURL });

    const payload = this.buildBasePayload(input);

    let completion: unknown;
    try {
      completion = input.abortSignal
        ? await client.chat.completions.create(payload, { signal: input.abortSignal })
        : await client.chat.completions.create(payload);
    } catch (err: unknown) {
      console.error(
        '[OpenAIProvider] Error during API call:',
        err instanceof Error ? err.message : String(err),
      );
      const error = (typeof err === 'object' && err !== null ? err : {}) as {
        headers?: unknown;
        response?: { data?: unknown };
        status?: number;
        request?: { url?: string };
      };

      if (error.headers) {
        console.debug('[OpenAIProvider] err.headers:', error.headers);
      }
      if (error.response?.data) {
        console.debug('[OpenAIProvider] err.response.data:', JSON.stringify(error.response.data));
      }

      if (error.status === 403) {
        const maskedKey = apiKey.length > 8 ? apiKey.slice(0, 8) + '...' : '(short-key)';
        console.debug('[OpenAIProvider] 🔒 403 – Permission denied');
        console.debug('[OpenAIProvider] Request URL:', error.request?.url ?? baseURL);
        console.debug('[OpenAIProvider] NVIDIA key prefix:', maskedKey);
      }
      throw err;
    }

    if (input.stream) {
      if (!this.isAsyncIterable(completion)) {
        return this.unavailable('OpenAI stream mode is not available for this response');
      }
      return this.consumeStream(completion, input.onChunk);
    }

    const root = completion as Record<string, unknown>;
    return this.extractMessageResponse(root);
  }
}
