import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { createAuthRouter } from '../../routes/auth.routes';
import { createUsersRouter } from '../../routes/users.routes';
import { AppError } from '../../utils/app-error';
import { createTestApp } from '../setup/test-app';

jest.mock('../../config/env.config', () => ({
  env: {
    FRONTEND_URL: 'http://localhost:5173',
    INVITATION_EXPIRATION_MINUTES: 1440,
    INVITATION_RESEND_COOLDOWN_SECONDS: 300,
    PASSWORD_RESET_RATE_LIMIT_MAX: 10,
    PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS: 900,
  },
}));

let mockAuthenticatedRoles: string[] = [];

jest.mock('../../middlewares/auth.middleware', () => ({
  authMiddleware: (
    req: { headers: Record<string, string | undefined>; user?: unknown },
    res: { status: (code: number) => { json: (payload: Record<string, unknown>) => void } },
    next: () => void,
  ) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice('Bearer '.length);
    if (!token.startsWith('role:')) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const roles = token
      .slice('role:'.length)
      .split(',')
      .filter((role) => role.length > 0);
    mockAuthenticatedRoles = roles;

    req.user = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      email: 'admin@vozciudadana.gob',
      fullName: 'Admin Test',
      roles,
    };

    next();
  },
  jwtMiddleware: (
    req: { headers: Record<string, string | undefined>; user?: unknown },
    res: { status: (code: number) => { json: (payload: Record<string, unknown>) => void } },
    next: () => void,
  ) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice('Bearer '.length);
    if (!token.startsWith('role:')) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const roles = token
      .slice('role:'.length)
      .split(',')
      .filter((role) => role.length > 0);
    mockAuthenticatedRoles = roles;

    req.user = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      email: 'admin@vozciudadana.gob',
      fullName: 'Admin Test',
      roles,
    };

    next();
  },
}));

type AsyncFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

type LoginResult = {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
};

const authService = {
  login: jest.fn<AsyncFn<[string, string, string], LoginResult>>(),
  refresh:
    jest.fn<
      AsyncFn<[string, string, { ip?: string; userAgent?: string }?], Record<string, unknown>>
    >(),
  me: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
  logout: jest.fn<AsyncFn<[string, string?], void>>(),
  logoutAll: jest.fn<AsyncFn<[string], void>>(),
  registerAdmin: jest.fn<AsyncFn<[Record<string, unknown>, string[]], Record<string, unknown>>>(),
  requestPasswordReset: jest.fn<AsyncFn<[string, { ip?: string | null }?], void>>(),
  validatePasswordReset: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
  resetPassword: jest.fn<AsyncFn<[string, string], { userId: string; email: string }>>(),
};

const lockoutService = {
  checkIpRateLimit: jest.fn<AsyncFn<[string], void>>().mockResolvedValue(undefined),
  checkLockout: jest
    .fn<AsyncFn<[string, { ip?: string; userAgent?: string }?], void>>()
    .mockResolvedValue(undefined),
  checkRefreshRateLimit: jest.fn<AsyncFn<[string], void>>().mockResolvedValue(undefined),
};

/** Solo lo que consume el rate limit por IP del flujo de recuperación. */
const rateLimiter = {
  increment: jest.fn<AsyncFn<[string, string, number], number>>().mockResolvedValue(1),
  windowStart: jest.fn(() => 0),
  remainingSeconds: jest.fn<AsyncFn<[string, string, number], number>>().mockResolvedValue(900),
  prune: jest.fn<AsyncFn<[string], number>>().mockResolvedValue(0),
};

const userService = {
  listUsers: jest.fn<AsyncFn<[], Array<Record<string, unknown>>>>(),
  getUserById: jest.fn<AsyncFn<[string], Record<string, unknown>>>(),
  createUser: jest.fn<AsyncFn<[Record<string, unknown>], Record<string, unknown>>>(),
  updateUser: jest.fn<AsyncFn<[string, Record<string, unknown>], Record<string, unknown>>>(),
  assignRole: jest.fn<AsyncFn<[string, string], Record<string, unknown>>>(),
  removeRole: jest.fn<AsyncFn<[string, string], Record<string, unknown>>>(),
};

const auditService = {
  logFromRequest: jest
    .fn<AsyncFn<[unknown, Record<string, unknown>], void>>()
    .mockResolvedValue(undefined),
};

const permissionsByRole: Record<string, string[]> = {
  COORDINADOR: ['users.view'],
  SUPER_ADMIN: ['users.view', 'users.create', 'users.update', 'users.delete', 'roles.assign'],
};

const prismaService = {
  user: {
    findUnique: jest.fn(async () => ({
      id: '550e8400-e29b-41d4-a716-446655440001',
      email: 'admin@vozciudadana.gob',
      fullName: 'Admin Test',
      isActive: true,
      userRoles: mockAuthenticatedRoles.map((role) => ({
        role: {
          id: role,
          name: role,
          slug: role,
          rolePermissions: (permissionsByRole[role] ?? []).map((permission) => ({
            permission: { slug: permission, module: permission.split('.')[0] },
          })),
        },
      })),
    })),
  },
};

const app = createTestApp((_, router) => {
  router.use(
    '/api/v1/auth',
    createAuthRouter(
      authService as unknown as never,
      auditService as unknown as never,
      lockoutService as unknown as never,
      prismaService as unknown as never,
      rateLimiter as unknown as never,
    ),
  );

  router.use(
    '/api/v1/admin',
    createUsersRouter(
      userService as unknown as never,
      auditService as unknown as never,
      prismaService as unknown as never,
    ),
  );
});

const USER_ID = '550e8400-e29b-41d4-a716-446655440002';
const ROLE_ID = '550e8400-e29b-41d4-a716-446655440003';

describe('Auth + RBAC integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticatedRoles = [];
    lockoutService.checkIpRateLimit.mockResolvedValue(undefined);
    lockoutService.checkLockout.mockResolvedValue(undefined);
    lockoutService.checkRefreshRateLimit.mockResolvedValue(undefined);
  });

  it('POST /api/v1/auth/login debe responder 200 en credenciales válidas', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: USER_ID,
        email: 'admin@vozciudadana.gob',
        fullName: 'Admin',
        roles: ['SUPER_ADMIN'],
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('x-device-id', 'test-device')
      .send({
        email: 'admin@vozciudadana.gob',
        password: 'PasswordSeguro123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('access-token');
    expect(res.body.refreshToken).toBe('refresh-token');
    expect(authService.login).toHaveBeenCalledWith(
      'admin@vozciudadana.gob',
      'PasswordSeguro123!',
      'test-device',
    );
  });

  it('POST /api/v1/auth/login debe responder 401 en credenciales inválidas', async () => {
    authService.login.mockRejectedValue(AppError.unauthorized('Credenciales inválidas'));

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@vozciudadana.gob',
      password: 'incorrecta',
    });

    expect(res.status).toBe(401);
  });

  it('GET /api/v1/admin/users debe permitir lectura a COORDINADOR', async () => {
    userService.listUsers.mockResolvedValue([
      {
        id: USER_ID,
        email: 'coord@vozciudadana.gob',
        fullName: 'Coord Test',
        isActive: true,
        createdAt: new Date().toISOString(),
        roles: [{ id: ROLE_ID, name: 'COORDINADOR' }],
      },
    ]);

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer role:COORDINADOR');

    expect(res.status).toBe(200);
    expect(Array.isArray((res.body as { users: unknown[] }).users)).toBe(true);
    expect(userService.listUsers).toHaveBeenCalledTimes(1);
  });

  it('GET /api/v1/admin/users/:id debe permitir lectura a COORDINADOR', async () => {
    userService.getUserById.mockResolvedValue({
      id: USER_ID,
      email: 'coord@vozciudadana.gob',
      fullName: 'Coord Test',
      isActive: true,
      createdAt: new Date().toISOString(),
      roles: [{ id: ROLE_ID, name: 'COORDINADOR' }],
    });

    const res = await request(app)
      .get(`/api/v1/admin/users/${USER_ID}`)
      .set('Authorization', 'Bearer role:COORDINADOR');

    expect(res.status).toBe(200);
    expect((res.body as { user: { id: string } }).user.id).toBe(USER_ID);
  });

  it('POST /api/v1/admin/users debe bloquear a COORDINADOR (403)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', 'Bearer role:COORDINADOR')
      .send({
        email: 'nuevo@vozciudadana.gob',
        password: 'PasswordSeguro123!',
        fullName: 'Nuevo Usuario',
      });

    expect(res.status).toBe(403);
    expect(userService.createUser).not.toHaveBeenCalled();
  });

  it('POST /api/v1/admin/users debe permitir SUPER_ADMIN', async () => {
    userService.createUser.mockResolvedValue({
      id: USER_ID,
      email: 'nuevo@vozciudadana.gob',
      fullName: 'Nuevo Usuario',
      isActive: true,
      createdAt: new Date().toISOString(),
      roles: [],
    });

    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', 'Bearer role:SUPER_ADMIN')
      .send({
        email: 'nuevo@vozciudadana.gob',
        password: 'PasswordSeguro123!',
        fullName: 'Nuevo Usuario',
      });

    expect(res.status).toBe(201);
    expect(userService.createUser).toHaveBeenCalledTimes(1);
  });

  it('POST /api/v1/admin/users/:id/roles/:roleId debe permitir SUPER_ADMIN', async () => {
    userService.assignRole.mockResolvedValue({
      id: USER_ID,
      email: 'nuevo@vozciudadana.gob',
      fullName: 'Nuevo Usuario',
      isActive: true,
      createdAt: new Date().toISOString(),
      roles: [{ id: ROLE_ID, name: 'COORDINADOR' }],
    });

    const res = await request(app)
      .post(`/api/v1/admin/users/${USER_ID}/roles/${ROLE_ID}`)
      .set('Authorization', 'Bearer role:SUPER_ADMIN');

    expect(res.status).toBe(200);
    expect(userService.assignRole).toHaveBeenCalledWith(USER_ID, ROLE_ID);
  });

  it('DELETE /api/v1/admin/users/:id/roles/:roleId debe permitir SUPER_ADMIN', async () => {
    userService.removeRole.mockResolvedValue({
      id: USER_ID,
      email: 'nuevo@vozciudadana.gob',
      fullName: 'Nuevo Usuario',
      isActive: true,
      createdAt: new Date().toISOString(),
      roles: [],
    });

    const res = await request(app)
      .delete(`/api/v1/admin/users/${USER_ID}/roles/${ROLE_ID}`)
      .set('Authorization', 'Bearer role:SUPER_ADMIN');

    expect(res.status).toBe(200);
    expect(userService.removeRole).toHaveBeenCalledWith(USER_ID, ROLE_ID);
  });

  it('GET /api/v1/admin/users debe responder 401 sin token', async () => {
    const res = await request(app).get('/api/v1/admin/users');

    expect(res.status).toBe(401);
  });

  // ── Refresh token flow ──────────────────────────────────────────────────────

  it('POST /api/v1/auth/refresh debe emitir nuevos tokens con refresh válido', async () => {
    authService.refresh.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('x-device-id', 'test-device')
      .send({ refreshToken: 'valid-refresh-token' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('new-access-token');
    expect(res.body.refreshToken).toBe('new-refresh-token');
    expect(authService.refresh).toHaveBeenCalledWith(
      'valid-refresh-token',
      'test-device',
      expect.objectContaining({ ip: expect.any(String) }),
    );
  });

  it('POST /api/v1/auth/refresh debe responder 401 con refresh token expirado', async () => {
    authService.refresh.mockRejectedValue(
      AppError.unauthorized('Refresh token inválido o expirado'),
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'expired-refresh-token' });

    expect(res.status).toBe(401);
  });

  it('POST /api/v1/auth/refresh debe responder 401 con refresh token inválido', async () => {
    authService.refresh.mockRejectedValue(AppError.unauthorized('Token inválido'));

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'tampered-token' });

    expect(res.status).toBe(401);
  });

  it('POST /api/v1/auth/refresh debe responder 400 sin refreshToken en body', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({});

    expect(res.status).toBe(400);
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('POST /api/v1/auth/refresh debe responder 401 con sesión expirada', async () => {
    authService.refresh.mockRejectedValue(
      AppError.unauthorized('Sesión expirada, iniciá sesión nuevamente'),
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'valid-but-session-expired' });

    expect(res.status).toBe(401);
  });

  it('POST /api/v1/auth/refresh debe responder 401 ante replay attack (hash mismatch)', async () => {
    authService.refresh.mockRejectedValue(AppError.unauthorized('Refresh token ya utilizado'));

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'already-used-token' });

    expect(res.status).toBe(401);
  });

  // ── Logout flow ─────────────────────────────────────────────────────────────

  it('POST /api/v1/auth/logout debe responder 200 e invalidar la sesión', async () => {
    authService.logout.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer role:OPERADOR_CHAT')
      .send({ refreshToken: 'some-refresh-token' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/cerrad/i);
    expect(authService.logout).toHaveBeenCalledWith(expect.any(String), 'some-refresh-token');
  });

  it('POST /api/v1/auth/logout con logoutAll=true debe invalidar todas las sesiones', async () => {
    authService.logoutAll.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer role:OPERADOR_CHAT')
      .send({ logoutAll: true });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/todas/i);
    expect(authService.logoutAll).toHaveBeenCalledTimes(1);
  });

  it('POST /api/v1/auth/logout sin Authorization debe responder 401', async () => {
    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken: 'some-token' });

    expect(res.status).toBe(401);
    expect(authService.logout).not.toHaveBeenCalled();
  });

  // ── Recuperación de contraseña ──────────────────────────────────────────────

  it('POST /api/v1/auth/forgot-password siempre responde 202 y no revela si el correo existe', async () => {
    authService.requestPasswordReset.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'desconocida@example.test' });

    expect(res.status).toBe(202);
    expect(res.body.message).toMatch(/si el correo está registrado/i);
    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      'desconocida@example.test',
      expect.objectContaining({ ip: expect.any(String) }),
    );
  });

  it('GET /api/v1/auth/reset-password/validate clasifica un token usado', async () => {
    authService.validatePasswordReset.mockResolvedValue({ valid: false, reason: 'used' });

    const res = await request(app)
      .get('/api/v1/auth/reset-password/validate')
      .query({
        token: 'a'.repeat(32),
      });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ valid: false, reason: 'used' });
  });

  it('POST /api/v1/auth/reset-password rechaza contraseñas que no coinciden', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: 'a'.repeat(32),
        password: 'ClaveNueva123',
        passwordConfirmation: 'OtraClave123',
      });

    expect(res.status).toBe(400);
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });
});
