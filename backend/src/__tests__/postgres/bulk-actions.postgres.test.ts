import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AuthorizationService } from '../../services/authorization.service';
import { BulkActionQueue } from '../../services/bulk/bulk-action-queue.service';
import { BulkActionWorker } from '../../services/bulk/bulk-action-worker.service';
import { BULK_PERMISSIONS } from '../../services/bulk/bulk-action.schema';
import type { PrismaService } from '../../services/prisma.service';

// Only a uniquely named temporary schema is created and removed; public data is untouched.
const schema = `bulk_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set('schema', schema);
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const db = prisma as PrismaService;
const queue = new BulkActionQueue(db);
const actor = randomUUID();
const transfer = jest.fn<() => Promise<never>>();
const makeWorker = () => new BulkActionWorker(db, { transfer } as never, {} as never, {} as never);

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const sql = readFileSync(
    resolve(
      __dirname,
      '../../../prisma/migrations/20261014170000_conversation_bulk_jobs/migration.sql',
    ),
    'utf8',
  );
  for (const statement of sql.split(';').filter((part) => part.trim()))
    await prisma.$executeRawUnsafe(statement);
});
beforeEach(async () => {
  await prisma.conversationBulkJob.deleteMany({ where: { actorId: actor } });
  transfer.mockReset();
  transfer.mockResolvedValue(undefined as never);
  jest
    .spyOn(AuthorizationService.prototype, 'getUserPermissionSlugs')
    .mockResolvedValue(BULK_PERMISSIONS);
});
afterAll(async () => {
  jest.restoreAllMocks();
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await prisma.$disconnect();
});

describe('durable bulk queue with PostgreSQL', () => {
  it('persists a single job on concurrent retries and scopes results to its owner', async () => {
    const key = randomUUID();
    const payload = { action: 'activate_bot' as const, conversation_ids: [randomUUID()] };
    const [a, b] = await Promise.all([
      queue.enqueue(actor, key, payload),
      queue.enqueue(actor, key, payload),
    ]);
    expect(a.job_id).toBe(b.job_id);
    expect(await prisma.conversationBulkItem.count()).toBe(1);
    await expect(queue.status(randomUUID(), a.job_id)).rejects.toThrow('no encontrado');
  });
  it('limits concurrent replicas to one chunk and isolates item failures', async () => {
    transfer.mockRejectedValueOnce(new Error('provider unavailable'));
    const job = await queue.enqueue(actor, randomUUID(), {
      action: 'activate_bot',
      conversation_ids: Array.from({ length: 12 }, () => randomUUID()),
    });
    await Promise.all([makeWorker().tick(), makeWorker().tick()]);
    expect(transfer).toHaveBeenCalledTimes(10);
    expect(await prisma.conversationBulkItem.count({ where: { status: 'pending' } })).toBe(2);
    expect(await prisma.conversationBulkItem.count({ where: { status: 'uncertain' } })).toBe(1);
    await prisma.conversationBulkItem.updateMany({
      where: { claimedAt: { not: null } },
      data: { claimedAt: new Date(Date.now() - 2000) },
    });
    await makeWorker().tick();
    expect((await queue.status(actor, job.job_id)).done).toBe(true);
    expect(transfer).toHaveBeenCalledTimes(12);
  });
  it('marks abandoned claims uncertain without replaying their side effects', async () => {
    await queue.enqueue(actor, randomUUID(), {
      action: 'activate_bot',
      conversation_ids: [randomUUID()],
    });
    await prisma.conversationBulkItem.updateMany({
      data: { status: 'running', claimedAt: new Date(Date.now() - 360_000) },
    });
    await makeWorker().tick();
    expect(transfer).not.toHaveBeenCalled();
    expect(await prisma.conversationBulkItem.count({ where: { status: 'uncertain' } })).toBe(1);
  });
});
