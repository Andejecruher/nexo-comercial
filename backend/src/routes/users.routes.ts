/**
 * Rutas de administración de usuarios del panel.
 * Base: /api/v1/admin/users
 */
import { Router } from 'express';
import { UsersController } from '../controllers/users.controller';
import { UserNotificationPreferencesController } from '../controllers/user-notification-preferences.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { validate } from '../middlewares/validation';
import { AiAgentRepository } from '../repositories/ai-agent.repository';
import { DepartmentRepository } from '../repositories/department.repository';
import { UserNotificationPreferencesRepository } from '../repositories/user-notification-preferences.repository';
import type { AuditService } from '../services/audit.service';
import type { PrismaService } from '../services/prisma.service';
import type { UserService } from '../services/user.service';
import {
  UserNotificationPreferencesSchema,
  UserNotificationPreferencesService,
} from '../services/user-notification-preferences.service';

export function createUsersRouter(
  userService: UserService,
  audit: AuditService,
  prisma: PrismaService,
): Router {
  const router = Router();
  const ctrl = new UsersController(userService, audit);
  const preferencesService = new UserNotificationPreferencesService(
    new UserNotificationPreferencesRepository(prisma),
    new DepartmentRepository(prisma),
    new AiAgentRepository(prisma),
  );
  const preferencesCtrl = new UserNotificationPreferencesController(preferencesService);

  router.use(authMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.get('/me/notification-preferences', preferencesCtrl.getMy);
  router.put(
    '/me/notification-preferences',
    validate({ body: UserNotificationPreferencesSchema }),
    preferencesCtrl.updateMy,
  );

  router.get('/users', requirePermissions(prisma, 'users.view'), ctrl.list);
  router.get('/users/:id', requirePermissions(prisma, 'users.view'), ctrl.getById);

  router.post('/users', requirePermissions(prisma, 'users.create'), ctrl.create);
  router.post(
    '/users/:id/invitations/resend',
    requirePermissions(prisma, 'users.create'),
    ctrl.resendInvitation,
  );
  router.patch('/users/:id', requirePermissions(prisma, 'users.update'), ctrl.update);
  router.delete('/users/:id', requirePermissions(prisma, 'users.delete'), ctrl.deactivate);
  router.delete('/users/:id/delete', requirePermissions(prisma, 'users.delete'), ctrl.delete);

  router.post(
    '/users/:id/roles/:roleId',
    requirePermissions(prisma, 'roles.assign'),
    ctrl.assignRole,
  );
  router.delete(
    '/users/:id/roles/:roleId',
    requirePermissions(prisma, 'roles.assign'),
    ctrl.removeRole,
  );

  router.get('/config', requirePermissions(prisma, 'permissions.manage'), (_req, res) => {
    res.json({
      message: 'Configuración del sistema (solo SUPERADMIN)',
      features: {
        rbacEnabled: true,
        refreshTokenRotation: true,
        refreshTokenStorage: 'postgres',
        multiSession: true,
        auditLog: true,
        rateLimiting: true,
        progressiveLockout: true,
      },
    });
  });

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}

/** Perfil propio: no requiere permisos administrativos de usuarios. */
export function createUserProfileRouter(userService: UserService, audit: AuditService): Router {
  const router = Router();
  const ctrl = new UsersController(userService, audit);
  router.use(authMiddleware);
  /* eslint-disable @typescript-eslint/no-misused-promises */
  router.get('/me', ctrl.getMyProfile);
  router.patch('/me', ctrl.updateMyProfile);
  /* eslint-enable @typescript-eslint/no-misused-promises */
  return router;
}
