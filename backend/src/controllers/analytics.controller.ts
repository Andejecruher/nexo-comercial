/**
 * AnalyticsController — Endpoints de métricas de la plataforma.
 * Todos los endpoints son GET y soportan filtros opcionales via query params.
 */

import { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import type { AnalyticsService } from '../services/analytics/analytics.service';
import type { AnalyticsFilters } from '../services/analytics/analytics.types';

// ── Esquema de validación de query params ─────────────────────────────────────

const AnalyticsQuery = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    department: z.string().optional(),
    agentId: z.string().uuid('agentId debe ser un UUID válido').optional(),
  })
  .superRefine((data, ctx) => {
    const from = data.from ? new Date(data.from) : undefined;
    const to = data.to ? new Date(data.to) : undefined;

    if (data.from && isNaN(from!.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from: fecha inválida',
        path: ['from'],
      });
    }
    if (data.to && isNaN(to!.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'to: fecha inválida', path: ['to'] });
    }
    if (from && to && from > to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from debe ser anterior a to',
        path: ['from'],
      });
    }
  });

function parseFilters(query: Request['query']): AnalyticsFilters {
  const parsed = AnalyticsQuery.parse(query);
  return {
    from: parsed.from ? new Date(parsed.from) : undefined,
    to: parsed.to ? new Date(parsed.to) : undefined,
    department: parsed.department,
    agentId: parsed.agentId,
  };
}

export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  /**
   * GET /analytics/dashboard
   * Métricas completas del dashboard: KPIs, timings, volumen diario, SLA y flujo.
   */
  dashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = parseFilters(req.query);
      const data = await this.service.getDashboardMetrics(filters);
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
   * GET /analytics/tickets
   * KPIs, timings, volumen diario y SLA de tickets.
   */
  tickets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = parseFilters(req.query);
      const data = await this.service.getTicketMetrics(filters);
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
   * GET /analytics/agents
   * Performance por agente: tickets manejados, tiempos de respuesta y cumplimiento SLA.
   */
  agents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = parseFilters(req.query);
      const data = await this.service.getAgentMetrics(filters);
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
   * GET /analytics/departments
   * Distribución de tickets por departamento.
   */
  departments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = parseFilters(req.query);
      const data = await this.service.getDepartmentMetrics(filters);
      res.json(data);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Parámetros inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };
}
