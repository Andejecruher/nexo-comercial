import { DeliveryStatusService } from '../services/whatsapp/delivery-status.service';
import { CampaignStatusService } from '../services/campaigns/campaign-status.service';
import { InboundIngestionService } from '../services/ingress/inbound-ingestion.service';
import { ReactionService } from '../services/whatsapp/reaction.service';
/**
 * WebhookController — HTTP adapter para endpoints del webhook de WhatsApp.
 *
 * Flujo del POST:
 * 1. Parsear y validar payload
 * 2. Persistir InboxEvent en DB (para auditoría y replay) — ANTES de responder 200,
 *    para garantizar durabilidad: si la DB falla, se responde 500 y Meta reintenta.
 * 3. Persistir estados de campañas y encolar inbound (o dejar pending para barrido DB)
 * 4. Responder 200 OK a Meta (< 5s)
 * 5. Auditoría (WebhookEventLog) y delivery statuses del chat como best-effort posterior
 *
 * La firma HMAC ya fue validada por metaSignature.middleware.ts.
 * La idempotencia ya fue verificada por idempotency.middleware.ts.
 *
 * Deduplicación en capas (defensa en profundidad):
 *  1. idempotency.middleware (DB por wamid): corta replays de Meta antes del controller.
 *  2. InboxEvent.upsert (DB por wamid): durabilidad + dedupe persistente ante replays.
 *  3. FsmRouterV2 (lease lock en `conversation_meta`): serializa el procesamiento por conversación.
 */
import { TemplateStatusService } from '../services/templates/template-status.service';
import { Request, Response } from 'express';
import { env } from '../config/env.config';
import { MessageRepository } from '../repositories/message.repository';
import { InboxProcessorService } from '../services/events/inbox-processor.service';
import { PrismaService } from '../services/prisma.service';
import { RealtimeNotifier } from '../services/realtime/realtime-notifier.service';
import { WebhookParserService } from '../services/whatsapp/webhook-parser.service';
import { WhatsAppProvider } from '../services/whatsapp/whatsapp.provider';
import { WaWebhookPayload } from '../types/whatsapp.types';
import { createStructuredLogger } from '../utils/structured-logger';

const log = createStructuredLogger('WebhookController');

export class WebhookController {
  private readonly verifyToken: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxProcessor: InboxProcessorService,
    private readonly webhookParser: WebhookParserService,
    private readonly messageRepo: MessageRepository,
    private readonly whatsappProvider?: WhatsAppProvider,
    private readonly realtimeNotifier?: RealtimeNotifier,
    private readonly ingestion?: InboundIngestionService,
  ) {
    this.verifyToken = env.WHATSAPP_VERIFY_TOKEN;
  }

  /**
   * GET /webhook — verificación del webhook por Meta.
   */
  verifyWebhookChallenge = (req: Request, res: Response): void => {
    const mode = req.query['hub.mode'] as string | undefined;
    const token = req.query['hub.verify_token'] as string | undefined;
    const challenge = req.query['hub.challenge'] as string | undefined;

    if (mode === 'subscribe' && token === this.verifyToken) {
      console.log('[WebhookController] Verificación de webhook exitosa');
      res.status(200).send(challenge);
      return;
    }

    console.warn('[WebhookController] Verificación fallida — token inválido o modo incorrecto');
    res.status(403).send('Forbidden');
  };

  /**
   * POST /webhook — recibe mensajes y eventos entrantes de WhatsApp.
   */
  receiveWebhookMessage = async (req: Request, res: Response): Promise<void> => {
    const correlationId = res.locals.correlationId ?? 'unknown';
    const payload = req.body as WaWebhookPayload | undefined;

    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    if (!this.webhookParser.isWhatsAppPayload(payload)) {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    let parsed: ReturnType<WebhookParserService['parse']>;
    try {
      parsed = this.webhookParser.parse(payload);
    } catch (err: unknown) {
      // Payload estructuralmente inválido: reintentar no ayudaría → 200 para no forzar retries.
      console.error('[WebhookController] Error parseando payload, se ignora:', err);
      res.status(200).json({ status: 'ignored', reason: 'unparseable' });
      return;
    }

    // Persistir y encolar mensajes inbound ANTES de responder 200.
    // Garantiza durabilidad: si la DB falla, Meta recibe 500 y reintenta el webhook.
    try {
      await new TemplateStatusService(this.prisma).ingest(payload);
      await new CampaignStatusService(this.prisma).ingest(payload);
      await this.persistInboundMessages(parsed.messages, correlationId);
      // Las reacciones mutan un mensaje existente; nunca crean uno nuevo.
      if (parsed.reactions.length)
        await new ReactionService(this.prisma, this.realtimeNotifier).apply(parsed.reactions);
      if (parsed.statuses.length)
        await this.prisma.webhookEventLog.create({
          data: {
            correlationId,
            processedOk: false,
            rawPayload: {
              kind: 'delivery-receipts-v1',
              attempts: 0,
              statuses: parsed.statuses.map((s) => ({
                wamid: s.wamid,
                status: s.status,
                timestamp: s.timestamp,
                ...(s.errorCode !== undefined ? { errorCode: s.errorCode } : {}),
                ...(s.errorTitle ? { errorTitle: s.errorTitle.slice(0, 255) } : {}),
              })),
            },
          },
        });
    } catch (err: unknown) {
      console.error('[WebhookController] Error persistiendo inbound, se devuelve 500:', err);
      res.status(500).json({ error: 'processing_failed' });
      return;
    }

    // Meta requiere 200 OK en menos de 5 segundos
    res.status(200).json({ status: 'ok' });

    // Auditoría y delivery statuses como best-effort posterior (no bloquean la respuesta)
    void this.recordAudit(payload, correlationId, req.ip);
    void this.persistDeliveryStatuses(parsed.statuses);
  };

  private async persistInboundMessages(
    messages: ReturnType<WebhookParserService['parse']>['messages'],
    correlationId: string,
  ): Promise<void> {
    for (const msg of messages) {
      const inboxEvent = this.ingestion
        ? await this.ingestion.ingest(msg, correlationId)
        : await this.prisma.inboxEvent.upsert({
            where: { wamid: msg.wamid },
            update: {}, // si ya existe (replay), no actualizar
            create: {
              wamid: msg.wamid,
              phone: msg.phone,
              payload: msg as object,
              idempotencyKey: msg.wamid,
            },
          });

      if (inboxEvent.status === 'pending') {
        try {
          await this.inboxProcessor.enqueue(msg, inboxEvent.id);
        } catch (error) {
          if (!this.ingestion) throw error;
          log('warn', 'inbox.dispatch_recoverable', correlationId, {
            inboxEventId: inboxEvent.id,
            error: String(error),
          });
        }

        if (env.BATCHING_WINDOW_MS > 0 && this.whatsappProvider) {
          // Best-effort typing indicator: nunca debe bloquear el 200 ni descartar el evento.
          this.whatsappProvider
            .sendTypingIndicator(msg.phone, msg.wamid, {
              lineExternalIdentifier: msg.phoneNumberId,
              allowDefault: true,
            })
            .catch((err: unknown) => {
              console.warn('[WebhookController] Error enviando typing indicator:', err);
            });
        }
      }
    }
  }

  private async recordAudit(
    payload: WaWebhookPayload,
    correlationId: string,
    ip?: string,
  ): Promise<void> {
    try {
      await this.prisma.webhookEventLog.create({
        data: {
          correlationId,
          rawPayload: {
            object: payload.object,
            entries: payload.entry?.map((entry) => ({
              id: entry.id,
              fields: entry.changes?.map((change) => change.field),
            })),
          },
          ipAddress: ip,
          processedOk: true,
        },
      });
    } catch (err: unknown) {
      console.warn('[WebhookController] Error guardando WebhookEventLog:', err);
    }
  }

  private async persistDeliveryStatuses(
    statuses: ReturnType<WebhookParserService['parse']>['statuses'],
  ): Promise<void> {
    await new DeliveryStatusService(this.prisma, this.messageRepo, this.realtimeNotifier).apply(
      statuses,
    );
  }
}
