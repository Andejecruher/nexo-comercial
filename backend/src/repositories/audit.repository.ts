import { PrismaService } from '../services/prisma.service';

export interface AuditPrismaLike {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
}

export class AuditRepository {
  constructor(private readonly prisma: PrismaService | AuditPrismaLike) {}

  async insertAuditLog(params: {
    id: string;
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    metadataJson: string;
    ip: string | null;
    userAgent: string | null;
    createdAt: Date;
  }): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO audit_logs
         (id, actor_id, action, target_type, target_id, metadata, ip, user_agent, created_at)
       VALUES
         ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, $9::timestamptz)`,
      params.id,
      params.actorId,
      params.action,
      params.targetType,
      params.targetId,
      params.metadataJson,
      params.ip,
      params.userAgent,
      params.createdAt,
    );
  }
}
