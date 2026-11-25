import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ScopeService } from '../services/scope.service';
import { NotFoundError, UnauthorizedError } from '../utils/app-error';
import type { ScopeKind } from '../types/auth.types';

/**
 * Middleware que resuelve el scope del usuario autenticado y lo inyecta en
 * req.scope. Debe ejecutarse después de authMiddleware.
 */
export function scopeMiddleware(scopeService: ScopeService): RequestHandler {
  const handler = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    try {
      req.scope = await scopeService.resolveScope(req.user.id);
      next();
    } catch (error) {
      next(error);
    }
  };

  return function scopeMiddlewareHandler(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    void handler(req, res, next).catch(next);
  };
}

/**
 * Factory que devuelve un middleware que exige uno de los kinds de scope
 * indicados. Si el scope no coincide, responde con 404 (RN6: nunca revelar
 * la existencia de recursos fuera de alcance).
 */
export function requireScope(...allowed: ScopeKind[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.scope || !allowed.includes(req.scope.kind)) {
      next(new NotFoundError('Resource not found'));
      return;
    }
    next();
  };
}
