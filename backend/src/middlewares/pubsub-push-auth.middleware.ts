/**
 * OIDC verification for Google Pub/Sub push endpoints.
 *
 * A push subscription signed with `--push-auth-service-account` attaches an
 * `Authorization: Bearer <OIDC token>` header. Cloud Tasks calls the worker
 * behind private Cloud Run IAM, but the API is publicly reachable, so the push
 * routes must verify the token in-process — otherwise anyone could POST forged
 * events to `/pubsub/*` and drive realtime or AI-stream delivery.
 *
 * Verification uses `google-auth-library` (already a dependency) and checks the
 * signature, the audience (API origin), and the caller identity (the push
 * service account email).
 */
import { NextFunction, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.config';

export interface PubSubPushIdentity {
  email?: string;
  emailVerified?: boolean;
}

export type PubSubPushTokenVerifier = (
  token: string,
  audience: string,
) => Promise<PubSubPushIdentity>;

export interface PubSubPushAuthOptions {
  audience?: string;
  serviceAccountEmail?: string;
  /** Injectable for tests; defaults to `OAuth2Client.verifyIdToken`. */
  verify?: PubSubPushTokenVerifier;
}

const defaultVerifier: PubSubPushTokenVerifier = async (token, audience) => {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken: token, audience });
  const payload = ticket.getPayload();
  return { email: payload?.email, emailVerified: payload?.email_verified };
};

/**
 * Returns a middleware that rejects any request whose bearer token is not a
 * valid Google-issued OIDC token for the expected audience and service account.
 *
 * Outside production, when the audience or the service account email is not
 * configured, verification is skipped so local runs (fake transport, no Pub/Sub)
 * keep working. In production a missing configuration fails fast at startup.
 */
export function createPubSubPushAuthMiddleware(
  options: PubSubPushAuthOptions = {},
): (req: Request, res: Response, next: NextFunction) => void {
  const audience = options.audience ?? env.PUBSUB_PUSH_AUDIENCE ?? env.BASE_URL;
  const serviceAccountEmail = options.serviceAccountEmail ?? env.PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL;
  const verify = options.verify ?? defaultVerifier;

  if (!audience || !serviceAccountEmail) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'PUBSUB_PUSH_AUDIENCE and PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL are required in production to authenticate Pub/Sub push requests',
      );
    }
    console.warn('[PubSubPushAuth] OIDC verification disabled (allowed outside production)');
    return (_req, _res, next) => next();
  }

  return (req, res, next): void => {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'Token not found in Authorization header' });
      return;
    }

    verify(token, audience)
      .then((identity) => {
        if (identity.email !== serviceAccountEmail || identity.emailVerified !== true) {
          console.error(
            JSON.stringify({
              level: 'warn',
              event: 'pubsub_push_auth_rejected',
              reason: 'identity_mismatch',
            }),
          );
          res.status(401).json({ error: 'Invalid token identity' });
          return;
        }
        next();
      })
      .catch((error: unknown) => {
        console.error(
          JSON.stringify({
            level: 'warn',
            event: 'pubsub_push_auth_failed',
            reason: error instanceof Error ? error.message : String(error),
          }),
        );
        res.status(401).json({ error: 'Invalid or expired token' });
      });
  };
}
