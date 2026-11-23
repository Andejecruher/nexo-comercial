import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import request from 'supertest';
import { createTestApp } from '../setup/test-app';
import { AuthService } from '../../services/auth.service';
import { PromovidoService } from '../../services/promovido.service';
import { ScopeService } from '../../services/scope.service';
import { requireScope } from '../../middlewares/scope.middleware';
import { env } from '../../config/env.config';
import { encrypt } from '../../utils/crypto';
import type { PanelRole, ScopeContext } from '../../types/auth.types';

type AsyncMock<Args extends unknown[] = [], Result = unknown> = (...args: Args) => Promise<Result>;

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const SECTION_ID = '550e8400-e29b-41d4-a716-446655440002';
const COORD_ID = '550e8400-e29b-41d4-a716-446655440003';
const LEADER_ID = '550e8400-e29b-41d4-a716-446655440004';
const OTHER_LEADER_ID = '550e8400-e29b-41d4-a716-446655440005';
const PROMOVIDO_ID = '550e8400-e29b-41d4-a716-446655440006';

function scopeForRole(role: string): ScopeContext {
  if (role === 'SUPER_ADMIN' || role === 'CAPTURISTA') return { kind: 'admin' };
  if (role === 'COORDINADOR') return { kind: 'coordinator', sectionId: SECTION_ID, coordinatorId: COORD_ID };
  if (role === 'LIDER') return { kind: 'leader', sectionId: SECTION_ID, leaderId: LEADER_ID, coordinatorId: COORD_ID };
  return { kind: 'none' };
}

jest.mock('../../middlewares/auth.middleware', () => ({
  authMiddleware: (
    req: Request & { scope?: ScopeContext },
    res: Response,
    next: NextFunction,
  ): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer role:')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    const role = authHeader.slice('Bearer role:'.length);
    req.user = {
      id: USER_ID,
      email: `${role.toLowerCase()}@test.test`,
      fullName: 'Test User',
      roles: [role as PanelRole],
    };
    req.scope = scopeForRole(role);
    next();
  },
}));

function createAuthServiceWithScope(role: string, entityLink: 'coordinator' | 'leader' | null = null) {
  const normalizedEmail = `${role.toLowerCase()}@test.test`;
  const user = {
    id: USER_ID,
    email: normalizedEmail,
    fullName: 'Test User',
    isActive: true,
    hashedPassword: '$2b$10$hashed',
    userRoles: [{ role: { name: role } }],
  };

  const scopePrisma = {
    user: {
      findUnique: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue({
        id: USER_ID,
        userRoles: [{ role: { name: role } }],
        coordinator: entityLink === 'coordinator' ? { id: COORD_ID, sectionId: SECTION_ID } : null,
        leader: entityLink === 'leader' ? { id: LEADER_ID, sectionId: SECTION_ID, coordinatorId: COORD_ID } : null,
      }),
    },
  };

  const users = {
    findByEmailWithRoles: jest.fn<AsyncMock<[string], unknown>>().mockResolvedValue(user),
    findByIdWithRoles: jest.fn<AsyncMock<[string], unknown>>().mockResolvedValue(user),
  };

  const prisma = {
    refreshSession: {
      deleteMany: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue({ count: 0 }),
      count: jest.fn<AsyncMock<[unknown], number>>().mockResolvedValue(0),
      findMany: jest.fn<AsyncMock<[unknown], unknown[]>>().mockResolvedValue([]),
      create: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue({}),
    },
  };

  const lockout = {
    checkLockout: jest.fn<AsyncMock<[string], void>>().mockResolvedValue(undefined),
    clearFailures: jest.fn<AsyncMock<[string], void>>().mockResolvedValue(undefined),
    recordFailure: jest.fn<AsyncMock<[string], void>>().mockResolvedValue(undefined),
  };

  const scopeService = new ScopeService(scopePrisma as never);
  return { service: new AuthService(users as never, prisma as never, lockout as never, undefined, undefined, undefined, scopeService), users, scopeService };
}

function promovidoData() {
  return {
    firstName: 'ANTONIO',
    paternalLastName: 'CRUZ',
    maternalLastName: 'HERNANDEZ',
    birthDate: '1995-06-13',
    sex: 'H' as const,
    curp: 'CUHA950613HCSRRN06',
    voterKey: 'CUHA950613HCSRRN06',
    address: 'Calle 1',
    neighborhood: 'Centro',
    locality: 'Cintalapa',
    municipality: 'Cintalapa',
    state: 'CHIAPAS',
    sectionId: SECTION_ID,
    leaderId: LEADER_ID,
    phone: '9611234567',
    isActive: true,
  };
}

function promovidoPrisma() {
  const data = promovidoData();
  const m = <A extends unknown[], R>() => jest.fn<AsyncMock<A, R>>();
  const prisma: any = {
    section: {
      findUnique: m<[{ where: { id: string } }], unknown>().mockResolvedValue({
        id: SECTION_ID,
        sectionCode: '0042',
        isActive: true,
        state: { isActive: true, name: 'CHIAPAS' },
        district: { isActive: true, code: '01' },
      }),
    },
    leader: {
      findUnique: m<[{ where: { id: string } }], unknown>().mockResolvedValue({
        id: LEADER_ID,
        fullName: 'Juan Pérez',
        isActive: true,
        sectionId: SECTION_ID,
        coordinatorId: COORD_ID,
      }),
    },
    promovido: {
      findUnique: m<[{ where: { id?: string; uploadRecordId?: string } }], unknown>().mockImplementation(
        ({ where }: { where: { id?: string; uploadRecordId?: string } }) => {
          if (where.id === PROMOVIDO_ID || where.uploadRecordId === 'upload-1') {
            return Promise.resolve({
              id: PROMOVIDO_ID,
              sectionId: SECTION_ID,
              leaderId: LEADER_ID,
              createdAt: new Date(),
              updatedAt: new Date(),
              isActive: true,
              uploadRecordId: null,
              citizenId: 'citizen-1',
              dataEncrypted: encrypt(JSON.stringify(data)),
              leader: { id: LEADER_ID, fullName: 'Juan Pérez' },
              section: { id: SECTION_ID, sectionCode: '0042' },
              citizen: { id: 'citizen-1', name: 'ANTONIO', lastName: 'CRUZ', phone: '9611234567' },
            });
          }
          return Promise.resolve(null);
        },
      ),
      findFirst: m<[unknown], unknown>().mockResolvedValue(null),
      findMany: m<[unknown], unknown[]>().mockResolvedValue([]),
      count: m<[unknown], number>().mockResolvedValue(0),
      create: m<[unknown], unknown>().mockResolvedValue({ id: PROMOVIDO_ID }),
      update: m<[unknown], unknown>().mockResolvedValue({ id: PROMOVIDO_ID }),
    },
    citizen: {
      findUnique: m<[unknown], unknown>().mockResolvedValue(null),
      create: m<[unknown], unknown>().mockResolvedValue({ id: 'citizen-1' }),
      update: m<[unknown], unknown>().mockResolvedValue({ id: 'citizen-1' }),
    },
    neighborhood: {
      findUnique: m<[unknown], unknown>().mockResolvedValue({ sectionId: SECTION_ID }),
    },
    $transaction: m<[(tx: unknown) => Promise<unknown>], unknown>().mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    ),
    $executeRaw: m<[unknown], unknown>().mockResolvedValue(undefined),
  };
  return prisma;
}

describe('Coordinators hierarchy RBAC scope', () => {
  beforeAll(() => {
    Object.assign(env, { ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' });
  });

  describe('scope in authentication responses', () => {
    it('login includes coordinator scope for a coordinator user', async () => {
      const { service, users } = createAuthServiceWithScope('COORDINADOR', 'coordinator');
      jest.spyOn(await import('../../utils/password.util'), 'comparePassword').mockResolvedValue(true);

      const result = await service.login('coordinador@test.test', 'Password123!', 'device-1');

      expect(result.user.scope).toEqual({
        kind: 'coordinator',
        sectionId: SECTION_ID,
        coordinatorId: COORD_ID,
      });
      expect(users.findByEmailWithRoles).toHaveBeenCalledWith('coordinador@test.test');
    });

    it('login includes leader scope for a leader user', async () => {
      const { service } = createAuthServiceWithScope('LIDER', 'leader');
      jest.spyOn(await import('../../utils/password.util'), 'comparePassword').mockResolvedValue(true);

      const result = await service.login('lider@test.test', 'Password123!', 'device-1');

      expect(result.user.scope).toEqual({
        kind: 'leader',
        sectionId: SECTION_ID,
        leaderId: LEADER_ID,
        coordinatorId: COORD_ID,
      });
    });

    it('me includes admin scope for a super-admin user', async () => {
      const { service } = createAuthServiceWithScope('SUPER_ADMIN');

      const result = await service.me(USER_ID);

      expect(result.scope).toEqual({ kind: 'admin' });
    });
  });

  describe('promovido leakage matrix via HTTP scope middleware', () => {
    const prisma = promovidoPrisma();
    const promovidoService = new PromovidoService(prisma as never);

    const app = createTestApp((_, router) => {
      const { authMiddleware } = require('../../middlewares/auth.middleware');

      const promovidoRouter = Router();
      // El mock de auth inyecta req.scope directamente; no se re-resuelve con
      // scopeMiddleware porque este test cubre el guard requireScope + el
      // scoping del servicio, no la resolución de scope.
      promovidoRouter.use(authMiddleware);
      promovidoRouter.get(
        '/promovidos/:id',
        requireScope('admin', 'coordinator', 'leader'),
        (req: Request & { scope?: ScopeContext }, res: Response, next: NextFunction): void => {
          void (async () => {
            try {
              const promovido = await promovidoService.getById(req.params.id, req.scope);
              res.json({ promovido });
            } catch (error) {
              next(error);
            }
          })();
        },
      );
      router.use('/api/v1/scope-test', promovidoRouter);
    });

    it('SUPER_ADMIN reads any promovido unfiltered', async () => {
      const response = await request(app)
        .get(`/api/v1/scope-test/promovidos/${PROMOVIDO_ID}`)
        .set('Authorization', 'Bearer role:SUPER_ADMIN');

      expect(response.status).toBe(200);
      expect(response.body.promovido.id).toBe(PROMOVIDO_ID);
    });

    it('LIDER reading another leader promovido returns 404', async () => {
      const response = await request(app)
        .get(`/api/v1/scope-test/promovidos/${PROMOVIDO_ID}`)
        .set('Authorization', 'Bearer role:LIDER');

      expect(response.status).toBe(404);
    });

    it('COORDINADOR reading a promovido of a leader under another coordinator returns 404', async () => {
      const response = await request(app)
        .get(`/api/v1/scope-test/promovidos/${PROMOVIDO_ID}`)
        .set('Authorization', 'Bearer role:COORDINADOR');

      expect(response.status).toBe(404);
    });

    it('OPERADOR_CHAT is blocked by scope guard with 404', async () => {
      const response = await request(app)
        .get(`/api/v1/scope-test/promovidos/${PROMOVIDO_ID}`)
        .set('Authorization', 'Bearer role:OPERADOR_CHAT');

      expect(response.status).toBe(404);
    });
  });
});
