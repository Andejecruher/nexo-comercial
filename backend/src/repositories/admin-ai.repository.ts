/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaService } from '../services/prisma.service';
import type { Prisma } from '@prisma/client';
import { AppError } from '../utils/app-error';

export interface AgentTopicAssignment {
  topicId: string;
  promptId: string;
  priority: number;
  isDefault: boolean;
}

export class AdminAiRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAgents(args: unknown) {
    return (this.prisma.aiAgent as any).findMany(args) as Promise<any[]>;
  }

  findAgentById(id: string) {
    return this.prisma.aiAgent.findUnique({ where: { id } });
  }

  findAgentBySlug(slug: string) {
    return this.prisma.aiAgent.findUnique({ where: { slug } });
  }

  createAgent(data: Record<string, unknown>) {
    return (this.prisma.aiAgent as any).create({ data });
  }

  updateAgentById(id: string, data: Record<string, unknown>) {
    return (this.prisma.aiAgent as any).update({ where: { id }, data });
  }

  deactivateAgent(id: string) {
    return this.prisma.aiAgent.update({ where: { id }, data: { isActive: false } });
  }

  findLinesByAgentId(agentId: string) {
    return this.prisma.communicationLine.findMany({
      where: { OR: [{ agentId }, { agentId: null, aiAgentId: agentId }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAgentTopics(agentId: string) {
    return this.prisma.aiAgentTopic.findMany({
      where: { agentId, isActive: true },
      include: { topic: { include: { systemPrompt: true } }, prompt: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  replaceAgentTopics(agentId: string, assignments: AgentTopicAssignment[]) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Serialize complete replacements per agent so concurrent saves cannot leave two defaults.
      const agents = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM ai_agents WHERE id = ${agentId}::uuid FOR UPDATE`;
      if (agents.length === 0) {
        throw AppError.notFound('Agente no encontrado');
      }
      // Validate the complete configuration before changing any runtime links.
      for (const assignment of assignments) {
        const topic = await tx.aiTopic.findUnique({ where: { id: assignment.topicId } });
        const prompt = await tx.aiPrompt.findUnique({ where: { id: assignment.promptId } });
        if (!topic?.isActive) throw AppError.badRequest('El tópico no existe o está inactivo');
        if (!prompt?.isActive) throw AppError.badRequest('El prompt no existe o está inactivo');
        if (prompt.topicId && prompt.topicId !== topic.id) {
          throw AppError.badRequest('El prompt pertenece a otro tópico');
        }
        if (prompt.type === 'tool') {
          throw AppError.badRequest('Selecciona un prompt de conversación, no de herramienta');
        }
      }
      await tx.aiAgentTopic.updateMany({
        where: { agentId, topicId: { notIn: assignments.map((item) => item.topicId) } },
        data: { isActive: false, isDefault: false },
      });
      for (const assignment of assignments) {
        await tx.aiAgentTopic.upsert({
          where: { agentId_topicId: { agentId, topicId: assignment.topicId } },
          create: { agentId, ...assignment, isActive: true },
          update: { ...assignment, isActive: true },
        });
      }
      return tx.aiAgentTopic.findMany({
        where: { agentId, isActive: true },
        include: { topic: { include: { systemPrompt: true } }, prompt: true },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      });
    });
  }

  findActiveTopicsWithToolsAndPrompt() {
    return this.prisma.aiTopic.findMany({
      where: { isActive: true },
      include: {
        tools: {
          include: { tool: true },
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        systemPrompt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  findActiveTools() {
    return this.prisma.aiTool.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  findActivePromptsWithTopic() {
    return this.prisma.aiPrompt.findMany({
      where: { isActive: true },
      include: { topic: { select: { id: true, name: true, slug: true } } },
      orderBy: [{ topicId: 'asc' }, { version: 'desc' }],
    });
  }

  findTools(args: unknown) {
    return (this.prisma.aiTool as any).findMany(args) as Promise<any[]>;
  }

  findToolById(id: string) {
    return this.prisma.aiTool.findUnique({ where: { id } });
  }

  findToolByName(name: string) {
    return this.prisma.aiTool.findUnique({ where: { name } });
  }

  createTool(data: Record<string, unknown>) {
    return (this.prisma.aiTool as any).create({ data });
  }

  updateToolById(id: string, data: Record<string, unknown>) {
    return (this.prisma.aiTool as any).update({ where: { id }, data });
  }

  deactivateTool(id: string) {
    return this.prisma.aiTool.update({ where: { id }, data: { isActive: false } });
  }

  findTopics(args: unknown) {
    return (this.prisma.aiTopic as any).findMany(args) as Promise<any[]>;
  }

  findTopicByIdWithIncludes(id: string) {
    return this.prisma.aiTopic.findUnique({
      where: { id },
      include: {
        tools: {
          include: { tool: true },
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        systemPrompt: true,
      },
    });
  }

  findTopicById(id: string) {
    return this.prisma.aiTopic.findUnique({ where: { id } });
  }

  findTopicBySlug(slug: string) {
    return this.prisma.aiTopic.findUnique({ where: { slug } });
  }

  createTopic(data: Record<string, unknown>) {
    return (this.prisma.aiTopic as any).create({
      data,
      include: {
        tools: {
          include: { tool: true },
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        systemPrompt: true,
      },
    });
  }

  updateTopicById(id: string, data: Record<string, unknown>) {
    return (this.prisma.aiTopic as any).update({
      where: { id },
      data,
      include: {
        tools: {
          include: { tool: true },
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        systemPrompt: true,
      },
    });
  }

  deactivateTopic(id: string) {
    return this.prisma.aiTopic.update({ where: { id }, data: { isActive: false } });
  }

  clearTopicTools(topicId: string) {
    return this.prisma.aiTopicTool.deleteMany({ where: { topicId } });
  }

  addTopicTools(topicId: string, toolIds: string[]) {
    if (toolIds.length === 0) {
      return Promise.resolve({ count: 0 });
    }
    return this.prisma.aiTopicTool.createMany({
      data: toolIds.map((toolId, idx) => ({
        topicId,
        toolId,
        sortOrder: (idx + 1) * 10,
      })),
    });
  }

  findPrompts(args: unknown) {
    return (this.prisma.aiPrompt as any).findMany(args) as Promise<any[]>;
  }

  findPromptByIdWithTopic(id: string) {
    return this.prisma.aiPrompt.findUnique({
      where: { id },
      include: { topic: { select: { id: true, name: true, slug: true } } },
    });
  }

  findPromptById(id: string) {
    return this.prisma.aiPrompt.findUnique({ where: { id } });
  }

  findMaxPromptVersion(topicId: string | null) {
    return this.prisma.aiPrompt.findFirst({
      where: { topicId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
  }

  createPrompt(data: Record<string, unknown>) {
    return (this.prisma.aiPrompt as any).create({
      data,
      include: { topic: { select: { id: true, name: true, slug: true } } },
    });
  }

  updatePromptById(id: string, data: Record<string, unknown>) {
    return (this.prisma.aiPrompt as any).update({
      where: { id },
      data,
      include: { topic: { select: { id: true, name: true, slug: true } } },
    });
  }

  deactivatePrompt(id: string) {
    return this.prisma.aiPrompt.update({ where: { id }, data: { isActive: false } });
  }

  deactivateOtherActivePrompts(params: { topicId: string; type: string; excludeId: string }) {
    return this.prisma.aiPrompt.updateMany({
      where: {
        topicId: params.topicId,
        type: params.type as any,
        isActive: true,
        id: { not: params.excludeId },
      },
      data: { isActive: false },
    });
  }

  activatePromptById(id: string) {
    return this.prisma.aiPrompt.update({
      where: { id },
      data: { isActive: true },
      include: { topic: { select: { id: true, name: true, slug: true } } },
    });
  }

  findLines(args: unknown) {
    return (this.prisma.communicationLine as any).findMany(args) as Promise<any[]>;
  }

  findLineByIdWithAgent(id: string) {
    return this.prisma.communicationLine.findUnique({
      where: { id },
      include: { agent: true },
    });
  }

  findLineById(id: string) {
    return this.prisma.communicationLine.findUnique({ where: { id } });
  }

  findLineByChannelAndExternalIdentifier(channel: string, externalIdentifier: string) {
    return this.prisma.communicationLine.findFirst({
      where: { channel: channel as any, externalIdentifier },
    });
  }

  findLineConflictByChannelAndExternalIdentifier(params: {
    channel: string;
    externalIdentifier: string;
    excludeId: string;
  }) {
    return this.prisma.communicationLine.findFirst({
      where: {
        channel: params.channel as any,
        externalIdentifier: params.externalIdentifier,
        id: { not: params.excludeId },
      },
    });
  }

  createLine(data: Record<string, unknown>) {
    return (this.prisma.communicationLine as any).create({
      data,
      include: { agent: true },
    });
  }

  updateLineById(id: string, data: Record<string, unknown>) {
    return (this.prisma.communicationLine as any).update({
      where: { id },
      data,
      include: { agent: true },
    });
  }
}
