import { PrismaClient } from '@prisma/client';
import { seedDepartments } from './core/departments.seed';
import { seedNeighborhoods } from './core/neighborhoods.seed';
import { seedPermissions } from './core/permissions.seed';
import { seedRolePermissions } from './core/role-permissions.seed';
import { seedRoles } from './core/roles.seed';

type SeedScope = 'all' | 'core' | 'dev' | 'test';

function parseScope(): SeedScope {
  const arg = process.argv[2]?.toLowerCase();
  if (arg === 'all' || arg === 'dev' || arg === 'test') return arg;
  return 'core';
}

async function seedCore(prisma: PrismaClient): Promise<void> {
  await seedNeighborhoods(prisma);
  await seedRoles(prisma);
  await seedPermissions(prisma);
  await seedRolePermissions(prisma);
  await seedDepartments(prisma);
}

async function seedDev(prisma: PrismaClient): Promise<void> {
  const [{ seedSuperadmin }, { seedAiModule }] = await Promise.all([
    import('./dev/superadmin.seed'),
    import('./dev/ai-module.seed'),
  ]);
  await seedSuperadmin(prisma);
  await seedAiModule(prisma);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run seed in production environment.');
  }

  const scope = parseScope();
  const prisma = new PrismaClient();

  try {
    console.log(`🌱 Seeding database (scope: ${scope})...`);

    if (scope === 'all' || scope === 'core') {
      await seedCore(prisma);
    }

    if (scope === 'all' || scope === 'dev') {
      await seedDev(prisma);
    }

    if (scope === 'all' || scope === 'test') {
      const { seedTestFixtures } = await import('./test/fixtures.seed');
      await seedTestFixtures(prisma);
    }

    console.log('🎉 Seed complete');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
