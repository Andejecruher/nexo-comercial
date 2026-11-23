import { assertObjectPath } from '../services/storage/object-path';
import {
  inboundContent,
  presentationMeta,
  record,
  type CustomerServiceWindow,
} from '../services/message-content';
import type { WaInboundMessage } from '../types/whatsapp.types';
import { AppError } from '../utils/app-error';
import { safeFilename } from '../services/whatsapp/media-policy';
/**
 * Repository para Message y MessageStatus.
 */
import {
  Attachment,
  Message,
  MessageDirection,
  MessageStatus,
  MessageStatusValue,
  MessageType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../services/prisma.service';

export interface CreateMessageInput {
  conversationId: string;
  /** Ticket al que pertenece el mensaje. Obligatorio en la práctica para
   * mensajes nuevos; nullable en DB para históricos. */
  ticketId?: string;
  body: string;
  direction: MessageDirection;
  messageType?: MessageType;
  externalMessageId?: string;
  idempotencyKey?: string;
  sendByUserId?: string;
  meta?: Record<string, unknown>;
  createdAt?: Date;
}

function metaRecord(meta: Prisma.JsonValue): Prisma.JsonObject | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
  return meta;
}

function trimmedMetaString(meta: Prisma.JsonObject, key: string): string | undefined {
  const value = meta[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Runs de IA cuyo nombre de agente aún no está en el meta del mensaje. */
export function aiRunIdsMissingAgentName(metas: Prisma.JsonValue[]): string[] {
  const ids = new Set<string>();
  for (const meta of metas) {
    const record = metaRecord(meta);
    if (!record || trimmedMetaString(record, 'aiAgentName')) continue;
    const runId = trimmedMetaString(record, 'aiRunId');
    if (runId) ids.add(runId);
  }
  return [...ids];
}

/** Copia el nombre del agente resuelto sobre mensajes que solo traen `aiRunId`. */
export function mergeAiAgentNames<T extends { meta: Prisma.JsonValue }>(
  items: T[],
  namesByRunId: ReadonlyMap<string, string>,
): T[] {
  if (namesByRunId.size === 0) return items;
  return items.map((item) => {
    const record = metaRecord(item.meta);
    if (!record || trimmedMetaString(record, 'aiAgentName')) return item;
    const runId = trimmedMetaString(record, 'aiRunId');
    const name = runId ? namesByRunId.get(runId)?.trim() : undefined;
    if (!name) return item;
    return { ...item, meta: { ...record, aiAgentName: name } };
  });
}

/** Campos públicos del remitente — evita exponer hashedPassword en el JSON. */
export const senderSelect = { id: true, fullName: true, email: true } satisfies Prisma.UserSelect;

export type MessageSender = {
  id: string;
  fullName: string | null;
  email: string;
};

export type MessageWithSender = Message & { sender: MessageSender | null };

export type MessageWithStatuses = MessageWithSender & {
  statuses: MessageStatus[];
  attachmentsViaMessageId: Attachment[];
};

export type JsonAttachment = Omit<Attachment, 'fileSizeBytes'> & {
  fileSizeBytes: string;
};

export type JsonMessageWithStatuses = Omit<MessageWithStatuses, 'attachmentsViaMessageId'> & {
  attachmentsViaMessageId: JsonAttachment[];
};

/** Convierte los BigInt de Prisma al contrato JSON público sin perder precisión. */
export function serializeMessageForJson(item: MessageWithStatuses): JsonMessageWithStatuses {
  return {
    ...item,
    attachmentsViaMessageId: item.attachmentsViaMessageId.map((attachment) => ({
      ...attachment,
      storageKey: '',
      cdnUrl: null,
      driveFileId: null,
      driveFolderId: null,
      fileSizeBytes: attachment.fileSizeBytes.toString(),
    })),
  };
}

/** Orden de avance de los estados de entrega de WhatsApp. `failed` es terminal. */
const STATUS_RANK: Record<MessageStatusValue, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

function statusRank(status: MessageStatusValue): number {
  return STATUS_RANK[status] ?? 0;
}

export interface MessageStatusOutcome {
  /** true si se insertó una fila nueva; false si el status era igual o anterior. */
  created: boolean;
  messageId: string;
  conversationId: string;
  wamid: string;
  status: MessageStatusValue;
  timestamp: Date;
}

export class MessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Message | null> {
    return this.prisma.message.findUnique({ where: { id } });
  }

  async findConversationWithCitizenPhone(conversationId: string): Promise<{
    id: string;
    citizen: { phone: string };
    meta?: { communicationLineId?: string | null } | null;
  } | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        citizen: { select: { phone: true } },
        meta: { select: { communicationLineId: true } },
      },
    });
    const phone = conversation?.citizen.phone;
    if (!conversation || phone == null) return null;

    return { ...conversation, citizen: { phone } };
  }

  async create(input: CreateMessageInput): Promise<MessageWithSender> {
    return this.createInTransaction(this.prisma, input);
  }

  async createInTransaction(
    tx: Prisma.TransactionClient,
    input: CreateMessageInput,
  ): Promise<MessageWithSender> {
    const media = input.meta?.media as
      | {
          id?: string;
          phoneNumberId?: string;
          mime_type?: string;
          mimeType?: string;
          filename?: string;
        }
      | undefined;
    const inboundMedia = input.direction === MessageDirection.inbound ? media : undefined;
    const line = inboundMedia?.id
      ? await tx.conversationMeta.findUnique({
          where: { conversationId: input.conversationId },
          select: { communicationLineId: true },
        })
      : undefined;
    return tx.message.create({
      data: {
        conversationId: input.conversationId,
        ticketId: input.ticketId,
        body: input.body,
        createdAt: input.createdAt,
        direction: input.direction,
        messageType: input.messageType ?? MessageType.text,
        externalMessageId: input.externalMessageId,
        idempotencyKey:
          input.idempotencyKey ??
          (input.direction === MessageDirection.inbound && input.externalMessageId
            ? `inbound:${input.externalMessageId}`
            : undefined),
        sendByUserId: input.sendByUserId,
        meta: (input.meta ?? {}) as object,
        ...(inboundMedia?.id
          ? {
              attachmentsViaMessageId: {
                create: {
                  storageKey: inboundMedia.id,
                  providerMediaId: inboundMedia.id,
                  communicationLineId: line?.communicationLineId,
                  providerPhoneNumberId: inboundMedia.phoneNumberId,
                  mimeType:
                    inboundMedia.mimeType ?? inboundMedia.mime_type ?? 'application/octet-stream',
                  fileSizeBytes: BigInt(0),
                  originalFilename: inboundMedia.filename
                    ? safeFilename(inboundMedia.filename)
                    : undefined,
                  processingState: 'pending',
                },
              },
            }
          : {}),
      },
      include: { sender: { select: senderSelect } },
    });
  }

  async createAttachment(params: {
    messageId: string;
    storageKey: string;
    mimeType: string;
    fileSizeBytes: bigint;
    originalFilename?: string;
    cdnUrl?: string;
    uploadedBy: string;
  }): Promise<Attachment> {
    // Numeric Meta IDs are valid only for pending provider media, never as CDN URLs.
    assertObjectPath(params.storageKey);
    if (params.cdnUrl) assertObjectPath(params.cdnUrl);
    return this.prisma.attachment.create({
      data: {
        messageId: params.messageId,
        storageKey: params.storageKey,
        mimeType: params.mimeType,
        fileSizeBytes: params.fileSizeBytes,
        originalFilename: params.originalFilename,
        cdnUrl: params.cdnUrl,
        uploadedBy: params.uploadedBy,
      },
    });
  }

  async findByExternalId(externalMessageId: string): Promise<Message | null> {
    return this.prisma.message.findFirst({
      where: { externalMessageId },
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<MessageWithSender | null> {
    return this.prisma.message.findUnique({
      where: { idempotencyKey },
      include: { sender: { select: senderSelect } },
    });
  }

  /**
   * Reemplaza la clave de correlación interna por el wamid real de Meta.
   * Primero busca por `idempotencyKey`; si no hay match, cae al patrón legado
   * de AI-tool que guardaba esa misma clave en `externalMessageId`.
   * Un conteo 0 es válido: hay outbox sin entidad Message (p. ej. invitaciones).
   */
  async bindProviderMessageId(
    tx: Prisma.TransactionClient,
    params: { idempotencyKey: string; wamid: string },
  ): Promise<number> {
    const byKey = await tx.message.updateMany({
      where: { idempotencyKey: params.idempotencyKey },
      data: { externalMessageId: params.wamid },
    });
    if (byKey.count > 0) return byKey.count;

    const legacy = await tx.message.updateMany({
      where: {
        direction: MessageDirection.outbound,
        externalMessageId: params.idempotencyKey,
      },
      data: { externalMessageId: params.wamid },
    });
    return legacy.count;
  }

  /**
   * Persiste un status de entrega (sent/delivered/read/failed).
   * Idempotencia por rango: no inserta ni reporta `created` si el status
   * entrante es igual o anterior al máximo ya registrado para el mensaje.
   * Un conteo nulo indica que el mensaje aún no tiene wamid correlacionado.
   */
  async upsertStatus(params: {
    wamid: string;
    status: MessageStatusValue;
    timestamp: Date;
    errorCode?: number;
    errorTitle?: string;
  }): Promise<MessageStatusOutcome | null> {
    return this.prisma.$transaction((tx) => this.upsertStatusInTransaction(tx, params));
  }

  async upsertStatusInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      wamid: string;
      status: MessageStatusValue;
      timestamp: Date;
      errorCode?: number;
      errorTitle?: string;
    },
  ): Promise<MessageStatusOutcome | null> {
    const msg = await tx.message.findFirst({
      where: { externalMessageId: params.wamid },
    });

    if (!msg) return null; // mensaje no encontrado — ignorar status

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'delivery:' + params.wamid}, 0))`;
    const existing = await tx.messageStatus.findMany({
      where: { messageId: msg.id },
      select: { status: true },
    });
    const maxRank = existing.reduce((max, row) => Math.max(max, statusRank(row.status)), 0);

    if (statusRank(params.status) <= maxRank) {
      return {
        created: false,
        messageId: msg.id,
        conversationId: msg.conversationId,
        wamid: params.wamid,
        status: params.status,
        timestamp: params.timestamp,
      };
    }

    await tx.messageStatus.create({
      data: {
        messageId: msg.id,
        wamid: params.wamid,
        status: params.status,
        timestamp: params.timestamp,
        errorCode: params.errorCode,
        errorTitle: params.errorTitle,
      },
    });

    return {
      created: true,
      messageId: msg.id,
      conversationId: msg.conversationId,
      wamid: params.wamid,
      status: params.status,
      timestamp: params.timestamp,
    };
  }

  async getStatusTimeline(wamid: string): Promise<MessageStatus[]> {
    return this.prisma.messageStatus.findMany({
      where: { wamid },
      orderBy: { timestamp: 'asc' },
    });
  }

  /**
   * Lista mensajes de una conversación en orden cronológico ascendente,
   * con sus statuses de entrega y attachments adjuntos.
   * Estrategia limit+1 para cursor-based pagination.
   */
  /**
   * Obtiene los últimos N mensajes de una conversación para usarlos como
   * contexto histórico en el prompt del agente IA.
   * Excluye mensajes con body vacío/blank y un mensaje específico por id.
   */
  async findRecentForAiContext(params: {
    conversationId: string;
    limit: number;
    excludeMessageId?: string;
    excludeMessageIds?: string[];
  }): Promise<Pick<Message, 'id' | 'body' | 'direction'>[]> {
    const excludeIds =
      params.excludeMessageIds ?? (params.excludeMessageId ? [params.excludeMessageId] : []);
    // One DB snapshot: later, eagerly persisted fragments must not leak into this AI turn.
    const excluded = excludeIds.length
      ? Prisma.sql`AND m.id NOT IN (${Prisma.join(excludeIds.map((id) => Prisma.sql`${id}::uuid`))})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Pick<Message, 'id' | 'body' | 'direction'>[]
    >(Prisma.sql`
      SELECT m.id, m.body, m.direction::text AS direction
      FROM messages m
      WHERE m.conversation_id = ${params.conversationId}::uuid
        ${excluded}
        AND NOT EXISTS (
          SELECT 1 FROM inbox_events ie
          WHERE ie.message_id = m.id AND ie.status IN ('pending', 'failed', 'processing')
        )
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ${params.limit}
    `);

    // Reverse to get chronological order and filter blank bodies
    return rows.filter((m) => m.body.trim().length > 0).reverse();
  }

  async listByConversation(params: {
    conversationId: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: MessageWithStatuses[]; hasNextPage: boolean }> {
    await this.validateCursor(params.cursor, { conversationId: params.conversationId });
    const rows = await this.prisma.message.findMany({
      where: { conversationId: params.conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: {
        statuses: { orderBy: { timestamp: 'asc' } },
        attachmentsViaMessageId: true,
        attachment: true,
        sender: { select: senderSelect },
      },
    });

    const hasNextPage = rows.length > params.limit;
    const page = hasNextPage ? rows.slice(0, params.limit) : rows;

    return {
      items: await this.normalizePage(await this.withResolvedAiAgentNames(page.reverse())),
      hasNextPage,
    };
  }

  /**
   * Lista los mensajes asociados a un ticket (aislamiento por ticket en la
   * vista "Detalles del Ticket"), en orden cronológico ascendente.
   * Estrategia limit+1 para cursor-based pagination.
   */
  async listByTicket(params: {
    ticketId: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: MessageWithStatuses[]; hasNextPage: boolean }> {
    await this.validateCursor(params.cursor, {
      OR: [
        { ticketId: params.ticketId },
        { ticketMessages: { some: { ticketId: params.ticketId } } },
      ],
    });
    const rows = await this.prisma.message.findMany({
      where: {
        OR: [
          { ticketId: params.ticketId },
          { ticketMessages: { some: { ticketId: params.ticketId } } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: {
        statuses: { orderBy: { timestamp: 'asc' } },
        attachmentsViaMessageId: true,
        attachment: true,
        sender: { select: senderSelect },
      },
    });

    const hasNextPage = rows.length > params.limit;
    const page = hasNextPage ? rows.slice(0, params.limit) : rows;

    return {
      items: await this.normalizePage(await this.withResolvedAiAgentNames(page.reverse())),
      hasNextPage,
    };
  }

  private async validateCursor(cursor: string | undefined, where: Prisma.MessageWhereInput) {
    if (!cursor) return;
    if (
      !/^[0-9a-f-]{36}$/i.test(cursor) ||
      !(await this.prisma.message.findFirst({
        where: { ...where, id: cursor },
        select: { id: true },
      }))
    )
      throw AppError.badRequest('Cursor de mensajes inválido');
  }

  private async normalizePage<T extends MessageWithStatuses & { attachment?: Attachment | null }>(
    items: T[],
  ): Promise<T[]> {
    const ids = items
      .filter((m) => m.direction === 'inbound' && !record(m.meta).eventAt)
      .flatMap((m) => (m.externalMessageId ? [m.externalMessageId] : []));
    const originals = ids.length
      ? await this.prisma.inboxEvent.findMany({
          where: { wamid: { in: ids } },
          select: { wamid: true, payload: true },
        })
      : [];
    const keys = items.flatMap((item) => (item.idempotencyKey ? [item.idempotencyKey] : []));
    const outbox = keys.length
      ? await this.prisma.outboxEvent.findMany({
          where: { idempotencyKey: { in: keys } },
          select: { idempotencyKey: true, status: true },
        })
      : [];
    const processing = new Map(outbox.map((row) => [row.idempotencyKey, row.status]));
    const byId = new Map(originals.map((row) => [row.wamid, record(row.payload).message]));
    return items.map((item) => {
      const original = byId.get(item.externalMessageId ?? '');
      const historical = record(original);
      const state = processing.get(item.idempotencyKey ?? '');
      const meta = {
        ...(state
          ? {
              processing: {
                state,
                ...(state === 'dead_lettered'
                  ? {
                      error:
                        'No se pudo enviar el mensaje. Revisa la ventana de atención y la configuración de Meta.',
                    }
                  : {}),
              },
            }
          : {}),
        ...(typeof historical.type === 'string' && typeof historical.timestamp === 'string'
          ? inboundContent(original as WaInboundMessage)
          : {}),
        ...record(item.meta),
      };
      const attachments = [...item.attachmentsViaMessageId];
      if (item.attachment && !attachments.some((a) => a.id === item.attachment!.id))
        attachments.push(item.attachment);
      return {
        ...item,
        attachment: undefined,
        meta: presentationMeta({ id: item.id, meta }) as Prisma.JsonObject,
        // Keep storage references inside the service layer until URLs are signed.
        // serializeMessageForJson removes the private key at the HTTP boundary.
        attachmentsViaMessageId: attachments,
      };
    });
  }

  async customerWindow(conversationId: string, now = new Date()): Promise<CustomerServiceWindow> {
    // Provider event time, never ticket.updatedAt or outbound time. Legacy payloads
    // remain in inbox_events, so no destructive history backfill is needed.
    const rows = await this.prisma.$queryRaw<{ lastInboundAt: Date | null }[]>`
      SELECT MAX(CASE
        WHEN COALESCE(m.meta->>'eventTimestamp', m.meta->>'providerTimestamp', i.payload->'message'->>'timestamp') ~ '^[0-9]{1,11}([.][0-9]+)?$'
        THEN CASE WHEN COALESCE(m.meta->>'eventTimestamp', m.meta->>'providerTimestamp', i.payload->'message'->>'timestamp')::double precision > 0
          AND COALESCE(m.meta->>'eventTimestamp', m.meta->>'providerTimestamp', i.payload->'message'->>'timestamp')::double precision <= extract(epoch from m.created_at)
          THEN to_timestamp(COALESCE(m.meta->>'eventTimestamp', m.meta->>'providerTimestamp', i.payload->'message'->>'timestamp')::double precision)
          ELSE NULL END
        ELSE NULL END) AS "lastInboundAt"
      FROM messages m LEFT JOIN inbox_events i ON i.wamid = m.external_message_id
      LEFT JOIN conversation_meta cm ON cm.conversation_id = m.conversation_id
      LEFT JOIN communication_lines cl ON cl.id = cm.communication_line_id
      WHERE m.conversation_id = ${conversationId}::uuid AND m.direction = 'inbound'
        AND (cm.communication_line_id IS NULL
          OR m.meta->>'lineId' = cm.communication_line_id::text
          OR i.payload->>'phoneNumberId' IN (cl.external_identifier, cl.whatsapp_phone_number_id)
          OR (m.meta->>'lineId' IS NULL AND i.payload->>'phoneNumberId' IS NULL))
        AND COALESCE(m.meta->>'type', m.message_type::text) NOT IN ('system', 'unsupported', 'reaction')`;
    const last = rows[0]?.lastInboundAt;
    const expiresAt = last ? new Date(last.getTime() + 24 * 60 * 60 * 1000) : null;
    return {
      lastInboundAt: last?.toISOString() ?? null,
      expiresAt: expiresAt?.toISOString() ?? null,
      isOpen: Boolean(expiresAt && expiresAt > now),
      serverNow: now.toISOString(),
    };
  }

  private async withResolvedAiAgentNames<T extends { meta: Prisma.JsonValue }>(
    items: T[],
  ): Promise<T[]> {
    const runIds = aiRunIdsMissingAgentName(items.map((item) => item.meta));
    if (runIds.length === 0) return items;

    const runs = await this.prisma.aiRun.findMany({
      where: { id: { in: runIds } },
      select: { id: true, agent: { select: { name: true } } },
    });
    const namesByRunId = new Map<string, string>();
    for (const run of runs) {
      const name = run.agent.name.trim();
      if (name) namesByRunId.set(run.id, name);
    }
    return mergeAiAgentNames(items, namesByRunId);
  }
}
