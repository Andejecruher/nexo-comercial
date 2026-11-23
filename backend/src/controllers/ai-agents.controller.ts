/**
 * Controlador de consulta de agentes IA para la bandeja de conversaciones.
 * Base: /api/v1/ai-agents
 * Lectura disponible para perfiles con acceso al inbox (conversaciones.view / tickets.view).
 */
import { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { AiAgentsService } from '../services/ai-agents.service';

const ListAgentsQuery = z.object({
  lineId: z.string().uuid().optional(),
});

export class AiAgentsController {
  constructor(private readonly service: AiAgentsService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { lineId } = ListAgentsQuery.parse(req.query);
      const agents = await this.service.listActiveAgents(lineId);
      res.json({ agents });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };
}
