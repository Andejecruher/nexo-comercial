/**
 * PrecampanaAnalyticsController — Endpoints de métricas de precampaña (Promovidos)
 * y gestión de metas (PrecampaignGoal).
 *
 * Estilo espejo de AnalyticsController: métodos arrow en clase, try/catch con
 * ZodError → 400, delegación al servicio.
 */

import { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import type { PrecampanaAnalyticsService } from '../services/analytics/precampana-analytics.service';
import type { PrecampanaFilter } from '../repositories/precampana-analytics.repository';

// ── Esquema de query params ─────────────────────────────────────────────────────

const goalsQuerySchema = z.object({
  scope: z.enum(['GLOBAL', 'SECTION', 'LEADER']).optional(),
  cadence: z.enum(['CAMPAIGN', 'MONTHLY', 'WEEKLY']).optional(),
});

/**
 * Esquema de los query params del dashboard.
 * - `sectionId` / `leaderId`: UUID v4.
 * - `from` / `to`: strings ISO 8601; se validan como fecha y se chequea que
 *   `from < to` cuando ambos están presentes. `to` es exclusivo.
 */
const dashboardQuerySchema = z
  .object({
    sectionId: z.string().uuid().optional(),
    sectionCode: z.string().optional(),
    leaderId: z.string().uuid().optional(),
    coordinatorId: z.string().uuid().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const fromMs = data.from ? Date.parse(data.from) : NaN;
    const toMs = data.to ? Date.parse(data.to) : NaN;

    if (data.from && Number.isNaN(fromMs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'from debe ser una fecha ISO 8601 válida',
      });
    }
    if (data.to && Number.isNaN(toMs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'to debe ser una fecha ISO 8601 válida',
      });
    }
    if (data.from && data.to && !Number.isNaN(fromMs) && !Number.isNaN(toMs) && fromMs > toMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'from debe ser anterior a to',
      });
    }
    if (data.from && data.to && fromMs === toMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'to debe ser posterior a from',
      });
    }
    if (data.leaderId && (data.sectionId || data.sectionCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['leaderId'],
        message: 'leaderId no puede combinarse con un filtro de sección',
      });
    }
    if (data.coordinatorId && (data.leaderId || data.sectionId || data.sectionCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coordinatorId'],
        message: 'coordinatorId no puede combinarse con filtros de sección o líder',
      });
    }
    if (data.sectionId && data.sectionCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sectionId'],
        message: 'Usá sectionId o sectionCode, no ambos',
      });
    }
  });

export class PrecampanaAnalyticsController {
  constructor(private readonly service: PrecampanaAnalyticsService) {}

  /**
   * GET /analytics/precampana/dashboard
   * Métricas agregadas del dashboard de precampaña.
   * Query params opcionales: sectionId, leaderId, coordinatorId (UUID), from, to (ISO 8601).
   */
  dashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = dashboardQuerySchema.parse(req.query);
      const filter: PrecampanaFilter = {
        sectionId: parsed.sectionId,
        sectionCode: parsed.sectionCode,
        leaderId: parsed.leaderId,
        coordinatorId: parsed.coordinatorId,
        from: parsed.from ? new Date(parsed.from) : undefined,
        to: parsed.to ? new Date(parsed.to) : undefined,
      };
      const data = await this.service.getDashboardMetrics(filter);
      res.json(data);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Parámetros inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  /**
   * GET /analytics/precampana/filter-options
   * Catálogo activo de secciones, coordinadores y líderes para los selectores
   * del dashboard. No requiere permisos de catálogo electoral.
   */
  filterOptions = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getFilterOptions();
      res.json(data);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /analytics/precampana/goals?scope=SECTION&cadence=WEEKLY
   * Lista metas activas, opcionalmente filtradas por alcance y cadencia.
   */
  goals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = goalsQuerySchema.parse(req.query);
      const data = await this.service.getGoals(parsed);
      res.json(data);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Parámetros inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  /**
   * POST /analytics/precampana/goals
   * Crea una nueva meta de precampaña.
   */
  createGoal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const goal = await this.service.createGoal(req.body);
      res.status(201).json(goal);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Parámetros inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  /**
   * PATCH /analytics/precampana/goals/:id
   * Actualiza parcialmente una meta.
   */
  updateGoal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const goal = await this.service.updateGoal(req.params.id, req.body);
      res.json(goal);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Parámetros inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  /**
   * PATCH /analytics/precampana/goals/:id/deactivate
   * Desactiva una meta (soft delete).
   */
  deactivateGoal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const goal = await this.service.deactivateGoal(req.params.id);
      res.json(goal);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Parámetros inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };
}
