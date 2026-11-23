/**
 * closeout-integration-gate.ts
 *
 * Throwaway integration harness for the coordinators hierarchy close-out.
 *
 * Requires a local PostgreSQL instance reachable on localhost:5432 with the
 * credentials below. It will DROP and CREATE a database named
 * `vozcuidadana_pr3_verify` and run destructive migrations against ONLY that
 * database. It refuses to run if the target URL does not end with
 * `_pr3_verify`.
 *
 * Usage (from backend/):
 *   DATABASE_URL=postgresql://voz:secret@localhost:5432/vozcuidadana_pr3_verify \
 *     PR3_GATE_ALLOW=1 \
 *     pnpm ts-node --project scripts/tsconfig.json prisma/scripts/closeout-integration-gate.ts
 */
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const PGHOST = 'localhost';
const PGPORT = '5432';
const PGUSER = 'voz';
const PGPASSWORD = 'secret';
const VERIFY_DB_SUFFIX = 'vozcuidadana_pr3_verify';
const MIGRATION_DIR = resolve(__dirname, '../migrations/20260901093000_coordinators_hierarchy_closeout');
const SKIP_DIR = resolve('/tmp/opencode', 'pr3-gate-skip');

if (!process.env.PR3_GATE_ALLOW) {
  console.error('Set PR3_GATE_ALLOW=1 to confirm you want to run against the throwaway DB.');
  process.exit(1);
}

if (!DATABASE_URL.includes(VERIFY_DB_SUFFIX)) {
  console.error(
    `Refusing to run against ${DATABASE_URL}. This harness only targets databases named ${VERIFY_DB_SUFFIX}.`,
  );
  process.exit(1);
}

const dbName = DATABASE_URL.split('/').pop() ?? VERIFY_DB_SUFFIX;

function psql(database: string, sql: string): void {
  execSync(
    `PGPASSWORD=${PGPASSWORD} psql -h ${PGHOST} -p ${PGPORT} -U ${PGUSER} -d ${database} -c '${sql}'`,
    { stdio: 'ignore' },
  );
}

function recreateDatabase(): void {
  psql('postgres', `DROP DATABASE IF EXISTS "${dbName}"`);
  psql('postgres', `CREATE DATABASE "${dbName}"`);
}

function runMigrateDeploy(): void {
  try {
    const output = execSync('pnpm prisma migrate deploy --schema=./prisma/schema.prisma', {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL },
      encoding: 'utf-8',
    });
    process.stdout.write(output);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    const stdout = (error as { stdout?: string }).stdout ?? '';
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    throw new Error(`migrate deploy failed: ${stderr || stdout || (error as Error).message}`);
  }
}

function withCloseOutMigrationExcluded<T>(fn: () => T): T {
  if (!existsSync(MIGRATION_DIR)) {
    throw new Error(`Close-out migration not found at ${MIGRATION_DIR}`);
  }
  mkdirSync(SKIP_DIR, { recursive: true });
  const skipped = resolve(SKIP_DIR, basename(MIGRATION_DIR));
  if (existsSync(skipped)) {
    throw new Error('Skipped close-out migration already exists; aborting to avoid state confusion.');
  }
  renameSync(MIGRATION_DIR, skipped);
  try {
    return fn();
  } finally {
    renameSync(skipped, MIGRATION_DIR);
  }
}

async function withPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedCatalog(prisma: PrismaClient) {
  const state = await prisma.electoralState.create({
    data: { code: '07', name: 'Chiapas' },
  });
  const district = await prisma.electoralDistrict.create({
    data: { stateId: state.id, code: '01', name: 'Tuxtla' },
  });
  const section = await prisma.section.create({
    data: { stateId: state.id, districtId: district.id, sectionCode: '0042' },
  });
  return { state, district, section };
}

async function seedSecondSection(prisma: PrismaClient, stateId: string, districtId: string) {
  return prisma.section.create({
    data: { stateId, districtId, sectionCode: '0043' },
  });
}

async function assertCloseOutApplied(prisma: PrismaClient) {
  const row = await prisma.$queryRawUnsafe<
    Array<{ migration_name: string }>
  >(`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '20260901093000_coordinators_hierarchy_closeout'`);
  if (row.length === 0) throw new Error('Close-out migration was not recorded in _prisma_migrations');
}

async function assertEnumNarrowed(prisma: PrismaClient) {
  const values = await prisma.$queryRawUnsafe<Array<{ enumlabel: string }>>(`
    SELECT e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'leader_role'
    ORDER BY e.enumsortorder
  `);
  const labels = values.map((v) => v.enumlabel);
  if (JSON.stringify(labels) !== JSON.stringify(['PROMOTOR_BARRIO', 'ENLACE_TERRITORIAL'])) {
    throw new Error(`Unexpected leader_role values: ${labels.join(', ')}`);
  }
}

async function assertSupportTablesDropped(prisma: PrismaClient) {
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('coordinator_backfill_map', 'coordinator_backfill_issues')
  `);
  if (rows.length > 0) {
    throw new Error(`Support tables still exist: ${rows.map((r) => r.table_name).join(', ')}`);
  }
}

async function assertSupportTablesExist(prisma: PrismaClient) {
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('coordinator_backfill_map', 'coordinator_backfill_issues')
  `);
  if (rows.length !== 2) {
    throw new Error(
      `Expected support tables to remain after failed close-out, found: ${rows.length}`,
    );
  }
}

async function scenarioA_FullChainDeploy() {
  console.log('\n=== Scenario A: full migrate deploy on fresh DB ===');
  recreateDatabase();
  runMigrateDeploy();
  await withPrisma(async (prisma) => {
    await assertCloseOutApplied(prisma);
  });
  console.log('PASS: full chain deployed cleanly.');
}

async function scenarioB_CompositeFkRejectsCrossSection() {
  console.log('\n=== Scenario B: composite FK rejects cross-section assignment ===');
  recreateDatabase();
  runMigrateDeploy();
  await withPrisma(async (prisma) => {
    const { state, district, section } = await seedCatalog(prisma);
    const otherSection = await seedSecondSection(prisma, state.id, district.id);

    const coordinator = await prisma.coordinator.create({
      data: { sectionId: section.id, fullName: 'Coordinator A', email: 'coord@example.com' },
    });
    const coordinatorB = await prisma.coordinator.create({
      data: {
        sectionId: otherSection.id,
        fullName: 'Coordinator B',
        email: 'coordb@example.com',
      },
    });
    const leader = await prisma.leader.create({
      data: { sectionId: otherSection.id, fullName: 'Leader B', coordinatorId: coordinatorB.id },
    });

    let rejected = false;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "leaders" SET "coordinator_id" = '${coordinator.id}' WHERE "id" = '${leader.id}'`,
      );
    } catch (error) {
      rejected =
        error instanceof Error &&
        (error.message.toLowerCase().includes('foreign key') ||
          error.message.includes('coordinator_id_section_id_fkey'));
    }

    if (!rejected) throw new Error('Cross-section coordinator assignment was accepted');
  });
  console.log('PASS: composite FK rejected cross-section assignment.');
}

async function scenarioC_UserDeletionSetNull() {
  console.log('\n=== Scenario C: User deletion SetNulls linked coordinator/leader ===');
  recreateDatabase();
  runMigrateDeploy();
  await withPrisma(async (prisma) => {
    const { section } = await seedCatalog(prisma);
    const user = await prisma.user.create({
      data: {
        email: `user-${randomUUID()}@example.com`,
        hashedPassword: 'x',
        fullName: 'Test User',
      },
    });
    const coordinator = await prisma.coordinator.create({
      data: {
        sectionId: section.id,
        fullName: 'Coordinator User',
        email: 'coord-user@example.com',
        userId: user.id,
      },
    });
    const leader = await prisma.leader.create({
      data: {
        sectionId: section.id,
        fullName: 'Leader User',
        coordinatorId: coordinator.id,
        userId: user.id,
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    const coordinatorAfter = await prisma.coordinator.findUnique({ where: { id: coordinator.id } });
    const leaderAfter = await prisma.leader.findUnique({ where: { id: leader.id } });

    if (!coordinatorAfter || coordinatorAfter.userId !== null) {
      throw new Error('Coordinator was deleted or user_id was not set to null');
    }
    if (!leaderAfter || leaderAfter.userId !== null) {
      throw new Error('Leader was deleted or user_id was not set to null');
    }
  });
  console.log('PASS: User deletion SetNulls preserved coordinator and leader entities.');
}

function runBackfillScript(): string {
  return execSync(
    'pnpm ts-node --project scripts/tsconfig.json prisma/scripts/backfill-coordinators-hierarchy.ts',
    {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL },
      encoding: 'utf-8',
    },
  );
}

function runCleanupScript(): string {
  return execSync(
    'pnpm ts-node --project scripts/tsconfig.json prisma/scripts/cleanup-ghost-leaders.ts',
    {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL },
      encoding: 'utf-8',
    },
  );
}

async function scenarioD_BackfillIdempotencyAndCloseOutSuccess() {
  console.log('\n=== Scenario D: backfill idempotency + close-out success ===');
  recreateDatabase();

  withCloseOutMigrationExcluded(() => {
    runMigrateDeploy();
  });

  await withPrisma(async (prisma) => {
    const { section } = await seedCatalog(prisma);
    const coordinatorId = randomUUID();
    const legacyId = randomUUID();
    const candidateId = randomUUID();
    const userId = randomUUID();

    await prisma.$executeRawUnsafe(
      `INSERT INTO "coordinators" ("id", "section_id", "full_name", "email", "is_active", "created_at", "updated_at")
       VALUES ('${coordinatorId}', '${section.id}', 'Pre-existing Coordinator', 'pre@example.com', true, NOW(), NOW())`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "users" ("id", "email", "hashed_password", "created_at", "updated_at")
       VALUES ('${userId}', 'promo-${userId}@example.com', 'x', NOW(), NOW())`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "leaders" ("id", "section_id", "full_name", "email", "role", "is_active", "coordinator_id", "created_at", "updated_at")
       VALUES ('${legacyId}', '${section.id}', 'Legacy Coordinator', 'legacy@example.com', 'COORDINADOR_SECCIONAL'::leader_role, true, NULL, NOW(), NOW())`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "leaders" ("id", "section_id", "full_name", "role", "is_active", "coordinator_id", "created_at", "updated_at")
       VALUES ('${candidateId}', '${section.id}', 'Candidate Leader', 'PROMOTOR_BARRIO'::leader_role, true, '${coordinatorId}', NOW(), NOW())`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "promovidos" (
         "id", "leader_id", "section_id", "created_by_user_id", "data_encrypted",
         "state_name_snapshot", "district_code_snapshot", "section_code_snapshot", "leader_name_snapshot",
         "created_at", "updated_at"
       )
       VALUES (
         '${randomUUID()}', '${legacyId}', '${section.id}', '${userId}', 'x',
         'Chiapas', '01', '0042', 'Legacy Coordinator',
         NOW(), NOW()
       )`,
    );
  });

  const firstBackfillOutput = withCloseOutMigrationExcluded(() => runBackfillScript());
  console.log('--- First backfill output ---');
  process.stdout.write(firstBackfillOutput);
  if (!firstBackfillOutput.includes('legacy_coordinators')) {
    throw new Error('First backfill run did not produce expected audit output');
  }

  const secondBackfillOutput = withCloseOutMigrationExcluded(() => runBackfillScript());
  console.log('--- Second backfill output ---');
  process.stdout.write(secondBackfillOutput);
  const lastLine = secondBackfillOutput.trim().split('\n').pop();
  const summary = lastLine ? (JSON.parse(lastLine) as { payload?: { count?: number } }) : {};
  if (summary.payload?.count !== 0) {
    throw new Error(`Second backfill run produced changes: ${secondBackfillOutput}`);
  }

  const cleanupOutput = withCloseOutMigrationExcluded(() => runCleanupScript());
  console.log('--- Cleanup output ---');
  process.stdout.write(cleanupOutput);

  runMigrateDeploy();

  await withPrisma(async (prisma) => {
    await assertCloseOutApplied(prisma);
    await assertEnumNarrowed(prisma);
    await assertSupportTablesDropped(prisma);
    const remainingLeaders = await prisma.leader.count();
    if (remainingLeaders !== 1) {
      throw new Error(`Expected 1 leader after close-out, found ${remainingLeaders}`);
    }
  });

  console.log('PASS: backfill idempotent, cleanup removed ghost, close-out applied cleanly.');
}

async function scenarioE_CloseOutBlocksWithPendingIssues() {
  console.log('\n=== Scenario E: close-out blocks when pending issues exist ===');
  recreateDatabase();

  withCloseOutMigrationExcluded(() => {
    runMigrateDeploy();
  });

  await withPrisma(async (prisma) => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "coordinator_backfill_issues" ("id", "kind", "reason", "created_at", "updated_at")
       VALUES ('${randomUUID()}', 'manual_reassignment_required', 'issue for gate test', NOW(), NOW())`,
    );
  });

  let blocked = false;
  try {
    runMigrateDeploy();
  } catch (error) {
    blocked = error instanceof Error && error.message.includes('Close-out blocked');
  }

  if (!blocked) throw new Error('Close-out migration did not block on pending issue');

  await withPrisma(async (prisma) => {
    await assertSupportTablesExist(prisma);
  });

  console.log('PASS: close-out raised exception and left support tables in place.');
}

async function main() {
  await scenarioA_FullChainDeploy();
  await scenarioB_CompositeFkRejectsCrossSection();
  await scenarioC_UserDeletionSetNull();
  await scenarioD_BackfillIdempotencyAndCloseOutSuccess();
  await scenarioE_CloseOutBlocksWithPendingIssues();
  console.log('\n=== All integration-gate scenarios passed ===');
}

main().catch((error) => {
  console.error('\nIntegration gate failed:', error);
  process.exit(1);
});
