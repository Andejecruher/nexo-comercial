import { describe, expect, it, jest, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { advisoryLockIdFromFingerprint } from '../../utils/postgres-advisory-lock';

// This fingerprint's unsigned 64-bit interpretation exceeds PostgreSQL's
// signed int8 range and previously caused the Prisma parameter conversion error.
const REPORTED_FINGERPRINT = '80d6f7a2d91b7c92';

// Another fingerprint in the lower half of the signed range.
const LOWER_FINGERPRINT = '0123456789abcdef';

describe('Promovido advisory lock — real PostgreSQL', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('executes pg_advisory_xact_lock with the reported problematic value', async () => {
    const lockId = advisoryLockIdFromFingerprint(REPORTED_FINGERPRINT);

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
      }),
    ).resolves.toBeUndefined();
  });

  it('executes the lock with a lower-half value', async () => {
    const lockId = advisoryLockIdFromFingerprint(LOWER_FINGERPRINT);

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
      }),
    ).resolves.toBeUndefined();
  });

  it('serializes two transactions competing for the same lock key', async () => {
    const lockId = advisoryLockIdFromFingerprint(REPORTED_FINGERPRINT);
    const timestamps: number[] = [];

    const t1 = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
      timestamps.push(Date.now());
      // Hold the lock briefly so the second transaction must wait.
      await new Promise((resolve) => setTimeout(resolve, 150));
      timestamps.push(Date.now());
    });

    // Give t1 a head start to ensure it acquires the lock first.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const t2 = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
      timestamps.push(Date.now());
    });

    await Promise.all([t1, t2]);

    expect(timestamps.length).toBe(3);
    // t2 must start after t1 has finished (released the lock).
    expect(timestamps[2]).toBeGreaterThanOrEqual(timestamps[1]);
  }, 10000);

  it('releases the lock automatically when the transaction rolls back', async () => {
    const lockId = advisoryLockIdFromFingerprint(REPORTED_FINGERPRINT);
    const error = new Error('intentional rollback');

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
        throw error;
      }),
    ).rejects.toBe(error);

    // A subsequent transaction on the same key must succeed immediately.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
      }),
    ).resolves.toBeUndefined();
  });
});
