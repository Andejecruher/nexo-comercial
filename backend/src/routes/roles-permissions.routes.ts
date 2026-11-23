import { Router } from 'express';
import { RolesPermissionsController } from '../controllers/roles-permissions.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import type { AuditService } from '../services/audit.service';
import type { PrismaService } from '../services/prisma.service';
import type { RolesPermissionsService } from '../services/roles-permissions.service';

export function createRolesPermissionsRouter(
  prisma: PrismaService,
  service: RolesPermissionsService,
  audit: AuditService,
): Router {
  const router = Router();
  const ctrl = new RolesPermissionsController(service, audit);

  router.use(authMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.get('/permissions', requirePermissions(prisma, 'permissions.view'), ctrl.listPermissions);
  router.get(
    '/permissions/assignable',
    requirePermissions(prisma, 'permissions.view'),
    ctrl.listAssignablePermissions,
  );
  router.get(
    '/permissions/:id/roles',
    requirePermissions(prisma, 'permissions.view'),
    ctrl.listPermissionRoles,
  );
  router.get(
    '/permissions/:id',
    requirePermissions(prisma, 'permissions.view'),
    ctrl.getPermission,
  );
  router.post(
    '/permissions',
    requirePermissions(prisma, 'permissions.create'),
    ctrl.createPermission,
  );
  router.patch(
    '/permissions/:id',
    requirePermissions(prisma, 'permissions.update'),
    ctrl.updatePermission,
  );
  router.patch(
    '/permissions/:id/status',
    requirePermissions(prisma, 'permissions.deactivate'),
    ctrl.setPermissionStatus,
  );
  router.get('/roles', requirePermissions(prisma, 'roles.view'), ctrl.listRoles);
  router.get('/roles/:id', requirePermissions(prisma, 'roles.view'), ctrl.getRole);
  router.post('/roles', requirePermissions(prisma, 'roles.create'), ctrl.createRole);
  router.patch('/roles/:id', requirePermissions(prisma, 'roles.update'), ctrl.updateRole);
  router.delete('/roles/:id', requirePermissions(prisma, 'roles.delete'), ctrl.deleteRole);
  router.put(
    '/roles/:id/permissions',
    requirePermissions(prisma, 'permissions.manage'),
    ctrl.replaceRolePermissions,
  );
  router.post(
    '/roles/:id/permissions/:permissionId',
    requirePermissions(prisma, 'permissions.manage'),
    ctrl.addRolePermission,
  );
  router.delete(
    '/roles/:id/permissions/:permissionId',
    requirePermissions(prisma, 'permissions.manage'),
    ctrl.removeRolePermission,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
