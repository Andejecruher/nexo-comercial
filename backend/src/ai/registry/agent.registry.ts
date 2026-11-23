import { ConversationChannel } from '@prisma/client';
import { PrismaService } from '../../services/prisma.service';
import { AIProviderName } from '../core/types';

export interface ResolvedLineAgent {
  lineId: string;
  externalIdentifier: string;
  agent: {
    id: string;
    name: string;
    provider: AIProviderName;
    model: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stream?: boolean;
    chatTemplateKwargs?: Record<string, unknown>;
  };
}

function readNumericMetadata(
  metadata: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function readBooleanMetadata(
  metadata: Record<string, unknown>,
  keys: string[],
): boolean | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
  }
  return undefined;
}

function readObjectMetadata(
  metadata: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

export class AgentRegistry {
  constructor(private readonly prisma: PrismaService) {}

  async resolveLineAgent(input: {
    channel: ConversationChannel;
    phoneNumber?: string;
    externalIdentifier?: string;
  }): Promise<ResolvedLineAgent | undefined> {
    const byPhone =
      !input.externalIdentifier && input.phoneNumber
        ? await this.prisma.communicationLine.findFirst({
            where: {
              channel: input.channel,
              phoneNumber: input.phoneNumber,
              isActive: true,
            },
          })
        : undefined;

    const byExternal =
      !byPhone && input.externalIdentifier
        ? await this.prisma.communicationLine.findFirst({
            where: {
              channel: input.channel,
              externalIdentifier: input.externalIdentifier,
              isActive: true,
            },
          })
        : undefined;

    const byDefault =
      !input.externalIdentifier && !byPhone && !byExternal
        ? await this.prisma.communicationLine.findFirst({
            where: {
              channel: input.channel,
              isDefault: true,
              isActive: true,
            },
          })
        : undefined;

    const line = byPhone ?? byExternal ?? byDefault;

    const resolvedAgentId = line?.agentId ?? line?.aiAgentId;

    if (!line || !line.aiEnabled || !resolvedAgentId) {
      return undefined;
    }

    const agent = await this.prisma.aiAgent.findFirst({
      where: {
        id: resolvedAgentId,
        isActive: true,
      },
    });

    if (!agent) {
      return undefined;
    }

    const metadata =
      agent.metadata && typeof agent.metadata === 'object' && !Array.isArray(agent.metadata)
        ? (agent.metadata as Record<string, unknown>)
        : {};

    return {
      lineId: line.id,
      externalIdentifier: line.externalIdentifier || line.phoneNumber || '',
      agent: {
        id: agent.id,
        name: agent.name,
        provider: agent.provider,
        model: agent.model,
        temperature: agent.temperature !== null ? Number(agent.temperature) : undefined,
        maxTokens: agent.maxTokens !== null ? agent.maxTokens : undefined,
        topP: readNumericMetadata(metadata, ['topP', 'top_p']),
        topK: readNumericMetadata(metadata, ['topK', 'top_k']),
        frequencyPenalty: readNumericMetadata(metadata, ['frequencyPenalty', 'frequency_penalty']),
        presencePenalty: readNumericMetadata(metadata, ['presencePenalty', 'presence_penalty']),
        stream: readBooleanMetadata(metadata, ['stream']),
        chatTemplateKwargs: readObjectMetadata(metadata, [
          'chatTemplateKwargs',
          'chat_template_kwargs',
        ]),
      },
    };
  }
}
