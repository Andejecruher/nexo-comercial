/**
 * Wrapper de PrismaClient con la misma datasource URL que Cloud SQL / local.
 * Se conecta al iniciar la app y desconecta al recibir señal de cierre.
 */
import { PrismaClient } from '@prisma/client';
import { prismaClientOptions } from '../database/prisma-client-options';
import { createStructuredLogger } from '../utils/structured-logger';

const log = createStructuredLogger('PrismaService');

export class PrismaService extends PrismaClient {
  constructor() {
    super(prismaClientOptions());
  }

  /** Conecta al motor de base de datos. Llamar al iniciar la app. */
  async connect(): Promise<void> {
    await this.$connect();
    log('info', 'prisma.connected');
  }

  /** Desconecta limpiamente. Llamar en process signal handlers. */
  async disconnect(): Promise<void> {
    await this.$disconnect();
    log('debug', 'prisma.disconnected');
  }
}
