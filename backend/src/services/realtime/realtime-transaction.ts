import { logRealtimeBoundary } from './realtime-observability.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { RealtimeNotifier } from './realtime-notifier.service';

const transactionEvents = new WeakMap<object, string[]>();

/** Called only after the outbox insert succeeds, while the transaction is open. */
export function recordRealtimeEvent(tx: object, eventId: string): void {
  transactionEvents.get(tx)?.push(eventId);
}

/** Publish only after Prisma confirms commit; rollback discards the collected IDs. */
export async function withRealtimeTransaction<T>(
  prisma: PrismaService,
  notifier: RealtimeNotifier | undefined,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number },
): Promise<T> {
  const eventIds: string[] = [];
  const result = await prisma.$transaction(async (tx) => {
    transactionEvents.set(tx, eventIds);
    try {
      return await work(tx);
    } finally {
      transactionEvents.delete(tx);
    }
  }, options);
  for (const eventId of eventIds)
    logRealtimeBoundary('info', 'RealtimeTransaction', 'outbox.commit', {
      eventId,
      status: 'committed',
    });
  await notifier?.publishCommitted?.(eventIds);
  return result;
}
