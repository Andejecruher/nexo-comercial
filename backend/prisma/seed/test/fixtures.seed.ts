import { PrismaClient } from '@prisma/client';

/**
 * Test-only fixtures.
 * Extend this seeder when the test suite needs deterministic citizens,
 * conversations, or other domain objects.
 */
export async function seedTestFixtures(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    console.log('ℹ️  Skipping test fixtures: NODE_ENV is not "test"');
    return;
  }

  console.log('ℹ️  No test fixtures defined yet');
}
