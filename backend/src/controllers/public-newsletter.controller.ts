import type { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';
import { env } from '../config/env.config';
import type { NewsletterService } from '../services/newsletter.service';

const SubscribeBodySchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(255).optional(),
  source: z.string().trim().min(1).max(50).default('footer'),
});

const UnsubscribeBodySchema = z.object({
  token: z.string().trim().min(64).max(64),
});

const TokenParamSchema = z.object({
  token: z.string().trim().min(64).max(64),
});

export class PublicNewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  subscribe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = SubscribeBodySchema.parse(req.body);
      const ip =
        (typeof req.headers['x-forwarded-for'] === 'string'
          ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
          : Array.isArray(req.headers['x-forwarded-for'])
            ? req.headers['x-forwarded-for'][0]
            : null) ??
        req.socket?.remoteAddress ??
        null;

      const result = await this.newsletterService.subscribe({
        email: body.email,
        name: body.name,
        source: body.source,
        ipAddress: ip,
        doubleOptIn: env.NEWSLETTER_DOUBLE_OPT_IN,
        confirmTtlHours: env.NEWSLETTER_CONFIRM_TTL_HOURS,
      });

      if (result.status === 'active') {
        res.status(200).json({
          status: 'active',
          alreadySubscribed: result.alreadySubscribed,
          subscribedAt: result.subscribedAt?.toISOString() ?? null,
        });
        return;
      }

      res.status(201).json({
        status: 'pending',
        message:
          'Revisá tu correo para confirmar la suscripción. Si no llega, revisá la carpeta de spam.',
        confirmExpiresAt: result.confirmExpiresAt.toISOString(),
        ...(process.env.NODE_ENV === 'development' && result.devConfirmToken
          ? { devConfirmToken: result.devConfirmToken }
          : {}),
      });
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        res.status(400).json({
          error: first?.message ?? 'Datos inválidos',
          code: 'VALIDATION_ERROR',
          details: err.issues,
        });
        return;
      }
      next(err);
    }
  };

  verify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = TokenParamSchema.parse(req.params);
      const out = await this.newsletterService.verifyConfirmToken(token);
      res.status(200).json(out);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: 'Token inválido',
          code: 'VALIDATION_ERROR',
          details: err.issues,
        });
        return;
      }
      next(err);
    }
  };

  confirm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = TokenParamSchema.parse(req.params);
      const result = await this.newsletterService.confirmSubscription(token);
      res.status(200).json({
        status: result.status,
        subscribedAt: result.subscribedAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: 'Token inválido',
          code: 'VALIDATION_ERROR',
          details: err.issues,
        });
        return;
      }
      next(err);
    }
  };

  unsubscribe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = UnsubscribeBodySchema.parse(req.body);
      await this.newsletterService.unsubscribe(body.token);
      res.status(200).json({ status: 'unsubscribed' });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: firstZodMessage(err),
          code: 'VALIDATION_ERROR',
          details: err.issues,
        });
        return;
      }
      next(err);
    }
  };
}

function firstZodMessage(err: ZodError): string {
  return err.issues[0]?.message ?? 'Datos inválidos';
}
