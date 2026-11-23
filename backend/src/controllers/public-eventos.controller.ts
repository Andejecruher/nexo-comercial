import type { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';

import type { PublicEventosService } from '../services/public-eventos.service';

export const PublicEventoAsistenciaBodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(500),
    phone: z.string().trim().min(7).max(20),
    email: z.preprocess((v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'string' && v.trim() === '') return undefined;
      return v;
    }, z.string().email().optional()),
    consentGiven: z.boolean().optional(),
  })
  .refine((d) => d.fullName.trim().split(/\s+/).filter(Boolean).length >= 2, {
    message: 'Ingresá nombre y apellido',
    path: ['fullName'],
  });

const ReferenceDateQuerySchema = z.object({
  referenceDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const EventIdParamsSchema = z.object({
  eventId: z.string().uuid(),
});

export class PublicEventosController {
  constructor(private readonly publicEventosService: PublicEventosService) {}

  listWeek = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = ReferenceDateQuerySchema.safeParse(req.query);
      if (!q.success) {
        res.status(400).json({
          error: q.error.issues[0]?.message ?? 'Query inválida',
          code: 'VALIDATION_ERROR',
          details: q.error.issues,
        });
        return;
      }
      const result = await this.publicEventosService.listWeek({
        referenceDateStr: q.data.referenceDate,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  registerAttendance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = EventIdParamsSchema.parse(req.params);
      const body = PublicEventoAsistenciaBodySchema.parse(req.body);
      const result = await this.publicEventosService.registerAttendance({
        eventId: params.eventId,
        fullName: body.fullName,
        phoneRaw: body.phone,
        email: body.email,
        consentGiven: body.consentGiven,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        res.status(400).json({
          error: first?.message ?? 'Datos inválidos',
          code: 'VALIDATION_ERROR',
          details: err.issues,
        });
        return;
      }
      next(err);
    }
  };
}
