import { describe, expect, it, jest } from '@jest/globals';
import {
  NewsletterService,
  hashNewsletterToken,
  normalizeNewsletterEmail,
} from '../../services/newsletter.service';

const ST = { active: 'active', pending: 'pending', unsubscribed: 'unsubscribed' } as const;

function makePrismaNewsletterMock() {
  const rowsByEmail: Record<string, any> = {};
  const rowsById: Record<string, any> = {};

  function indexRow(row: any) {
    rowsByEmail[row.email] = row;
    rowsById[row.id] = row;
  }

  return {
    newsletterSubscriber: {
      findUnique: jest.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) return rowsByEmail[where.email] ?? null;
        if (where.id) return rowsById[where.id] ?? null;
        return null;
      }),
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { confirmTokenHash?: string; unsubscribeTokenHash?: string };
        }) => {
          const all = Object.values(rowsByEmail);
          if (where.confirmTokenHash) {
            return all.find((r: any) => r.confirmTokenHash === where.confirmTokenHash) ?? null;
          }
          if (where.unsubscribeTokenHash) {
            return (
              all.find((r: any) => r.unsubscribeTokenHash === where.unsubscribeTokenHash) ?? null
            );
          }
          return null;
        },
      ),
      create: jest.fn(async ({ data }: { data: any }) => {
        const id = `ns-${Object.keys(rowsByEmail).length}`;
        const row = {
          id,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        indexRow(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const prev = rowsById[where.id];
        if (!prev) throw new Error('not found');
        const next = { ...prev, ...data, updatedAt: new Date() };
        delete rowsByEmail[prev.email];
        rowsByEmail[next.email] = next;
        rowsById[next.id] = next;
        return next;
      }),
    },
    _rowsByEmail: rowsByEmail,
    _indexRow: indexRow,
  };
}

describe('NewsletterService — helpers', () => {
  it('normaliza email a minúsculas y trim', () => {
    expect(normalizeNewsletterEmail('  Test@EXAMPLE.com ')).toBe('test@example.com');
  });

  it('hash de token es determinista (sha256 hex)', () => {
    expect(hashNewsletterToken('abc')).toBe(hashNewsletterToken('abc'));
    expect(hashNewsletterToken('abc')).not.toBe(hashNewsletterToken('abd'));
  });
});

describe('NewsletterService — subscribe', () => {
  it('crea suscriptor activo sin double opt-in', async () => {
    const prisma = makePrismaNewsletterMock();
    // @ts-expect-error mock parcial
    const svc = new NewsletterService(prisma);

    const out = await svc.subscribe({
      email: 'nueva@example.com',
      source: 'footer',
      doubleOptIn: false,
      confirmTtlHours: 72,
    });

    expect(out.status).toBe('active');
    if (out.status === 'active') {
      expect(out.alreadySubscribed).toBe(false);
      expect(out.subscribedAt).toBeInstanceOf(Date);
    }
    expect(prisma.newsletterSubscriber.create).toHaveBeenCalledTimes(1);
    const call = (prisma.newsletterSubscriber.create as jest.Mock).mock.calls[0][0] as {
      data: { email: string; status: string; unsubscribeTokenHash: string | null };
    };
    expect(call.data.email).toBe('nueva@example.com');
    expect(call.data.status).toBe(ST.active);
    expect(call.data.unsubscribeTokenHash).toHaveLength(64);
  });

  it('devuelve alreadySubscribed si ya está activo', async () => {
    const prisma = makePrismaNewsletterMock();
    const subbed = new Date('2026-01-01T00:00:00.000Z');
    prisma._indexRow({
      id: '1',
      email: 'a@example.com',
      status: ST.active,
      subscribedAt: subbed,
    });
    // @ts-expect-error mock
    const svc = new NewsletterService(prisma);

    const out = await svc.subscribe({
      email: 'A@Example.com',
      source: 'footer',
      doubleOptIn: false,
      confirmTtlHours: 72,
    });

    expect(out).toEqual({
      status: 'active',
      alreadySubscribed: true,
      subscribedAt: subbed,
    });
    expect(prisma.newsletterSubscriber.create).not.toHaveBeenCalled();
  });

  it('double opt-in deja pending y token de confirmación', async () => {
    const prisma = makePrismaNewsletterMock();
    // @ts-expect-error mock
    const svc = new NewsletterService(prisma);

    const out = await svc.subscribe({
      email: 'pend@example.com',
      source: 'footer',
      doubleOptIn: true,
      confirmTtlHours: 24,
    });

    expect(out.status).toBe('pending');
    if (out.status === 'pending') {
      expect(out.confirmExpiresAt.getTime()).toBeGreaterThan(Date.now());
    }
    const row = prisma._rowsByEmail['pend@example.com'];
    expect(row.status).toBe(ST.pending);
    expect(row.confirmTokenHash).toHaveLength(64);
    expect(row.subscribedAt).toBeNull();
  });
});

describe('NewsletterService — confirm y unsubscribe', () => {
  it('confirm pasa de pending a active', async () => {
    const prisma = makePrismaNewsletterMock();
    const rawToken = 'a'.repeat(64);
    const hash = hashNewsletterToken(rawToken);
    const expires = new Date(Date.now() + 3600_000);
    prisma._indexRow({
      id: 'x1',
      email: 'u@example.com',
      status: ST.pending,
      confirmTokenHash: hash,
      confirmTokenExpiresAt: expires,
      unsubscribeTokenHash: null,
    });
    // @ts-expect-error mock
    const svc = new NewsletterService(prisma);

    const out = await svc.confirmSubscription(rawToken);
    expect(out.status).toBe('active');
    const row = prisma._rowsByEmail['u@example.com'];
    expect(row.status).toBe(ST.active);
    expect(row.confirmTokenHash).toBeNull();
    expect(row.unsubscribeTokenHash).toHaveLength(64);
  });

  it('unsubscribe marca unsubscribed', async () => {
    const prisma = makePrismaNewsletterMock();
    const rawUnsub = 'b'.repeat(64);
    const unsubHash = hashNewsletterToken(rawUnsub);
    prisma._indexRow({
      id: 'y1',
      email: 'v@example.com',
      status: ST.active,
      unsubscribeTokenHash: unsubHash,
    });
    // @ts-expect-error mock
    const svc = new NewsletterService(prisma);

    await svc.unsubscribe(rawUnsub);
    expect(prisma._rowsByEmail['v@example.com'].status).toBe(ST.unsubscribed);
    expect(prisma._rowsByEmail['v@example.com'].unsubscribeTokenHash).toBeNull();
  });

  it('verify devuelve valid false si token no coincide', async () => {
    const prisma = makePrismaNewsletterMock();
    // @ts-expect-error mock
    const svc = new NewsletterService(prisma);
    await expect(svc.verifyConfirmToken('c'.repeat(64))).resolves.toEqual({ valid: false });
  });
});

describe('NewsletterService — correos de double opt-in', () => {
  type SentEmail = { template: string; props: Record<string, string> };
  const makeEmailService = () => ({
    send: jest.fn(async (_input: SentEmail) => ({
      success: true,
      provider: 'fake',
      durationMs: 1,
    })),
  });

  it('envía la confirmación con el token en claro al suscribir con DOI', async () => {
    const prisma = makePrismaNewsletterMock();
    const emailService = makeEmailService();
    // @ts-expect-error mock
    const svc = new NewsletterService(prisma, emailService);

    await svc.subscribe({
      email: 'pend@example.com',
      name: 'Ana',
      source: 'footer',
      doubleOptIn: true,
      confirmTtlHours: 24,
    });

    expect(emailService.send).toHaveBeenCalledTimes(1);
    const call = emailService.send.mock.calls[0]?.[0] as SentEmail;
    expect(call.template).toBe('newsletter-confirm');

    // El correo lleva el token en claro; la fila guarda solo el hash.
    const rawToken = new URL(call.props.confirmUrl).searchParams.get('token') ?? '';
    expect(call.props.confirmUrl).toContain('/boletin/confirmar?token=');
    expect(prisma._rowsByEmail['pend@example.com'].confirmTokenHash).toBe(
      hashNewsletterToken(rawToken),
    );
  });

  it('no envía confirmación cuando el double opt-in está apagado', async () => {
    const prisma = makePrismaNewsletterMock();
    const emailService = makeEmailService();
    // @ts-expect-error mock
    const svc = new NewsletterService(prisma, emailService);

    await svc.subscribe({
      email: 'directa@example.com',
      source: 'footer',
      doubleOptIn: false,
      confirmTtlHours: 24,
    });

    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('envía la bienvenida con enlace de baja al confirmar', async () => {
    const prisma = makePrismaNewsletterMock();
    const emailService = makeEmailService();
    const rawToken = 'a'.repeat(64);
    prisma._indexRow({
      id: 'x1',
      email: 'u@example.com',
      name: 'Ana',
      status: ST.pending,
      confirmTokenHash: hashNewsletterToken(rawToken),
      confirmTokenExpiresAt: new Date(Date.now() + 3600_000),
      unsubscribeTokenHash: null,
    });
    // @ts-expect-error mock
    const svc = new NewsletterService(prisma, emailService);

    await svc.confirmSubscription(rawToken);

    const call = emailService.send.mock.calls[0]?.[0] as SentEmail;
    expect(call.template).toBe('newsletter-welcome');
    const rawUnsub = new URL(call.props.unsubscribeUrl).searchParams.get('token') ?? '';
    expect(prisma._rowsByEmail['u@example.com'].unsubscribeTokenHash).toBe(
      hashNewsletterToken(rawUnsub),
    );
  });

  it('un fallo de correo no cancela el alta', async () => {
    const prisma = makePrismaNewsletterMock();
    const emailService = {
      send: jest.fn(async () => {
        throw new Error('proveedor caído');
      }),
    };
    // @ts-expect-error mock
    const svc = new NewsletterService(prisma, emailService);

    const out = await svc.subscribe({
      email: 'pend@example.com',
      source: 'footer',
      doubleOptIn: true,
      confirmTtlHours: 24,
    });

    expect(out.status).toBe('pending');
    expect(prisma._rowsByEmail['pend@example.com'].status).toBe(ST.pending);
  });
});
