import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { createIneOcrRouter } from '../../routes/ine-ocr.routes';
import { AppError } from '../../utils/app-error';
import { createTestApp } from '../setup/test-app';

jest.mock('../../middlewares/auth.middleware', () => ({
  authMiddleware: (
    req: { headers: Record<string, string | undefined>; user?: unknown; scope?: unknown },
    res: { status: (code: number) => { json: (payload: Record<string, unknown>) => void } },
    next: () => void,
  ) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer role:')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    const roles = authHeader.slice('Bearer role:'.length).split(',');
    req.user = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      email: 'admin@vozciudadana.gob',
      fullName: 'Admin Test',
      roles,
    };
    if (roles.includes('SUPER_ADMIN') || roles.includes('CAPTURISTA')) {
      req.scope = { kind: 'admin' };
    } else if (roles.includes('COORDINADOR')) {
      req.scope = { kind: 'coordinator', sectionId: PARENT_ID, coordinatorId: ITEM_ID };
    } else if (roles.includes('LIDER')) {
      req.scope = { kind: 'leader', sectionId: PARENT_ID, leaderId: ITEM_ID };
    } else {
      req.scope = { kind: 'none' };
    }
    next();
  },
}));

// Test de comportamiento del controlador: el guard deriva permisos del rol del
// token. SUPER_ADMIN omnipermitido; COORDINADOR sólo lee el catálogo electoral
// (preserva el 403 de `PATCH /catalog/leaders` con COORDINADOR).

jest.mock('../../middlewares/scope.middleware', () => {
  const { NotFoundError } = require('../../utils/app-error');
  return {
    scopeMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireScope:
      (...allowed: string[]) =>
      (req: { scope?: { kind: string } }, _res: unknown, next: (err?: unknown) => void): void => {
        if (!req.scope || !allowed.includes(req.scope.kind)) {
          next(new NotFoundError('Resource not found'));
          return;
        }
        next();
      },
    scopeWhere: jest.fn().mockReturnValue(undefined),
  };
});

jest.mock('../../middlewares/permission.middleware', () => {
  const { hasAllPermissions, hasAnyPermission } = require('../../utils/authorization.util');
  const { ForbiddenError, UnauthorizedError } = require('../../utils/app-error');
  const ROLE_PERMS: Record<string, string[]> = {
    SUPER_ADMIN: ['*'],
    COORDINADOR: ['catalogo_electoral.view', 'promovidos.view', 'lideres.view'],
    LIDER: [
      'catalogo_electoral.view',
      'lideres.view',
      'promovidos.view',
      'promovidos.create',
      'promovidos.update',
      'promovidos.delete',
    ],
    CAPTURISTA: [
      'lideres.view',
      'lideres.create',
      'lideres.update',
      'lideres.delete',
      'catalogo_electoral.view',
    ],
    OPERADOR_CHAT: ['conversaciones.view'],
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

const catalogService = {
  listStates: jest.fn<AsyncFn<[boolean | undefined], unknown[]>>(),
  listDistricts: jest.fn<AsyncFn<[string | undefined, boolean | undefined], unknown[]>>(),
  listSections: jest.fn<AsyncFn<[Record<string, unknown>], unknown[]>>(),
  listLeaders: jest.fn<
    AsyncFn<[Record<string, unknown>, unknown], { leaders: unknown[]; totalCount?: number; hasNextPage?: boolean }>
  >(),
  createState: jest.fn<AsyncFn<[Record<string, unknown>], Record<string, unknown>>>(),
  createDistrict: jest.fn<AsyncFn<[Record<string, unknown>], Record<string, unknown>>>(),
  createSection: jest.fn<AsyncFn<[Record<string, unknown>], Record<string, unknown>>>(),
  createLeader: jest.fn<AsyncFn<[Record<string, unknown>], Record<string, unknown>>>(),
  updateState: jest.fn<AsyncFn<[string, Record<string, unknown>], Record<string, unknown>>>(),
  updateDistrict: jest.fn<AsyncFn<[string, Record<string, unknown>], Record<string, unknown>>>(),
  updateSection: jest.fn<AsyncFn<[string, Record<string, unknown>], Record<string, unknown>>>(),
  updateLeader: jest.fn<AsyncFn<[string, Record<string, unknown>], Record<string, unknown>>>(),
  deactivateState: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
  deactivateDistrict: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
  deactivateSection: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
  deactivateLeader: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
  reinviteLeader: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
};

const auditService = {
  logFromRequest: jest
    .fn<AsyncFn<[unknown, Record<string, unknown>], void>>()
    .mockResolvedValue(undefined),
};

const prismaMock = {} as never;
const scopeService = {
  resolveScope: jest.fn<AsyncFn<[string], unknown>>().mockResolvedValue({ kind: 'admin' }),
};

const app = createTestApp((_, router) => {
  router.use(
    '/api/v1/ine-ocr',
    createIneOcrRouter(
      catalogService as never,
      prismaMock,
      auditService as never,
      scopeService as never,
    ),
  );
});

const ITEM_ID = '550e8400-e29b-41d4-a716-446655440002';
const PARENT_ID = '550e8400-e29b-41d4-a716-446655440003';

describe('INE OCR catalog integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auditService.logFromRequest.mockResolvedValue(undefined);
  });

  it('GET catalog states accepts includeInactive for workflow roles', async () => {
    catalogService.listStates.mockResolvedValue([]);

    const response = await request(app)
      .get('/api/v1/ine-ocr/catalog/states?includeInactive=true')
      .set('Authorization', 'Bearer role:COORDINADOR');

    expect(response.status).toBe(200);
    expect(catalogService.listStates).toHaveBeenCalledWith(true);
  });

  it('POST catalog section forwards operational metrics', async () => {
    catalogService.createSection.mockResolvedValue({
      id: ITEM_ID,
      stateId: PARENT_ID,
      districtId: PARENT_ID,
      sectionCode: '0042',
      pollingStationCount: 6,
      votesPerStation: 100,
      nominalList: 1200,
      votesRequired: 600,
    });

    const response = await request(app)
      .post('/api/v1/ine-ocr/catalog/sections')
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({
        stateId: PARENT_ID,
        districtId: PARENT_ID,
        sectionCode: '0042',
        pollingStationCount: 6,
        votesPerStation: 100,
        nominalList: 1200,
        votesRequired: 600,
      });

    expect(response.status).toBe(201);
    expect(catalogService.createSection).toHaveBeenCalledWith({
      stateId: PARENT_ID,
      districtId: PARENT_ID,
      sectionCode: '0042',
      pollingStationCount: 6,
      votesPerStation: 100,
      nominalList: 1200,
      votesRequired: 600,
    });
  });

  it('PATCH catalog state updates and audits with SUPERADMIN', async () => {
    catalogService.updateState.mockResolvedValue({
      id: ITEM_ID,
      code: '07',
      name: 'Chiapas',
      isActive: true,
    });

    const response = await request(app)
      .patch(`/api/v1/ine-ocr/catalog/states/${ITEM_ID}`)
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({ name: 'Chiapas' });

    expect(response.status).toBe(200);
    expect(catalogService.updateState).toHaveBeenCalledWith(ITEM_ID, { name: 'Chiapas' });
    expect(auditService.logFromRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'ine.catalog.state.update', targetId: ITEM_ID }),
    );
  });

  it('blocks catalog mutations for COORDINADOR', async () => {
    const response = await request(app)
      .patch(`/api/v1/ine-ocr/catalog/leaders/${ITEM_ID}`)
      .set('Authorization', 'Bearer role:COORDINADOR')
      .send({ fullName: 'Nuevo nombre' });

    expect(response.status).toBe(403);
    expect(catalogService.updateLeader).not.toHaveBeenCalled();
  });

  it('DELETE catalog state returns 409 when active descendants exist', async () => {
    catalogService.deactivateState.mockRejectedValue(
      AppError.conflict('The electoral state has active descendants'),
    );

    const response = await request(app)
      .delete(`/api/v1/ine-ocr/catalog/states/${ITEM_ID}`)
      .set('Authorization', 'Bearer role:SUPER_ADMIN');

    expect(response.status).toBe(409);
  });

  it('PATCH catalog district returns 404 for an unknown record', async () => {
    catalogService.updateDistrict.mockRejectedValue(
      AppError.notFound('Electoral district not found'),
    );

    const response = await request(app)
      .patch(`/api/v1/ine-ocr/catalog/districts/${ITEM_ID}`)
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({ stateId: PARENT_ID, code: '01' });

    expect(response.status).toBe(404);
  });

  it('DELETE catalog leader performs a soft delete and audits it', async () => {
    catalogService.deactivateLeader.mockResolvedValue({
      id: ITEM_ID,
      sectionId: PARENT_ID,
      fullName: 'Líder sintético',
      isActive: false,
    });

    const response = await request(app)
      .delete(`/api/v1/ine-ocr/catalog/leaders/${ITEM_ID}`)
      .set('Authorization', 'Bearer role:SUPER_ADMIN');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ leader: { id: ITEM_ID, isActive: false } });
    expect(auditService.logFromRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'ine.catalog.leader.deactivate', targetId: ITEM_ID }),
    );
  });

  it('GET catalog leaders forwards coordinator scope to the service', async () => {
    catalogService.listLeaders.mockResolvedValue({ leaders: [] });

    const response = await request(app)
      .get('/api/v1/ine-ocr/catalog/leaders')
      .set('Authorization', 'Bearer role:COORDINADOR');

    expect(response.status).toBe(200);
    expect(catalogService.listLeaders).toHaveBeenCalledWith(
      expect.not.objectContaining({ page: expect.any(Number) }),
      expect.objectContaining({ kind: 'coordinator', coordinatorId: ITEM_ID }),
    );
  });

  it('GET catalog leaders forwards leader scope to the service', async () => {
    catalogService.listLeaders.mockResolvedValue({ leaders: [] });

    const response = await request(app)
      .get('/api/v1/ine-ocr/catalog/leaders')
      .set('Authorization', 'Bearer role:LIDER');

    expect(response.status).toBe(200);
    expect(catalogService.listLeaders).toHaveBeenCalledWith(
      expect.not.objectContaining({ page: expect.any(Number) }),
      expect.objectContaining({ kind: 'leader', leaderId: ITEM_ID }),
    );
  });

  it('GET catalog leaders forwards filters and pagination to the service', async () => {
    catalogService.listLeaders.mockResolvedValue({
      leaders: [],
      totalCount: 0,
      hasNextPage: false,
    });

    const response = await request(app)
      .get('/api/v1/ine-ocr/catalog/leaders')
      .query({
        sectionId: PARENT_ID,
        coordinatorId: ITEM_ID,
        q: 'ana',
        page: 2,
        pageSize: 10,
        includeInactive: 'true',
      })
      .set('Authorization', 'Bearer role:SUPER_ADMIN');

    expect(response.status).toBe(200);
    expect(catalogService.listLeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionId: PARENT_ID,
        coordinatorId: ITEM_ID,
        q: 'ana',
        page: 2,
        pageSize: 10,
        includeInactive: true,
      }),
      expect.objectContaining({ kind: 'admin' }),
    );
  });

  it('blocks catalog leader creation for LIDER at permission layer', async () => {
    const response = await request(app)
      .post('/api/v1/ine-ocr/catalog/leaders')
      .set('Authorization', 'Bearer role:LIDER')
      .send({ sectionId: PARENT_ID, coordinatorId: ITEM_ID, fullName: 'Nuevo', email: 'n@x.co' });

    expect(response.status).toBe(403);
    expect(catalogService.createLeader).not.toHaveBeenCalled();
  });

  it('POST catalog leader reinvite requires lideres.update', async () => {
    catalogService.reinviteLeader.mockResolvedValue({
      invitation: { id: 'inv-2', status: 'sent' },
    });

    const capturista = await request(app)
      .post(`/api/v1/ine-ocr/catalog/leaders/${ITEM_ID}/reinvite`)
      .set('Authorization', 'Bearer role:CAPTURISTA');

    expect(capturista.status).toBe(200);
    expect(catalogService.reinviteLeader).toHaveBeenCalledWith(ITEM_ID, expect.anything());
    expect(auditService.logFromRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'ine.catalog.leader.reinvite', targetId: ITEM_ID }),
    );

    catalogService.reinviteLeader.mockClear();
    const coordinador = await request(app)
      .post(`/api/v1/ine-ocr/catalog/leaders/${ITEM_ID}/reinvite`)
      .set('Authorization', 'Bearer role:COORDINADOR');

    expect(coordinador.status).toBe(403);
    expect(catalogService.reinviteLeader).not.toHaveBeenCalled();
  });

  it('blocks catalog leader mutations for OPERADOR_CHAT', async () => {
    const response = await request(app)
      .get('/api/v1/ine-ocr/catalog/leaders')
      .set('Authorization', 'Bearer role:OPERADOR_CHAT');

    expect(response.status).toBe(403);
    expect(catalogService.listLeaders).not.toHaveBeenCalled();
  });
});
