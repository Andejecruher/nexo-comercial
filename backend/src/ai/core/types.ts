import type { WaInboundMessage } from '../../types/whatsapp.types';

export type AIProviderName = 'openai' | 'anthropic';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface AIToolDefinition {
  id: string;
  name: string;
  description: string;
  kind: 'internal' | 'external';
  internalKey?: string;
  externalUrl?: string;
  externalMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  externalHeaders?: Record<string, string>;
  externalAuthEnvKey?: string;
  timeoutMs: number;
  allowlistDomains: string[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface AIToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AIStreamChunk {
  textDelta: string;
  accumulatedText: string;
  raw: Record<string, unknown>;
}

export interface AIResponse {
  text: string;
  toolCalls: AIToolCall[];
  raw: Record<string, unknown>;
  usage?: AIUsage;
  providerUnavailable?: boolean;
}

export interface AIProviderInput {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  chatTemplateKwargs?: Record<string, unknown>;
  stream?: boolean;
  abortSignal?: AbortSignal;
  onChunk?: (chunk: AIStreamChunk) => Promise<void> | void;
  messages: AIMessage[];
  tools: AIToolDefinition[];
}

export interface AIProvider {
  generate(input: AIProviderInput): Promise<AIResponse>;
}

export interface AIExecutionContext {
  conversationId: string;
  citizenId: string;
  phone: string;
  lineExternalIdentifier?: string;
  messageId: string;
  messageText: string;
  inboundMessages?: WaInboundMessage[];
  flowState: string;
  correlationId: string;
  excludeMessageIds?: string[];
  batchGeneration?: number;
  abortSignal?: AbortSignal;
}
