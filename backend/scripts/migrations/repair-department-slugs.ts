/**
 * Repara department_slug que no corresponda a un slug del catálogo.
 *
 * Es dry-run por defecto. Solo modifica valores con una coincidencia única por
 * slug o nombre normalizados; los desconocidos y ambiguos se reportan sin tocar.
 *
 * Uso (desde backend/):
 *   pnpm departments:repair-slugs
 *   DRY_RUN=false pnpm departments:repair-slugs
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { resolveCanonicalDepartmentSlug } from '../../src/utils/department-slug';

const prisma = new PrismaClient();
const DRY_RUN = process.env['DRY_RUN'] !== 'false';

type Target = {
  name: string;
  listValues(): Promise<Array<{ departmentSlug: string | null }>>;
  count(value: string): Promise<number>;
  update(from: string, to: string): Promise<number>;
};

type Stats = {
  reviewedValues: number;
  canonicalValues: number;
  correctedValues: number;
  correctedRows: number;
  unresolvedValues: number;
};

function log(level: 'info' | 'warn' | 'error', event: string, data?: object): void {
  const message = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    script: 'repair-department-slugs',
    event,
    dryRun: DRY_RUN,
    ...data,
  });
  if (level === 'error') console.error(message);
  else if (level === 'warn') console.warn(message);
  else console.log(message);
}

const targets: Target[] = [
  {
    name: 'tickets',
    listValues: () =>
      prisma.ticket.findMany({
        where: { departmentSlug: { not: null } },
        distinct: ['departmentSlug'],
        select: { departmentSlug: true },
      }),
    count: (value) => prisma.ticket.count({ where: { departmentSlug: value } }),
    update: async (from, to) =>
      (
        await prisma.ticket.updateMany({
          where: { departmentSlug: from },
          data: { departmentSlug: to },
        })
      ).count,
  },
  {
    name: 'conversation_meta',
    listValues: () =>
      prisma.conversationMeta.findMany({
        where: { departmentSlug: { not: null } },
        distinct: ['departmentSlug'],
        select: { departmentSlug: true },
      }),
    count: (value) => prisma.conversationMeta.count({ where: { departmentSlug: value } }),
    update: async (from, to) =>
      (
        await prisma.conversationMeta.updateMany({
          where: { departmentSlug: from },
          data: { departmentSlug: to },
        })
      ).count,
  },
  {
    name: 'assignments',
    listValues: () =>
      prisma.assignment.findMany({
        where: { departmentSlug: { not: null } },
        distinct: ['departmentSlug'],
        select: { departmentSlug: true },
      }),
    count: (value) => prisma.assignment.count({ where: { departmentSlug: value } }),
    update: async (from, to) =>
      (
        await prisma.assignment.updateMany({
          where: { departmentSlug: from },
          data: { departmentSlug: to },
        })
      ).count,
  },
  {
    name: 'notifications',
    listValues: () =>
      prisma.notification.findMany({
        where: { departmentSlug: { not: null } },
        distinct: ['departmentSlug'],
        select: { departmentSlug: true },
      }),
    count: (value) => prisma.notification.count({ where: { departmentSlug: value } }),
    update: async (from, to) =>
      (
        await prisma.notification.updateMany({
          where: { departmentSlug: from },
          data: { departmentSlug: to },
        })
      ).count,
  },
];

async function main(): Promise<void> {
  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    select: { slug: true, name: true },
  });
  const canonicalSlugs = new Set(departments.map((department) => department.slug));
  const stats: Stats = {
    reviewedValues: 0,
    canonicalValues: 0,
    correctedValues: 0,
    correctedRows: 0,
    unresolvedValues: 0,
  };

  log('info', 'migration.start', {
    departmentCount: departments.length,
    targets: targets.map((target) => target.name),
  });

  for (const target of targets) {
    const values = await target.listValues();
    for (const row of values) {
      const current = row.departmentSlug;
      if (!current) continue;
      stats.reviewedValues += 1;

      if (canonicalSlugs.has(current)) {
        stats.canonicalValues += 1;
        continue;
      }

      const resolution = resolveCanonicalDepartmentSlug(current, departments);
      if (resolution.status !== 'matched') {
        stats.unresolvedValues += 1;
        log('warn', 'slug.unresolved', {
          target: target.name,
          current,
          status: resolution.status,
          candidates: resolution.candidates,
        });
        continue;
      }

      const affectedRows = await target.count(current);
      if (!DRY_RUN) {
        const updatedRows = await target.update(current, resolution.slug);
        if (updatedRows !== affectedRows) {
          log('warn', 'slug.concurrent_change', {
            target: target.name,
            current,
            canonical: resolution.slug,
            expectedRows: affectedRows,
            updatedRows,
          });
        }
      }

      stats.correctedValues += 1;
      stats.correctedRows += affectedRows;
      log('info', 'slug.corrected', {
        target: target.name,
        current,
        canonical: resolution.slug,
        affectedRows,
      });
    }
  }

  log('info', 'migration.complete', stats);
}

void main()
  .catch((error: unknown) => {
    log('error', 'migration.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
