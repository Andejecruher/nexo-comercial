/**
 * Tests del endpoint GET /api/v1/ai-agents (filtro "Atendido por bot" del inbox).
 * Cubre: shape de respuesta, filtro por lineId y permiso conversaciones.view/tickets.view.
 */
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middlewares/errorHandler';
import { createAiAgentsRouter } from '../../routes/ai-agents.routes';
import type { PrismaService } from '../../services/prisma.service';

// Auth: inyecta un usuario autenticado (el JWT real se cubre en auth.middleware tests).
jest.mock('../../middlewares/auth.middleware', () => {
  const mockAuthMiddleware = (
    req: { user?: object },
    _res: unknown,
    next: () => void,
  ): void => {
    req.user = { id: 'user-1', email: 'agente@voz.gob.ar', fullName: 'Agente', roles: [] };
    next();
  };
  return { authMiddleware: mockAuthMiddleware, jwtMiddleware: mockAuthMiddleware };
});

// Permisos del usuario autenticado, mutables por test.
let mockPermissions: string[] = [];
jest.mock('../../services/authorization.service', () => ({
  AuthorizationService: jest.fn().mockImplementation(() => ({
    getUserPermissionSlugs: jest.fn(async () => mockPermissions),
  })),
}));

function makePrismaMock() {
  return {
    aiAgent: {
      findMany: jest.fn(async (): Promise<unknown[]> => [
        {
          id: '00000000-0000-4000-8000-0000000000a1',
          name: 'Bot Reclamos',
          communicationLines: [
            { id: '00000000-0000-4000-8000-0000000000b1', displayName: 'Línea Principal' },
          ],
        },
      ]),
    },
  };
}

function makeApp(prisma: ReturnType<typeof makePrismaMock>): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/ai-agents', createAiAgentsRouter(prisma as unknown as PrismaService));
  app.use(errorHandler);
  return app;
}

describe('GET /api/v1/ai-agents', () => {
  beforeEach(() => {
    mockPermissions = ['conversaciones.view'];
  });

  it('devuelve agentes activos con sus líneas (id, name, lines[])', async () => {
    const prisma = makePrismaMock();

    const res = await request(makeApp(prisma)).get('/api/v1/ai-agents');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      agents: [
        {
          id: '00000000-0000-4000-8000-0000000000a1',
          name: 'Bot Reclamos',
          lines: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'Línea Principal' }],
        },
      ],
    });
    expect(prisma.aiAgent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
      }),
    );
  });

  it('con tickets.view alcanza (mismo permiso que el listado de conversaciones)', async () => {
    mockPermissions = ['tickets.view'];
    const prisma = makePrismaMock();

    const res = await request(makeApp(prisma)).get('/api/v1/ai-agents');

    expect(res.status).toBe(200);
  });

  it('403 cuando el usuario no tiene conversaciones.view ni tickets.view', async () => {
    mockPermissions = ['reportes.view'];
    const prisma = makePrismaMock();

    const res = await request(makeApp(prisma)).get('/api/v1/ai-agents');

    expect(res.status).toBe(403);
    expect(prisma.aiAgent.findMany).not.toHaveBeenCalled();
  });

  it('lineId restringe a los agentes asignados a esa línea', async () => {
    const prisma = makePrismaMock();
    const lineId = '00000000-0000-4000-8000-0000000000b1';

    const res = await request(makeApp(prisma)).get(`/api/v1/ai-agents?lineId=${lineId}`);

    expect(res.status).toBe(200);
    expect(prisma.aiAgent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, communicationLines: { some: { id: lineId } } },
      }),
    );
  });

  it('400 cuando lineId no es un uuid válido', async () => {
    const prisma = makePrismaMock();

    const res = await request(makeApp(prisma)).get('/api/v1/ai-agents?lineId=no-es-uuid');

    expect(res.status).toBe(400);
    expect(prisma.aiAgent.findMany).not.toHaveBeenCalled();
  });
});
