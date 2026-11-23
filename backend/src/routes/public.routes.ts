import { Router } from 'express';
import { PublicEventosController } from '../controllers/public-eventos.controller';
import { PublicNewsletterController } from '../controllers/public-newsletter.controller';
import { PublicRegistroController } from '../controllers/public-registro.controller';
import {
  createPublicBarriosRateLimitMiddleware,
  createPublicEventosAsistenciaRateLimitMiddleware,
  createPublicEventosSemanaRateLimitMiddleware,
  createPublicNewsletterRateLimitMiddleware,
  createPublicRegistroRateLimitMiddleware,
} from '../middlewares/public-ip-rate-limit.middleware';
import type { CitizensService } from '../services/citizens.service';
import type { NeighborhoodsService } from '../services/neighborhoods.service';
import type { NewsletterService } from '../services/newsletter.service';
import type { PublicEventosService } from '../services/public-eventos.service';
import type { PostgresRateLimiter } from '../services/postgres-rate-limiter.service';

export function createPublicRouter(
  citizensService: CitizensService,
  neighborhoodsService: NeighborhoodsService,
  rateLimiter: PostgresRateLimiter,
  newsletterService: NewsletterService,
  publicEventosService: PublicEventosService,
): Router {
  const router = Router();
  const ctrl = new PublicRegistroController(citizensService, neighborhoodsService);
  const newsletterCtrl = new PublicNewsletterController(newsletterService);
  const eventosCtrl = new PublicEventosController(publicEventosService);
  const registroRl = createPublicRegistroRateLimitMiddleware(rateLimiter);
  const barriosRl = createPublicBarriosRateLimitMiddleware(rateLimiter);
  const newsletterRl = createPublicNewsletterRateLimitMiddleware(rateLimiter);
  const eventosSemanaRl = createPublicEventosSemanaRateLimitMiddleware(rateLimiter);
  const eventosAsistenciaRl = createPublicEventosAsistenciaRateLimitMiddleware(rateLimiter);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.get('/barrios', barriosRl, ctrl.listBarrios);
  router.post('/registro-ciudadano', registroRl, ctrl.registroCiudadano);

  router.get('/eventos/semana', eventosSemanaRl, eventosCtrl.listWeek);
  router.post('/eventos/:eventId/asistencia', eventosAsistenciaRl, eventosCtrl.registerAttendance);

  router.post('/newsletter/subscribe', newsletterRl, newsletterCtrl.subscribe);
  router.get('/newsletter/verify/:token', newsletterRl, newsletterCtrl.verify);
  router.post('/newsletter/confirm/:token', newsletterRl, newsletterCtrl.confirm);
  router.post('/newsletter/unsubscribe', newsletterRl, newsletterCtrl.unsubscribe);

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
