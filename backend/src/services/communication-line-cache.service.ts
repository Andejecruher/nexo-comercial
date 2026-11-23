/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PrismaClient } from '@prisma/client';
import { env } from '../config/env.config';
import { decrypt } from '../utils/crypto';

type CachedCommunicationLine = Record<string, unknown> & {
  whatsappAppSecret?: string | null; // desencriptado
  whatsappAccessToken?: string | null; // desencriptado
  whatsappPhoneNumberId?: string | null;
};

const DEFAULT_TTL_MS = Number(env.WHATSAPP_SECRET_CACHE_TTL_MS ?? '60_000');

type CacheEntry = { value: CachedCommunicationLine | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CachedCommunicationLine | null>>();

function makeKey(opts: { lineId?: string; id?: string; externalIdentifier?: string }) {
  if (opts.lineId) return `line:${opts.lineId}`;
  if (opts.id) return `id:${opts.id}`;
  if (opts.externalIdentifier) return `ext:${opts.externalIdentifier}`;
  throw new Error('lineId, id or externalIdentifier required');
}

function decryptOrRaw(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  try {
    return decrypt(value);
  } catch {
    // Compatibilidad con datos legacy en texto plano.
    return value;
  }
}

export async function getCommunicationLineCached(
  prisma: PrismaClient,
  opts: { lineId?: string; id?: string; externalIdentifier?: string; ttlMs?: number },
): Promise<CachedCommunicationLine | null> {
  const key = makeKey(opts);
  const now = Date.now();

  const entry = cache.get(key);
  if (entry && entry.expiresAt > now) return entry.value;
  if (inflight.has(key)) return inflight.get(key)!;

  const p = (async () => {
    const where = opts.lineId
      ? { id: opts.lineId }
      : opts.id
        ? { whatsappPhoneNumberId: opts.id }
        : { externalIdentifier: opts.externalIdentifier };

    const line = (await (prisma.communicationLine as any).findFirst({
      where,
      select: {
        id: true,
        channel: true,
        externalIdentifier: true,
        phoneNumber: true,
        provider: true,
        displayName: true,
        isActive: true,
        isDefault: true,
        aiEnabled: true,
        agentId: true,
        aiAgentId: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        whatsappAppSecret: true,
        whatsappAccessToken: true,
        whatsappBusinessAccountId: true,
        whatsappAppId: true,
        whatsappPhoneNumberId: true,
      },
    })) as Record<string, unknown> | null;

    const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;

    if (!line) {
      cache.set(key, { value: null, expiresAt: Date.now() + ttl });
      return null;
    }

    // desencriptar solo aquí; no loguear valores en claro
    const accessToken = decryptOrRaw(line['whatsappAccessToken']);
    const appSecret = decryptOrRaw(line['whatsappAppSecret']);

    const cached: CachedCommunicationLine = {
      ...line,
      whatsappAppSecret: appSecret,
      whatsappAccessToken: accessToken,
    };

    const expiresAt = Date.now() + ttl;
    cache.set(key, { value: cached, expiresAt });

    const lineId = typeof cached.id === 'string' ? cached.id : undefined;
    if (lineId) {
      cache.set(`line:${lineId}`, { value: cached, expiresAt });
    }

    const externalIdentifier =
      typeof cached.externalIdentifier === 'string' ? cached.externalIdentifier : undefined;
    if (externalIdentifier) {
      cache.set(`ext:${externalIdentifier}`, { value: cached, expiresAt });
    }

    const phoneNumberId =
      typeof cached.whatsappPhoneNumberId === 'string' ? cached.whatsappPhoneNumberId : undefined;
    if (phoneNumberId) {
      cache.set(`id:${phoneNumberId}`, { value: cached, expiresAt });
    }

    return cached;
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

export function setCommunicationLineCache(
  opts: { lineId?: string; id?: string; externalIdentifier?: string },
  value: CachedCommunicationLine,
  ttlMs?: number,
): void {
  const key = makeKey(opts);
  cache.set(key, { value, expiresAt: Date.now() + (ttlMs ?? DEFAULT_TTL_MS) });
}

export function invalidateCommunicationLineCacheById(id: string): void {
  cache.delete(`line:${id}`);
  cache.delete(`id:${id}`);
}

export function invalidateCommunicationLineCacheByExternalIdentifier(ext: string): void {
  cache.delete(`ext:${ext}`);
}
