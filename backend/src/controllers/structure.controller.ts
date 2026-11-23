import type { NextFunction, Request, Response } from 'express';
import type { AuditService } from '../services/audit.service';
import type { StructureService } from '../services/structure.service';

export class StructureController {
  constructor(
    private readonly service: StructureService,
    private readonly audit: AuditService,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const includeInactive =
        typeof req.query.includeInactive === 'boolean'
          ? req.query.includeInactive
          : req.query.includeInactive === 'true';
      const structures = await this.service.list({ includeInactive });
      res.json({ structures });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const structure = await this.service.create(req.body);
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'structure.create',
        targetType: 'OrganizationalStructure',
        targetId: structure.id,
        metadata: { name: structure.name, slug: structure.slug },
      });
      res.status(201).json({ structure });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const structure = await this.service.getById(req.params.id);
      res.json({ structure });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const structure = await this.service.update(req.params.id, req.body);
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'structure.update',
        targetType: 'OrganizationalStructure',
        targetId: structure.id,
        metadata: req.body,
      });
      res.json({ structure });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const structure = await this.service.deactivate(req.params.id);
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'structure.delete',
        targetType: 'OrganizationalStructure',
        targetId: structure.id,
        metadata: { isActive: structure.isActive },
      });
      res.json({ structure });
    } catch (error) {
      next(error);
    }
  };
}
