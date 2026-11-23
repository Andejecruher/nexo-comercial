import { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { BulkActionQueue } from '../services/bulk/bulk-action-queue.service';
import { BulkActionSchema } from '../services/bulk/bulk-action.schema';
import { AppError } from '../utils/app-error';

export class BulkActionsController {
  constructor(private readonly queue: BulkActionQueue) {}
  enqueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized();
      const payload = BulkActionSchema.parse(req.body);
      const requestKey = z.string().uuid().parse(req.get('Idempotency-Key'));
      res.status(202).json(await this.queue.enqueue(req.user.id, requestKey, payload));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: 'Solicitud masiva inválida', details: error.issues });
        return;
      }
      next(error);
    }
  };
  status = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized();
      res.json(await this.queue.status(req.user.id, z.string().uuid().parse(req.params.jobId)));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: 'Identificador inválido' });
        return;
      }
      next(error);
    }
  };
}
