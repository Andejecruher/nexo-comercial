/**
 * backfill-coordinators-hierarchy.ts
 *
 * Idempotent one-shot that migrates legacy COORDINADOR_SECCIONAL leaders into
 * the new coordinators hierarchy:
 *
 * 1. Audits active legacy coordinators and their active promovidos.
 * 2. Creates one coordinator row per legacy coordinator (same section/contact).
 * 3. Reassigns their promovidos to the single same-section active non-coordinator
 *    leader, or deactivates the legacy leader as a ghost and records an issue.
 * 4. Auto-assigns a coordinator to coordinator-less leaders only when their
 *    section has exactly one coordinator; otherwise records an issue.
 *
 * Outputs a JSONL audit report and upserts into the PR1 support tables
 * (coordinator_backfill_map / coordinator_backfill_issues). Rerunning produces
 * zero changes because already-mapped legacy leaders are skipped.
 *
 * Uso (desde backend/):
 *   pnpm ts-node --project scripts/tsconfig.json prisma/scripts/backfill-coordinators-hierarchy.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import {
  type LeaderInput,
  buildAuditEntry,
  decideAutoAssign,
  findReassignmentCandidate,
  formatJsonl,
} from './backfill-coordinators-hierarchy.logic';

const prisma = new PrismaClient();

const LEGACY_COORDINATOR_ROLE = 'COORDINADOR_SECCIONAL';

interface LegacyLeaderRow {
  id: string;
  section_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  promovido_count: number;
}

interface SectionLeaderRow {
  id: string;
  section_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
  coordinator_id: string | null;
  promovido_count: number;
}

interface CoordinatorRow {
  id: string;
  section_id: string;
}

async function main(): Promise<void> {
  const runId = randomUUID();
  const reportLines: string[] = [];

  await prisma.$transaction(async (tx) => {
    // 1. Audit: find unprocessed legacy coordinators.
    const legacyRows = await tx.$queryRaw<LegacyLeaderRow[]>`
      SELECT
        l.id,
        l.section_id,
        l.full_name,
        l.phone,
        l.email,
        COALESCE(p.count, 0)::int AS promovido_count
      FROM leaders l
      LEFT JOIN (
        SELECT leader_id, COUNT(*)::int AS count
        FROM promovidos
        WHERE is_active = true
        GROUP BY leader_id
      ) p ON p.leader_id = l.id
      WHERE l.role = ${LEGACY_COORDINATOR_ROLE}::leader_role
        AND l.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM coordinator_backfill_map m WHERE m.leader_id = l.id
        )
      ORDER BY l.section_id, l.created_at
    `;

    reportLines.push(
      formatJsonl(
        buildAuditEntry({
          runId,
          step: 'audit',
          kind: 'legacy_coordinators',
          action: 'count',
          status: 'ok',
          payload: { count: legacyRows.length },
        }),
      ),
    );

    if (legacyRows.length === 0) {
      return;
    }

    // 2. Create one coordinator per legacy coordinator and record the map.
    const coordinatorByLeader = new Map<string, string>();
    for (const row of legacyRows) {
      const coordinatorId = randomUUID();
      coordinatorByLeader.set(row.id, coordinatorId);

      await tx.$executeRaw`
        INSERT INTO coordinators (id, section_id, full_name, phone, email, user_id, is_active, created_at, updated_at)
        VALUES (
          ${coordinatorId}::uuid,
          ${row.section_id}::uuid,
          ${row.full_name},
          ${row.phone},
          ${row.email},
          NULL,
          true,
          NOW(),
          NOW()
        )
      `;

      await tx.$executeRaw`
        INSERT INTO coordinator_backfill_map (id, leader_id, section_id, coordinator_id, created_at, updated_at)
        VALUES (
          ${randomUUID()}::uuid,
          ${row.id}::uuid,
          ${row.section_id}::uuid,
          ${coordinatorId}::uuid,
          NOW(),
          NOW()
        )
      `;

      reportLines.push(
        formatJsonl(
          buildAuditEntry({
            runId,
            step: 'create_coordinator',
            kind: 'coordinator_created',
            leaderId: row.id,
            sectionId: row.section_id,
            coordinatorId,
            action: 'insert',
            status: 'ok',
          }),
        ),
      );
    }

    // 3. Reassign promovidos to the single candidate, or ghost the leader.
    for (const row of legacyRows) {
      const sectionLeaders = await tx.$queryRaw<SectionLeaderRow[]>`
        SELECT
          l.id,
          l.section_id,
          l.full_name,
          l.phone,
          l.email,
          l.role,
          l.is_active,
          l.coordinator_id,
          COALESCE(p.count, 0)::int AS promovido_count
        FROM leaders l
        LEFT JOIN (
          SELECT leader_id, COUNT(*)::int AS count
          FROM promovidos
          WHERE is_active = true
          GROUP BY leader_id
        ) p ON p.leader_id = l.id
        WHERE l.section_id = ${row.section_id}::uuid
          AND l.is_active = true
      `;

      const legacyLeader: LeaderInput = {
        id: row.id,
        sectionId: row.section_id,
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        role: LEGACY_COORDINATOR_ROLE,
        isActive: true,
        promovidoCount: row.promovido_count,
      };

      const candidates = sectionLeaders.map((leader) => ({
        id: leader.id,
        sectionId: leader.section_id,
        fullName: leader.full_name,
        phone: leader.phone,
        email: leader.email,
        role: leader.role,
        isActive: leader.is_active,
        coordinatorId: leader.coordinator_id,
        promovidoCount: leader.promovido_count,
      }));

      const decision = findReassignmentCandidate(legacyLeader, candidates);

      if (decision.kind === 'reassign' && decision.candidateId) {
        await tx.$executeRaw`
          UPDATE promovidos
          SET leader_id = ${decision.candidateId}::uuid,
              leader_name_snapshot = ${decision.candidateName},
              updated_at = NOW()
          WHERE leader_id = ${row.id}::uuid
            AND is_active = true
        `;

        await tx.$executeRaw`
          UPDATE leaders
          SET is_active = false, updated_at = NOW()
          WHERE id = ${row.id}::uuid
        `;

        reportLines.push(
          formatJsonl(
            buildAuditEntry({
              runId,
              step: 'reassign_promovidos',
              kind: 'promovidos_reassigned',
              leaderId: row.id,
              sectionId: row.section_id,
              action: 'update',
              status: 'ok',
              payload: {
                candidateId: decision.candidateId,
                candidateName: decision.candidateName,
              },
            }),
          ),
        );
      } else {
        await tx.$executeRaw`
          UPDATE leaders
          SET is_active = false, updated_at = NOW()
          WHERE id = ${row.id}::uuid
        `;

        const candidateCount = candidates.filter(
          (leader) =>
            leader.id !== row.id &&
            leader.role !== LEGACY_COORDINATOR_ROLE &&
            leader.isActive,
        ).length;

        const existingIssue = await tx.$queryRaw<{ count: number }[]>`
          SELECT COUNT(*)::int AS count
          FROM coordinator_backfill_issues
          WHERE leader_id = ${row.id}::uuid
            AND kind = 'manual_reassignment_required'
        `;

        if (existingIssue[0].count === 0) {
          await tx.$executeRaw`
            INSERT INTO coordinator_backfill_issues (id, leader_id, section_id, kind, reason, payload, created_at, updated_at)
            VALUES (
              ${randomUUID()}::uuid,
              ${row.id}::uuid,
              ${row.section_id}::uuid,
              'manual_reassignment_required',
              ${decision.reason},
              ${JSON.stringify({ candidateCount, promovidoCount: row.promovido_count })}::jsonb,
              NOW(),
              NOW()
            )
          `;
        }

        reportLines.push(
          formatJsonl(
            buildAuditEntry({
              runId,
              step: 'reassign_promovidos',
              kind: 'ghost_created',
              leaderId: row.id,
              sectionId: row.section_id,
              action: 'deactivate',
              status: 'issue',
              reason: decision.reason,
              payload: { candidateCount, promovidoCount: row.promovido_count },
            }),
          ),
        );
      }
    }

    // 4. Auto-assign coordinator-less leaders when their section has exactly one.
    const allCoordinators = await tx.$queryRaw<CoordinatorRow[]>`
      SELECT c.id, c.section_id
      FROM coordinators c
      JOIN coordinator_backfill_map m ON m.coordinator_id = c.id
    `;

    const coordinatorsBySection = new Map<string, string[]>();
    for (const coordinator of allCoordinators) {
      const list = coordinatorsBySection.get(coordinator.section_id) ?? [];
      list.push(coordinator.id);
      coordinatorsBySection.set(coordinator.section_id, list);
    }

    const coordinatorlessLeaders = await tx.$queryRaw<SectionLeaderRow[]>`
      SELECT
        l.id,
        l.section_id,
        l.full_name,
        l.phone,
        l.email,
        l.role,
        l.is_active,
        l.coordinator_id,
        COALESCE(p.count, 0)::int AS promovido_count
      FROM leaders l
      LEFT JOIN (
        SELECT leader_id, COUNT(*)::int AS count
        FROM promovidos
        WHERE is_active = true
        GROUP BY leader_id
      ) p ON p.leader_id = l.id
      WHERE l.is_active = true
        AND l.role != ${LEGACY_COORDINATOR_ROLE}::leader_role
        AND l.coordinator_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM coordinator_backfill_issues i
          WHERE i.leader_id = l.id AND i.kind = 'auto_assign_skipped_multiple_coordinators'
        )
    `;

    for (const leader of coordinatorlessLeaders) {
      const sectionCoordinators = coordinatorsBySection.get(leader.section_id) ?? [];
      const decision = decideAutoAssign(
        sectionCoordinators.map((id) => ({ id, sectionId: leader.section_id })),
        {
          id: leader.id,
          sectionId: leader.section_id,
          fullName: leader.full_name,
          phone: leader.phone,
          email: leader.email,
          role: leader.role,
          isActive: leader.is_active,
          coordinatorId: leader.coordinator_id,
          promovidoCount: leader.promovido_count,
        },
      );

      if (decision.kind === 'auto_assign' && decision.coordinatorId) {
        await tx.$executeRaw`
          UPDATE leaders
          SET coordinator_id = ${decision.coordinatorId}::uuid,
              updated_at = NOW()
          WHERE id = ${leader.id}::uuid
        `;

        reportLines.push(
          formatJsonl(
            buildAuditEntry({
              runId,
              step: 'auto_assign',
              kind: 'leader_auto_assigned',
              leaderId: leader.id,
              sectionId: leader.section_id,
              coordinatorId: decision.coordinatorId,
              action: 'update',
              status: 'ok',
            }),
          ),
        );
      } else if (decision.kind === 'issue') {
        const existingIssue = await tx.$queryRaw<{ count: number }[]>`
          SELECT COUNT(*)::int AS count
          FROM coordinator_backfill_issues
          WHERE leader_id = ${leader.id}::uuid
            AND kind = 'auto_assign_skipped_multiple_coordinators'
        `;

        if (existingIssue[0].count === 0) {
          await tx.$executeRaw`
            INSERT INTO coordinator_backfill_issues (id, leader_id, section_id, kind, reason, payload, created_at, updated_at)
            VALUES (
              ${randomUUID()}::uuid,
              ${leader.id}::uuid,
              ${leader.section_id}::uuid,
              'auto_assign_skipped_multiple_coordinators',
              ${decision.reason},
              ${JSON.stringify({ coordinatorCount: sectionCoordinators.length })}::jsonb,
              NOW(),
              NOW()
            )
          `;
        }

        reportLines.push(
          formatJsonl(
            buildAuditEntry({
              runId,
              step: 'auto_assign',
              kind: 'auto_assign_skipped',
              leaderId: leader.id,
              sectionId: leader.section_id,
              action: 'report',
              status: 'issue',
              reason: decision.reason,
              payload: { coordinatorCount: sectionCoordinators.length },
            }),
          ),
        );
      }
    }
  });

  for (const line of reportLines) {
    console.log(line);
  }
}

main()
  .catch((error) => {
    console.error('Error inesperado:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
