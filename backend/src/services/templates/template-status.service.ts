import { createHash } from 'crypto';
import { z } from 'zod';
import type { PrismaService } from '../prisma.service';

const payloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      time: z.number().optional(),
      changes: z.array(z.object({ field: z.string(), value: z.unknown() })),
    }),
  ),
});
const valueSchema = z.object({
  message_template_id: z.union([z.string(), z.number().int().safe()]).transform(String),
  message_template_name: z.string(),
  event: z.string(),
  reason: z.string().nullish(),
});
interface ParsedTemplateUpdate {
  wabaId: string;
  templateId: string;
  templateName: string;
  status: string;
  reason?: string;
  occurredAt: Date;
  dedupeKey: string;
}
interface TemplateStreamEvent {
  id: string;
  waba_id: string;
  message_template_id: string;
  message_template_name: string;
  event: string;
  reason: string | null;
  occurred_at: string;
}
export function parseTemplateStatusUpdates(payload: unknown): ParsedTemplateUpdate[] {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return [];
  return parsed.data.entry.flatMap((entry) =>
    entry.changes.flatMap((change) => {
      if (change.field !== 'message_template_status_update') return [];
      const value = valueSchema.safeParse(change.value);
      if (!value.success) return [];
      const v = value.data;
      return [
        {
          wabaId: entry.id,
          templateId: v.message_template_id,
          templateName: v.message_template_name,
          status: v.event,
          reason: v.reason ?? undefined,
          occurredAt: new Date((entry.time ?? Date.now() / 1000) * 1000),
          // Without an entry time do not deduplicate legitimate repeated transitions.
          dedupeKey: createHash('sha256')
            .update(JSON.stringify([entry.id, entry.time ?? Date.now(), v]))
            .digest('hex'),
        },
      ];
    }),
  );
}
export class TemplateStatusService {
  constructor(private readonly prisma: PrismaService) {}
  async ingest(payload: unknown): Promise<void> {
    const updates = parseTemplateStatusUpdates(payload);
    if (!updates.length) return;
    await this.prisma.$transaction(async (tx) => {
      // Serialize event ID allocation/commit so replay cursors cannot skip concurrent commits.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(748212031)`;
      for (const data of updates)
        await tx.templateStatusEvent.upsert({
          where: { dedupeKey: data.dedupeKey },
          create: data,
          update: {},
        });
    });
  }
  async cursor(wabaId: string): Promise<string> {
    const last = await this.prisma.templateStatusEvent.findFirst({
      where: { wabaId },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    return String(last?.id ?? 0);
  }
  async since(wabaId: string, cursor: string): Promise<TemplateStreamEvent[]> {
    const rows = await this.prisma.templateStatusEvent.findMany({
      where: { wabaId, id: { gt: BigInt(cursor) } },
      orderBy: { id: 'asc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: String(r.id),
      waba_id: r.wabaId,
      message_template_id: r.templateId,
      message_template_name: r.templateName,
      event: r.status,
      reason: r.reason,
      occurred_at: r.occurredAt.toISOString(),
    }));
  }
}
