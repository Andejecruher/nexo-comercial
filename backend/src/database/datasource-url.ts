import { env } from '../config/env.config';

/** Pool size for Cloud Run API instances handling concurrent requests. */
export const DEFAULT_API_PRISMA_CONNECTION_LIMIT = 10;

/** Pool size for the long-lived worker (inbox + outbox + relay + OCR + health). */
export const DEFAULT_WORKER_PRISMA_CONNECTION_LIMIT = 8;

/**
 * Prisma `connection_limit` used when building the Cloud SQL socket URL.
 *
 * Explicit `PRISMA_CONNECTION_LIMIT` wins. Otherwise workers get a pool large
 * enough for concurrent pollers; the API stays at 1 to avoid exhausting Cloud SQL
 * across many serverless instances.
 */
export function prismaConnectionLimit(): number {
  return (
    env.PRISMA_CONNECTION_LIMIT ??
    (env.WORKERS_ENABLED
      ? DEFAULT_WORKER_PRISMA_CONNECTION_LIMIT
      : DEFAULT_API_PRISMA_CONNECTION_LIMIT)
  );
}

/**
 * Cloud SQL UNIX socket URL, or `DATABASE_URL` in local/dev.
 *
 * When `CLOUDSQL_*` are set, `DATABASE_URL`'s `connection_limit` is ignored so
 * the worker can use a larger pool without rotating the shared secret.
 */
export function resolveDatasourceUrl(): string {
  const instance = process.env.CLOUDSQL_INSTANCE_CONNECTION_NAME;
  const user = process.env.CLOUDSQL_DB_USER;
  const pass = process.env.CLOUDSQL_DB_PASS;
  const name = process.env.CLOUDSQL_DB_NAME;

  if (instance && user && pass && name) {
    const usePgbouncer = process.env.CLOUDSQL_USE_PGBOUNCER === 'true';
    const pgbouncer = usePgbouncer ? '&pgbouncer=true' : '';
    const limit = prismaConnectionLimit();
    return `postgresql://${user}:${pass}@localhost/${name}?host=/cloudsql/${instance}&connection_limit=${limit}${pgbouncer}`;
  }

  return env.DATABASE_URL;
}
