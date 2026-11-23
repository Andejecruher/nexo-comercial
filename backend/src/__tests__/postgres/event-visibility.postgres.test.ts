import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { GetWeeklyEventsTool } from '../../ai/tools/get-weekly-events.tool';
import { PublicEventosController } from '../../controllers/public-eventos.controller';
import { AttendanceRepository } from '../../repositories/attendance.repository';
import { EventRepository } from '../../repositories/event.repository';
import { PrismaService } from '../../services/prisma.service';
import { PublicEventosService } from '../../services/public-eventos.service';
import { createTestApp } from '../setup/test-app';

async function applyMigration(prisma: PrismaClient, migrationDir: string): Promise<void> {
  const migration = readFileSync(join(__dirname, migrationDir), 'utf8');
  // Plpgsql function bodies ($$ ... $$) contain inner semicolons: extract the
  // whole CREATE FUNCTION statement and split only the remaining statements.
  const functionMatch = migration.match(/CREATE (?:OR REPLACE )?FUNCTION[\s\S]*?\$\$;/);
  if (functionMatch && functionMatch.index !== undefined) {
    const before = migration.slice(0, functionMatch.index).split(';');
    const after = migration.slice(functionMatch.index + functionMatch[0].length).split(';');
    for (const statement of before.filter((s) => s.trim())) {
      await prisma.$executeRawUnsafe(statement);
    }
    await prisma.$executeRawUnsafe(functionMatch[0]);
    for (const statement of after.filter((s) => s.trim())) {
      await prisma.$executeRawUnsafe(statement);
    }
    return;
  }
  for (const statement of migration.split(';').filter((s) => s.trim())) {
    await prisma.$executeRawUnsafe(statement);
  }
}

describe('event visibility — real PostgreSQL', () => {
  const schema = `event_visibility_test_${randomUUID().replace(/-/g, '')}`;
  let admin: PrismaClient;
  let prisma: PrismaClient;
  let repository: EventRepository;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1', 'postgres'].includes(url.hostname)) {
      throw new Error('This suite requires local PostgreSQL');
    }

    admin = new PrismaClient();
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('schema', schema);
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

    await prisma.$executeRawUnsafe(
      "CREATE TYPE event_status AS ENUM ('draft', 'published', 'completed', 'cancelled')",
    );
    await prisma.$executeRawUnsafe(
      "CREATE TYPE event_type AS ENUM ('townhall', 'community', 'volunteer', 'campaign', 'rally')",
    );
    await prisma.$executeRawUnsafe('CREATE TABLE users (id UUID PRIMARY KEY)');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE events (
        id UUID PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        event_type event_type NOT NULL DEFAULT 'townhall',
        status event_status NOT NULL DEFAULT 'draft',
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ,
        location_name VARCHAR(255),
        neighborhood VARCHAR(255),
        address VARCHAR(500),
        latitude DECIMAL(10, 7),
        longitude DECIMAL(10, 7),
        capacity INTEGER,
        organizer_user_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Mirror the production migration chain: visibility column first,
    // then the 'internal' -> 'private' rename that drops the details table.
    await applyMigration(
      prisma,
      '../../../prisma/migrations/20261109000000_event_visibility/migration.sql',
    );
    await applyMigration(
      prisma,
      '../../../prisma/migrations/20261109010000_event_visibility_private/migration.sql',
    );
    repository = new EventRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (admin) {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM events');
  });

  async function createEvent(input: { visibility: 'public' | 'private'; startsAt: Date }) {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO events (id, title, slug, status, starts_at, visibility)
      VALUES (${id}::uuid, ${`${input.visibility} event`}, ${`${input.visibility}-${id}`},
        'published'::event_status, ${input.startsAt}, ${input.visibility}::event_visibility)
    `;
    return id;
  }

  it('omits a published private event from the public weekly repository query', async () => {
    const weekStart = new Date('2026-05-04T06:00:00.000Z');
    const weekEnd = new Date('2026-05-11T06:00:00.000Z');
    const privateId = await createEvent({
      visibility: 'private',
      startsAt: new Date('2026-05-06T18:00:00.000Z'),
    });
    const publicId = await createEvent({
      visibility: 'public',
      startsAt: new Date('2026-05-07T18:00:00.000Z'),
    });

    const events = await repository.listPublishedInWeek(weekStart, weekEnd, 10);

    expect(events.map((event) => event.id)).toEqual([publicId]);
    expect(events.map((event) => event.id)).not.toContain(privateId);
  });

  it('omits private events from upcoming and in-range public listings', async () => {
    const from = new Date('2026-05-01T06:00:00.000Z');
    const privateId = await createEvent({
      visibility: 'private',
      startsAt: new Date('2026-05-06T18:00:00.000Z'),
    });
    const publicId = await createEvent({
      visibility: 'public',
      startsAt: new Date('2026-05-07T18:00:00.000Z'),
    });

    const upcoming = await repository.listUpcomingPublished(10, from);
    const inRange = await repository.listPublishedInRange(
      new Date('2026-05-01T06:00:00.000Z'),
      new Date('2026-05-31T06:00:00.000Z'),
    );

    expect(upcoming.map((event) => event.id)).toEqual([publicId]);
    expect(inRange.map((event) => event.id)).toEqual([publicId]);
    expect([privateId]).not.toContain(publicId);
  });

  it('returns 404 for public attendance registration against a private event', async () => {
    const privateId = await createEvent({
      visibility: 'private',
      startsAt: new Date(Date.now() + 86_400_000),
    });
    const service = new PublicEventosService(
      repository,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    const app = createTestApp((_app, router) => {
      const controller = new PublicEventosController(service);
      router.post('/api/v1/public/eventos/:eventId/asistencia', (req, res, next) => {
        void controller.registerAttendance(req, res, next);
      });
    });

    const response = await request(app)
      .post(`/api/v1/public/eventos/${privateId}/asistencia`)
      .send({ fullName: 'María Prueba', phone: '9611234567' });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('permite gestión administrativa de asistencia e invitaciones de un evento privado', async () => {
    const privateId = await createEvent({
      visibility: 'private',
      startsAt: new Date(Date.now() + 86_400_000),
    });
    const attendance = new AttendanceRepository(prisma as unknown as PrismaService);

    const event = await attendance.findEventByIdWithStatusCapacity(privateId);
    expect(event?.id).toBe(privateId);

    await expect(attendance.eventExists(privateId)).resolves.toBe(true);
  });

  it('omits private events from the getWeeklyEvents AI tool', async () => {
    const now = new Date('2026-05-06T12:00:00.000Z');
    await createEvent({ visibility: 'private', startsAt: new Date('2026-05-07T18:00:00.000Z') });

    const result = await new GetWeeklyEventsTool(repository, undefined, now).execute({
      limite: 10,
    });

    expect(result).toMatchObject({ found: false, items: [] });
  });

  it('stores private visibility through the migration chain', async () => {
    const id = await createEvent({
      visibility: 'private',
      startsAt: new Date('2026-05-07T18:00:00.000Z'),
    });

    const row = await prisma.event.findUniqueOrThrow({
      where: { id },
      select: { visibility: true },
    });

    expect(row.visibility).toBe('private');
  });
});
