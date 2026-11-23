import { createHash } from 'crypto';
import { Readable, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { GcsMediaStorage } from '../../services/media/gcs-media-storage';
import { MediaValidationStream } from '../../services/media/media-validation-stream';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
  'base64',
);
const key = 'conversations/line/conv/att-photo.png';
function setup() {
  let metadata: any;
  let destination: Writable;
  const file = {
    createWriteStream: jest.fn((options: any) => {
      const chunks: Buffer[] = [];
      destination = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(chunk);
          callback();
        },
        final(callback) {
          const bytes = Buffer.concat(chunks);
          metadata = {
            ...options.metadata,
            size: String(bytes.length),
            generation: '123',
            md5Hash: createHash('md5').update(bytes).digest('base64'),
          };
          callback();
        },
      });
      return destination;
    }),
    getMetadata: jest.fn(async () => {
      if (!metadata) throw Object.assign(new Error('Missing'), { code: 404 });
      return [metadata];
    }),
    setMetadata: jest.fn(async (value: any) => {
      metadata = { ...metadata, ...value };
    }),
    delete: jest.fn(async () => {
      metadata = undefined;
    }),
    getSignedUrl: jest.fn(async () => ['https://storage.googleapis.com/signed']),
  };
  const storage = { bucket: jest.fn(() => ({ file: jest.fn(() => file) })) };
  return {
    service: new GcsMediaStorage(storage as never),
    storage,
    file,
    destination: () => destination,
    setMetadata: (value: any) => {
      metadata = value;
    },
  };
}
it('streams, verifies the content and recovers a committed object without another upload', async () => {
  const { service, file } = setup();
  const result = await service.put({
    key,
    attachmentId: 'att',
    stream: Readable.from([png.subarray(0, 10), png.subarray(10)]),
    mimeType: 'image/png',
    kind: 'image',
  });
  expect(result.storageKey).toBe(key);
  expect(result.cdnUrl).toBe(key);
  expect(service.key('line', 'conv', 'att', 'photo.png')).toBe(key);
  expect(result.fileSizeBytes).toBe(BigInt(png.length));
  expect(result.checksumSha256).toBe(createHash('sha256').update(png).digest('hex'));
  expect(file.createWriteStream).toHaveBeenCalledWith(
    expect.objectContaining({ preconditionOpts: { ifGenerationMatch: 0 } }),
  );
  expect(await service.recover(key, 'att')).toEqual(result);
  expect(file.createWriteStream).toHaveBeenCalledTimes(1);
});
it('propagates a broken source stream and never marks it validated', async () => {
  const { service, file, destination } = setup();
  const source = Readable.from(
    (async function* () {
      yield png.subarray(0, 10);
      throw new Error('source failed');
    })(),
  );
  await expect(
    service.put({ key, attachmentId: 'att', stream: source, mimeType: 'image/png', kind: 'image' }),
  ).rejects.toThrow('source failed');
  expect(destination().destroyed).toBe(true);
  expect(source.destroyed).toBe(true);
  expect(file.setMetadata).not.toHaveBeenCalled();
});
it('propagates destination failure and cancels the source', async () => {
  const { service, file } = setup();
  file.createWriteStream.mockReturnValueOnce(
    new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error('GCS unavailable'));
      },
    }),
  );
  const source = Readable.from([png]);
  await expect(
    service.put({ key, attachmentId: 'att', stream: source, mimeType: 'image/png', kind: 'image' }),
  ).rejects.toThrow('GCS unavailable');
  expect(source.destroyed).toBe(true);
  expect(file.setMetadata).not.toHaveBeenCalled();
});
it('discards only the exact unvalidated generation and rejects a foreign object', async () => {
  const { service, file, setMetadata } = setup();
  setMetadata({ generation: '42', metadata: { attachmentId: 'att' } });
  expect(await service.recover(key, 'att')).toBeNull();
  expect(file.delete).toHaveBeenCalledWith({ ifGenerationMatch: '42' });
  file.delete.mockClear();
  setMetadata({ generation: '43', metadata: { attachmentId: 'someone-else' } });
  await expect(service.recover(key, 'att')).rejects.toThrow('MEDIA_STORAGE_KEY_REJECTED');
  expect(file.delete).not.toHaveBeenCalled();
});
it('signs a v4 read URL for exactly 15 minutes and rejects other buckets', async () => {
  const { storage } = setup();
  const signer = {
    getSignedUrl: jest.fn().mockResolvedValue('https://storage.googleapis.com/signed'),
  };
  const serviceWithSigner = new GcsMediaStorage(storage as never, 'voz_ciudadana', signer);
  const now = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  try {
    const signed = await serviceWithSigner.getSignedUrl(key, '../photo.png', 'image/png');
    expect(Date.parse(signed.expiresAt)).toBe(now + 900000);
    expect(signer.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'voz_ciudadana',
        objectName: key,
        method: 'GET',
        expires: new Date(now + 900000),
        responseType: 'image/png',
        responseDisposition: "inline; filename*=UTF-8''_photo.png",
      }),
    );
    await expect(
      serviceWithSigner.getSignedUrl('gs://another-bucket/messages/att', 'file', 'image/png'),
    ).rejects.toThrow('MEDIA_STORAGE_KEY_REJECTED');
  } finally {
    jest.restoreAllMocks();
  }
});
async function validate(chunks: Buffer[], mime: string, kind: string, hash?: string) {
  const validator = new MediaValidationStream(mime, kind, hash);
  await pipeline(
    Readable.from(chunks),
    validator,
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  );
  return validator.result;
}
it('checks the Meta SHA-256 in hexadecimal and base64, and rejects mismatches', async () => {
  for (const encoding of ['hex', 'base64'] as const)
    await expect(
      validate([png], 'image/png', 'image', createHash('sha256').update(png).digest(encoding)),
    ).resolves.toBeDefined();
  await expect(validate([png], 'image/png', 'image', 'bad')).rejects.toThrow('MEDIA_HASH_MISMATCH');
});
it('rejects spoofed media and empty content', async () => {
  await expect(validate([Buffer.from('not a png')], 'image/png', 'image')).rejects.toThrow();
  await expect(validate([], 'image/png', 'image')).rejects.toThrow('MEDIA_FORMAT_REJECTED');
});
it('checks size across chunks and UTF-8 including bytes beyond the signature sample', async () => {
  await expect(
    validate(
      Array.from({ length: 6 }, () => Buffer.alloc(1024 * 1024)),
      'image/png',
      'image',
    ),
  ).rejects.toThrow('MEDIA_SIZE_EXCEEDED');
  await expect(
    validate([Buffer.alloc(65536, 65), Buffer.from([0xff])], 'text/plain', 'document'),
  ).rejects.toThrow('MEDIA_FORMAT_REJECTED');
  await expect(
    validate([Buffer.from([0xc3]), Buffer.from([0xb1])], 'text/plain', 'document'),
  ).resolves.toBeDefined();
  await expect(validate([png], 'text/plain', 'document')).rejects.toThrow();
});
