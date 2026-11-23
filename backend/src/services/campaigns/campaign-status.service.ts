import { CampaignMessageService } from './campaign-message.service';
import { PrismaService } from '../prisma.service';
import type { WaWebhookPayload } from '../../types/whatsapp.types';
import { formatPhoneForMeta, normalizePhoneForStorage } from '../../utils/phone-normalizer';
import { CampaignWorkerService } from './campaign-worker.service';

export function allowedPreviousStatuses(status: string): string[] {
  // Delivery/read evidence wins over failure; late sent never resurrects failure.
  switch (status) {
    case 'sent':
      return ['pending', 'sent'];
    case 'delivered':
      return ['pending', 'sent', 'failed', 'delivered'];
    case 'read':
      return ['pending', 'sent', 'delivered', 'failed', 'read'];
    case 'failed':
      return ['pending', 'sent', 'failed'];
    default:
      return [];
  }
}
export class CampaignStatusService {
  constructor(private readonly prisma: PrismaService) {}
  async ingest(payload: WaWebhookPayload): Promise<void> {
    const touched = new Set<string>();
    for (const entry of payload.entry ?? [])
      for (const change of entry.changes ?? []) {
        const phoneNumberId = change.value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        for (const status of change.value?.statuses ?? []) {
          if (
            typeof status.id !== 'string' ||
            !status.id ||
            status.id.length > 512 ||
            typeof status.recipient_id !== 'string' ||
            !allowedPreviousStatuses(status.status).length ||
            !/^\d+$/.test(status.timestamp)
          )
            continue;
          const at = new Date(Number(status.timestamp) * 1000);
          if (!Number.isFinite(at.getTime())) continue;
          const callback = status.biz_opaque_callback_data;
          const phoneCandidates = [
            status.recipient_id,
            formatPhoneForMeta(status.recipient_id),
            normalizePhoneForStorage(status.recipient_id),
          ].filter(
            (phone, index, phones) =>
              /^[1-9]\d{7,14}$/.test(phone) && phones.indexOf(phone) === index,
          );
          if (!phoneCandidates.length) continue;
          // The callback is sent before HTTP, closing the webhook-before-response race.
          const row = await this.prisma.campaignRecipient.findFirst({
            where: {
              campaign: { phoneNumberId },
              phone: { in: phoneCandidates },
              OR: [
                { messageId: status.id },
                ...(callback &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callback)
                  ? [
                      {
                        id: callback,
                        messageId: null,
                        dispatchState: { in: ['sending' as const, 'uncertain' as const] },
                      },
                    ]
                  : []),
              ],
            },
            select: { id: true, campaignId: true },
          });
          if (!row) continue; // Ordinary chat messages still flow to the existing handler.
          // Conditional writes are atomic even when Meta calls different API instances.
          await this.prisma.campaignRecipient.updateMany({
            where: { id: row.id, OR: [{ messageId: null }, { messageId: status.id }] },
            data: { messageId: status.id },
          });
          const prior = allowedPreviousStatuses(status.status) as Array<
            'pending' | 'sent' | 'delivered' | 'read' | 'failed'
          >;
          await this.prisma.campaignRecipient.updateMany({
            where: { id: row.id, messageId: status.id, status: { in: prior } },
            data: {
              status: status.status,
              dispatchState: status.status === 'failed' ? 'finished' : 'accepted',
              lockedAt: null,
              errorCode:
                status.status === 'failed'
                  ? String(status.errors?.[0]?.code ?? 'META_FAILED')
                  : null,
            },
          });
          // Record missing milestones without regressing the aggregate state or replacing first evidence.
          const field = {
            sent: 'sentAt',
            delivered: 'deliveredAt',
            read: 'readAt',
            failed: 'failedAt',
          }[status.status];
          await this.prisma.campaignRecipient.updateMany({
            where: { id: row.id, messageId: status.id, [field]: null },
            data: { [field]: at },
          });
          await new CampaignMessageService(this.prisma).sync(row.id);
          touched.add(row.campaignId);
        }
      }
    for (const id of touched) await new CampaignWorkerService(this.prisma).refreshStatus(id);
  }
}
