import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

/** Installs the active Prisma baseline in a disposable PostgreSQL database. */
export async function migrateIsolatedDatabase(admin: PrismaClient, database: string): Promise<URL> {
  if (!/^[a-z][a-z0-9_]+$/.test(database)) throw new Error('Invalid test database name');
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1', 'postgres'].includes(url.hostname)) {
    throw new Error('PostgreSQL integration tests require a local database');
  }
  await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
  url.pathname = `/${database}`;
  url.searchParams.delete('schema');
  execFileSync(
    process.execPath,
    [
      require.resolve('prisma/build/index.js'),
      'migrate',
      'deploy',
      '--schema',
      resolve(__dirname, '../../../prisma/schema.prisma'),
    ],
    { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' },
  );
  return url;
}

export async function dropIsolatedDatabase(admin: PrismaClient, database: string): Promise<void> {
  if (!/^[a-z][a-z0-9_]+$/.test(database)) throw new Error('Invalid test database name');
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}"`);
}
