import { Prisma } from '@prisma/client';
import { PrismaService } from '../services/prisma.service';

const agentSelect = {
  id: true,
  isActive: true,
} as const;

export type AiAgentStatusRecord = Prisma.AiAgentGetPayload<{ select: typeof agentSelect }>;

export class AiAgentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByIds(ids: string[]): Promise<AiAgentStatusRecord[]> {
    if (ids.length === 0) return [];
    return this.prisma.aiAgent.findMany({
      where: { id: { in: ids }, isActive: true },
      select: agentSelect,
    });
  }
}