import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { createCoordinatorRouter } from '../../routes/coordinator.routes';
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
    requirePermissions: (
      _prisma: unknown,
      permissions: string | string[],
      mode: 'all' | 'any' = 'all',
    ) => guard(permissions, mode),
    requireAnyPermission: (_prisma: unknown, permissions: string[]) => guard(permissions, 'any'),
  };
});

type AsyncFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

const coordinatorService = {
  list: jest.fn<AsyncFn<[{ sectionId?: string }], unknown[]>>(),
  create: jest.fn<AsyncFn<[Record<string, unknown>], Record<string, unknown>>>(),
  getById: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
  update: jest.fn<AsyncFn<[string, Record<string, unknown>], Record<string, unknown>>>(),
  delete: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
  reinvite: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
};

const auditService = {
  logFromRequest: jest
    .fn<AsyncFn<[unknown, Record<string, unknown>], void>>()
    .mockResolvedValue(undefined),
};

const prismaStub = {} as never;

const app = createTestApp((_, router) => {
  router.use(
    '/api/v1/coordinators',
    createCoordinatorRouter(coordinatorService as never, auditService as never, prismaStub),
  );
});

const COORDINATOR_ID = '550e8400-e29b-41d4-a716-446655440002';
const SECTION_ID = '550e8400-e29b-41d4-a716-446655440003';

describe('Coordinator routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/v1/coordinators requires coordinadores.view', async () => {
    coordinatorService.list.mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/v1/coordinators?sectionId=${SECTION_ID}`)
      .set('Authorization', 'Bearer role:COORDINADOR');

    expect(res.status).toBe(200);
    expect(coordinatorService.list).toHaveBeenCalledWith({ sectionId: SECTION_ID });
  });

  it('GET /api/v1/coordinators forwards structureId', async () => {
    coordinatorService.list.mockResolvedValue([]);
    const STRUCTURE_ID = '550e8400-e29b-41d4-a716-446655440010';

    const res = await request(app)
      .get(`/api/v1/coordinators?structureId=${STRUCTURE_ID}`)
      .set('Authorization', 'Bearer role:COORDINADOR');

    expect(res.status).toBe(200);
    expect(coordinatorService.list).toHaveBeenCalledWith({ structureId: STRUCTURE_ID });
  });

  it('POST /api/v1/coordinators requires coordinadores.create', async () => {
    coordinatorService.create.mockResolvedValue({
      coordinator: { id: COORDINATOR_ID },
      invitation: { id: 'inv-1', status: 'sent' },
    });

    const res = await request(app)
      .post('/api/v1/coordinators')
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({ sectionId: SECTION_ID, fullName: 'María', email: 'maria@ejemplo.test' });

    expect(res.status).toBe(201);
    expect(coordinatorService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionId: SECTION_ID,
        fullName: 'María',
        email: 'maria@ejemplo.test',
      }),
      expect.objectContaining({
        actorId: '550e8400-e29b-41d4-a716-446655440001',
        actorName: 'Admin Test',
      }),
    );
  });

  it('POST /api/v1/coordinators returns 409 on ownership conflict', async () => {
    coordinatorService.create.mockRejectedValue(AppError.conflict('Email already owns an entity'));

    const res = await request(app)
      .post('/api/v1/coordinators')
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({ sectionId: SECTION_ID, fullName: 'María', email: 'maria@ejemplo.test' });

    expect(res.status).toBe(409);
  });

  it('POST /api/v1/coordinators rejects invalid payloads', async () => {
    const res = await request(app)
      .post('/api/v1/coordinators')
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({ sectionId: SECTION_ID, fullName: 'M', email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(coordinatorService.create).not.toHaveBeenCalled();
  });

  it('PATCH /api/v1/coordinators/:id requires coordinadores.update', async () => {
    coordinatorService.update.mockResolvedValue({ id: COORDINATOR_ID, fullName: 'Updated' });

    const res = await request(app)
      .patch(`/api/v1/coordinators/${COORDINATOR_ID}`)
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({ fullName: 'Updated' });

    expect(res.status).toBe(200);
    expect(coordinatorService.update).toHaveBeenCalledWith(COORDINATOR_ID, { fullName: 'Updated' });
  });

  it('PATCH /api/v1/coordinators/:id rejects sectionId because the cargo is immutable', async () => {
    const res = await request(app)
      .patch(`/api/v1/coordinators/${COORDINATOR_ID}`)
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({ sectionId: SECTION_ID, fullName: 'Updated' });

    expect(res.status).toBe(400);
    expect(coordinatorService.update).not.toHaveBeenCalled();
  });

  it('DELETE /api/v1/coordinators/:id soft deletes', async () => {
    coordinatorService.delete.mockResolvedValue({ id: COORDINATOR_ID, isActive: false });

    const res = await request(app)
      .delete(`/api/v1/coordinators/${COORDINATOR_ID}`)
      .set('Authorization', 'Bearer role:SUPER_ADMIN');

    expect(res.status).toBe(200);
    expect(coordinatorService.delete).toHaveBeenCalledWith(COORDINATOR_ID);
  });

  it('POST /api/v1/coordinators/:id/reinvite requires coordinadores.update', async () => {
    coordinatorService.reinvite.mockResolvedValue({ invitation: { id: 'inv-2', status: 'sent' } });

    const res = await request(app)
      .post(`/api/v1/coordinators/${COORDINATOR_ID}/reinvite`)
      .set('Authorization', 'Bearer role:SUPER_ADMIN');

    expect(res.status).toBe(200);
    expect(coordinatorService.reinvite).toHaveBeenCalledWith(COORDINATOR_ID, {
      actorId: '550e8400-e29b-41d4-a716-446655440001',
      actorName: 'Admin Test',
    });
  });
});
