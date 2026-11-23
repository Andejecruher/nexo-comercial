import { Prisma } from '@prisma/client';
import { env } from '../config/env.config';
import { resolveDatasourceUrl } from './datasource-url';

/** Shared PrismaClient constructor options for the singleton and PrismaService. */
export function prismaClientOptions(): Prisma.PrismaClientOptions {
  return {
    log: env.NODE_ENV === 'development' ? (['error', 'warn'] as const) : (['error'] as const),
    datasources: { db: { url: resolveDatasourceUrl() } },
  };
}
