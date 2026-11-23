import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.config';
import { NewsletterPrismaLike, NewsletterRepository } from '../repositories/newsletter.repository';
import { NotFoundError } from '../utils/app-error';
import type { EmailService } from './email/email.service';
import { formatExpiration } from './email/format';

/** Valores de `newsletter_subscriber_status` en DB (Prisma enum). Literales para evitar dependencia frágil del enum en tests. */
const NS = {
  pending: 'pending',
  active: 'active',
  unsubscribed: 'unsubscribed',
} as const;

const TOKEN_BYTES = 32;

export function normalizeNewsletterEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashNewsletterToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

function buildNewsletterUrl(path: string, token?: string): string {
  const url = new URL(path, `${env.FRONTEND_URL.replace(/\/$/, '')}/`);
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

export const buildNewsletterConfirmUrl = (token: string): string =>
  buildNewsletterUrl('/boletin/confirmar', token);

export const buildNewsletterUnsubscribeUrl = (token: string): string =>
  buildNewsletterUrl('/boletin/baja', token);

function maskEmailForResponse(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const visible = local.substring(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export type SubscribeNewsletterInput = {
  email: string;
  name?: string | null;
  source: string;
  ipAddress?: string | null;
  doubleOptIn: boolean;
  confirmTtlHours: number;
};

export type SubscribeNewsletterResult =
  | {
      status: 'active';
      alreadySubscribed: boolean;
      subscribedAt: Date | null;
    }
  | {
      status: 'pending';
      alreadySubscribed: false;
      confirmExpiresAt: Date;
      /** Solo para depuración local; el controlador no lo expone en producción. */
      devConfirmToken?: string;
    };

export type VerifyNewsletterTokenResult =
  | { valid: false }
  | { valid: true; status: 'pending'; emailMasked: string };

export class NewsletterService {
  private readonly repository: NewsletterRepository;

  constructor(
    repositoryOrPrisma: NewsletterRepository | NewsletterPrismaLike,
    private readonly emailService?: EmailService,
  ) {
    this.repository =
      repositoryOrPrisma instanceof NewsletterRepository
        ? repositoryOrPrisma
        : new NewsletterRepository(repositoryOrPrisma);
  }

  /**
   * El correo es un efecto secundario del alta: si el proveedor falla, la
   * suscripción sigue en `pending` y el usuario puede reintentar.
   */
  private async sendOrLog(
    action: 'confirm' | 'welcome',
    send: (emailService: EmailService) => Promise<{ success: boolean; errorCode?: string }>,
  ): Promise<void> {
    if (!this.emailService) return;
    try {
      const delivery = await send(this.emailService);
      if (!delivery.success) {
        console.error(`[Newsletter] Falló el envío de ${action}`, {
          errorCode: delivery.errorCode,
        });
      }
    } catch (error) {
      console.error(`[Newsletter] Excepción al enviar ${action}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async subscribe(input: SubscribeNewsletterInput): Promise<SubscribeNewsletterResult> {
    const email = normalizeNewsletterEmail(input.email);
    const now = new Date();
    const existing = await this.repository.findByEmail(email);

    if (existing?.status === NS.active) {
      return {
        status: 'active',
        alreadySubscribed: true,
        subscribedAt: existing.subscribedAt,
      };
    }

    if (input.doubleOptIn) {
      const rawConfirm = generateRawToken();
      const confirmHash = hashNewsletterToken(rawConfirm);
      const confirmExpiresAt = new Date(now.getTime() + input.confirmTtlHours * 60 * 60 * 1000);

      const data = {
        email,
        name: input.name?.trim() || null,
        source: input.source,
        status: NS.pending,
        ipAddress: input.ipAddress ?? null,
        subscribedAt: null,
        unsubscribedAt: null,
        confirmTokenHash: confirmHash,
        confirmTokenExpiresAt: confirmExpiresAt,
        unsubscribeTokenHash: null,
      };

      if (existing) {
        await this.repository.updateById(existing.id, {
          name: data.name,
          source: data.source,
          status: NS.pending,
          ipAddress: data.ipAddress,
          unsubscribedAt: null,
          subscribedAt: null,
          confirmTokenHash: confirmHash,
          confirmTokenExpiresAt: confirmExpiresAt,
          unsubscribeTokenHash: null,
        });
      } else {
        await this.repository.create(data);
      }

      await this.sendOrLog('confirm', (emailService) =>
        emailService.send({
          to: { email, name: data.name ?? undefined },
          template: 'newsletter-confirm',
          props: {
            recipientName: data.name ?? undefined,
            platformName: env.MAIL_PLATFORM_NAME,
            confirmUrl: buildNewsletterConfirmUrl(rawConfirm),
            ...formatExpiration(confirmExpiresAt),
          },
        }),
      );

      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[Newsletter][dev] pending confirmation for ${maskEmailForResponse(email)} — token (use in confirm URL): ${rawConfirm}`,
        );
      }

      return {
        status: 'pending',
        alreadySubscribed: false,
        confirmExpiresAt,
        devConfirmToken: process.env.NODE_ENV === 'development' ? rawConfirm : undefined,
      };
    }

    const rawUnsub = generateRawToken();
    const unsubHash = hashNewsletterToken(rawUnsub);

    const baseData = {
      name: input.name?.trim() || null,
      source: input.source,
      status: NS.active,
      ipAddress: input.ipAddress ?? null,
      subscribedAt: now,
      unsubscribedAt: null,
      confirmTokenHash: null,
      confirmTokenExpiresAt: null,
      unsubscribeTokenHash: unsubHash,
    };

    if (existing) {
      await this.repository.updateById(existing.id, baseData);
    } else {
      await this.repository.create({
        email,
        ...baseData,
      });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[Newsletter][dev] active subscription ${maskEmailForResponse(email)} — unsubscribe token: ${rawUnsub}`,
      );
    }

    return {
      status: 'active',
      alreadySubscribed: false,
      subscribedAt: now,
    };
  }

  async verifyConfirmToken(rawToken: string): Promise<VerifyNewsletterTokenResult> {
    const token = rawToken?.trim();
    if (!token) return { valid: false };
    const hash = hashNewsletterToken(token);
    const row = await this.repository.findByConfirmTokenHash(hash);
    if (!row || row.status !== NS.pending) {
      return { valid: false };
    }
    if (row.confirmTokenExpiresAt && row.confirmTokenExpiresAt.getTime() < Date.now()) {
      return { valid: false };
    }
    return { valid: true, status: 'pending', emailMasked: maskEmailForResponse(row.email) };
  }

  async confirmSubscription(rawToken: string): Promise<{ status: 'active'; subscribedAt: Date }> {
    const token = rawToken?.trim();
    if (!token) {
      throw new NotFoundError('Enlace de confirmación inválido o expirado');
    }
    const hash = hashNewsletterToken(token);
    const row = await this.repository.findByConfirmTokenHash(hash);
    if (!row || row.status !== NS.pending) {
      throw new NotFoundError('Enlace de confirmación inválido o expirado');
    }
    if (row.confirmTokenExpiresAt && row.confirmTokenExpiresAt.getTime() < Date.now()) {
      throw new NotFoundError('Enlace de confirmación inválido o expirado');
    }

    const rawUnsub = generateRawToken();
    const unsubHash = hashNewsletterToken(rawUnsub);
    const now = new Date();

    await this.repository.updateById(row.id, {
      status: NS.active,
      subscribedAt: now,
      confirmTokenHash: null,
      confirmTokenExpiresAt: null,
      unsubscribeTokenHash: unsubHash,
    });

    await this.sendOrLog('welcome', (emailService) =>
      emailService.send({
        to: { email: row.email, name: row.name ?? undefined },
        template: 'newsletter-welcome',
        props: {
          recipientName: row.name ?? undefined,
          platformName: env.MAIL_PLATFORM_NAME,
          siteUrl: env.FRONTEND_URL,
          unsubscribeUrl: buildNewsletterUnsubscribeUrl(rawUnsub),
        },
      }),
    );

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[Newsletter][dev] confirmed ${maskEmailForResponse(row.email)} — unsubscribe token: ${rawUnsub}`,
      );
    }

    return { status: 'active', subscribedAt: now };
  }

  async unsubscribe(rawToken: string): Promise<void> {
    const token = rawToken?.trim();
    if (!token) {
      throw new NotFoundError('Enlace de baja inválido');
    }
    const hash = hashNewsletterToken(token);
    const row = await this.repository.findByUnsubscribeTokenHash(hash);
    if (!row || row.status !== NS.active) {
      throw new NotFoundError('Enlace de baja inválido');
    }

    const now = new Date();
    await this.repository.updateById(row.id, {
      status: NS.unsubscribed,
      unsubscribedAt: now,
      confirmTokenHash: null,
      confirmTokenExpiresAt: null,
      unsubscribeTokenHash: null,
    });
  }

  /** Indica si el correo tiene suscripción activa (p. ej. validación interna). */
  async isSubscribed(email: string): Promise<boolean> {
    const normalized = normalizeNewsletterEmail(email);
    const row = await this.repository.findStatusByEmail(normalized);
    return row?.status === NS.active;
  }
}
