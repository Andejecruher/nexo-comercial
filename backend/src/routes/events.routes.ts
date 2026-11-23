import { Router } from 'express';

import { EventsController } from '../controllers/events.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { paginate } from '../middlewares/pagination';
import type { AttendanceService } from '../services/attendance.service';
import type { AuditService } from '../services/audit.service';
import type { EventService } from '../services/event.service';
import type { PrismaService } from '../services/prisma.service';

export function createEventsRouter(
  eventService: EventService,
  attendanceService: AttendanceService,
  audit: AuditService,
  prisma: PrismaService,
): Router {
  const router = Router();
  const ctrl = new EventsController(eventService, attendanceService, audit);

  router.use(authMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  // ── Eventos CRUD ──────────────────────────────────────────────────────────
  router.get('/events', requirePermissions(prisma, ['eventos.view'], 'all'), paginate(), ctrl.list);
  router.post('/events', requirePermissions(prisma, ['eventos.create'], 'all'), ctrl.create);
  router.get('/events/:id', requirePermissions(prisma, ['eventos.view'], 'all'), ctrl.get);
  router.patch('/events/:id', requirePermissions(prisma, ['eventos.update'], 'all'), ctrl.update);

  // ── Invitaciones masivas ──────────────────────────────────────────────────
  router.post(
    '/events/:id/invite',
    requirePermissions(prisma, ['eventos.update'], 'all'),
    ctrl.invite,
  );

  // ── Registros ─────────────────────────────────────────────────────────────
  router.post(
    '/events/:id/registrations',
    requirePermissions(prisma, ['eventos.update'], 'all'),
    ctrl.register,
  );
  router.get(
    '/events/:id/registrations',
    requirePermissions(prisma, ['eventos.view'], 'all'),
    paginate(),
    ctrl.listRegistrations,
  );
  router.patch(
    '/events/:id/registrations/:registrationId/confirm',
    requirePermissions(prisma, ['eventos.update'], 'all'),
    ctrl.confirm,
  );
  router.post(
    '/events/:id/registrations/:registrationId/checkin',
    requirePermissions(prisma, ['eventos.update'], 'all'),
    ctrl.checkIn,
  );

  // ── Asistentes ────────────────────────────────────────────────────────────
  router.get(
    '/events/:id/attendees',
    requirePermissions(prisma, ['eventos.view'], 'all'),
    paginate(),
    ctrl.listAttendees,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
