/**
 * Normaliza campaign_recipients.phone al formato requerido por Meta.
 *
 * El script es dry-run por defecto, procesa filas por lotes y nunca fusiona
 * destinatarios que colisionen después de normalizar.
 *
 * Uso (desde backend/):
 *   pnpm ts-node --project scripts/tsconfig.json scripts/migrations/backfill-campaign-recipient-phones.ts
 *   DRY_RUN=false pnpm ts-node --project scripts/tsconfig.json scripts/migrations/backfill-campaign-recipient-phones.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../.env') });

import { Prisma, PrismaClient } from '@prisma/client';
import { formatPhoneForMeta } from '../../src/utils/phone-normalizer';

const prisma = new PrismaClient();
const DRY_RUN = process.env['DRY_RUN'] !== 'false';
const requestedBatchSize = Number(process.env['BATCH_SIZE'] ?? 500);
const BATCH_SIZE =
  Number.isInteger(requestedBatchSize) && requestedBatchSize >= 1 && requestedBatchSize <= 2000
    ? requestedBatchSize
    : 500;

type Stats = {
  reviewed: number;
  corrected: number;
  alreadyCanonical: number;
  rejected: number;
  conflicts: number;
};

function log(level: 'info' | 'warn' | 'error', event: string, data?: object): void {
  const message = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    script: 'backfill-campaign-recipient-phones',
    event,
    dryRun: DRY_RUN,
    ...data,
  });
  if (level === 'error') console.error(message);
  else if (level === 'warn') console.warn(message);
  else console.log(message);
}

async function hasNormalizationConflict(
  recipient: { id: string; campaignId: string },
  normalizedPhone: string,
): Promise<boolean> {
  const siblings = await prisma.campaignRecipient.findMany({
    where: { campaignId: recipient.campaignId, id: { not: recipient.id } },
    select: { phone: true },
  });
  return siblings.some((sibling) => formatPhoneForMeta(sibling.phone) === normalizedPhone);
}

async function main(): Promise<void> {
  const stats: Stats = {
    reviewed: 0,
    corrected: 0,
    alreadyCanonical: 0,
    rejected: 0,
    conflicts: 0,
  };
  let cursor: string | undefined;

  log('info', 'migration.start', { batchSize: BATCH_SIZE });

  while (true) {
    const rows = await prisma.campaignRecipient.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, campaignId: true, phone: true },
    });
    if (!rows.length) break;

    for (const row of rows) {
      stats.reviewed += 1;
      const normalizedPhone = formatPhoneForMeta(row.phone);

      if (normalizedPhone === row.phone) {
        stats.alreadyCanonical += 1;
        continue;
      }
      if (!/^[1-9]\d{7,14}$/.test(normalizedPhone)) {
        stats.rejected += 1;
        log('warn', 'recipient.rejected', { recipientId: row.id, campaignId: row.campaignId });
        continue;
      }
      if (await hasNormalizationConflict(row, normalizedPhone)) {
        stats.conflicts += 1;
        log('warn', 'recipient.conflict', { recipientId: row.id, campaignId: row.campaignId });
        continue;
      }

      if (!DRY_RUN) {
        try {
          await prisma.campaignRecipient.update({
            where: { id: row.id },
            data: { phone: normalizedPhone },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            stats.conflicts += 1;
            log('warn', 'recipient.concurrent_conflict', {
              recipientId: row.id,
              campaignId: row.campaignId,
            });
            continue;
          }
          throw error;
        }
      }
      stats.corrected += 1;
    }

    cursor = rows.at(-1)!.id;
    log('info', 'batch.complete', { cursor, ...stats });
  }

  log('info', 'migration.complete', stats);
}

void main()
  .catch((error: unknown) => {
    log('error', 'migration.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
