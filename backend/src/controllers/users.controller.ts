import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { AuditService } from '../services/audit.service';
import {
  CreateUserSchema,
  UpdateUserSchema,
  UserIdParamSchema,
  UserRoleParamSchema,
  type UserService,
} from '../services/user.service';
import { AppError } from '../utils/app-error';

export class UsersController {
  constructor(
    private readonly userService: UserService,
    private readonly audit: AuditService,
  ) {}

  getMyProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized();
      res.json({ user: await this.userService.getProfile(req.user.id) });
    } catch (error) {
      next(error);
    }
  };

  updateMyProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw AppError.unauthorized();
      const user = await this.userService.updateProfile(req.user.id, req.body);
      res.status(200).json({ user });
    } catch (error) {
      next(error);
    }
  };

  list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await this.userService.listUsers();
      res.json({ users });
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = UserIdParamSchema.parse(req.params);
      const user = await this.userService.getUserById(id);
      res.json({ user });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = CreateUserSchema.parse(req.body);
      const user = await this.userService.createUser(data, {
        actorId: req.user?.id,
        actorName: req.user?.fullName ?? req.user?.email,
      });

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'user.create',
        targetType: 'User',
        targetId: user.id,
        metadata: {
          email: user.email,
          roleIds: data.roleIds ?? [],
        },
      });

      const { invitation, ...createdUser } = user;
      res.status(201).json({
        user: createdUser,
        ...(invitation ? { invitation } : {}),
        ...(invitation?.status === 'failed'
          ? {
              warning: {
                code: 'INVITATION_EMAIL_FAILED',
                message: 'El usuario fue creado, pero no fue posible enviar la invitación.',
              },
            }
          : {}),
      });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = UserIdParamSchema.parse(req.params);
      const data = UpdateUserSchema.parse(req.body);

      const user = await this.userService.updateUser(id, data);

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'user.update',
        targetType: 'User',
        targetId: id,
        metadata: {
          fullName: data.fullName,
          isActive: data.isActive,
          passwordChanged: data.password !== undefined,
        },
      });

      res.json({ user });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  assignRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, roleId } = UserRoleParamSchema.parse(req.params);
      const user = await this.userService.assignRole(id, roleId);

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'role.assign',
        targetType: 'User',
        targetId: id,
        metadata: { roleId },
      });

      res.json({ user });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  removeRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, roleId } = UserRoleParamSchema.parse(req.params);
      const user = await this.userService.removeRole(id, roleId);

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'role.remove',
        targetType: 'User',
        targetId: id,
        metadata: { roleId },
      });

      res.json({ user });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  resendInvitation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = UserIdParamSchema.parse(req.params);
      const result = await this.userService.resendInvitation(id, {
        actorId: req.user?.id,
        actorName: req.user?.fullName ?? req.user?.email,
      });

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'user.invitation.resend',
        targetType: 'User',
        targetId: id,
        metadata: { invitationId: result.invitation.id, status: result.invitation.status },
      });

      res.json({
        invitation: result.invitation,
        ...(result.invitation.status === 'failed'
          ? {
              warning: {
                code: 'INVITATION_EMAIL_FAILED',
                message: 'No fue posible reenviar la invitación.',
              },
            }
          : {}),
      });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  /**
   * DELETE /admin/users/:id — desactivación lógica del usuario.
   * No hay hard delete: se marca isActive=false para preservar auditoría.
   * Impide auto-desactivación para evitar lockout accidental de SUPERADMIN.
   */
  deactivate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = UserIdParamSchema.parse(req.params);

      if (req.user?.id === id) {
        throw AppError.badRequest('No podés desactivarte a vos mismo');
      }

      const user = await this.userService.updateUser(id, { isActive: false });

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'user.deactivate',
        targetType: 'User',
        targetId: id,
        metadata: { email: user.email },
      });

      res.json({ user });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = UserIdParamSchema.parse(req.params);
      await this.userService.deleteUserById(id);

      await this.audit.logFromRequest(req, {
        actorId: req.user?.id,
        action: 'user.delete',
        targetType: 'User',
        targetId: id,
      });

      res.json({ success: true });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };
}
