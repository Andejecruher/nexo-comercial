import { createHash, randomUUID } from 'crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { createStructuredLogger } from '../../utils/structured-logger';
import { WhatsAppProvider } from './whatsapp.provider';
import type { WhatsAppLineContext } from './whatsapp-line-config.resolver';

const log = createStructuredLogger('PrivateMediaStore');

/** Retention for cache entries that are never read again. */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Hard cap for the cache volume; GCS holds the durable copy. */
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
/**
 * Never evict a file touched this recently: it may be an in-flight write or the
 * bytes a turn is about to read.
 */
const MIN_ENTRY_AGE_MS = 60_000;

/** Reads the durable copy of a provider media ID, when one exists. */
export type MediaBytesFallback = (id: string, lineId?: string) => Promise<Buffer | null>;

export interface PrivateMediaStoreOptions {
  root?: string;
  ttlMs?: number;
  maxBytes?: number;
  /** `0` disables the opportunistic sweep triggered by writes. */
  sweepIntervalMs?: number;
  fallback?: MediaBytesFallback;
}

export interface SweepResult {
  deleted: number;
  freedBytes: number;
}

interface CacheEntry {
  path: string;
  size: number;
  mtimeMs: number;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Private read-through cache for WhatsApp media.
 *
 * Bytes are written with a hashed name, never served statically and never use a
 * client-supplied path. The durable copy lives in GCS: this store only absorbs
 * the turn that needs the bytes before `MessageMediaService` archives them.
 * Entries are therefore bounded by TTL and by total size — an unbounded cache
 * silently duplicates every archived object forever.
 */
export class PrivateMediaStore {
  private readonly root: string;
  private readonly ttlMs: number;
  private readonly maxBytes: number;
  private readonly sweepIntervalMs: number;
  private readonly fallback?: MediaBytesFallback;
  private lastSweepAt = 0;
  private sweeping = false;

  constructor(options: PrivateMediaStoreOptions = {}) {
    this.root =
      options.root ?? process.env.WHATSAPP_MEDIA_DIR ?? join(process.cwd(), 'storage', 'whatsapp');
    this.ttlMs =
      options.ttlMs ?? positiveInt(process.env.WHATSAPP_MEDIA_CACHE_TTL_MS, DEFAULT_TTL_MS);
    this.maxBytes =
      options.maxBytes ??
      positiveInt(process.env.WHATSAPP_MEDIA_CACHE_MAX_BYTES, DEFAULT_MAX_BYTES);
    this.sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    this.fallback = options.fallback;
  }

  private path(id: string, lineId?: string): string {
    return join(
      this.root,
      createHash('sha256')
        .update(`${lineId ?? 'default'}:${id}`)
        .digest('hex'),
    );
  }

  async put(id: string, bytes: Buffer, lineId?: string): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const target = this.path(id, lineId);
    const temporary = `${target}.${randomUUID()}`;
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, target);
    this.sweepIfDue();
  }

  async get(
    id: string,
    provider: WhatsAppProvider,
    context?: WhatsAppLineContext,
  ): Promise<Buffer> {
    if (!/^\d+$/.test(id)) throw new Error('Invalid provider media ID');
    const cached = await this.readLocal(id, context?.lineId);
    if (cached) return cached;
    const archived = await this.readFallback(id, context?.lineId);
    if (archived) {
      await this.put(id, archived, context?.lineId);
      return archived;
    }
    const bytes = await provider.downloadMedia(id, context);
    await this.put(id, bytes, context?.lineId);
    return bytes;
  }

  async delete(id: string, lineId?: string): Promise<boolean> {
    try {
      await unlink(this.path(id, lineId));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  /**
   * Drops entries older than the TTL and, if the volume is still over the size
   * cap, the oldest entries until it fits.
   */
  async sweep(now = Date.now()): Promise<SweepResult> {
    const result: SweepResult = { deleted: 0, freedBytes: 0 };
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result;
      throw error;
    }

    const entries: CacheEntry[] = [];
    let totalBytes = 0;
    for (const name of names) {
      const entryPath = join(this.root, name);
      try {
        const info = await stat(entryPath);
        if (!info.isFile()) continue;
        entries.push({ path: entryPath, size: info.size, mtimeMs: info.mtimeMs });
        totalBytes += info.size;
      } catch {
        // Raced with another writer or a delete; nothing to account for.
      }
    }

    const evict = async (entry: CacheEntry): Promise<void> => {
      try {
        await unlink(entry.path);
        result.deleted += 1;
        result.freedBytes += entry.size;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          log('warn', 'media.cache_evict_failed', undefined, {
            error: String(error),
            root: this.root,
          });
      }
    };

    // Oldest first: once an entry is inside the TTL window, the rest are newer.
    const candidates = entries
      .filter((entry) => now - entry.mtimeMs > MIN_ENTRY_AGE_MS)
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
    const evicted = new Set<string>();

    for (const entry of candidates) {
      if (now - entry.mtimeMs <= this.ttlMs) break;
      await evict(entry);
      evicted.add(entry.path);
    }

    for (const entry of candidates) {
      if (totalBytes - result.freedBytes <= this.maxBytes) break;
      if (evicted.has(entry.path)) continue;
      await evict(entry);
    }

    return result;
  }

  private async readLocal(id: string, lineId?: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(id, lineId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return null;
    }
  }

  private async readFallback(id: string, lineId?: string): Promise<Buffer | null> {
    if (!this.fallback) return null;
    try {
      const bytes = await this.fallback(id, lineId);
      return bytes && bytes.length > 0 ? bytes : null;
    } catch (error) {
      // A stale GCS read must never fail the turn: Meta is still the fallback.
      log('warn', 'media.cache_fallback_failed', undefined, { error: String(error) });
      return null;
    }
  }

  private sweepIfDue(): void {
    if (this.sweepIntervalMs <= 0 || this.sweeping) return;
    const now = Date.now();
    if (now - this.lastSweepAt < this.sweepIntervalMs) return;
    this.lastSweepAt = now;
    this.sweeping = true;
    void this.sweep(now)
      .then((result) => {
        if (result.deleted > 0)
          log('info', 'media.cache_swept', undefined, {
            deleted: result.deleted,
            freedBytes: result.freedBytes,
            root: this.root,
          });
      })
      .catch((error: unknown) =>
        log('warn', 'media.cache_sweep_failed', undefined, {
          error: String(error),
          root: this.root,
        }),
      )
      .finally(() => {
        this.sweeping = false;
      });
  }
}
