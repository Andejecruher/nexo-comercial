import type { NextFunction, Request, Response } from 'express';
import type { CoordinatorService } from '../services/coordinator.service';
import type { AuditService } from '../services/audit.service';

export class CoordinatorController {
  constructor(
    private readonly service: CoordinatorService,
    private readonly audit: AuditService,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sectionId = typeof req.query.sectionId === 'string' ? req.query.sectionId : undefined;
      const structureId =
        typeof req.query.structureId === 'string' ? req.query.structureId : undefined;
      const coordinators = await this.service.list({
        ...(sectionId ? { sectionId } : {}),
        ...(structureId ? { structureId } : {}),
      });
      res.json({ coordinators });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.create(req.body, {
        actorId: req.user?.id,
        actorName: req.user?.fullName ?? undefined,
      });
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'coordinator.create',
        targetType: 'Coordinator',
        targetId: result.coordinator.id,
        metadata: { sectionId: req.body.sectionId, structureId: req.body.structureId },
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const coordinator = await this.service.getById(req.params.id);
      res.json({ coordinator });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const coordinator = await this.service.update(req.params.id, req.body);
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'coordinator.update',
        targetType: 'Coordinator',
        targetId: coordinator.id,
        metadata: req.body,
      });
      res.json({ coordinator });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const coordinator = await this.service.delete(req.params.id);
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'coordinator.delete',
        targetType: 'Coordinator',
        targetId: coordinator.id,
        metadata: { isActive: coordinator.isActive },
      });
      res.json({ coordinator });
    } catch (error) {
      next(error);
    }
  };

  reinvite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.reinvite(req.params.id, {
        actorId: req.user?.id,
        actorName: req.user?.fullName ?? undefined,
      });
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'coordinator.reinvite',
        targetType: 'Coordinator',
        targetId: req.params.id,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
