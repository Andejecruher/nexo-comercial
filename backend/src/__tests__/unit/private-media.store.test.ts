import { mkdtemp, readdir, rm, utimes } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrivateMediaStore } from '../../services/whatsapp/private-media.store';
import type { WhatsAppProvider } from '../../services/whatsapp/whatsapp.provider';

const MEDIA_ID = '1234567890';

function fakeProvider(bytes = Buffer.from('from-meta')) {
  return { downloadMedia: jest.fn(async () => bytes) } as unknown as WhatsAppProvider & {
    downloadMedia: jest.Mock;
  };
}

describe('PrivateMediaStore', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'wa-media-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('serves a cached entry without calling the provider', async () => {
    const store = new PrivateMediaStore({ root, sweepIntervalMs: 0 });
    const provider = fakeProvider();

    await store.put(MEDIA_ID, Buffer.from('cached'));
    await expect(store.get(MEDIA_ID, provider)).resolves.toEqual(Buffer.from('cached'));
    expect(provider.downloadMedia).not.toHaveBeenCalled();
  });

  it('returns the archived bytes from the fallback and re-caches them', async () => {
    const store = new PrivateMediaStore({
      root,
      sweepIntervalMs: 0,
      fallback: jest.fn(async () => Buffer.from('from-gcs')),
    });
    const provider = fakeProvider();

    await expect(store.get(MEDIA_ID, provider)).resolves.toEqual(Buffer.from('from-gcs'));
    expect(provider.downloadMedia).not.toHaveBeenCalled();
    await expect(store.get(MEDIA_ID, provider)).resolves.toEqual(Buffer.from('from-gcs'));
    expect(provider.downloadMedia).not.toHaveBeenCalled();
  });

  it('falls back to Meta when the archive has nothing and the read-through fails', async () => {
    const fallback = jest.fn(async () => {
      throw new Error('GCS_DOWN');
    });
    const store = new PrivateMediaStore({ root, sweepIntervalMs: 0, fallback });
    const provider = fakeProvider(Buffer.from('from-meta'));

    await expect(store.get(MEDIA_ID, provider)).resolves.toEqual(Buffer.from('from-meta'));
    expect(fallback).toHaveBeenCalledWith(MEDIA_ID, undefined);
    expect(provider.downloadMedia).toHaveBeenCalledTimes(1);
    await expect(store.get(MEDIA_ID, provider)).resolves.toEqual(Buffer.from('from-meta'));
    expect(provider.downloadMedia).toHaveBeenCalledTimes(1);
  });

  it('rejects media IDs that are not Meta numeric ids', async () => {
    const store = new PrivateMediaStore({ root, sweepIntervalMs: 0 });
    await expect(store.get('../escape', fakeProvider())).rejects.toThrow(
      'Invalid provider media ID',
    );
  });

  it('deletes an entry and reports whether it existed', async () => {
    const store = new PrivateMediaStore({ root, sweepIntervalMs: 0 });

    await store.put(MEDIA_ID, Buffer.from('cached'));
    await expect(store.delete(MEDIA_ID)).resolves.toBe(true);
    await expect(store.delete(MEDIA_ID)).resolves.toBe(false);
  });

  it('sweeps entries older than the TTL', async () => {
    const store = new PrivateMediaStore({ root, sweepIntervalMs: 0, ttlMs: 60_000 });
    await store.put(MEDIA_ID, Buffer.from('expired'));
    const [name] = await readdir(root);
    const old = new Date(Date.now() - 5 * 60_000);
    await utimes(join(root, name!), old, old);

    await expect(store.sweep()).resolves.toEqual({ deleted: 1, freedBytes: 7 });
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it('sweeps the oldest entries when the cache exceeds its size cap', async () => {
    const store = new PrivateMediaStore({ root, sweepIntervalMs: 0, maxBytes: 6 });
    await store.put('1', Buffer.alloc(4, 'a'));
    await store.put('2', Buffer.alloc(4, 'b'));
    await store.put('3', Buffer.alloc(4, 'c'));

    // Newest file stays inside the grace window; age the two oldest ones.
    const [first, second, third] = (await readdir(root)) as [string, string, string];
    const ages = new Map([
      [first, new Date(Date.now() - 5 * 60_000)],
      [second, new Date(Date.now() - 4 * 60_000)],
      [third, new Date(Date.now() - 3 * 60_000)],
    ]);
    for (const [name, date] of ages) await utimes(join(root, name), date, date);

    const result = await store.sweep();
    expect(result.deleted).toBe(2);
    expect(result.freedBytes).toBe(8);
    await expect(readdir(root)).resolves.toEqual([third]);
  });

  it('triggers at most one opportunistic sweep per interval', async () => {
    const store = new PrivateMediaStore({ root, sweepIntervalMs: 60_000 });
    const sweep = jest.spyOn(store, 'sweep');

    await store.put('1', Buffer.from('a'));
    await store.put('2', Buffer.from('b'));

    expect(sweep).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setImmediate(resolve));
  });
});
