/**
 * Controlador de administración de IA.
 *
 * Gestiona: AiAgent, AiTool, AiTopic, AiPrompt, CommunicationLine
 * Base: /api/v1/admin/ai/*
 * Acceso: SUPERADMIN o ADMIN
 */
import { Prisma } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AI_AGENT_METADATA_GUIDE, validateAiAgentMetadata } from '../ai/config/agent-metadata';
import { AdminAiRepository } from '../repositories/admin-ai.repository';
import type { PrismaService } from '../services/prisma.service';
import { AppError } from '../utils/app-error';
import { encrypt } from '../utils/crypto';

// ── Schemas de validación ─────────────────────────────────────────────────────

const ListQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  topicId: z.string().uuid().optional(),
});

const CreateAgentSchema = z.object({
  slug: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  provider: z.enum(['openai', 'anthropic']),
  model: z.string().min(1).max(255),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const UpdateAgentSchema = CreateAgentSchema.partial();

const AssignAgentTopicsSchema = z
  .object({
    assignments: z
      .array(
        z.object({
          topicId: z.string().uuid(),
          promptId: z.string().uuid(),
          priority: z.number().int().min(0).max(2147483647).default(100),
          isDefault: z.boolean().default(false),
        }),
      )
      .max(100),
  })
  .superRefine(({ assignments }, ctx) => {
    if (new Set(assignments.map((item) => item.topicId)).size !== assignments.length) {
      ctx.addIssue({ code: 'custom', path: ['assignments'], message: 'No repitas un tópico' });
    }
    if (assignments.length > 0 && assignments.filter((item) => item.isDefault).length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['assignments'],
        message: 'Selecciona un único tópico predeterminado',
      });
    }
  });

const CreateToolSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().min(1),
    kind: z.enum(['internal', 'external']),
    internalKey: z.string().max(120).optional(),
    externalUrl: z.string().url().optional(),
    externalMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
    externalHeaders: z.record(z.string(), z.string()).optional(),
    externalAuthEnvKey: z.string().max(120).optional(),
    timeoutMs: z.number().int().min(100).default(8000),
    allowlistDomains: z.array(z.string()).default([]),
    inputSchema: z.record(z.string(), z.unknown()).optional(),
    outputSchema: z.record(z.string(), z.unknown()).optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'external' && !data.externalUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['externalUrl'],
        message: 'externalUrl es requerido para tools de tipo external',
      });
    }
  });

const UpdateToolSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().min(1).optional(),
  kind: z.enum(['internal', 'external']).optional(),
  internalKey: z.string().max(120).optional(),
  externalUrl: z.string().url().optional(),
  externalMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  externalHeaders: z.record(z.string(), z.string()).optional(),
  externalAuthEnvKey: z.string().max(120).optional(),
  timeoutMs: z.number().int().min(100).optional(),
  allowlistDomains: z.array(z.string()).optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const CreateTopicSchema = z.object({
  slug: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  systemPromptId: z.string().uuid().optional(),
  matcherKeywords: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  toolIds: z.array(z.string().uuid()).optional(),
});

const UpdateTopicSchema = CreateTopicSchema.partial();

const AssignTopicToolsSchema = z.object({
  toolIds: z.array(z.string().uuid()),
});

const CreatePromptSchema = z.object({
  topicId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  type: z.enum(['topic', 'system', 'fallback', 'tool']),
  content: z.string().min(1),
  isActive: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const UpdatePromptSchema = CreatePromptSchema.partial();

const CreateLineSchema = z
  .object({
    displayName: z.string().min(1).max(255),
    phoneNumber: z.string().min(1).max(30).optional(),
    channel: z.enum(['whatsapp', 'web_chat', 'email']).default('whatsapp'),
    provider: z.enum(['meta', 'twilio']).default('meta'),
    whatsappPhoneNumberId: z.string().max(100).optional(),
    whatsappBusinessAccountId: z.string().max(100).optional(),
    whatsappAppId: z.string().max(100).optional(),
    whatsappAppSecret: z.string().max(1024).optional(),
    whatsappAccessToken: z.string().max(4096).optional(),
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    aiEnabled: z.boolean().default(false),
    agentId: z.string().uuid().optional(),
    departmentIds: z.array(z.string().uuid()).default([]),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((data, ctx) => {
    if (data.aiEnabled && !data.agentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['agentId'],
        message: 'agentId es requerido cuando aiEnabled es true',
      });
    }
    if (data.channel === 'whatsapp') {
      if (!data.whatsappPhoneNumberId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['whatsappPhoneNumberId'],
          message: 'whatsappPhoneNumberId es requerido para WhatsApp',
        });
      }
      if (!data.whatsappAccessToken?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['whatsappAccessToken'],
          message: 'whatsappAccessToken es requerido para WhatsApp',
        });
      }
      if (!data.whatsappAppSecret?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['whatsappAppSecret'],
          message: 'whatsappAppSecret es requerido para WhatsApp',
        });
      }
    }
  });

const UpdateLineSchema = z
  .object({
    displayName: z.string().min(1).max(255).optional(),
    phoneNumber: z.string().min(1).max(30).optional(),
    provider: z.string().max(100).optional(),
    externalIdentifier: z.string().min(1).max(255).optional(),
    businessAccountId: z.string().max(100).optional(),
    whatsappBusinessAccountId: z.string().max(100).optional(),
    whatsappAppId: z.string().max(100).optional(),
    whatsappPhoneNumberId: z.string().max(100).optional(),
    whatsappAccessToken: z.string().max(4096).optional(),
    whatsappAppSecret: z.string().max(1024).optional(),
    verifyToken: z.string().max(500).optional(),
    webhookSecret: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    aiEnabled: z.boolean().optional(),
    agentId: z.string().uuid().nullable().optional(),
    departmentIds: z.array(z.string().uuid()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.aiEnabled === true && data.agentId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['agentId'],
        message: 'agentId es requerido cuando aiEnabled es true',
      });
    }
  });

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCursorMeta(
  items: { id: string }[],
  limit: number,
): { nextCursor: string | undefined; hasNextPage: boolean; count: number } {
  const hasNextPage = items.length > limit;
  const slice = hasNextPage ? items.slice(0, limit) : items;
  return {
    nextCursor: hasNextPage ? slice[slice.length - 1]?.id : undefined,
    hasNextPage,
    count: slice.length,
  };
}

// ── Controlador ───────────────────────────────────────────────────────────────

export class AdminAiController {
  private readonly repository: AdminAiRepository;

  constructor(prisma: PrismaService) {
    this.repository = new AdminAiRepository(prisma);
  }

  // ── Agents ────────────────────────────────────────────────────────────────

  listAgents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ListQuerySchema.parse(req.query);
      const { search, isActive, cursor, limit } = query;

      const agents = await this.repository.findAgents({
        where: {
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }),
          ...(isActive !== undefined && { isActive }),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          topics: {
            where: { isActive: true },
            include: { topic: { include: { systemPrompt: true } }, prompt: true },
          },
        },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      const meta = buildCursorMeta(agents, limit);
      const slice = agents.slice(0, limit);

      res.json({ agents: slice, meta });
    } catch (err) {
      next(err);
    }
  };

  getAgent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const agent = await this.repository.findAgentById(id);
      if (!agent) throw AppError.notFound('Agente no encontrado');
      res.json({ agent });
    } catch (err) {
      next(err);
    }
  };

  getAgentDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const agent = await this.repository.findAgentById(id);
      if (!agent) throw AppError.notFound('Agente no encontrado');

      // Phone lines assigned to this agent
      const lines = await this.repository.findLinesByAgentId(id);

      // Candidates and runtime assignments are separate: metadata is not used by TopicRegistry.
      const topics = await this.repository.findActiveTopicsWithToolsAndPrompt();
      const topicAssignments = await this.repository.findAgentTopics(id);

      // All active tools
      const tools = await this.repository.findActiveTools();

      // Prompts associated via topics or system-level
      const prompts = await this.repository.findActivePromptsWithTopic();

      res.json({
        agent,
        lines,
        topics: topics.map(mapTopic),
        tools,
        prompts,
        topicAssignments,
        metadataGuide: AI_AGENT_METADATA_GUIDE,
      });
    } catch (err) {
      next(err);
    }
  };

  assignAgentTopics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedId = z.string().uuid().safeParse(req.params.id);
      const parsed = AssignAgentTopicsSchema.safeParse(req.body);
      if (!parsedId.success) throw AppError.badRequest('El identificador de agente no es válido');
      if (!parsed.success)
        throw AppError.badRequest(parsed.error.issues.map((issue) => issue.message).join('; '));
      const id = parsedId.data;
      const { assignments } = parsed.data;
      const topicAssignments = await this.repository.replaceAgentTopics(id, assignments);
      res.json({ topicAssignments });
    } catch (err) {
      next(err);
    }
  };

  createAgent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = CreateAgentSchema.parse(req.body);
      const metadataErrors = validateAiAgentMetadata(data.metadata);
      if (metadataErrors.length > 0) {
        throw AppError.badRequest(`metadata invalida: ${metadataErrors.join('; ')}`);
      }

      const existing = await this.repository.findAgentBySlug(data.slug);
      if (existing) throw AppError.conflict(`Slug '${data.slug}' ya está en uso`);

      const agent = await this.repository.createAgent({
        slug: data.slug,
        name: data.name,
        description: data.description,
        provider: data.provider,
        model: data.model,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        isActive: data.isActive,
        metadata: data.metadata as Prisma.InputJsonValue,
      });

      res.status(201).json({ agent });
    } catch (err) {
      next(err);
    }
  };

  updateAgent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const data = UpdateAgentSchema.parse(req.body);

      if (data.metadata !== undefined) {
        const metadataErrors = validateAiAgentMetadata(data.metadata);
        if (metadataErrors.length > 0) {
          throw AppError.badRequest(`metadata invalida: ${metadataErrors.join('; ')}`);
        }
      }

      const existing = await this.repository.findAgentById(id);
      if (!existing) throw AppError.notFound('Agente no encontrado');

      if (data.slug && data.slug !== existing.slug) {
        const slugConflict = await this.repository.findAgentBySlug(data.slug);
        if (slugConflict) throw AppError.conflict(`Slug '${data.slug}' ya está en uso`);
      }

      const agent = await this.repository.updateAgentById(id, {
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.provider !== undefined && { provider: data.provider }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.temperature !== undefined && { temperature: data.temperature }),
        ...(data.maxTokens !== undefined && { maxTokens: data.maxTokens }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.metadata !== undefined && { metadata: data.metadata as Prisma.InputJsonValue }),
      });

      res.json({ agent });
    } catch (err) {
      next(err);
    }
  };

  deleteAgent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const existing = await this.repository.findAgentById(id);
      if (!existing) throw AppError.notFound('Agente no encontrado');

      // Soft delete: desactivar en lugar de eliminar
      await this.repository.deactivateAgent(id);

      res.json({ message: 'Agente desactivado correctamente' });
    } catch (err) {
      next(err);
    }
  };

  // ── Tools ─────────────────────────────────────────────────────────────────

  listTools = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ListQuerySchema.parse(req.query);
      const { search, isActive, cursor, limit } = query;

      const tools = await this.repository.findTools({
        where: {
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }),
          ...(isActive !== undefined && { isActive }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      const meta = buildCursorMeta(tools, limit);
      const slice = tools.slice(0, limit);

      res.json({ tools: slice, meta });
    } catch (err) {
      next(err);
    }
  };

  getTool = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tool = await this.repository.findToolById(id);
      if (!tool) throw AppError.notFound('Tool no encontrada');
      res.json({ tool });
    } catch (err) {
      next(err);
    }
  };

  createTool = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = CreateToolSchema.parse(req.body);

      const existing = await this.repository.findToolByName(data.name);
      if (existing) throw AppError.conflict(`Una tool con nombre '${data.name}' ya existe`);

      const tool = await this.repository.createTool({
        name: data.name,
        description: data.description,
        kind: data.kind,
        type: data.kind, // campo duplicado en schema por legacy
        internalKey: data.internalKey,
        externalUrl: data.externalUrl,
        externalMethod: data.externalMethod,
        externalHeaders: data.externalHeaders
          ? (data.externalHeaders as Prisma.InputJsonValue)
          : Prisma.DbNull,
        externalAuthEnvKey: data.externalAuthEnvKey,
        timeoutMs: data.timeoutMs,
        allowlistDomains: data.allowlistDomains,
        inputSchema: data.inputSchema ? (data.inputSchema as Prisma.InputJsonValue) : Prisma.DbNull,
        outputSchema: data.outputSchema
          ? (data.outputSchema as Prisma.InputJsonValue)
          : Prisma.DbNull,
        isActive: data.isActive,
      });

      res.status(201).json({ tool });
    } catch (err) {
      next(err);
    }
  };

  updateTool = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const data = UpdateToolSchema.parse(req.body);

      const existing = await this.repository.findToolById(id);
      if (!existing) throw AppError.notFound('Tool no encontrada');

      if (data.name && data.name !== existing.name) {
        const nameConflict = await this.repository.findToolByName(data.name);
        if (nameConflict) throw AppError.conflict(`Una tool con nombre '${data.name}' ya existe`);
      }

      const tool = await this.repository.updateToolById(id, {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.kind !== undefined && { kind: data.kind, type: data.kind }),
        ...(data.internalKey !== undefined && { internalKey: data.internalKey }),
        ...(data.externalUrl !== undefined && { externalUrl: data.externalUrl }),
        ...(data.externalMethod !== undefined && { externalMethod: data.externalMethod }),
        ...(data.externalHeaders !== undefined && {
          externalHeaders: data.externalHeaders as Prisma.InputJsonValue,
        }),
        ...(data.externalAuthEnvKey !== undefined && {
          externalAuthEnvKey: data.externalAuthEnvKey,
        }),
        ...(data.timeoutMs !== undefined && { timeoutMs: data.timeoutMs }),
        ...(data.allowlistDomains !== undefined && { allowlistDomains: data.allowlistDomains }),
        ...(data.inputSchema !== undefined && {
          inputSchema: data.inputSchema as Prisma.InputJsonValue,
        }),
        ...(data.outputSchema !== undefined && {
          outputSchema: data.outputSchema as Prisma.InputJsonValue,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      });

      res.json({ tool });
    } catch (err) {
      next(err);
    }
  };

  deleteTool = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const existing = await this.repository.findToolById(id);
      if (!existing) throw AppError.notFound('Tool no encontrada');

      await this.repository.deactivateTool(id);

      res.json({ message: 'Tool desactivada correctamente' });
    } catch (err) {
      next(err);
    }
  };

  // ── Topics ────────────────────────────────────────────────────────────────

  listTopics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ListQuerySchema.parse(req.query);
      const { search, isActive, cursor, limit } = query;

      const topics = await this.repository.findTopics({
        where: {
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }),
          ...(isActive !== undefined && { isActive }),
        },
        include: {
          tools: {
            include: { tool: true },
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          systemPrompt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      const meta = buildCursorMeta(topics, limit);
      const slice = topics.slice(0, limit).map(mapTopic);

      res.json({ topics: slice, meta });
    } catch (err) {
      next(err);
    }
  };

  getTopic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const topic = await this.repository.findTopicByIdWithIncludes(id);
      if (!topic) throw AppError.notFound('Topic no encontrado');
      res.json({ topic: mapTopic(topic) });
    } catch (err) {
      next(err);
    }
  };

  createTopic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = CreateTopicSchema.parse(req.body);

      const existing = await this.repository.findTopicBySlug(data.slug);
      if (existing) throw AppError.conflict(`Slug '${data.slug}' ya está en uso`);

      if (data.systemPromptId) {
        const prompt = await this.repository.findPromptById(data.systemPromptId);
        if (!prompt) throw AppError.badRequest('systemPromptId no existe');
      }

      const topic = await this.repository.createTopic({
        slug: data.slug,
        name: data.name,
        description: data.description,
        systemPromptId: data.systemPromptId,
        matcherKeywords: data.matcherKeywords,
        isActive: data.isActive,
        ...(data.toolIds &&
          data.toolIds.length > 0 && {
            tools: {
              create: data.toolIds.map((toolId, idx) => ({
                toolId,
                sortOrder: (idx + 1) * 10,
              })),
            },
          }),
      });

      res.status(201).json({ topic: mapTopic(topic) });
    } catch (err) {
      next(err);
    }
  };

  updateTopic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const data = UpdateTopicSchema.parse(req.body);

      const existing = await this.repository.findTopicById(id);
      if (!existing) throw AppError.notFound('Topic no encontrado');

      if (data.slug && data.slug !== existing.slug) {
        const slugConflict = await this.repository.findTopicBySlug(data.slug);
        if (slugConflict) throw AppError.conflict(`Slug '${data.slug}' ya está en uso`);
      }

      if (data.systemPromptId) {
        const prompt = await this.repository.findPromptById(data.systemPromptId);
        if (!prompt) throw AppError.badRequest('systemPromptId no existe');
      }

      // Si se proveen toolIds, reemplazar las asociaciones
      if (data.toolIds !== undefined) {
        await this.repository.clearTopicTools(id);
        await this.repository.addTopicTools(id, data.toolIds);
      }

      const topic = await this.repository.updateTopicById(id, {
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.systemPromptId !== undefined && { systemPromptId: data.systemPromptId }),
        ...(data.matcherKeywords !== undefined && { matcherKeywords: data.matcherKeywords }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      });

      res.json({ topic: mapTopic(topic) });
    } catch (err) {
      next(err);
    }
  };

  deleteTopic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const existing = await this.repository.findTopicById(id);
      if (!existing) throw AppError.notFound('Topic no encontrado');

      await this.repository.deactivateTopic(id);

      res.json({ message: 'Topic desactivado correctamente' });
    } catch (err) {
      next(err);
    }
  };

  assignTopicTools = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { toolIds } = AssignTopicToolsSchema.parse(req.body);

      const existing = await this.repository.findTopicById(id);
      if (!existing) throw AppError.notFound('Topic no encontrado');

      // Reemplazar todas las tools del topic
      await this.repository.clearTopicTools(id);
      await this.repository.addTopicTools(id, toolIds);

      const topic = await this.repository.findTopicByIdWithIncludes(id);

      res.json({ topic: mapTopic(topic!) });
    } catch (err) {
      next(err);
    }
  };

  // ── Prompts ───────────────────────────────────────────────────────────────

  listPrompts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ListQuerySchema.parse(req.query);
      const { search, isActive, cursor, limit, topicId } = query;

      const prompts = await this.repository.findPrompts({
        where: {
          ...(search && { name: { contains: search, mode: 'insensitive' } }),
          ...(isActive !== undefined && { isActive }),
          ...(topicId && { topicId }),
        },
        include: {
          topic: { select: { id: true, name: true, slug: true } },
        },
        orderBy: [{ topicId: 'asc' }, { version: 'desc' }],
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      const meta = buildCursorMeta(prompts, limit);
      const slice = prompts.slice(0, limit);

      res.json({ prompts: slice, meta });
    } catch (err) {
      next(err);
    }
  };

  getPrompt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const prompt = await this.repository.findPromptByIdWithTopic(id);
      if (!prompt) throw AppError.notFound('Prompt no encontrado');
      res.json({ prompt });
    } catch (err) {
      next(err);
    }
  };

  createPrompt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = CreatePromptSchema.parse(req.body);

      if (data.topicId) {
        const topic = await this.repository.findTopicById(data.topicId);
        if (!topic) throw AppError.badRequest('topicId no existe');
      }

      // Determinar version: max(version) + 1 dentro del mismo topic (o 1 si no hay)
      const maxVersionRecord = await this.repository.findMaxPromptVersion(data.topicId ?? null);
      const version = (maxVersionRecord?.version ?? 0) + 1;

      const prompt = await this.repository.createPrompt({
        topicId: data.topicId,
        name: data.name,
        type: data.type as 'topic' | 'system' | 'tool' | 'fallback',
        version,
        content: data.content,
        isActive: data.isActive,
        metadata: data.metadata as Prisma.InputJsonValue,
      });

      res.status(201).json({ prompt });
    } catch (err) {
      next(err);
    }
  };

  updatePrompt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const data = UpdatePromptSchema.parse(req.body);

      const existing = await this.repository.findPromptById(id);
      if (!existing) throw AppError.notFound('Prompt no encontrado');

      if (data.topicId && data.topicId !== existing.topicId) {
        const topic = await this.repository.findTopicById(data.topicId);
        if (!topic) throw AppError.badRequest('topicId no existe');
      }

      const promptUpdateData: Prisma.AiPromptUncheckedUpdateInput = {
        ...(data.topicId !== undefined && { topicId: data.topicId }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && {
          type: data.type as 'topic' | 'system' | 'tool' | 'fallback',
        }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.metadata !== undefined && { metadata: data.metadata as Prisma.InputJsonValue }),
      };

      const prompt = await this.repository.updatePromptById(id, promptUpdateData);

      res.json({ prompt });
    } catch (err) {
      next(err);
    }
  };

  deletePrompt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const existing = await this.repository.findPromptById(id);
      if (!existing) throw AppError.notFound('Prompt no encontrado');

      await this.repository.deactivatePrompt(id);

      res.json({ message: 'Prompt desactivado correctamente' });
    } catch (err) {
      next(err);
    }
  };

  activatePrompt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const existing = await this.repository.findPromptById(id);
      if (!existing) throw AppError.notFound('Prompt no encontrado');

      // Si tiene topic, desactivar todos los demás prompts activos del mismo topic y tipo
      if (existing.topicId) {
        await this.repository.deactivateOtherActivePrompts({
          topicId: existing.topicId,
          type: existing.type,
          excludeId: id,
        });
      }

      const prompt = await this.repository.activatePromptById(id);

      res.json({ prompt });
    } catch (err) {
      next(err);
    }
  };

  // ── Lines ─────────────────────────────────────────────────────────────────

  listLines = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ListQuerySchema.parse(req.query);
      const { search, isActive, cursor, limit } = query;

      const lines = await this.repository.findLines({
        where: {
          ...(search && {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' } },
              { phoneNumber: { contains: search } },
              { externalIdentifier: { contains: search, mode: 'insensitive' } },
            ],
          }),
          ...(isActive !== undefined && { isActive }),
        },
        include: {
          agent: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      const meta = buildCursorMeta(lines, limit);
      const slice = lines.slice(0, limit);

      res.json({ lines: slice, meta });
    } catch (err) {
      next(err);
    }
  };

  getLine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const line = await this.repository.findLineByIdWithAgent(id);
      if (!line) throw AppError.notFound('Línea no encontrada');
      res.json({ line });
    } catch (err) {
      next(err);
    }
  };

  createLine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = CreateLineSchema.parse(req.body);

      if (data.agentId) {
        const agent = await this.repository.findAgentById(data.agentId);
        if (!agent) throw AppError.badRequest('agentId no existe');
      }

      const externalIdentifier = data.whatsappPhoneNumberId?.trim();
      if (!externalIdentifier) {
        throw AppError.badRequest('whatsappPhoneNumberId es requerido');
      }

      const existing = await this.repository.findLineByChannelAndExternalIdentifier(
        data.channel,
        externalIdentifier,
      );
      if (existing) {
        throw AppError.conflict(
          `Ya existe una línea con channel='${data.channel}' y whatsappPhoneNumberId='${externalIdentifier}'`,
        );
      }

      const mergedMetadata: Record<string, unknown> = {
        ...(data.metadata as Record<string, unknown>),
        departmentIds: data.departmentIds,
      };

      const line = await this.repository.createLine({
        channel: data.channel,
        externalIdentifier,
        phoneNumber: data.phoneNumber,
        provider: data.provider,
        displayName: data.displayName,
        isActive: data.isActive,
        isDefault: data.isDefault,
        aiEnabled: data.aiEnabled,
        agentId: data.agentId ?? null,
        aiAgentId: data.agentId ?? null,
        metadata: mergedMetadata as Prisma.InputJsonValue,
        whatsappPhoneNumberId: externalIdentifier,
        ...(data.whatsappBusinessAccountId && {
          whatsappBusinessAccountId: data.whatsappBusinessAccountId,
        }),
        ...(data.whatsappAppId && { whatsappAppId: data.whatsappAppId }),
        ...(data.whatsappAccessToken && {
          whatsappAccessToken: encrypt(data.whatsappAccessToken),
        }),
        ...(data.whatsappAppSecret && {
          whatsappAppSecret: encrypt(data.whatsappAppSecret),
        }),
      } as Prisma.CommunicationLineUncheckedCreateInput);

      res.status(201).json({ line });
    } catch (err) {
      next(err);
    }
  };

  updateLine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const data = UpdateLineSchema.parse(req.body);

      const existing = await this.repository.findLineById(id);
      if (!existing) throw AppError.notFound('Línea no encontrada');

      if (data.agentId) {
        const agent = await this.repository.findAgentById(data.agentId);
        if (!agent) throw AppError.badRequest('agentId no existe');
      }

      // Si se cambia externalIdentifier, validar unicidad channel + externalIdentifier
      if (data.externalIdentifier && data.externalIdentifier !== existing.externalIdentifier) {
        const channelToCheck = existing.channel;
        const conflict = await this.repository.findLineConflictByChannelAndExternalIdentifier({
          channel: channelToCheck,
          externalIdentifier: data.externalIdentifier,
          excludeId: id,
        });
        if (conflict) {
          throw AppError.conflict(
            `Ya existe una línea con channel='${channelToCheck}' y externalIdentifier='${data.externalIdentifier}'`,
          );
        }
      }

      // Construir metadata: fusionar cambios incrementales sobre la metadata existente
      const existingMeta = (existing.metadata as Record<string, unknown>) ?? {};
      let metadataUpdate: Record<string, unknown> | undefined;
      if (
        data.departmentIds !== undefined ||
        data.verifyToken !== undefined ||
        data.webhookSecret !== undefined ||
        data.businessAccountId !== undefined ||
        data.metadata !== undefined
      ) {
        metadataUpdate = { ...existingMeta };
        if (data.metadata !== undefined) Object.assign(metadataUpdate, data.metadata);
        if (data.departmentIds !== undefined) metadataUpdate['departmentIds'] = data.departmentIds;
        if (data.verifyToken !== undefined) metadataUpdate['verifyToken'] = data.verifyToken;
        if (data.webhookSecret !== undefined) metadataUpdate['webhookSecret'] = data.webhookSecret;
      }

      const line = await this.repository.updateLineById(id, {
        ...(data.displayName !== undefined && { displayName: data.displayName }),
        ...(data.phoneNumber !== undefined && { phoneNumber: data.phoneNumber }),
        ...(data.provider !== undefined && { provider: data.provider }),
        ...(data.externalIdentifier !== undefined && {
          externalIdentifier: data.externalIdentifier,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        ...(data.aiEnabled !== undefined && { aiEnabled: data.aiEnabled }),
        ...(data.agentId !== undefined && { agentId: data.agentId ?? null }),
        ...(data.agentId !== undefined && { aiAgentId: data.agentId ?? null }),
        ...(data.whatsappBusinessAccountId !== undefined && {
          whatsappBusinessAccountId: data.whatsappBusinessAccountId,
        }),
        ...(data.whatsappAppId !== undefined && { whatsappAppId: data.whatsappAppId }),
        ...(data.whatsappPhoneNumberId !== undefined && {
          whatsappPhoneNumberId: data.whatsappPhoneNumberId,
        }),
        ...(data.businessAccountId !== undefined &&
          data.whatsappBusinessAccountId === undefined && {
            whatsappBusinessAccountId: data.businessAccountId,
          }),
        ...(data.whatsappAccessToken !== undefined && {
          whatsappAccessToken: encrypt(data.whatsappAccessToken),
        }),
        ...(data.whatsappAppSecret !== undefined && {
          whatsappAppSecret: encrypt(data.whatsappAppSecret),
        }),
        ...(metadataUpdate !== undefined && { metadata: metadataUpdate as Prisma.InputJsonValue }),
      } as Prisma.CommunicationLineUncheckedUpdateInput);

      res.json({ line });
    } catch (err) {
      next(err);
    }
  };
}

// ── Mappers ───────────────────────────────────────────────────────────────────

type TopicWithIncludes = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  systemPromptId: string | null;
  matcherKeywords: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  tools: Array<{ tool: unknown }>;
  systemPrompt: unknown;
};

function mapTopic(topic: TopicWithIncludes) {
  return {
    id: topic.id,
    slug: topic.slug,
    name: topic.name,
    description: topic.description,
    systemPromptId: topic.systemPromptId,
    matcherKeywords: topic.matcherKeywords,
    isActive: topic.isActive,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    tools: topic.tools.map((t: { tool: unknown }) => t.tool),
    systemPrompt: topic.systemPrompt,
  };
}
