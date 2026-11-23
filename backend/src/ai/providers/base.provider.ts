import * as crypto from 'crypto';

import { AIProvider, AIProviderInput, AIResponse, AIToolCall, AIUsage } from '../core/types';

export abstract class BaseProvider implements AIProvider {
  abstract generate(input: AIProviderInput): Promise<AIResponse>;

  protected toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  protected normalizeUsage(value: unknown): AIUsage | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const rec = value as Record<string, unknown>;
    const usage: AIUsage = {
      inputTokens: this.toNumber(rec.prompt_tokens ?? rec.input_tokens),
      outputTokens: this.toNumber(rec.completion_tokens ?? rec.output_tokens),
      totalTokens: this.toNumber(rec.total_tokens),
    };

    if (
      usage.inputTokens === undefined &&
      usage.outputTokens === undefined &&
      usage.totalTokens === undefined
    ) {
      return undefined;
    }

    return usage;
  }

  protected isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
    return (
      !!value &&
      typeof value === 'object' &&
      Symbol.asyncIterator in value &&
      typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
    );
  }

  protected toText(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => this.toText(item))
        .join('\n')
        .trim();
    }
    if (value && typeof value === 'object') {
      const rec = value as Record<string, unknown>;
      if (typeof rec.text === 'string') {
        return rec.text;
      }
      if (typeof rec.content === 'string') {
        return rec.content;
      }
    }
    return '';
  }

  protected parseToolInput(input: unknown): Record<string, unknown> {
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return {};
      }
      return {};
    }

    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return input as Record<string, unknown>;
    }

    return {};
  }

  protected normalizeToolCalls(value: unknown): AIToolCall[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const result: AIToolCall[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const id = typeof rec.id === 'string' ? rec.id : crypto.randomUUID();

      const fn =
        rec.function && typeof rec.function === 'object'
          ? (rec.function as Record<string, unknown>)
          : {};

      const name =
        typeof fn.name === 'string' ? fn.name : typeof rec.name === 'string' ? rec.name : '';

      if (!name) continue;

      const argumentsValue = fn.arguments ?? rec.input ?? rec.arguments;
      result.push({
        id,
        name,
        input: this.parseToolInput(argumentsValue),
      });
    }

    return result;
  }

  protected unavailable(reason: string): AIResponse {
    return {
      text: '',
      toolCalls: [],
      raw: { reason },
      providerUnavailable: true,
    };
  }
}
