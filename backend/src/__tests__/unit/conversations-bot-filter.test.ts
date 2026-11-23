/**
 * Tests del filtro "atendido por bot" del listado de conversaciones.
 * Cubre: parsing de bot_ids (multi-selección + 'all'), coexistencia OR
 * bot ↔ departamento, aliases deprecados (bot_id, attended_by) y derivación
 * botcheada del campo DTO `botAgent`.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { ConversationsController } from '../../controllers/conversations.controller';
import { ConversationsService } from '../../services/conversations.service';

const asyncMock = <T = unknown>() => jest.fn<(...args: unknown[]) => Promise<T>>();

function makeRes() {
  const res: {
    statusCode?: number;
    body?: unknown;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
  } = {
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function makeController(service: { list: ReturnType<typeof asyncMock> }) {
  const audit = { logFromRequest: asyncMock() };
  // @ts-expect-error mocks parciales del wiring del controller
  const controller = new ConversationsController(service, audit, {});
  return { controller, audit };
}

function makeReq(query: Record<string, unknown>): Request {
  return { query, user: { id: 'user-1' } } as unknown as Request;
}

describe('ConversationsController.list — filtros bot', () => {
  it('attended_by=bot y un filtro de departamento coexisten (OR, sin 400)', async () => {
    const service = {
      list: asyncMock().mockResolvedValue({ items: [], meta: { hasNextPage: false } }),
    };
    const { controller } = makeController(service);
    const next: NextFunction = jest.fn();
    const res = makeRes();

    await controller.list(
      makeReq({ attended_by: 'bot', dept: 'agua' }),
      res as unknown as Response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ botIds: [null], departmentSlug: 'agua' }),
    );
    expect(res.statusCode).toBeUndefined();
  });

  it('bot_id y department_id coexisten sin error de exclusión mutua', async () => {
    const service = {
      list: asyncMock().mockResolvedValue({ items: [], meta: { hasNextPage: false } }),
    };
    const { controller } = makeController(service);
    const next: NextFunction = jest.fn();

    await controller.list(
      makeReq({
        bot_id: '11111111-1111-4111-8111-111111111111',
        department_id: '22222222-2222-4222-8222-222222222222',
      }),
      makeRes() as unknown as Response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({
        botIds: ['11111111-1111-4111-8111-111111111111'],
        departmentIds: ['22222222-2222-4222-8222-222222222222'],
      }),
    );
  });

  it('department_id + bot_ids coexisten (OR entre grupos, sin exclusión mutua)', async () => {
    const service = {
      list: asyncMock().mockResolvedValue({ items: [], meta: { hasNextPage: false } }),
    };
    const { controller } = makeController(service);

    await controller.list(
      makeReq({
        department_id: '22222222-2222-4222-8222-222222222222',
        bot_ids: ['all'],
      }),
      makeRes() as unknown as Response,
      jest.fn(),
    );

    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentIds: ['22222222-2222-4222-8222-222222222222'],
        botIds: [null],
      }),
    );
  });

  it('bot_ids parsea all y múltiples UUIDs (repetido y CSV)', async () => {
    const service = {
      list: asyncMock().mockResolvedValue({ items: [], meta: { hasNextPage: false } }),
    };
    const { controller } = makeController(service);

    await controller.list(
      makeReq({
        bot_ids: [
          'all',
          '11111111-1111-4111-8111-111111111111,33333333-3333-4333-8333-333333333333',
        ],
      }),
      makeRes() as unknown as Response,
      jest.fn(),
    );

    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({
        botIds: [
          null,
          '11111111-1111-4111-8111-111111111111',
          '33333333-3333-4333-8333-333333333333',
        ],
      }),
    );
  });

  it('department_ids es alias de la lista de departamentos (repetido y CSV)', async () => {
    const service = {
      list: asyncMock().mockResolvedValue({ items: [], meta: { hasNextPage: false } }),
    };
    const { controller } = makeController(service);

    await controller.list(
      makeReq({
        department_ids: [
          '11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
        ],
      }),
      makeRes() as unknown as Response,
      jest.fn(),
    );

    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentIds: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
        ],
      }),
    );
  });

  it('400 cuando bot_ids tiene un valor que no es UUID ni all', async () => {
    const service = { list: asyncMock() };
    const { controller } = makeController(service);
    const res = makeRes();

    await controller.list(
      makeReq({ bot_ids: ['not-a-uuid'] }),
      res as unknown as Response,
      jest.fn(),
    );

    expect(res.statusCode).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('mapea attended_by=bot (deprecado) a botIds [null]', async () => {
    const service = {
      list: asyncMock().mockResolvedValue({ items: [], meta: { hasNextPage: false } }),
    };
    const { controller } = makeController(service);
    const res = makeRes();

    await controller.list(makeReq({ attended_by: 'bot' }), res as unknown as Response, jest.fn());

    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ botIds: [null] }));
    expect(res.statusCode).toBeUndefined();
    expect(res.body).toBeDefined();
  });

  it('mapea bot_id (deprecado) a botIds [uuid]', async () => {
    const service = {
      list: asyncMock().mockResolvedValue({ items: [], meta: { hasNextPage: false } }),
    };
    const { controller } = makeController(service);

    await controller.list(
      makeReq({ bot_id: '11111111-1111-4111-8111-111111111111' }),
      makeRes() as unknown as Response,
      jest.fn(),
    );

    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ botIds: ['11111111-1111-4111-8111-111111111111'] }),
    );
  });

  it('400 cuando attended_by tiene un valor no soportado', async () => {
    const service = { list: asyncMock() };
    const { controller } = makeController(service);

    const res = makeRes();
    await controller.list(
      makeReq({ attended_by: 'robot' }),
      res as unknown as Response,
      jest.fn(),
    );

    expect(res.statusCode).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
  });
});

describe('ConversationsService.list — botAgent derivado', () => {
  const baseItem = {
    id: 'conv-1',
    meta: { conversationId: 'conv-1', communicationLineId: 'line-1' },
    messages: [],
    tickets: [],
  };

  function makeService(items: unknown[], botAgents: Map<string, { id: string; name: string }>) {
    const conversationRepo = {
      listWithContext: asyncMock().mockResolvedValue({ items, hasNextPage: false }),
      findBotAgentsByLineIds: asyncMock().mockResolvedValue(botAgents),
    };
    // @ts-expect-error mocks parciales del wiring del service
    const svc = new ConversationsService(conversationRepo, {});
    return { svc, conversationRepo };
  }

  it('adjunta botAgent por línea y propaga botIds al repositorio', async () => {
    const { svc, conversationRepo } = makeService(
      [baseItem],
      new Map([['line-1', { id: 'agent-1', name: 'Bot Reclamos' }]]),
    );

    const result = await svc.list({ botIds: [null] });

    expect(conversationRepo.listWithContext).toHaveBeenCalledWith(
      expect.objectContaining({ botIds: [null] }),
    );
    expect(conversationRepo.findBotAgentsByLineIds).toHaveBeenCalledWith(['line-1']);
    expect(result.items[0]?.botAgent).toEqual({ id: 'agent-1', name: 'Bot Reclamos' });
  });

  it('botAgent es null cuando la línea no tiene agente IA activo', async () => {
    const { svc } = makeService([baseItem], new Map());

    const result = await svc.list({});

    expect(result.items[0]?.botAgent).toBeNull();
  });

  it('propaga botIds al repositorio cuando llega un agente específico', async () => {
    const { svc, conversationRepo } = makeService([], new Map());

    await svc.list({ botIds: ['agent-9'] });

    expect(conversationRepo.listWithContext).toHaveBeenCalledWith(
      expect.objectContaining({ botIds: ['agent-9'] }),
    );
  });

  it('propaga departmentIds y botIds juntos (OR entre grupos)', async () => {
    const { svc, conversationRepo } = makeService([], new Map());

    await svc.list({ departmentIds: ['dept-1'], botIds: ['agent-9', null] });

    expect(conversationRepo.listWithContext).toHaveBeenCalledWith(
      expect.objectContaining({ departmentIds: ['dept-1'], botIds: ['agent-9', null] }),
    );
  });
});
