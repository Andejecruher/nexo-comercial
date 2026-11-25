import { describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { scopeMiddleware, requireScope } from '../../../middlewares/scope.middleware';
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
    const scope: ScopeContext = { kind: 'admin' };
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
    const middleware = requireScope('admin');
    const req = createRequest({ id: 'user-1' }, { kind: 'admin' }) as Request;
    const res = createResponse() as Response;
    const next = createNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('returns 404 when scope kind is not allowed', () => {
    const middleware = requireScope('admin');
    const req = createRequest({ id: 'user-1' }, { kind: 'none' }) as Request;
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
