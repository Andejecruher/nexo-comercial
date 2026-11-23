/**
 * cleanup-ghost-leaders.ts
 *
 * Deletes legacy COORDINADOR_SECCIONAL leaders that were deactivated during the
 * backfill (ghosts) ONLY when they have no blocking dependents. Ghosts that
 * still hold active promovidos, upload records, or precampaign goals are
 * reported as unsafe and left in place so they can be resolved manually.
 *
 * The leaders table uses RESTRICT foreign keys for these relations, so the
 * database itself would reject an unsafe delete. This script checks the counts
 * beforehand and reports them instead of failing.
 *
 * Uso (desde backend/):
 *   pnpm ts-node --project scripts/tsconfig.json prisma/scripts/cleanup-ghost-leaders.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { partitionGhostsBySafety } from './cleanup-ghost-leaders.logic';

const prisma = new PrismaClient();

const LEGACY_COORDINATOR_ROLE = 'COORDINADOR_SECCIONAL';

interface GhostRow {
  id: string;
  section_id: string;
  full_name: string;
  promovido_count: number;
  upload_record_count: number;
  precampaign_goal_count: number;
}

interface ReportLine {
  kind: string;
  leaderId?: string;
  sectionId?: string;
  fullName?: string;
  reason?: string;
  status: string;
}

async function main(): Promise<void> {
  const ghosts = await prisma.$queryRaw<GhostRow[]>`
    SELECT
      l.id,
      l.section_id,
      l.full_name,
      COALESCE(p.count, 0)::int AS promovido_count,
      COALESCE(u.count, 0)::int AS upload_record_count,
      COALESCE(g.count, 0)::int AS precampaign_goal_count
    FROM leaders l
    LEFT JOIN (
      SELECT leader_id, COUNT(*)::int AS count
      FROM promovidos
      WHERE is_active = true
      GROUP BY leader_id
    ) p ON p.leader_id = l.id
    LEFT JOIN (
      SELECT leader_id, COUNT(*)::int AS count
      FROM upload_records
      WHERE leader_id IS NOT NULL
      GROUP BY leader_id
    ) u ON u.leader_id = l.id
    LEFT JOIN (
      SELECT leader_id, COUNT(*)::int AS count
      FROM precampaign_goals
      WHERE leader_id IS NOT NULL
      GROUP BY leader_id
    ) g ON g.leader_id = l.id
    WHERE l.role = ${LEGACY_COORDINATOR_ROLE}::leader_role
      AND l.is_active = false
    ORDER BY l.section_id, l.created_at
  `;

  const mappedGhosts = ghosts.map((ghost) => ({
    id: ghost.id,
    sectionId: ghost.section_id,
    fullName: ghost.full_name,
    promovidoCount: ghost.promovido_count,
    uploadRecordCount: ghost.upload_record_count,
    precampaignGoalCount: ghost.precampaign_goal_count,
  }));

  const { safe, unsafe } = partitionGhostsBySafety(mappedGhosts);
  const deletedIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const ghost of safe) {
      await tx.$executeRaw`
        DELETE FROM leaders WHERE id = ${ghost.id}::uuid
      `;
      deletedIds.push(ghost.id);
    }
  });

  for (const ghost of safe) {
    const line: ReportLine = {
      kind: 'deleted',
      leaderId: ghost.id,
      sectionId: ghost.sectionId,
      fullName: ghost.fullName,
      status: 'ok',
    };
    console.log(JSON.stringify(line));
  }

  for (const ghost of unsafe) {
    const line: ReportLine = {
      kind: 'unsafe',
      leaderId: ghost.id,
      sectionId: ghost.sectionId,
      fullName: ghost.fullName,
      reason: ghost.reason,
      status: 'skipped',
    };
    console.log(JSON.stringify(line));
  }

  console.log(
    JSON.stringify({
      kind: 'summary',
      total: ghosts.length,
      deleted: safe.length,
      unsafe: unsafe.length,
      status: 'ok',
    }),
  );
}

main()
  .catch((error) => {
    console.error('Error inesperado:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
