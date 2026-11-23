/**
 * fix-fsm-states.ts — Migration script: FSM V2 state normalization.
 *
 * Purpose:
 *  - Migrar conversaciones en HUMAN_FLOW sin assignedUserId
 *    a DEPARTMENT_ROUTING para que la IA pueda retomarlas.
 *  - Idempotente: puede ejecutarse múltiples veces sin efectos adicionales.
 *  - Usa Prisma transaction para atomicidad.
 *
 * Usage:
 *   npx ts-node scripts/migrations/fix-fsm-states.ts
 *
 * Dry-run (no writes):
 *   DRY_RUN=true npx ts-node scripts/migrations/fix-fsm-states.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.env['DRY_RUN'] === 'true';

function log(level: 'info' | 'warn' | 'error', event: string, data?: object): void {
  console[level](JSON.stringify({
    ts: new Date().toISOString(),
    level,
    script: 'fix-fsm-states',
    event,
    dryRun: DRY_RUN,
    ...data,
  }));
}

async function main(): Promise<void> {
  log('info', 'migration.start');

  // 1. Find orphan HUMAN_FLOW conversations: no assignedUserId on Conversation
  const orphans = await prisma.conversationMeta.findMany({
    where: {
      flowState: 'HUMAN_FLOW',
      conversation: {
        assignedUserId: null,
      },
    },
    select: {
      id: true,
      conversationId: true,
      flowState: true,
      version: true,
    },
  });

  log('info', 'migration.orphans_found', { count: orphans.length });

  if (orphans.length === 0) {
    log('info', 'migration.nothing_to_do');
    return;
  }

  if (DRY_RUN) {
    log('info', 'migration.dry_run_only', {
      wouldMigrate: orphans.map((o) => o.conversationId),
    });
    return;
  }

  // 2. Migrate each in a transaction (idempotent via WHERE guard)
  let migrated = 0;
  let skipped = 0;

  for (const orphan of orphans) {
    try {
      await prisma.$transaction(async (tx) => {
        // Re-check inside transaction to guard against race conditions
        const current = await tx.conversationMeta.findUnique({
          where: { conversationId: orphan.conversationId },
          select: { flowState: true },
        });

        if (!current || current.flowState !== 'HUMAN_FLOW') {
          // Already migrated or state changed — skip idempotently
          skipped++;
          return;
        }

        await tx.conversationMeta.update({
          where: { conversationId: orphan.conversationId },
          data: {
            flowState: 'DEPARTMENT_ROUTING',
            version: { increment: 1 },
          },
        });

        migrated++;
      });

      log('info', 'migration.conversation_migrated', {
        conversationId: orphan.conversationId,
        fromState: 'HUMAN_FLOW',
        toState: 'DEPARTMENT_ROUTING',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('error', 'migration.conversation_failed', {
        conversationId: orphan.conversationId,
        message,
      });
    }
  }

  log('info', 'migration.complete', { migrated, skipped, total: orphans.length });
}

main()
  .catch((err) => {
    log('error', 'migration.fatal', { message: String(err) });
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
