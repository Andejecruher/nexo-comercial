/**
 * Instancia singleton del cliente Prisma para toda la aplicación.
 *
 * Cloud Run + Cloud SQL: ver `resolveDatasourceUrl`. El runtime (API/worker)
 * usa PrismaService con las mismas opciones; este singleton es para imports
 * directos y hot-reload en desarrollo.
 */
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.config';
import { prismaClientOptions } from './prisma-client-options';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prismaClient: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient(prismaClientOptions());

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaClient;
}
