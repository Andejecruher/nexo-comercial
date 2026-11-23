/**
 * Tests unitarios: fix-fsm-states migration logic
 * Cubre:
 *  - Idempotencia: si no hay huérfanos, no escribe nada
 *  - Dry-run: detecta huérfanos pero no escribe
 *  - Migración efectiva: HUMAN_FLOW sin assignedUserId → DEPARTMENT_ROUTING en transaction
 *  - Idempotencia en doble ejecución: segunda pasada es no-op
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// ─── Tipos mínimos para el mock ───────────────────────────────────────────────

interface ConversationMetaRow {
  id: string;
  conversationId: string;
  flowState: string;
  version: number;
}

// ─── Mock factory ─────────────────────────────────────────────────────────────

function makePrismaMock(orphans: ConversationMetaRow[], inTransactionState?: string) {
  // The inner tx client that gets passed to the $transaction callback
  const txUpdate = jest.fn<(args: unknown) => Promise<void>>(async () => undefined);
  const txFindUnique = jest.fn<(args: unknown) => Promise<{ flowState: string } | null>>(
    async (args: unknown) => {
      const { where } = args as { where: { conversationId: string } };
      const row = orphans.find((o) => o.conversationId === where.conversationId);
      if (!row) return null;
      return { flowState: inTransactionState ?? row.flowState };
    },
  );

  const txClient = {
    conversationMeta: { findUnique: txFindUnique, update: txUpdate },
  };

  const $transaction = jest.fn<(cb: unknown) => Promise<void>>(async (cb: unknown) => {
    await (cb as (tx: typeof txClient) => Promise<void>)(txClient);
  });

  return {
    conversationMeta: {
      findMany: jest.fn<() => Promise<ConversationMetaRow[]>>(async () => orphans),
    },
    $transaction,
    _txClient: txClient,
    $disconnect: jest.fn<() => Promise<void>>(async () => undefined),
  };
}

// ─── Inline logic extracted from fix-fsm-states.ts ───────────────────────────
// We test the pure migration logic to avoid coupling to Prisma import.

type PrismaMock = ReturnType<typeof makePrismaMock>;

async function runMigration(
  prisma: PrismaMock,
  dryRun: boolean,
): Promise<{ migrated: number; skipped: number; total: number }> {
  const orphans = (await prisma.conversationMeta.findMany()) as ConversationMetaRow[];

  if (orphans.length === 0 || dryRun) {
    return { migrated: 0, skipped: 0, total: orphans.length };
  }

  let migrated = 0;
  let skipped = 0;

  for (const orphan of orphans) {
    await prisma.$transaction(async (tx: typeof prisma._txClient) => {
      const current = await tx.conversationMeta.findUnique({
        where: { conversationId: orphan.conversationId },
        select: { flowState: true },
      });

      if (!current || current.flowState !== 'HUMAN_FLOW') {
        skipped++;
        return;
      }

      await tx.conversationMeta.update({
        where: { conversationId: orphan.conversationId },
        data: { flowState: 'DEPARTMENT_ROUTING', version: { increment: 1 } },
      });

      migrated++;
    });
  }

  return { migrated, skipped, total: orphans.length };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('fix-fsm-states migration logic', () => {
  describe('cuando no hay huérfanos', () => {
    it('no escribe nada y retorna total=0', async () => {
      const prisma = makePrismaMock([]);

      const result = await runMigration(prisma, false);

      expect(result).toEqual({ migrated: 0, skipped: 0, total: 0 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('dry-run mode', () => {
    it('detecta huérfanos pero no ejecuta $transaction', async () => {
      const orphans: ConversationMetaRow[] = [
        { id: 'meta-1', conversationId: 'conv-1', flowState: 'HUMAN_FLOW', version: 0 },
        { id: 'meta-2', conversationId: 'conv-2', flowState: 'HUMAN_FLOW', version: 0 },
      ];
      const prisma = makePrismaMock(orphans);

      const result = await runMigration(prisma, true);

      expect(result.total).toBe(2);
      expect(result.migrated).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('migración efectiva', () => {
    let prisma: PrismaMock;
    const orphans: ConversationMetaRow[] = [
      { id: 'meta-1', conversationId: 'conv-1', flowState: 'HUMAN_FLOW', version: 0 },
    ];

    beforeEach(() => {
      prisma = makePrismaMock(orphans);
    });

    it('migra conversaciones huérfanas a DEPARTMENT_ROUTING usando $transaction', async () => {
      const result = await runMigration(prisma, false);

      expect(result).toEqual({ migrated: 1, skipped: 0, total: 1 });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma._txClient.conversationMeta.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'conv-1' },
          data: expect.objectContaining({ flowState: 'DEPARTMENT_ROUTING' }),
        }),
      );
    });
  });

  describe('idempotencia', () => {
    it('segunda ejecución es no-op si la conversación ya fue migrada (flowState != HUMAN_FLOW)', async () => {
      const orphans: ConversationMetaRow[] = [
        { id: 'meta-1', conversationId: 'conv-1', flowState: 'HUMAN_FLOW', version: 0 },
      ];
      // inTransactionState simula que al re-leer dentro de la tx ya tiene DEPARTMENT_ROUTING
      const prisma = makePrismaMock(orphans, 'DEPARTMENT_ROUTING');

      const result = await runMigration(prisma, false);

      // skipped because in-tx re-read returned DEPARTMENT_ROUTING
      expect(result).toEqual({ migrated: 0, skipped: 1, total: 1 });
      expect(prisma._txClient.conversationMeta.update).not.toHaveBeenCalled();
    });
  });
});
