import { SourceChannel } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';
import type { CitizensService } from '../services/citizens.service';
import type { NeighborhoodsService } from '../services/neighborhoods.service';
import { splitFullName } from '../utils/split-full-name';

export const PublicRegistroCiudadanoBodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(500),
    phone: z.string().trim().min(7).max(20),
    email: z.preprocess((v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'string' && v.trim() === '') return undefined;
      return v;
    }, z.string().email().optional()),
    neighborhoodId: z.string().uuid(),
    interests: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    consentGiven: z.boolean(),
  })
  .refine((data) => data.consentGiven === true, {
    message: 'Debés aceptar el tratamiento de datos personales',
    path: ['consentGiven'],
  });

export class PublicRegistroController {
  constructor(
    private readonly citizensService: CitizensService,
    private readonly neighborhoodsService: NeighborhoodsService,
  ) {}

  listBarrios = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const barrios = await this.neighborhoodsService.listPublicBarrios();
      res.json({ barrios });
    } catch (err) {
      next(err);
    }
  };

  registroCiudadano = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = PublicRegistroCiudadanoBodySchema.parse(req.body);
      const { name, lastName } = splitFullName(body.fullName);

      const citizen = await this.citizensService.create({
        phone: body.phone,
        name: name || undefined,
        lastName,
        email: body.email,
        neighborhoodId: body.neighborhoodId,
        interests: body.interests,
        consentGiven: true,
        sourceChannel: SourceChannel.web,
      });

      res.status(201).json({ citizen });
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
