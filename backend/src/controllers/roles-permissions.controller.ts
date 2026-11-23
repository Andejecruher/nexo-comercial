import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { AuditService } from '../services/audit.service';
import {
  CreateRoleSchema,
  CreatePermissionSchema,
  PermissionIdParamSchema,
  PermissionQuerySchema,
  PermissionStatusSchema,
  ReplacePermissionsSchema,
  RoleIdParamSchema,
  RolePermissionParamSchema,
  RolesPermissionsService,
  UpdateRoleSchema,
  UpdatePermissionSchema,
} from '../services/roles-permissions.service';
import { AppError } from '../utils/app-error';

function handle(error: unknown, next: NextFunction): void {
  if (error instanceof ZodError) {
    next(AppError.badRequest(`Datos inválidos: ${error.issues[0]?.message ?? 'payload inválido'}`));
    return;
  }
  next(error);
}

export class RolesPermissionsController {
  constructor(
    private readonly service: RolesPermissionsService,
    private readonly audit: AuditService,
  ) {}

  listPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.listPermissions(PermissionQuerySchema.parse(req.query)));
    } catch (e) {
      handle(e, next);
    }
  };
  listAssignablePermissions = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      res.json({ permissions: await this.service.listAssignablePermissions() });
    } catch (e) {
      next(e);
    }
  };
  getPermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = PermissionIdParamSchema.parse(req.params);
      res.json({ permission: await this.service.getPermission(id) });
    } catch (e) {
      handle(e, next);
    }
  };
  createPermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = CreatePermissionSchema.parse(req.body);
      const permission = await this.service.createPermission(data);
      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'permission.create',
        targetType: 'Permission',
        targetId: permission.id,
        metadata: data,
      });
      res.status(201).json({ permission });
    } catch (e) {
      handle(e, next);
    }
  };
  updatePermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = PermissionIdParamSchema.parse(req.params);
      const data = UpdatePermissionSchema.parse(req.body);
      const before = await this.service.getPermission(id);
      const permission = await this.service.updatePermission(id, data);
      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'permission.update',
        targetType: 'Permission',
        targetId: id,
        metadata: { before, changes: data },
      });
      res.json({ permission });
    } catch (e) {
      handle(e, next);
    }
  };
  setPermissionStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = PermissionIdParamSchema.parse(req.params);
      const { isActive } = PermissionStatusSchema.parse(req.body);
      const permission = await this.service.setPermissionStatus(id, isActive);
      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: isActive ? 'permission.activate' : 'permission.deactivate',
        targetType: 'Permission',
        targetId: id,
        metadata: { affectedRoles: permission.affectedRoles },
      });
      res.json({ permission });
    } catch (e) {
      handle(e, next);
    }
  };
  listPermissionRoles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = PermissionIdParamSchema.parse(req.params);
      res.json({ roles: await this.service.listPermissionRoles(id) });
    } catch (e) {
      handle(e, next);
    }
  };
  listRoles = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ roles: await this.service.listRoles() });
    } catch (e) {
      next(e);
    }
  };
  getRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = RoleIdParamSchema.parse(req.params);
      res.json({ role: await this.service.getRole(id) });
    } catch (e) {
      handle(e, next);
    }
  };
  createRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = CreateRoleSchema.parse(req.body);
      const role = await this.service.createRole(data);
      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'role.create',
        targetType: 'Role',
        targetId: role.id,
        metadata: data,
      });
      res.status(201).json({ role });
    } catch (e) {
      handle(e, next);
    }
  };
  updateRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = RoleIdParamSchema.parse(req.params);
      const data = UpdateRoleSchema.parse(req.body);
      const role = await this.service.updateRole(id, data);
      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'role.update',
        targetType: 'Role',
        targetId: id,
        metadata: data,
      });
      res.json({ role });
    } catch (e) {
      handle(e, next);
    }
  };
  deleteRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = RoleIdParamSchema.parse(req.params);
      await this.service.deleteRole(id);
      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'role.delete',
        targetType: 'Role',
        targetId: id,
      });
      res.status(204).send();
    } catch (e) {
      handle(e, next);
    }
  };
  replaceRolePermissions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = RoleIdParamSchema.parse(req.params);
      const { permissionIds } = ReplacePermissionsSchema.parse(req.body);
      const role = await this.service.replacePermissions(id, permissionIds);
      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'role.permissions.replace',
        targetType: 'Role',
        targetId: id,
        metadata: { permissionIds },
      });
      res.json({ role });
    } catch (e) {
      handle(e, next);
    }
  };
  addRolePermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, permissionId } = RolePermissionParamSchema.parse(req.params);
      const role = await this.service.addPermission(id, permissionId);
      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'role.permission.add',
        targetType: 'Role',
        targetId: id,
        metadata: { permissionId },
      });
      res.json({ role });
    } catch (e) {
      handle(e, next);
    }
  };
  removeRolePermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, permissionId } = RolePermissionParamSchema.parse(req.params);
      const role = await this.service.removePermission(id, permissionId);
      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'role.permission.remove',
        targetType: 'Role',
        targetId: id,
        metadata: { permissionId },
      });
      res.json({ role });
    } catch (e) {
      handle(e, next);
    }
  };
}
