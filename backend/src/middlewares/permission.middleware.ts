import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AuthorizationService } from '../services/authorization.service';
import type { PrismaService } from '../services/prisma.service';
import { ForbiddenError, UnauthorizedError } from '../utils/app-error';
import { hasAllPermissions, hasAnyPermission } from '../utils/authorization.util';

export function requirePermissions(
  prisma: PrismaService,
  permissions: string | string[],
  mode: 'all' | 'any' = 'all',
): RequestHandler {
  const required = Array.isArray(permissions) ? permissions : [permissions];
  const authorization = new AuthorizationService(prisma);

  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async (): Promise<void> => {
      try {
        if (!req.user) {
          next(new UnauthorizedError('Authentication required'));
          return;
        }

        const userPermissions = await authorization.getUserPermissionSlugs(req.user.id);
        req.user.permissions = userPermissions;
        const allowed =
          mode === 'any'
            ? hasAnyPermission(userPermissions, required)
            : hasAllPermissions(userPermissions, required);

        if (!allowed) {
          next(new ForbiddenError(`Access denied. Required permissions: ${required.join(', ')}`));
          return;
        }

        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}

export const requireAnyPermission = (
  prisma: PrismaService,
  permissions: string[],
): RequestHandler => requirePermissions(prisma, permissions, 'any');
