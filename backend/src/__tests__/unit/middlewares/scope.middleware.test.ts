import { describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { scopeMiddleware, requireScope, scopeWhere } from '../../../middlewares/scope.middleware';
import { ScopeService } from '../../../services/scope.service';
import type { ScopeContext } from '../../../types/auth.types';

type AsyncMock<Args extends unknown[] = [], Result = unknown> = (...args: Args) => Promise<Result>;

function createRequest(user?: { id: string }, scope?: ScopeContext): Partial<Request> {
  return { user, scope } as Partial<Request>;
}

function createResponse(): Partial<Response> {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as Partial<Response>;
}

function createScopeService(scope: ScopeContext): ScopeService {
  return {
    resolveScope: jest.fn<AsyncMock<[string], ScopeContext>>().mockResolvedValue(scope),
  } as unknown as ScopeService;
}

function createNext(): NextFunction {
  return jest.fn() as unknown as NextFunction;
}

describe('scopeMiddleware', () => {
  it('injects resolved scope into req.scope', async () => {
    const scope: ScopeContext = { kind: 'leader', sectionId: 'section-1', leaderId: 'leader-1' };
    const middleware = scopeMiddleware(createScopeService(scope));
    const req = createRequest({ id: 'user-1' }) as Request;
    const res = createResponse() as Response;
    const next = createNext();

    middleware(req, res, next);
    await Promise.resolve();

    expect(req.scope).toEqual(scope);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 401 when req.user is not set', async () => {
    const middleware = scopeMiddleware(createScopeService({ kind: 'none' }));
    const req = createRequest() as Request;
    const res = createResponse() as Response;
    const next = createNext();

    middleware(req, res, next);
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('propagates service errors to next', async () => {
    const service = {
      resolveScope: jest.fn<AsyncMock<[string], ScopeContext>>().mockRejectedValue(new Error('boom')),
    } as unknown as ScopeService;
    const middleware = scopeMiddleware(service);
    const req = createRequest({ id: 'user-1' }) as Request;
    const res = createResponse() as Response;
    const next = createNext();

    middleware(req, res, next);
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('requireScope', () => {
  it('allows matching scope kinds', () => {
    const middleware = requireScope('admin', 'coordinator');
    const req = createRequest({ id: 'user-1' }, { kind: 'coordinator', coordinatorId: 'coord-1' }) as Request;
    const res = createResponse() as Response;
    const next = createNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('returns 404 when scope kind is not allowed', () => {
    const middleware = requireScope('admin');
    const req = createRequest({ id: 'user-1' }, { kind: 'leader', leaderId: 'leader-1' }) as Request;
    const res = createResponse() as Response;
    const next = createNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('returns 404 when scope is missing', () => {
    const middleware = requireScope('admin');
    const req = createRequest({ id: 'user-1' }) as Request;
    const res = createResponse() as Response;
    const next = createNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

describe('scopeWhere', () => {
  it('returns undefined for admin scope', () => {
    expect(scopeWhere({ kind: 'admin' })).toBeUndefined();
  });

  it('returns undefined for missing scope', () => {
    expect(scopeWhere(undefined)).toBeUndefined();
  });

  it('returns leader relation filter for leader scope', () => {
    expect(scopeWhere({ kind: 'leader', leaderId: 'leader-1' })).toEqual({
      leader: { id: 'leader-1' },
    });
  });

  it('returns coordinator relation filter for coordinator scope', () => {
    expect(scopeWhere({ kind: 'coordinator', coordinatorId: 'coord-1' })).toEqual({
      leader: { coordinatorId: 'coord-1' },
    });
  });

  it('uses custom leader path when provided', () => {
    expect(scopeWhere({ kind: 'leader', leaderId: 'leader-1' }, { leaderPath: 'assignedLeader' })).toEqual({
      assignedLeader: { id: 'leader-1' },
    });
  });
});
