/**
 * AI Admin API Client — Nexo Comercial
 *
 * Wrapper sobre apiClient para endpoints de gestión de IA:
 * Agents, Tools, Topics, Prompts, CommunicationLines
 */

import type { ApiResponse } from '@/lib/api-client';
import { apiClient } from '@/lib/api-client';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type AIProvider = 'openai' | 'anthropic';
export type AIToolKind = 'internal' | 'external';
export type AIToolHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type AIPromptType = 'topic' | 'system' | 'fallback' | 'tool';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiAgent {
  id: string;
  slug: string;
  name: string;
  description?: string;
  provider: AIProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  isActive: boolean;
  metadata: Record<string, unknown>;
  topics?: AiAgentTopic[];
  createdAt: string;
  updatedAt: string;
}

export interface AiTool {
  id: string;
  name: string;
  description: string;
  kind: AIToolKind;
  internalKey?: string;
  externalUrl?: string;
  externalMethod?: AIToolHttpMethod;
  externalHeaders?: Record<string, string>;
  externalAuthEnvKey?: string;
  timeoutMs: number;
  allowlistDomains: string[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiTopic {
  id: string;
  slug: string;
  name: string;
  description?: string;
  systemPromptId?: string;
  matcherKeywords: string[];
  isActive: boolean;
  tools?: AiTool[];
  systemPrompt?: AiPrompt;
  createdAt: string;
  updatedAt: string;
}

export interface AiPrompt {
  id: string;
  topicId?: string;
  name: string;
  type: AIPromptType;
  version: number;
  content: string;
  isActive: boolean;
  metadata: Record<string, unknown>;
  topic?: { id: string; name: string; slug: string };
  createdAt: string;
  updatedAt: string;
}

export interface AgentTopicAssignment {
  topicId: string;
  promptId: string;
  priority: number;
  isDefault: boolean;
}

export interface AiAgentTopic extends AgentTopicAssignment {
  id: string;
  isActive: boolean;
  topic: AiTopic;
  prompt: AiPrompt;
}

export interface CommunicationLine {
  id: string;
  channel: string;
  externalIdentifier: string;
  phoneNumber?: string;
  provider?: string;
  displayName: string;
  isActive: boolean;
  isDefault: boolean;
  aiEnabled: boolean;
  agentId?: string | null;
  whatsappPhoneNumberId?: string;
  whatsappBusinessAccountId?: string;
  whatsappAppId?: string;
  metadata: Record<string, unknown>;
  agent?: AiAgent;
  departments?: { id: string; name: string; slug: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  nextCursor?: string;
  hasNextPage: boolean;
  count: number;
}

// ─── Query Params ─────────────────────────────────────────────────────────────

export interface AiListParams {
  search?: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
  [key: string]: string | number | boolean | undefined;
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CreateAgentPayload {
  slug: string;
  name: string;
  description?: string;
  provider: AIProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export type UpdateAgentPayload = Partial<CreateAgentPayload>;

export interface CreateToolPayload {
  name: string;
  description: string;
  kind: AIToolKind;
  internalKey?: string;
  externalUrl?: string;
  externalMethod?: AIToolHttpMethod;
  externalHeaders?: Record<string, string>;
  externalAuthEnvKey?: string;
  timeoutMs?: number;
  allowlistDomains?: string[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  isActive?: boolean;
}

export type UpdateToolPayload = Partial<CreateToolPayload>;

export interface CreateTopicPayload {
  slug: string;
  name: string;
  description?: string;
  systemPromptId?: string;
  matcherKeywords?: string[];
  isActive?: boolean;
  toolIds?: string[];
}

export type UpdateTopicPayload = Partial<CreateTopicPayload>;

export interface CreatePromptPayload {
  topicId?: string;
  name: string;
  type: AIPromptType;
  content: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export type UpdatePromptPayload = Partial<CreatePromptPayload>;

export interface UpdateLinePayload {
  displayName?: string;
  phoneNumber?: string;
  provider?: string;
  externalIdentifier?: string;
  businessAccountId?: string;
  whatsappPhoneNumberId?: string;
  whatsappBusinessAccountId?: string;
  whatsappAppId?: string;
  whatsappAppSecret?: string;
  whatsappAccessToken?: string;
  verifyToken?: string;
  webhookSecret?: string;
  isActive?: boolean;
  isDefault?: boolean;
  aiEnabled?: boolean;
  agentId?: string | null;
  departmentIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateLinePayload {
  displayName: string;
  phoneNumber?: string;
  channel?: string;
  provider?: string;
  whatsappPhoneNumberId?: string;
  whatsappBusinessAccountId?: string;
  whatsappAppId?: string;
  whatsappAppSecret?: string;
  whatsappAccessToken?: string;
  isActive?: boolean;
  isDefault?: boolean;
  aiEnabled?: boolean;
  agentId?: string;
  departmentIds?: string[];
  metadata?: Record<string, unknown>;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

interface AgentsListResponse {
  agents: AiAgent[];
  meta: PaginationMeta;
}

interface AgentResponse {
  agent: AiAgent;
}

interface ToolsListResponse {
  tools: AiTool[];
  meta: PaginationMeta;
}

interface ToolResponse {
  tool: AiTool;
}

interface TopicsListResponse {
  topics: AiTopic[];
  meta: PaginationMeta;
}

interface TopicResponse {
  topic: AiTopic;
}

interface PromptsListResponse {
  prompts: AiPrompt[];
  meta: PaginationMeta;
}

interface PromptResponse {
  prompt: AiPrompt;
}

interface LinesListResponse {
  lines: CommunicationLine[];
  meta: PaginationMeta;
}

interface LineResponse {
  line: CommunicationLine;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      q.set(k, String(v));
    }
  }
  const str = q.toString();
  return str ? `?${str}` : '';
}

// ─── Agents API ───────────────────────────────────────────────────────────────

export const agentsApi = {
  assignTopics: (
    id: string,
    assignments: AgentTopicAssignment[],
  ): Promise<ApiResponse<{ topicAssignments: AiAgentTopic[] }>> =>
    apiClient.put(`/admin/ai/agents/${id}/topics`, { assignments }),
  list: (params?: AiListParams): Promise<ApiResponse<AgentsListResponse>> =>
    apiClient.get(`/admin/ai/agents${buildQuery(params ?? {})}`),

  get: (id: string): Promise<ApiResponse<AgentResponse>> => apiClient.get(`/admin/ai/agents/${id}`),

  create: (payload: CreateAgentPayload): Promise<ApiResponse<AgentResponse>> =>
    apiClient.post('/admin/ai/agents', payload),

  update: (id: string, payload: UpdateAgentPayload): Promise<ApiResponse<AgentResponse>> =>
    apiClient.patch(`/admin/ai/agents/${id}`, payload),

  toggle: (id: string, isActive: boolean): Promise<ApiResponse<AgentResponse>> =>
    apiClient.patch(`/admin/ai/agents/${id}`, { isActive }),

  delete: (id: string): Promise<ApiResponse<{ message: string }>> =>
    apiClient.delete(`/admin/ai/agents/${id}`),
};

// ─── Tools API ────────────────────────────────────────────────────────────────

export const toolsApi = {
  list: (params?: AiListParams): Promise<ApiResponse<ToolsListResponse>> =>
    apiClient.get(`/admin/ai/tools${buildQuery(params ?? {})}`),

  get: (id: string): Promise<ApiResponse<ToolResponse>> => apiClient.get(`/admin/ai/tools/${id}`),

  create: (payload: CreateToolPayload): Promise<ApiResponse<ToolResponse>> =>
    apiClient.post('/admin/ai/tools', payload),

  update: (id: string, payload: UpdateToolPayload): Promise<ApiResponse<ToolResponse>> =>
    apiClient.patch(`/admin/ai/tools/${id}`, payload),

  toggle: (id: string, isActive: boolean): Promise<ApiResponse<ToolResponse>> =>
    apiClient.patch(`/admin/ai/tools/${id}`, { isActive }),

  delete: (id: string): Promise<ApiResponse<{ message: string }>> =>
    apiClient.delete(`/admin/ai/tools/${id}`),
};

// ─── Topics API ───────────────────────────────────────────────────────────────

export const topicsApi = {
  list: (params?: AiListParams): Promise<ApiResponse<TopicsListResponse>> =>
    apiClient.get(`/admin/ai/topics${buildQuery(params ?? {})}`),

  get: (id: string): Promise<ApiResponse<TopicResponse>> => apiClient.get(`/admin/ai/topics/${id}`),

  create: (payload: CreateTopicPayload): Promise<ApiResponse<TopicResponse>> =>
    apiClient.post('/admin/ai/topics', payload),

  update: (id: string, payload: UpdateTopicPayload): Promise<ApiResponse<TopicResponse>> =>
    apiClient.patch(`/admin/ai/topics/${id}`, payload),

  toggle: (id: string, isActive: boolean): Promise<ApiResponse<TopicResponse>> =>
    apiClient.patch(`/admin/ai/topics/${id}`, { isActive }),

  delete: (id: string): Promise<ApiResponse<{ message: string }>> =>
    apiClient.delete(`/admin/ai/topics/${id}`),

  assignTools: (topicId: string, toolIds: string[]): Promise<ApiResponse<TopicResponse>> =>
    apiClient.post(`/admin/ai/topics/${topicId}/tools`, { toolIds }),
};

// ─── Prompts API ──────────────────────────────────────────────────────────────

export const promptsApi = {
  list: (params?: AiListParams & { topicId?: string }): Promise<ApiResponse<PromptsListResponse>> =>
    apiClient.get(`/admin/ai/prompts${buildQuery(params ?? {})}`),

  get: (id: string): Promise<ApiResponse<PromptResponse>> =>
    apiClient.get(`/admin/ai/prompts/${id}`),

  create: (payload: CreatePromptPayload): Promise<ApiResponse<PromptResponse>> =>
    apiClient.post('/admin/ai/prompts', payload),

  update: (id: string, payload: UpdatePromptPayload): Promise<ApiResponse<PromptResponse>> =>
    apiClient.patch(`/admin/ai/prompts/${id}`, payload),

  toggle: (id: string, isActive: boolean): Promise<ApiResponse<PromptResponse>> =>
    apiClient.patch(`/admin/ai/prompts/${id}`, { isActive }),

  delete: (id: string): Promise<ApiResponse<{ message: string }>> =>
    apiClient.delete(`/admin/ai/prompts/${id}`),
};

// ─── Lines API ────────────────────────────────────────────────────────────────

export const linesApi = {
  list: (params?: AiListParams): Promise<ApiResponse<LinesListResponse>> =>
    apiClient.get(`/admin/ai/lines${buildQuery(params ?? {})}`),

  get: (id: string): Promise<ApiResponse<LineResponse>> => apiClient.get(`/admin/ai/lines/${id}`),

  create: (payload: CreateLinePayload): Promise<ApiResponse<LineResponse>> =>
    apiClient.post('/admin/ai/lines', payload),

  update: (id: string, payload: UpdateLinePayload): Promise<ApiResponse<LineResponse>> =>
    apiClient.patch(`/admin/ai/lines/${id}`, payload),
};

// ─── Agent Detail API ─────────────────────────────────────────────────────────

export interface AgentDetailResponse {
  agent: AiAgent;
  lines: CommunicationLine[];
  topics: AiTopic[];
  tools: AiTool[];
  prompts: AiPrompt[];
  topicAssignments: AiAgentTopic[];
}

export const agentDetailApi = {
  get: (id: string): Promise<ApiResponse<AgentDetailResponse>> =>
    apiClient.get(`/admin/ai/agents/${id}/detail`),
};

// ─── Phone Lines alias ────────────────────────────────────────────────────────
export const phoneLinesApi = linesApi;
