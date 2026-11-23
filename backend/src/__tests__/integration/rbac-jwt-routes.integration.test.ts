/**
 * Fase 0 RBAC: verifica que las rutas antes JWT-only ahora exigen permisos.
 *
 * Cubre cuatro routers actualizados en la Fase 0 de Configuraciones:
 *  - /conversations       — lectura ampliada (incluye OPERADOR_CHAT), escritura operativa
 *  - /messages            — solo roles con conversaciones.update pueden mutar
 *  - /handover            — solo roles con conversaciones.update pueden tomar/liberar/escalar
 *  - /analytics           — lectura restringida a roles con analytics.view
 *
 * Los controladores se stubean para aislar el test del permiso; el objetivo es
 * demostrar que `requirePermissions` responde 403 con el shape uniforme cuando el
 * llamador carece del permiso adecuado y 200 cuando lo tiene.
 *
 * La matriz role→permisos se construye desde el mismo helper que usa el seed
 * (`prisma/seed/core/permissions.seed`), de forma que un cambio en el catálogo
 * de permisos se propaga sin tocar este archivo (cero drift).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, RequestHandler, Response } from 'express';
import request from 'supertest';
import type { AnalyticsController } from '../../controllers/analytics.controller';
import type { ConversationsController } from '../../controllers/conversations.controller';
import type { HandoverController } from '../../controllers/handover.controller';
import type { MessagesController } from '../../controllers/messages.controller';
import { createAnalyticsRouter } from '../../routes/analytics.routes';
import { createConversationsRouter } from '../../routes/conversations.routes';
import { createHandoverRouter } from '../../routes/handover.routes';
import { createMessagesRouter } from '../../routes/messages.routes';
import { createTestApp } from '../setup/test-app';
// El catálogo de permisos vive bajo prisma/seed (fuera de rootDir `src`).
// Lo importamos a propósito para construir la matriz role→permiso sin drift.
import {
  PERMISSIONS,
  slugsForGroup,
  slugsForModule,
  slugsForModuleActions,
} from '../../../prisma/seed/core/permissions.seed';

/**
 * Matriz role→permisos espejo de `role-permissions.seed.ts`.
 * Las claves usan el UPPER_SNAKE del token de test (`Bearer role:COORDINADOR`),
 * no el slug lowercase persistido en BD; el mapeo es 1:1 con la matriz del seed.
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: PERMISSIONS.map((p) => p.slug),
  COORDINADOR: [
    ...slugsForGroup('whatsapp'),
    ...slugsForGroup('campana'),
    ...slugsForModule('departamentos'),
    ...slugsForModule('barrios'),
    ...slugsForModule('etiquetas'),
    ...slugsForModule('catalogo_electoral'),
    ...slugsForModule('analytics'),
  ],
  CAPTURISTA: [
    ...slugsForModuleActions('indicadores_precampana', ['view', 'export']),
    ...slugsForModule('promovidos'),
    ...slugsForModule('eventos'),
  ],
  OPERADOR_CHAT: [...slugsForGroup('whatsapp')],
  LIDER: [...slugsForModuleActions('indicadores_precampana', ['view', 'export'])],
};

/** Permisos efectivos para un conjunto de roles (unión con dedupe). */
function permissionsForRoles(roles: string[]): string[] {
  const union = roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []);
  return Array.from(new Set(union));
}

jest.mock('../../middlewares/jwt.middleware', () => ({
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
    req.user = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      email: 'admin@vozciudadana.gob',
      fullName: 'Admin Test',
      roles,
      permissions: permissionsForRoles(roles),
    };
    next();
  },
}));

jest.mock('../../middlewares/permission.middleware', () => {
  const { hasAllPermissions, hasAnyPermission } = require('../../utils/authorization.util');
  const { ForbiddenError, UnauthorizedError } = require('../../utils/app-error');
  return {
    requirePermissions: (
      _prisma: unknown,
      permissions: string | string[],
      mode: 'all' | 'any' = 'all',
    ) => {
      const required = Array.isArray(permissions) ? permissions : [permissions];
      return (
        req: { user?: { id?: string; permissions?: string[] } },
        _res: unknown,
        next: (err?: unknown) => void,
      ) => {
        if (!req.user) {
          next(new UnauthorizedError('Authentication required'));
          return;
        }
        const userPerms = req.user.permissions ?? [];
        const allowed =
          mode === 'any'
            ? hasAnyPermission(userPerms, required)
            : hasAllPermissions(userPerms, required);
        if (!allowed) {
          next(new ForbiddenError(`Access denied. Required permissions: ${required.join(', ')}`));
        } else {
          next();
        }
      };
    },
    requireAnyPermission: (prisma: unknown, permissions: string[]) => {
      const { requirePermissions } = require('../../middlewares/permission.middleware');
      return requirePermissions(prisma, permissions, 'any');
    },
  };
});

const okHandler: RequestHandler = (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
};

const controllerStub: ConversationsController = {
  list: okHandler,
  ensureOpen: okHandler,
  getById: okHandler,
  getMessages: okHandler,
  postMessage: okHandler,
  postAudio: okHandler,
  postMedia: okHandler,
  postContacts: okHandler,
  postLegacyTemplate: okHandler,
  postTemplate: okHandler,
  postTemplateMedia: okHandler,
  getWindow: okHandler,
  assign: okHandler,
  transfer: okHandler,
  handover: okHandler,
  close: okHandler,
  reopen: okHandler,
  markRead: okHandler,
} as unknown as ConversationsController;

const messagesStub: MessagesController = {
  getMedia: okHandler,
  sendText: okHandler,
  addAttachment: okHandler,
} as unknown as MessagesController;

const handoverStub: HandoverController = {
  take: okHandler,
  release: okHandler,
  escalate: okHandler,
} as unknown as HandoverController;

const analyticsStub: AnalyticsController = {
  dashboard: okHandler,
  tickets: okHandler,
  agents: okHandler,
  departments: okHandler,
} as unknown as AnalyticsController;

const prismaStub = {} as never;

const app = createTestApp((_, router) => {
  router.use('/api/v1/conversations', createConversationsRouter(controllerStub, prismaStub));
  router.use('/api/v1/messages', createMessagesRouter(messagesStub, prismaStub));
  router.use('/api/v1/handover', createHandoverRouter(handoverStub, prismaStub));
  router.use('/api/v1/analytics', createAnalyticsRouter(analyticsStub, prismaStub));
});

describe('Fase 0 — RBAC en rutas antes JWT-only', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('conversations', () => {
    it('COORDINADOR puede leer conversaciones', async () => {
      const res = await request(app)
        .get('/api/v1/conversations')
        .set('Authorization', 'Bearer role:COORDINADOR');
      expect(res.status).toBe(200);
    });

    it('CAPTURISTA no puede escribir acciones operativas', async () => {
      const res = await request(app)
        .post('/api/v1/conversations/550e8400-e29b-41d4-a716-446655440002/close')
        .set('Authorization', 'Bearer role:CAPTURISTA')
        .send({});
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ success: false });
    });

    it('OPERADOR_CHAT puede cerrar conversación', async () => {
      const res = await request(app)
        .post('/api/v1/conversations/550e8400-e29b-41d4-a716-446655440002/close')
        .set('Authorization', 'Bearer role:OPERADOR_CHAT')
        .send({});
      expect(res.status).toBe(200);
    });
  });

  describe('messages', () => {
    it('CAPTURISTA no puede enviar texto', async () => {
      const res = await request(app)
        .post('/api/v1/messages/text')
        .set('Authorization', 'Bearer role:CAPTURISTA')
        .send({ body: 'hola' });
      expect(res.status).toBe(403);
    });

    it('COORDINADOR puede enviar texto', async () => {
      const res = await request(app)
        .post('/api/v1/messages/text')
        .set('Authorization', 'Bearer role:COORDINADOR')
        .send({ body: 'hola' });
      expect(res.status).toBe(200);
    });
  });

  describe('handover', () => {
    it('CAPTURISTA recibe 403 en take', async () => {
      const res = await request(app)
        .post('/api/v1/handover/take')
        .set('Authorization', 'Bearer role:CAPTURISTA')
        .send({});
      expect(res.status).toBe(403);
    });

    it('OPERADOR_CHAT puede tomar handover', async () => {
      const res = await request(app)
        .post('/api/v1/handover/take')
        .set('Authorization', 'Bearer role:OPERADOR_CHAT')
        .send({});
      expect(res.status).toBe(200);
    });
  });

  describe('analytics', () => {
    it('OPERADOR_CHAT no puede leer dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', 'Bearer role:OPERADOR_CHAT');
      expect(res.status).toBe(403);
    });

    it('COORDINADOR puede leer dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', 'Bearer role:COORDINADOR');
      expect(res.status).toBe(200);
    });

    it('SUPER_ADMIN puede leer tickets', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/tickets')
        .set('Authorization', 'Bearer role:SUPER_ADMIN');
      expect(res.status).toBe(200);
    });
  });

  it('sin Authorization devuelve 401', async () => {
    const res = await request(app).get('/api/v1/conversations');
    expect(res.status).toBe(401);
  });
});
