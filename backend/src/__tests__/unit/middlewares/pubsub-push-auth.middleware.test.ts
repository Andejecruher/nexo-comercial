import { describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../../config/env.config';
import {
  createPubSubPushAuthMiddleware,
  type PubSubPushIdentity,
  type PubSubPushTokenVerifier,
} from '../../../middlewares/pubsub-push-auth.middleware';
import { withEnvConfig } from '../../helpers/with-env';

const AUDIENCE = 'https://api.example.com';
const PUSH_EMAIL = 'pubsub-push-invoker@project.iam.gserviceaccount.com';

function createRequest(authorization?: string): Partial<Request> {
  return { headers: authorization ? { authorization } : {} } as Partial<Request>;
}

function createResponse(): { res: Partial<Response>; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Partial<Response>, status, json };
}

function createNext(): NextFunction {
  return jest.fn() as unknown as NextFunction;
}

function createMiddleware(verify: (token: string, audience: string) => Promise<PubSubPushIdentity>) {
  return createPubSubPushAuthMiddleware({
    audience: AUDIENCE,
    serviceAccountEmail: PUSH_EMAIL,
    verify,
  });
}

describe('createPubSubPushAuthMiddleware', () => {
  it('rejects a request without an Authorization header', () => {
    const middleware = createMiddleware(jest.fn<PubSubPushTokenVerifier>());
    const req = createRequest() as Request;
    const { res, status } = createResponse();
    const next = createNext();

    middleware(req, res as Response, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer Authorization header', () => {
    const middleware = createMiddleware(jest.fn<PubSubPushTokenVerifier>());
    const req = createRequest('Basic abc') as Request;
    const { res, status } = createResponse();
    const next = createNext();

    middleware(req, res as Response, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when the token cannot be verified', async () => {
    const verify = jest.fn(async () => {
      throw new Error('invalid signature');
    });
    const middleware = createMiddleware(verify);
    const req = createRequest('Bearer forged-token') as Request;
    const { res, status } = createResponse();
    const next = createNext();

    middleware(req, res as Response, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(verify).toHaveBeenCalledWith('forged-token', AUDIENCE);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token issued for a different service account', async () => {
    const verify = jest.fn(async () => ({ email: 'attacker@evil.com', emailVerified: true }));
    const middleware = createMiddleware(verify);
    const req = createRequest('Bearer valid-but-wrong-identity') as Request;
    const { res, status } = createResponse();
    const next = createNext();

    middleware(req, res as Response, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token whose email is not verified', async () => {
    const verify = jest.fn(async () => ({ email: PUSH_EMAIL, emailVerified: false }));
    const middleware = createMiddleware(verify);
    const req = createRequest('Bearer unverified-email') as Request;
    const { res, status } = createResponse();
    const next = createNext();

    middleware(req, res as Response, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid Pub/Sub push token', async () => {
    const verify = jest.fn(async () => ({ email: PUSH_EMAIL, emailVerified: true }));
    const middleware = createMiddleware(verify);
    const req = createRequest('Bearer valid-token') as Request;
    const { res, status } = createResponse();
    const next = createNext();

    middleware(req, res as Response, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(verify).toHaveBeenCalledWith('valid-token', AUDIENCE);
    expect(next).toHaveBeenCalledWith();
    expect(status).not.toHaveBeenCalled();
  });

  it('skips verification outside production when the service account is unset', () => {
    const restore = withEnvConfig(env, { PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL: undefined });
    try {
      const middleware = createPubSubPushAuthMiddleware({ audience: AUDIENCE });
      const req = createRequest() as Request;
      const { res, status } = createResponse();
      const next = createNext();

      middleware(req, res as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(status).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});
