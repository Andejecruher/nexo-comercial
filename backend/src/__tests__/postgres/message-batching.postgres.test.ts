import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Réplica exacta del statement de claim de
 * `InboxProcessorService.processBatch` (inbox-processor.service.ts). Si cambia
 * el SQL de producción, este helper tiene que cambiar con él — la regresión
 * 23505 fue exactamente producción y test divergiendo.
 */
function claimSql(claimPhone: string, generation: number, claimToken: string): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO batch_window_claims AS bwc (phone, batch_generation, claim_token, claim_lease_until, drain_boundary, created_at)
    VALUES (
      ${claimPhone},
      ${generation},
      ${claimToken},
      now() + INTERVAL '5 minutes',
      now(),
      now()
    )
    ON CONFLICT (phone, batch_generation) DO UPDATE SET
      claim_token = EXCLUDED.claim_token,
      claim_lease_until = EXCLUDED.claim_lease_until,
      drain_boundary = EXCLUDED.drain_boundary,
      completed_at = NULL,
      updated_at = now()
    WHERE bwc.completed_at IS NULL
      AND bwc.claim_lease_until <= now()
    RETURNING phone, batch_generation, claim_token, claim_lease_until, drain_boundary
  `;
}

describe('message batching — real PostgreSQL', () => {
  let prisma: PrismaClient;
  const phone = '521999888777';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`DELETE FROM batch_window_claims WHERE phone = ${phone}`;
    await prisma.$executeRaw`DELETE FROM batch_windows WHERE phone = ${phone}`;
    await prisma.$executeRaw`DELETE FROM inbox_events WHERE phone = ${phone}`;
  });

  it('serializes concurrent same-phone extensions into one monotonic window', async () => {
    const windowMs = 2000;
    const maxWaitMs = 5000;

    const [r1, r2] = await Promise.all([
      prisma.$queryRaw<
        { batch_generation: number; batch_ready_at: Date; window_opened_at: Date }[]
      >`
        INSERT INTO batch_windows AS bw (phone, batch_generation, batch_ready_at, window_opened_at, updated_at)
        VALUES (${phone}, 1, now() + ${windowMs} * INTERVAL '1 millisecond', now(), now())
        ON CONFLICT (phone) DO UPDATE SET
          batch_generation = CASE
            WHEN EXCLUDED.batch_ready_at > bw.batch_ready_at THEN bw.batch_generation + 1
            ELSE bw.batch_generation
          END,
          batch_ready_at = LEAST(
            GREATEST(bw.window_opened_at + ${maxWaitMs} * INTERVAL '1 millisecond', EXCLUDED.batch_ready_at),
            now() + ${windowMs} * INTERVAL '1 millisecond'
          ),
          updated_at = now()
        RETURNING batch_generation, batch_ready_at, window_opened_at
      `,
      prisma.$queryRaw<
        { batch_generation: number; batch_ready_at: Date; window_opened_at: Date }[]
      >`
        INSERT INTO batch_windows AS bw (phone, batch_generation, batch_ready_at, window_opened_at, updated_at)
        VALUES (${phone}, 1, now() + ${windowMs} * INTERVAL '1 millisecond', now(), now())
        ON CONFLICT (phone) DO UPDATE SET
          batch_generation = CASE
            WHEN EXCLUDED.batch_ready_at > bw.batch_ready_at THEN bw.batch_generation + 1
            ELSE bw.batch_generation
          END,
          batch_ready_at = LEAST(
            GREATEST(bw.window_opened_at + ${maxWaitMs} * INTERVAL '1 millisecond', EXCLUDED.batch_ready_at),
            now() + ${windowMs} * INTERVAL '1 millisecond'
          ),
          updated_at = now()
        RETURNING batch_generation, batch_ready_at, window_opened_at
      `,
    ]);

    const rows = await prisma.$queryRaw<
      { batch_generation: number; batch_ready_at: Date; window_opened_at: Date }[]
    >`
      SELECT batch_generation, batch_ready_at, window_opened_at FROM batch_windows WHERE phone = ${phone}
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].window_opened_at).toBeInstanceOf(Date);
    const returnedGenerations = new Set([r1[0]?.batch_generation, r2[0]?.batch_generation]);
    expect(Math.max(...returnedGenerations)).toBe(rows[0].batch_generation);
  });

  it('CAS claim race allows exactly one winner per generation', async () => {
    const generation = 1;
    await prisma.$executeRaw`
      INSERT INTO batch_windows (phone, batch_generation, batch_ready_at, window_opened_at, updated_at)
      VALUES (${phone}, ${generation}, now() - INTERVAL '1 second', now(), now())
    `;

    const claims = await Promise.all([
      prisma.$queryRaw<{ claim_token: string }[]>(claimSql(phone, generation, 'token-a')),
      prisma.$queryRaw<{ claim_token: string }[]>(claimSql(phone, generation, 'token-b')),
    ]);

    const winners = claims.filter((c) => c.length > 0);
    expect(winners).toHaveLength(1);

    // El perdedor no debe pisar el token del ganador: la exclusión mutua depende
    // de que el DO UPDATE condicional NO se aplique cuando el claim está vivo.
    const stored = await prisma.$queryRaw<{ claim_token: string }[]>`
      SELECT claim_token FROM batch_window_claims
      WHERE phone = ${phone} AND batch_generation = ${generation}
    `;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.claim_token).toBe(winners[0]?.[0]?.claim_token);
  });

  it('rechaza con 0 filas un reintento sobre un claim ya completado', async () => {
    const generation = 1;
    await prisma.$executeRaw`
      INSERT INTO batch_windows (phone, batch_generation, batch_ready_at, window_opened_at, updated_at)
      VALUES (${phone}, ${generation}, now() - INTERVAL '1 second', now(), now())
    `;
    await prisma.$queryRaw(claimSql(phone, generation, 'token-first'));
    await prisma.$executeRaw`
      UPDATE batch_window_claims SET completed_at = now()
      WHERE phone = ${phone} AND batch_generation = ${generation}
    `;

    // Regresión 23505: la PK (phone, batch_generation) admite una sola fila, así
    // que un `WHERE NOT EXISTS (... completed_at IS NULL ...)` habría dejado
    // pasar el INSERT y reventado la PK en CADA reintento de Cloud Tasks.
    const retried = await prisma.$queryRaw<{ claim_token: string }[]>(
      claimSql(phone, generation, 'token-retry'),
    );

    expect(retried).toHaveLength(0);
  });

  it('toma el control de un claim expirado sin completar (recovery)', async () => {
    const generation = 1;
    await prisma.$executeRaw`
      INSERT INTO batch_windows (phone, batch_generation, batch_ready_at, window_opened_at, updated_at)
      VALUES (${phone}, ${generation}, now() - INTERVAL '1 second', now(), now())
    `;
    await prisma.$executeRaw`
      INSERT INTO batch_window_claims (phone, batch_generation, claim_token, claim_lease_until, drain_boundary, created_at, updated_at)
      VALUES (${phone}, ${generation}, 'abandoned', now() - INTERVAL '1 minute', now() - INTERVAL '2 minutes', now(), now())
    `;

    // Regresión 23505 también acá: un claim abandonado (lease vencido,
    // completed_at NULL) debe poder re-tomarse para drenar el lote.
    const taken = await prisma.$queryRaw<{ claim_token: string; claim_lease_until: Date }[]>(
      claimSql(phone, generation, 'token-recovery'),
    );

    expect(taken).toHaveLength(1);
    expect(taken[0]?.claim_token).toBe('token-recovery');
    expect(taken[0]?.claim_lease_until.getTime()).toBeGreaterThan(Date.now());
  });

  it('drains inbox events in created_at/id order within the drain boundary', async () => {
    const generation = 1;
    const drainBoundary = new Date(Date.now() - 1000);
    await prisma.$executeRaw`
      INSERT INTO batch_windows (phone, batch_generation, batch_ready_at, window_opened_at, updated_at)
      VALUES (${phone}, ${generation}, now() - INTERVAL '1 second', now(), now())
    `;
    await prisma.$executeRaw`
      INSERT INTO inbox_events (id, wamid, phone, payload, status, created_at, idempotency_key)
      VALUES
        ('11111111-1111-1111-1111-111111111111', 'wamid-a', ${phone}, '{}'::jsonb, 'pending', ${drainBoundary} + INTERVAL '1 second', 'wamid-a'),
        ('22222222-2222-2222-2222-222222222222', 'wamid-b', ${phone}, '{}'::jsonb, 'pending', ${drainBoundary} - INTERVAL '1 second', 'wamid-b'),
        ('33333333-3333-3333-3333-333333333333', 'wamid-c', ${phone}, '{}'::jsonb, 'pending', ${drainBoundary} - INTERVAL '2 second', 'wamid-c')
    `;

    const rows = await prisma.$queryRaw<{ id: string; wamid: string }[]>`
      WITH eligible AS (
        SELECT ie.id
        FROM inbox_events ie
        WHERE ie.phone = ${phone}
          AND ie.status IN ('pending', 'failed')
          AND ie.created_at <= ${drainBoundary}
        ORDER BY ie.created_at ASC, ie.id ASC
        FOR UPDATE SKIP LOCKED
      ),
      updated AS (
        UPDATE inbox_events ie
        SET status = 'processing', locked_at = now(), locked_by = 'batch-test'
        FROM eligible
        WHERE ie.id = eligible.id
        RETURNING ie.id, ie.wamid, ie.created_at
      )
      SELECT id, wamid FROM updated ORDER BY created_at ASC, id ASC
    `;

    expect(rows.map((r) => r.wamid)).toEqual(['wamid-c', 'wamid-b']);
  });
});
