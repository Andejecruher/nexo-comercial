/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaService } from '../services/prisma.service';

export interface SystemPrismaLike {
  auditLog: {
    findMany: (args: unknown) => Promise<unknown[]>;
  };
  inboxEvent: {
    findMany: (args: unknown) => Promise<unknown[]>;
    findUnique: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
  outboxEvent: {
    findMany: (args: unknown) => Promise<unknown[]>;
    findUnique: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
}

export class SystemRepository {
  constructor(private readonly prisma: PrismaService | SystemPrismaLike) {}

  findAuditLogs<T = unknown>(args: unknown): Promise<T[]> {
    return (this.prisma.auditLog as any).findMany(args) as Promise<T[]>;
  }

  findInboxEvents<T = unknown>(args: unknown): Promise<T[]> {
    return (this.prisma.inboxEvent as any).findMany(args) as Promise<T[]>;
  }

  findOutboxEvents<T = unknown>(args: unknown): Promise<T[]> {
    return (this.prisma.outboxEvent as any).findMany(args) as Promise<T[]>;
  }

  findOutboxEventById<T = unknown>(id: string): Promise<T | null> {
    return this.prisma.outboxEvent.findUnique({ where: { id } }) as Promise<T | null>;
  }

  updateOutboxEvent<T = unknown>(
    id: string,
    data: Record<string, unknown>,
    select?: Record<string, unknown>,
  ): Promise<T> {
    return this.prisma.outboxEvent.update({
      where: { id },
      data,
      ...(select !== undefined ? { select } : {}),
    }) as Promise<T>;
  }

  findInboxEventById<T = unknown>(id: string): Promise<T | null> {
    return this.prisma.inboxEvent.findUnique({ where: { id } }) as Promise<T | null>;
  }

  updateInboxEvent<T = unknown>(
    id: string,
    data: Record<string, unknown>,
    select?: Record<string, unknown>,
  ): Promise<T> {
    return this.prisma.inboxEvent.update({
      where: { id },
      data,
      ...(select !== undefined ? { select } : {}),
    }) as Promise<T>;
  }
}
