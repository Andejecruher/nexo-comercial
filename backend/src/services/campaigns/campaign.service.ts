import { createHash, randomUUID } from 'crypto';
import { Prisma, type Campaign, type CampaignRecipient } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { TemplateManagementService } from '../templates/template-management.service';
import { BackgroundTaskDispatcher } from '../tasks/cloud-tasks-dispatcher.service';
import { AppError } from '../../utils/app-error';
import {
  CampaignInput,
  campaignMediaType,
  citizenFields,
  normalizePhone,
  resolveVariables,
  templateVariables,
} from './campaign-contract';

type CampaignSummary = Pick<Campaign, 'id' | 'name' | 'purpose' | 'status' | 'total' | 'createdAt'>;
type CampaignDetail = CampaignSummary & {
  counts: Record<CampaignRecipient['status'], number>;
  deliveredTotal: number;
  sentTotal: number;
  uncertain: number;
  recipients: Array<
    Pick<CampaignRecipient, 'id' | 'phone' | 'status' | 'dispatchState' | 'errorCode' | 'messageId'>
  >;
  page: number;
  pageSize: number;
};

export class CampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher?: BackgroundTaskDispatcher,
  ) {}

  async create(
    input: CampaignInput,
    userId: string,
    idempotencyKey: string,
  ): Promise<Pick<Campaign, 'id' | 'total' | 'status'>> {
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = await this.prisma.campaign.findUnique({
      where: { createdBy_idempotencyKey: { createdBy: userId, idempotencyKey } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw AppError.conflict('La clave de idempotencia ya se usó con otros datos');
      return { id: existing.id, total: existing.total, status: existing.status };
    }
    const templates = new TemplateManagementService(this.prisma);
    const config = await templates.config(input.lineId);
    const template = await templates.assertOwnership(input.lineId, input.templateId);
    const variables = templateVariables(template);
    const mediaType = campaignMediaType(template);
    const attachment = input.attachmentId
      ? await this.prisma.campaignAttachment.findFirst({
          where: {
            id: input.attachmentId,
            createdBy: userId,
            lineId: input.lineId,
            templateId: input.templateId,
            campaignId: null,
          },
        })
      : null;
    if (
      (mediaType && (!attachment || attachment.mediaType !== mediaType)) ||
      (!mediaType && input.attachmentId)
    )
      throw AppError.badRequest('Carga un adjunto compatible con esta plantilla y campaña');
    const recipients: Array<{
      phone: string;
      citizenId?: string;
      variables: Record<string, string>;
    }> = [];
    const seen = new Set<string>();
    const add = (row: Record<string, string>, rawPhone: string, citizenId?: string) => {
      const phone = normalizePhone(rawPhone);
      if (seen.has(phone)) throw AppError.badRequest('Hay teléfonos duplicados en la audiencia');
      seen.add(phone);
      recipients.push({
        phone,
        citizenId,
        variables: {
          ...resolveVariables(variables, input.mappings, row),
          ...(attachment ? { 'header.media': attachment.url } : {}),
        },
      });
    };
    if (input.audience.source === 'citizen') {
      if (
        Object.values(input.mappings).some(
          (m) =>
            m.mode === 'dynamic' &&
            !citizenFields.includes(m.field as (typeof citizenFields)[number]),
        )
      )
        throw AppError.badRequest('Campo de ciudadano no permitido');
      const ids = [...new Set(input.audience.citizenIds)];
      const citizens = await this.prisma.citizen.findMany({
        where: { id: { in: ids }, consentGiven: true, phone: { not: null } },
        select: {
          id: true,
          name: true,
          lastName: true,
          phone: true,
          email: true,
          neighborhood: true,
        },
      });
      if (citizens.length !== ids.length)
        throw AppError.badRequest('Hay ciudadanos sin teléfono, consentimiento o inexistentes');
      for (const citizen of citizens)
        add(
          Object.fromEntries(citizenFields.map((k) => [k, citizen[k] ?? ''])),
          citizen.phone!,
          citizen.id,
        );
    } else {
      for (const row of input.audience.rows) {
        if (Object.keys(row).length > 100) throw AppError.badRequest('Máximo 100 columnas');
        add(
          row,
          Object.prototype.hasOwnProperty.call(row, input.audience.phoneColumn)
            ? row[input.audience.phoneColumn]
            : '',
        );
      }
    }
    const id = attachment?.id ?? randomUUID();
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.campaign.create({
            data: {
              id,
              name: input.name,
              purpose: input.purpose,
              lineId: input.lineId,
              phoneNumberId: config.phoneNumberId,
              templateId: template.id,
              templateSnapshot: template as unknown as Prisma.InputJsonValue,
              mappings: input.mappings,
              source: input.audience.source,
              total: recipients.length,
              createdBy: userId,
              consentConfirmedAt: new Date(),
              idempotencyKey,
              requestHash,
            },
          });
          if (attachment) {
            const claimed = await tx.campaignAttachment.updateMany({
              where: { id: attachment.id, createdBy: userId, campaignId: null },
              data: { campaignId: id },
            });
            if (claimed.count !== 1)
              throw AppError.conflict('El adjunto ya pertenece a otra campaña');
          }
          for (let offset = 0; offset < recipients.length; offset += 500)
            await tx.campaignRecipient.createMany({
              data: recipients.slice(offset, offset + 500).map((r) => ({ ...r, campaignId: id })),
            });
        },
        { timeout: 30_000 },
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const winner = await this.prisma.campaign.findUnique({
          where: { createdBy_idempotencyKey: { createdBy: userId, idempotencyKey } },
        });
        if (winner?.requestHash === requestHash)
          return { id: winner.id, total: winner.total, status: winner.status };
        if (winner) throw AppError.conflict('La clave de idempotencia ya se usó con otros datos');
      }
      throw error;
    }
    // DB is the durable queue/outbox. Reconciliation recovers any enqueue failure.
    await this.dispatcher?.dispatchCampaign?.(id).catch(() => {
      console.warn('[Campaign] Dispatch pendiente de reconciliación', { campaignId: id });
    });
    return { id, total: recipients.length, status: 'queued' };
  }

  async list(
    page: number,
  ): Promise<{ rows: CampaignSummary[]; total: number; page: number; pageSize: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 25,
        take: 25,
        select: { id: true, name: true, purpose: true, status: true, total: true, createdAt: true },
      }),
      this.prisma.campaign.count(),
    ]);
    return { rows, total, page, pageSize: 25 };
  }
  async detail(id: string, page: number): Promise<CampaignDetail> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        purpose: true,
        status: true,
        total: true,
        createdAt: true,
      },
    });
    if (!campaign) throw AppError.notFound('Campaña inexistente');
    const { groups, dispatch, recipients } = await this.prisma.$transaction(
      async (tx) => {
        const groups = await tx.campaignRecipient.groupBy({
          by: ['status'],
          where: { campaignId: id },
          _count: { _all: true },
        });
        const dispatch = await tx.campaignRecipient.groupBy({
          by: ['dispatchState'],
          where: { campaignId: id },
          _count: { _all: true },
        });
        const recipients = await tx.campaignRecipient.findMany({
          where: { campaignId: id },
          orderBy: { id: 'asc' },
          skip: (page - 1) * 50,
          take: 50,
          select: {
            id: true,
            phone: true,
            status: true,
            dispatchState: true,
            errorCode: true,
            messageId: true,
          },
        });
        return { groups, dispatch, recipients };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    const counts = { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
    for (const g of groups) counts[g.status] = g._count._all;
    return {
      ...campaign,
      counts,
      deliveredTotal: counts.delivered + counts.read,
      sentTotal: counts.sent + counts.delivered + counts.read,
      uncertain: dispatch.find((g) => g.dispatchState === 'uncertain')?._count._all ?? 0,
      recipients,
      page,
      pageSize: 50,
    };
  }
}
