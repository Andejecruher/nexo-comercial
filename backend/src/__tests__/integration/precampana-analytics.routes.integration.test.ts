import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { PrecampanaAnalyticsController } from '../../controllers/precampana-analytics.controller';
import { createPrecampanaAnalyticsRouter } from '../../routes/precampana-analytics.routes';
import { AppError } from '../../utils/app-error';
import { createTestApp } from '../setup/test-app';

jest.mock('../../middlewares/jwt.middleware', () => ({
  jwtMiddleware: (
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
    CAPTURISTA: ['indicadores_precampana.view'],
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

const analyticsService = {
  getDashboardMetrics: jest.fn<AsyncFn<[Record<string, unknown>], Record<string, unknown>>>(),
  getFilterOptions: jest.fn<AsyncFn<[], Record<string, unknown>>>(),
  getGoals: jest.fn<AsyncFn<[Record<string, unknown>], unknown[]>>(),
  createGoal: jest.fn<AsyncFn<[unknown], Record<string, unknown>>>(),
  updateGoal: jest.fn<AsyncFn<[string, unknown], Record<string, unknown>>>(),
  deactivateGoal: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
};

const prismaStub = {} as never;
const controller = new PrecampanaAnalyticsController(analyticsService as never);

const app = createTestApp((_, router) => {
  router.use('/api/v1/analytics', createPrecampanaAnalyticsRouter(controller, prismaStub));
});

const COORDINATOR_ID = '550e8400-e29b-41d4-a716-446655440010';
const LEADER_ID = '550e8400-e29b-41d4-a716-446655440011';
const SECTION_ID = '550e8400-e29b-41d4-a716-446655440012';

describe('Precampaña analytics routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /dashboard requires indicadores_precampana.view', async () => {
    analyticsService.getDashboardMetrics.mockResolvedValue({ total: 0, byCoordinator: [] });

    const denied = await request(app)
      .get('/api/v1/analytics/precampana/dashboard')
      .set('Authorization', 'Bearer role:COORDINADOR');
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .get('/api/v1/analytics/precampana/dashboard')
      .set('Authorization', 'Bearer role:CAPTURISTA');
    expect(allowed.status).toBe(200);
  });

  it('GET /dashboard forwards coordinatorId as a UUID filter', async () => {
    analyticsService.getDashboardMetrics.mockResolvedValue({
      total: 5,
      byCoordinator: [{ coordinatorId: COORDINATOR_ID, total: 5, coveragePct: null }],
      leadersWithoutQuota: 1,
    });

    const res = await request(app)
      .get(`/api/v1/analytics/precampana/dashboard?coordinatorId=${COORDINATOR_ID}`)
      .set('Authorization', 'Bearer role:CAPTURISTA');

    expect(res.status).toBe(200);
    expect(res.body.byCoordinator).toHaveLength(1);
    expect(res.body.leadersWithoutQuota).toBe(1);
    expect(analyticsService.getDashboardMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ coordinatorId: COORDINATOR_ID }),
    );
  });

  it('GET /dashboard rejects combining coordinatorId with leader or section filters', async () => {
    const withLeader = await request(app)
      .get(
        `/api/v1/analytics/precampana/dashboard?coordinatorId=${COORDINATOR_ID}&leaderId=${LEADER_ID}`,
      )
      .set('Authorization', 'Bearer role:CAPTURISTA');
    expect(withLeader.status).toBe(400);
    expect(analyticsService.getDashboardMetrics).not.toHaveBeenCalled();

    const withSection = await request(app)
      .get(
        `/api/v1/analytics/precampana/dashboard?coordinatorId=${COORDINATOR_ID}&sectionId=${SECTION_ID}`,
      )
      .set('Authorization', 'Bearer role:CAPTURISTA');
    expect(withSection.status).toBe(400);

    const withCode = await request(app)
      .get(
        `/api/v1/analytics/precampana/dashboard?coordinatorId=${COORDINATOR_ID}&sectionCode=2401`,
      )
      .set('Authorization', 'Bearer role:CAPTURISTA');
    expect(withCode.status).toBe(400);
  });

  it('GET /dashboard still combines dates with coordinator scope', async () => {
    analyticsService.getDashboardMetrics.mockResolvedValue({ total: 1 });

    const res = await request(app)
      .get(
        `/api/v1/analytics/precampana/dashboard?coordinatorId=${COORDINATOR_ID}&from=2026-08-01T00:00:00.000Z&to=2026-08-15T00:00:00.000Z`,
      )
      .set('Authorization', 'Bearer role:CAPTURISTA');

    expect(res.status).toBe(200);
    expect(analyticsService.getDashboardMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinatorId: COORDINATOR_ID,
        from: new Date('2026-08-01T00:00:00.000Z'),
        to: new Date('2026-08-15T00:00:00.000Z'),
      }),
    );
  });

  it('GET /filter-options returns the active catalog without coordinadores.view', async () => {
    analyticsService.getFilterOptions.mockResolvedValue({
      sections: [{ id: SECTION_ID, sectionCode: '2401' }],
      coordinators: [{ id: COORDINATOR_ID, fullName: 'Ana Torres' }],
      leaders: [{ id: LEADER_ID, fullName: 'Juan Pérez' }],
    });

    const res = await request(app)
      .get('/api/v1/analytics/precampana/filter-options')
      .set('Authorization', 'Bearer role:CAPTURISTA');

    expect(res.status).toBe(200);
    expect(res.body.coordinators[0].id).toBe(COORDINATOR_ID);
    expect(analyticsService.getFilterOptions).toHaveBeenCalled();
  });

  it('propagates service 400 when the coordinator is inactive', async () => {
    analyticsService.getDashboardMetrics.mockRejectedValue(
      AppError.badRequest('El coordinador seleccionado no existe o está inactivo'),
    );

    const res = await request(app)
      .get(`/api/v1/analytics/precampana/dashboard?coordinatorId=${COORDINATOR_ID}`)
      .set('Authorization', 'Bearer role:CAPTURISTA');

    expect(res.status).toBe(400);
  });
});
