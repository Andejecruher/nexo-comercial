/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaService } from '../services/prisma.service';

export interface AnalyticsPrismaLike {
  ticket: {
    count: (args: unknown) => Promise<number>;
    findMany: (args: unknown) => Promise<unknown[]>;
    groupBy: (args: unknown) => Promise<unknown[]>;
  };
  conversationMeta: {
    count: (args: unknown) => Promise<number>;
  };
}

export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService | AnalyticsPrismaLike) {}

  countTickets(where: Record<string, unknown>): Promise<number> {
    return this.prisma.ticket.count({ where });
  }

  findTickets<T = unknown>(args: unknown): Promise<T[]> {
    return (this.prisma.ticket as any).findMany(args) as Promise<T[]>;
  }

  groupTickets<T = unknown>(args: unknown): Promise<T[]> {
    return (this.prisma.ticket as any).groupBy(args) as Promise<T[]>;
  }

  countConversationMeta(where: Record<string, unknown>): Promise<number> {
    return this.prisma.conversationMeta.count({ where });
  }
}
