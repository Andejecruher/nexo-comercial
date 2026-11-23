import { MessageType } from '@prisma/client';
import * as crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { serializeMessageForJson } from '../repositories/message.repository';
import type { AuditService } from '../services/audit.service';
import { ConversationsService, normalizeInboxListStatus } from '../services/conversations.service';
import { MessageService } from '../services/message.service';
import { parseMultipartForm } from '../utils/multipart';

const IdParam = z.object({ id: z.string().uuid() });

function blankToUndefined(value: unknown) {
  if (value === '' || value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return blankToUndefined(value[0]);
  return value;
}

const optionalUuid = z.preprocess(blankToUndefined, z.string().uuid().optional());
const optionalUuidList = z.preprocess((value) => {
  if (value === '' || value === undefined || value === null) return undefined;
  const values = (Array.isArray(value) ? value : [value])
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}, z.array(z.string().uuid()).max(20).optional());
const optionalBotIdList = z.preprocess(
  (value) => {
    if (value === '' || value === undefined || value === null) return undefined;
    const values = (Array.isArray(value) ? value : [value])
      .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
      .map((item) => (typeof item === 'string' ? item.trim() : item))
      .filter(Boolean);
    return values.length > 0 ? values : undefined;
  },
  z
    .array(z.union([z.string().uuid(), z.literal('all')]))
    .max(20)
    .optional(),
);
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().min(1).max(max).optional());

const ListQuery = z.object({
  cursor: optionalUuid,
  limit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(100).optional()),
  citizenId: optionalUuid,
  status: optionalText(20),
  department_id: optionalUuidList,
  department_ids: optionalUuidList,
  departmentId: optionalUuid,
  departmentSlug: optionalText(100),
  dept: optionalText(100),
  attended_by: optionalText(20),
  bot_id: optionalUuid,
  bot_ids: optionalBotIdList,
  phone_line_id: optionalUuid,
  phoneLineId: optionalUuid,
  communicationLineId: optionalUuid,
  line: optionalUuid,
  search: optionalText(255),
});
const AssignBody = z.object({
  userId: z.string().uuid().optional(),
  departmentSlug: z.string().optional(),
});
const TransferBody = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('agent'),
    toUserId: z.string().uuid(),
    departmentSlug: z.string().optional(),
  }),
  z.object({
    type: z.literal('department'),
    departmentSlug: z.string().trim().min(1),
  }),
  z.object({ type: z.literal('ai') }),
]);
const SendMessageBody = z.object({
  body: z.string().min(1).max(4096),
  messageType: z.literal('text').optional(),
});
const EnsureOpenBody = z.object({
  citizenId: z.string().uuid(),
  communicationLineId: z.string().uuid().optional(),
});

export class ConversationsController {
  constructor(
    private readonly service: ConversationsService,
    private readonly audit: AuditService,
    private readonly messageService: MessageService,
  ) {}

  getWindow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      res.json(await this.messageService.getWindow(id));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: error.issues });
        return;
      }
      next(error);
    }
  };

  postTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      const input = z
        .object({
          lineId: z.string().uuid(),
          templateId: z.string().regex(/^\d+$/),
          values: z.record(z.string(), z.string().trim().min(1).max(1024)),
          attachmentId: z.string().uuid().optional(),
        })
        .strict()
        .parse(req.body);
      const idempotencyKey = z.string().min(1).max(255).parse(req.get('Idempotency-Key'));
      if (!req.user) {
        res.sendStatus(401);
        return;
      }
      const result = await this.messageService.sendTemplate({
        ...input,
        conversationId: id,
        senderId: req.user.id,
        idempotencyKey,
      });
      res.status(result.isReplay ? 200 : 202).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: error.issues });
        return;
      }
      next(error);
    }
  };

  postMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      const { fields, files } = parseMultipartForm(req);
      const caption = z.string().max(1024).optional().parse(fields.caption);
      const idempotencyKey = z.string().min(1).max(255).parse(req.get('Idempotency-Key'));
      if (!req.user) {
        res.sendStatus(401);
        return;
      }
      if (!files.file) {
        res.status(400).json({ error: 'Archivo requerido' });
        return;
      }
      const result = await this.messageService.sendMedia(
        { conversationId: id, senderId: req.user.id, idempotencyKey, caption },
        files.file,
      );
      res.status(result.isReplay ? 200 : 202).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: error.issues });
        return;
      }
      next(error);
    }
  };

  postTemplateMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      const { fields, files } = parseMultipartForm(req);
      const input = z
        .object({ lineId: z.string().uuid(), templateId: z.string().regex(/^\d+$/) })
        .parse(fields);
      if (!req.user) {
        res.sendStatus(401);
        return;
      }
      if (!files.file) {
        res.status(400).json({ error: 'Archivo requerido' });
        return;
      }
      res
        .status(201)
        .json(
          await this.messageService.uploadTemplateMedia(
            { ...input, conversationId: id, senderId: req.user.id },
            files.file,
          ),
        );
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: error.issues });
        return;
      }
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ListQuery.parse(req.query);
      const inboxStatus = query.status ? normalizeInboxListStatus(query.status) : undefined;
      if (query.status && !inboxStatus) {
        res.status(400).json({
          error: 'Datos inválidos',
          details: [{ path: ['status'], message: 'status inválido' }],
        });
        return;
      }

      const departmentHint = query.dept;
      const departmentIds = [
        ...(query.department_id ?? []),
        ...(query.department_ids ?? []),
        ...(query.departmentId ? [query.departmentId] : []),
        ...(departmentHint && z.string().uuid().safeParse(departmentHint).success
          ? [departmentHint]
          : []),
      ];
      const departmentSlug =
        query.departmentSlug ??
        (departmentHint && departmentIds.length === 0 ? departmentHint : undefined);

      // Filtro "atendido por bot": convive con los filtros de departamento
      // (OR entre grupos, nunca AND). `null` dentro del array = "todos los bots".
      const attendedByBot = query.attended_by !== undefined;
      if (attendedByBot && query.attended_by !== 'bot') {
        res.status(400).json({
          error: 'Datos inválidos',
          details: [{ path: ['attended_by'], message: 'attended_by inválido' }],
        });
        return;
      }
      const botIds: (string | null)[] = [
        ...(query.bot_ids ?? []).map((value) => (value === 'all' ? null : value)),
        ...(query.bot_id ? [query.bot_id] : []),
        ...(attendedByBot ? [null] : []),
      ];

      const result = await this.service.list({
        cursor: query.cursor,
        limit: query.limit,
        citizenId: query.citizenId,
        inboxStatus,
        departmentIds,
        departmentSlug,
        communicationLineId:
          query.phone_line_id ?? query.phoneLineId ?? query.communicationLineId ?? query.line,
        search: query.search,
        botIds: botIds.length > 0 ? botIds : undefined,
        viewerUserId: req.user?.id,
      });

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'conversation.list',
        targetType: 'Conversation',
      });

      res.json(result);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  ensureOpen = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { citizenId, communicationLineId } = EnsureOpenBody.parse(req.body);
      const conversation = await this.service.ensureOpenForCitizen(citizenId, communicationLineId);

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'conversation.ensure_open',
        targetType: 'Conversation',
        targetId: conversation.id,
        metadata: { citizenId },
      });

      res.json({ conversation });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      const conv = await this.service.getById(id);

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'conversation.get',
        targetType: 'Conversation',
        targetId: id,
      });

      res.json({ conversation: conv });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  assign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      const data = AssignBody.parse(req.body);
      const agentId = data.userId ?? req.user?.id;
      if (!agentId) {
        res.status(401).json({ error: 'No autenticado' });
        return;
      }

      const result = await this.service.assign(id, agentId, data.departmentSlug);

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'conversation.assign',
        targetType: 'Conversation',
        targetId: id,
        metadata: { agentId, departmentSlug: data.departmentSlug },
      });

      res.status(200).json(result);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  transfer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      const data = TransferBody.parse(req.body);

      const result = await this.service.transfer(id, data, { performedBy: req.user?.id });

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'conversation.transfer',
        targetType: 'Conversation',
        targetId: id,
        metadata: { target: data },
      });

      res.status(200).json(result);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  handover = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      const agentId = req.user?.id;
      if (!agentId) {
        res.status(401).json({ error: 'No autenticado' });
        return;
      }

      const result = await this.service.handover(id, agentId);

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'conversation.handover',
        targetType: 'Conversation',
        targetId: id,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  close = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      const result = await this.service.close(id, req.user?.id);

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'conversation.close',
        targetType: 'Conversation',
        targetId: id,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  reopen = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      const result = await this.service.reopen(id, req.user?.id);

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'conversation.reopen',
        targetType: 'Conversation',
        targetId: id,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  markRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'No autenticado' });
        return;
      }

      const result = await this.service.markRead(id, userId);

      await this.audit.logFromRequest(req, {
        actorId: userId,
        action: 'conversation.read',
        targetType: 'Conversation',
        targetId: id,
      });

      res.status(200).json(result);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  /**
   * GET /conversations/:id/messages
   * Lista mensajes de una conversación (cursor-based pagination).
   */
  getMessages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const { id } = IdParam.parse(req.params);
      const { cursor, limit } = req.pagination;

      const result = await this.messageService.listByConversation({
        conversationId: id,
        cursor,
        limit,
      });

      res.json({
        ...result,
        items: result.items.map(serializeMessageForJson),
      });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  /**
   * POST /conversations/:id/messages
   * Envía un mensaje outbound desde el dashboard.
   * Soporta Idempotency-Key en header para replay-safe retries.
   */
  postMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      const senderId = req.user?.id;
      if (!senderId) {
        res.status(401).json({ error: 'No autenticado' });
        return;
      }

      const idempotencyKey =
        typeof req.headers['idempotency-key'] === 'string'
          ? req.headers['idempotency-key']
          : crypto.randomUUID();

      const data = SendMessageBody.parse(req.body);

      const { message, isReplay } = await this.messageService.sendMessage({
        conversationId: id,
        body: data.body,
        messageType: data.messageType ?? MessageType.text,
        senderId,
        idempotencyKey,
      });

      res.status(isReplay ? 200 : 202).json({ message, idempotencyKey });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  /**
   * POST /conversations/:id/messages/audio
   * Sube un audio (multipart) a Meta y lo encola como nota de voz.
   */
  postLegacyMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      if (!req.user) {
        res.status(401).json({ error: 'No autenticado' });
        return;
      }
      const { fields, files } = parseMultipartForm(req);
      const file = files.file;
      if (!file) {
        res.status(400).json({ error: 'Falta el archivo' });
        return;
      }
      const kind = z.enum(['image', 'document', 'audio', 'video', 'sticker']).parse(fields.kind);
      const caption = z
        .string()
        .max(1024)
        .parse(fields.caption ?? '');
      const idempotencyKey = z
        .string()
        .min(1)
        .max(255)
        .parse(req.headers['idempotency-key'] ?? crypto.randomUUID());
      const result = await this.messageService.sendLegacyMedia({
        conversationId: id,
        senderId: req.user.id,
        idempotencyKey,
        kind,
        caption,
        buffer: file.buffer,
        filename: file.filename,
        mimeType: file.mimeType,
      });
      res.status(result.isReplay ? 200 : 202).json({ message: result.message, idempotencyKey });
    } catch (error) {
      next(error);
    }
  };

  postContacts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      if (!req.user) {
        res.status(401).json({ error: 'No autenticado' });
        return;
      }
      const idempotencyKey = z
        .string()
        .min(1)
        .max(255)
        .parse(req.headers['idempotency-key'] ?? crypto.randomUUID());
      const { citizenId } = z.object({ citizenId: z.string().uuid() }).strict().parse(req.body);
      const result = await this.messageService.sendContactMessage({
        conversationId: id,
        senderId: req.user.id,
        idempotencyKey,
        citizenId,
      });
      res.status(result.isReplay ? 200 : 202).json({ message: result.message, idempotencyKey });
    } catch (error) {
      next(error);
    }
  };

  postLegacyTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      if (!req.user) {
        res.status(401).json({ error: 'No autenticado' });
        return;
      }
      const data = z
        .object({
          templateId: z.string().regex(/^\d+$/),
          variables: z.record(z.string().max(128), z.string().max(2048)).default({}),
        })
        .parse(req.body);
      const idempotencyKey = z
        .string()
        .min(1)
        .max(255)
        .parse(req.headers['idempotency-key'] ?? crypto.randomUUID());
      const result = await this.messageService.sendLegacyTemplate({
        conversationId: id,
        senderId: req.user.id,
        idempotencyKey,
        ...data,
      });
      res.status(result.isReplay ? 200 : 202).json({ message: result.message, idempotencyKey });
    } catch (error) {
      next(error);
    }
  };

  postAudio = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = IdParam.parse(req.params);
      const senderId = req.user?.id;
      if (!senderId) {
        res.status(401).json({ error: 'No autenticado' });
        return;
      }

      const { fields, files } = parseMultipartForm(req);
      const audio = files.audio;
      if (!audio?.buffer.byteLength) {
        res.status(400).json({ error: 'Falta el archivo de audio' });
        return;
      }

      const parsedDuration = Number.parseInt(fields.durationSeconds ?? '1', 10);
      const durationSeconds = Number.isFinite(parsedDuration)
        ? Math.min(Math.max(parsedDuration, 1), 600)
        : 1;
      const filename = audio.filename.replace(/[/\\]/g, '_').slice(0, 180) || 'audio.ogg';

      const idempotencyKey =
        typeof req.headers['idempotency-key'] === 'string'
          ? req.headers['idempotency-key']
          : crypto.randomUUID();

      const { message, isReplay } = await this.messageService.sendAudio({
        conversationId: id,
        senderId,
        idempotencyKey,
        buffer: audio.buffer,
        mimeType: audio.mimeType,
        filename,
        durationSeconds,
      });

      res.status(isReplay ? 200 : 202).json({ message, idempotencyKey });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };
}
