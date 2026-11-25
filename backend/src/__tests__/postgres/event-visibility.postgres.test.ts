import { randomUUID } from 'crypto';

import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { GetWeeklyEventsTool } from '../../ai/tools/get-weekly-events.tool';
import { PublicEventosController } from '../../controllers/public-eventos.controller';
import { AttendanceRepository } from '../../repositories/attendance.repository';
import { EventRepository } from '../../repositories/event.repository';
import { PrismaService } from '../../services/prisma.service';
import { PublicEventosService } from '../../services/public-eventos.service';
import { createTestApp } from '../setup/test-app';
import { dropIsolatedDatabase, migrateIsolatedDatabase } from './baseline-schema';

describe('event visibility — real PostgreSQL', () => {
  const database = `event_visibility_test_${randomUUID().replace(/-/g, '')}`;
  let admin: PrismaClient;
  let prisma: PrismaClient;
  let repository: EventRepository;

  beforeAll(async () => {
    admin = new PrismaClient();
    const url = await migrateIsolatedDatabase(admin, database);
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    repository = new EventRepository(prisma as unknown as PrismaService);
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (admin) {
      await dropIsolatedDatabase(admin, database);
      await admin.$disconnect();
    }
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM events');
  });

  async function createEvent(input: { visibility: 'public' | 'private'; startsAt: Date }) {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO events (id, title, slug, status, starts_at, visibility, updated_at)
      VALUES (${id}::uuid, ${`${input.visibility} event`}, ${`${input.visibility}-${id}`},
        'published'::event_status, ${input.startsAt}, ${input.visibility}::event_visibility, now())
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
