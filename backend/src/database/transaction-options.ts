export type InteractiveTransactionOptions = {
  maxWait: number;
  timeout: number;
};

/**
 * Cloud SQL can add seconds of latency while the worker is under load.
 * Keep this shared so interactive transactions do not silently fall back to
 * Prisma's 2s max-wait / 5s execution defaults.
 */
export const PRISMA_INTERACTIVE_TRANSACTION_OPTIONS: InteractiveTransactionOptions = {
  maxWait: 10_000,
  timeout: 15_000,
};
