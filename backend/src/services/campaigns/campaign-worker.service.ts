import { CampaignMessageService } from './campaign-message.service';
import type { CampaignRecipient } from '@prisma/client';
import { formatPhoneForMeta } from '../../utils/phone-normalizer';
import { PostgresRateLimiter } from '../postgres-rate-limiter.service';
import { PrismaService } from '../prisma.service';
import {
  BackgroundTaskDispatcher,
  BackgroundTaskResult,
} from '../tasks/cloud-tasks-dispatcher.service';
import type { MetaTemplate } from '../templates/template-management.service';
import { WhatsAppLineConfigResolver } from '../whatsapp/whatsapp-line-config.resolver';
import { buildCampaignPayload } from './campaign-contract';

const BATCH_SIZE = 25;
const CONCURRENCY = 5;
const MAX_ATTEMPTS = 5;
const rate = Number(process.env.CAMPAIGN_MESSAGES_PER_SECOND ?? 5);
if (!Number.isInteger(rate) || rate < 1 || rate > 80)
  throw new Error('CAMPAIGN_MESSAGES_PER_SECOND debe ser 1–80');

export function retryDelay(attempt: number, retryAfter: string | null, now = Date.now()): number {
  const seconds =
    retryAfter && /^\d+$/.test(retryAfter)
      ? Number(retryAfter) * 1000
      : retryAfter
        ? Date.parse(retryAfter) - now
        : 0;
  return Math.max(
    Number.isFinite(seconds) ? seconds : 0,
    Math.min(300_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 1000),
  );
}
export class CampaignWorkerService {
  private readonly limiter: PostgresRateLimiter;
  private readonly resolver: WhatsAppLineConfigResolver;
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher?: BackgroundTaskDispatcher,
  ) {
    this.limiter = new PostgresRateLimiter(prisma);
    this.resolver = new WhatsAppLineConfigResolver(prisma);
  }

  async processBatch(id: string): Promise<BackgroundTaskResult> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return 'not_found';
    // Never replay an HTTP call whose outcome may already exist at Meta.
    await this.prisma.campaignRecipient.updateMany({
      where: {
        campaignId: id,
        dispatchState: 'sending',
        lockedAt: { lt: new Date(Date.now() - 120_000) },
      },
      data: { dispatchState: 'uncertain', errorCode: 'STALE_SEND_REVIEW_REQUIRED' },
    });
    const rows = await this.prisma.campaignRecipient.findMany({
      where: { campaignId: id, dispatchState: 'queued', nextAttemptAt: { lte: new Date() } },
      orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
    });
    if (rows.length) {
      // Resolve credentials before claiming any recipient: config failures remain retryable.
      const config = await this.resolver.resolve({ lineId: campaign.lineId, allowDefault: false });
      if (config.phoneNumberId !== campaign.phoneNumberId)
        throw new Error('La línea de la campaña cambió de número');
      await this.prisma.campaign.update({ where: { id }, data: { status: 'running' } });
      for (let offset = 0; offset < rows.length; offset += CONCURRENCY) {
        const results = await Promise.allSettled(
          rows
            .slice(offset, offset + CONCURRENCY)
            .map((row) =>
              this.send(row, campaign.templateSnapshot as unknown as MetaTemplate, config),
            ),
        );
        if (results.some((r) => r.status === 'rejected'))
          throw new Error('No se pudo persistir un resultado del lote');
      }
    }
    const unprojected = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT r.id FROM campaign_recipients r WHERE r.campaign_id = ${id}::uuid AND r.message_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.idempotency_key = 'campaign:' || r.id::text) LIMIT 25`;
    for (const row of unprojected) await new CampaignMessageService(this.prisma).sync(row.id);
    await this.refreshStatus(id);
    const next = await this.prisma.campaignRecipient.findFirst({
      where: { campaignId: id, dispatchState: 'queued' },
      orderBy: { nextAttemptAt: 'asc' },
    });
    if (next) {
      const when = Math.max(Date.now() + 1000, next.nextAttemptAt.getTime());
      await this.dispatcher?.dispatchCampaign?.(id, { seconds: Math.ceil(when / 1000) });
    }
    return rows.length ? 'processed' : 'noop';
  }

  private async send(
    row: CampaignRecipient,
    template: MetaTemplate,
    config: Awaited<ReturnType<WhatsAppLineConfigResolver['resolve']>>,
  ) {
    // Shared across campaign workers/instances for this sending number.
    if ((await this.limiter.increment('campaign-send', config.phoneNumberId, 1)) > rate) {
      await this.prisma.campaignRecipient.updateMany({
        where: { id: row.id, dispatchState: 'queued' },
        data: { nextAttemptAt: new Date(Date.now() + 1000) },
      });
      return;
    }
    const payload = buildCampaignPayload(
      template,
      row.variables as Record<string, string>,
      formatPhoneForMeta(row.phone),
      row.id,
    );
    const claim = await this.prisma.campaignRecipient.updateMany({
      where: { id: row.id, dispatchState: 'queued', nextAttemptAt: { lte: new Date() } },
      data: {
        dispatchState: 'sending',
        lockedAt: new Date(),
        attempts: { increment: 1 },
        errorCode: null,
      },
    });
    if (!claim.count) return;
    const where = { id: row.id, dispatchState: 'sending' as const };
    let response: Response;
    try {
      response = await fetch(config.messagesUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      await this.prisma.campaignRecipient.updateMany({
        where,
        data: { dispatchState: 'uncertain', errorCode: 'NETWORK_OUTCOME_UNKNOWN' },
      });
      return;
    }
    let body: { messages?: Array<{ id?: string }>; error?: { code?: number } } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      /* Classified by HTTP status below. */
    }
    if (response.ok && typeof body.messages?.[0]?.id === 'string' && body.messages[0].id) {
      // A fast webhook may already have attached the wamid and advanced the status.
      await this.prisma.campaignRecipient.updateMany({
        where: { ...where, messageId: null },
        data: {
          messageId: body.messages[0].id,
          dispatchState: 'accepted',
          acceptedAt: new Date(),
          lockedAt: null,
        },
      });
      await new CampaignMessageService(this.prisma).sync(row.id);
      return;
    }
    const throttled =
      response.status === 429 ||
      (!response.ok && [4, 80007, 130429, 131048, 131056].includes(body.error?.code ?? 0));
    const attempt = row.attempts + 1;
    if (throttled && attempt < MAX_ATTEMPTS) {
      await this.prisma.campaignRecipient.updateMany({
        where,
        data: {
          dispatchState: 'queued',
          lockedAt: null,
          nextAttemptAt: new Date(
            Date.now() + retryDelay(attempt, response.headers.get('retry-after')),
          ),
          errorCode: String(body.error?.code ?? response.status),
        },
      });
    } else if (response.status >= 500 || response.ok) {
      await this.prisma.campaignRecipient.updateMany({
        where,
        data: { dispatchState: 'uncertain', errorCode: 'META_OUTCOME_UNKNOWN' },
      });
    } else {
      await this.prisma.campaignRecipient.updateMany({
        where,
        data: {
          dispatchState: 'finished',
          status: 'failed',
          failedAt: new Date(),
          lockedAt: null,
          errorCode: String(body.error?.code ?? response.status),
        },
      });
    }
  }

  async refreshStatus(id: string): Promise<void> {
    // One statement/snapshot avoids stale counters overwriting a newer state.
    await this.prisma.$executeRaw`
      UPDATE campaigns c SET status = CASE
        WHEN EXISTS (SELECT 1 FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.dispatch_state IN ('queued', 'sending')) THEN 'running'::"CampaignStatus"
        WHEN EXISTS (SELECT 1 FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.dispatch_state = 'uncertain') THEN 'needs_review'::"CampaignStatus"
        ELSE 'completed'::"CampaignStatus" END, updated_at = NOW()
      WHERE c.id = ${id}::uuid`;
  }

  start(): () => void {
    let stopped = false;
    let timer: NodeJS.Timeout;
    const tick = async () => {
      try {
        const campaigns = await this.prisma.campaign.findMany({
          where: { status: { in: ['queued', 'running', 'needs_review'] } },
          orderBy: { updatedAt: 'asc' },
          take: 10,
          select: { id: true },
        });
        for (const c of campaigns) {
          if (stopped) break;
          try {
            await this.processBatch(c.id);
          } catch {
            console.error('[Campaign] Lote pendiente de recuperación', { campaignId: c.id });
          }
        }
      } finally {
        if (!stopped)
          timer = setTimeout(() => {
            void tick().catch(() => console.error('[Campaign] Poll fallido'));
          }, 1000);
      }
    };
    void tick().catch(() => console.error('[Campaign] Poll fallido'));
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }
}
