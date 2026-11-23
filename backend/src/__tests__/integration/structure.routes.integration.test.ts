import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { createStructureRouter } from '../../routes/structure.routes';
import { AppError } from '../../utils/app-error';
import { createTestApp } from '../setup/test-app';

jest.mock('../../middlewares/auth.middleware', () => ({
  authMiddleware: (
    req: { headers: Record<string, string | undefined>; user?: unknown },
    res: { status: (code: number) => { json: (payload: Record<string, unknown>) => void } },
    next: () => void,
  ) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer role:')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    req.user = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      email: 'admin@vozciudadana.gob',
      fullName: 'Admin Test',
      roles: authHeader.slice('Bearer role:'.length).split(','),
    };
    next();
  },
}));

jest.mock('../../middlewares/permission.middleware', () => {
  const { hasAllPermissions, hasAnyPermission } = require('../../utils/authorization.util');
  const { ForbiddenError, UnauthorizedError } = require('../../utils/app-error');
  const ROLE_PERMS: Record<string, string[]> = {
    SUPER_ADMIN: ['*'],
    COORDINADOR: ['coordinadores.view'],
  };
  const allowed = (userPerms: string[], required: string[], mode: 'all' | 'any'): boolean => {
    if (userPerms.includes('*')) return true;
    return mode === 'any'
      ? hasAnyPermission(userPerms, required)
      : hasAllPermissions(userPerms, required);
  };
  const guard =
    (permissions: string | string[], mode: 'all' | 'any') =>
    (req: { user?: { roles?: string[] } }, _res: unknown, next: (err?: unknown) => void): void => {
      if (!req.user) {
        next(new UnauthorizedError('Authentication required'));
        return;
      }
      const roles = req.user.roles ?? [];
      const userPerms = Array.from(new Set(roles.flatMap((r) => ROLE_PERMS[r] ?? [])));
      const required = Array.isArray(permissions) ? permissions : [permissions];
      if (!allowed(userPerms, required, mode)) {
        next(new ForbiddenError(`Access denied. Required permissions: ${required.join(', ')}`));
        return;
      }
      next();
    };
  return {
    requirePermissions: (_prisma: unknown, permissions: string | string[], mode: 'all' | 'any' = 'all') =>
      guard(permissions, mode),
    requireAnyPermission: (_prisma: unknown, permissions: string[]) => guard(permissions, 'any'),
  };
});

type AsyncFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

const structureService = {
  list: jest.fn<AsyncFn<[{ includeInactive?: boolean }], unknown[]>>(),
  create: jest.fn<AsyncFn<[Record<string, unknown>], Record<string, unknown>>>(),
  getById: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
  update: jest.fn<AsyncFn<[string, Record<string, unknown>], Record<string, unknown>>>(),
  deactivate: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
};

const auditService = {
  logFromRequest: jest
    .fn<AsyncFn<[unknown, Record<string, unknown>], void>>()
    .mockResolvedValue(undefined),
};

const prismaStub = {} as never;

const app = createTestApp((_, router) => {
  router.use(
    '/api/v1/structures',
    createStructureRouter(structureService as never, auditService as never, prismaStub),
  );
});

const STRUCTURE_ID = '550e8400-e29b-41d4-a716-446655440010';

describe('Structure routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/v1/structures requires coordinadores.view', async () => {
    structureService.list.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/structures')
      .set('Authorization', 'Bearer role:COORDINADOR');

    expect(res.status).toBe(200);
    expect(structureService.list).toHaveBeenCalledWith({ includeInactive: false });
  });

  it('POST /api/v1/structures requires coordinadores.create', async () => {
    structureService.create.mockResolvedValue({
      id: STRUCTURE_ID,
      name: 'Territorial',
      slug: 'territorial',
    });

    const res = await request(app)
      .post('/api/v1/structures')
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({
        name: 'Territorial',
        color: '#10b981',
        managerFirstName: 'Ana',
        managerLastName: 'Torres',
        managerPhone: '+529611234567',
      });

    expect(res.status).toBe(201);
    expect(structureService.create).toHaveBeenCalledWith({
      name: 'Territorial',
      color: '#10B981',
      managerFirstName: 'Ana',
      managerLastName: 'Torres',
      managerPhone: '+529611234567',
    });
  });

  it('POST /api/v1/structures rejects a missing color', async () => {
    const res = await request(app)
      .post('/api/v1/structures')
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({ name: 'Territorial' });

    expect(res.status).toBe(400);
    expect(structureService.create).not.toHaveBeenCalled();
  });

  it('POST /api/v1/structures rejects a short name', async () => {
    const res = await request(app)
      .post('/api/v1/structures')
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({ name: 'A', color: '#10B981' });

    expect(res.status).toBe(400);
    expect(structureService.create).not.toHaveBeenCalled();
  });

  it('PATCH /api/v1/structures/:id rejects an invalid HEX color', async () => {
    const res = await request(app)
      .patch(`/api/v1/structures/${STRUCTURE_ID}`)
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({ color: 'red' });

    expect(res.status).toBe(400);
    expect(structureService.update).not.toHaveBeenCalled();
  });

  it('DELETE /api/v1/structures/:id returns 409 when coordinators are still active', async () => {
    structureService.deactivate.mockRejectedValue(
      AppError.conflict('No se puede desactivar la estructura mientras tenga coordinadores activos'),
    );

    const res = await request(app)
      .delete(`/api/v1/structures/${STRUCTURE_ID}`)
      .set('Authorization', 'Bearer role:SUPER_ADMIN');

    expect(res.status).toBe(409);
  });
});
