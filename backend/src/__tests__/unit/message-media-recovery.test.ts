import { createHash } from 'crypto';
import { Readable, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { MediaValidationStream } from '../../services/media/media-validation-stream';
import { MessageMediaService } from '../../services/media/message-media.service';
import { GoogleProviderError } from '../../services/ine/google-auth';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
  'base64',
);
function setup() {
  const row: any = {
    id: 'att',
    messageId: 'msg',
    providerMediaId: 'media',
    communicationLineId: 'original-line',
    providerPhoneNumberId: 'phone',
    processingState: 'pending',
    attempts: 0,
    fileSizeBytes: BigInt(0),
    mimeType: 'image/png',
    originalFilename: 'sample.png',
    message: {
      id: 'msg',
      conversationId: 'conv',
      messageType: 'image',
      meta: {},
      conversation: { meta: { communicationLineId: 'changed-line' } },
    },
  };
  const prisma: any = {
    attachment: {
      findMany: jest.fn().mockResolvedValue([row]),
      updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
        if (where.id)
          Object.assign(
            row,
            Object.fromEntries(
              Object.entries(data).filter(
                ([, v]) => typeof v !== 'object' || v === null || v instanceof Date,
              ),
            ),
          );
        return { count: 1 };
      }),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  const provider: any = {
    downloadMediaStream: jest.fn().mockImplementation(async () => Readable.from([png])),
  };
  let uploaded = false;
  const info = {
    storageKey: 'conversations/original-line/conv/att-sample.png',
    mimeType: 'image/png',
    fileSizeBytes: BigInt(png.length),
    checksumMd5: createHash('md5').update(png).digest('hex'),
    checksumSha256: createHash('sha256').update(png).digest('hex'),
    driveFileId: null,
    driveFolderId: null,
  };
  const storage: any = {
    key: (_line: string, _conv: string, id: string) =>
      `conversations/original-line/conv/${id}-sample.png`,
    recover: jest.fn().mockImplementation(async () => (uploaded ? info : null)),
    put: jest.fn().mockImplementation(async (input: any) => {
      await pipeline(
        input.stream,
        new MediaValidationStream(input.mimeType, input.kind, input.expectedHash),
        new Writable({
          write(_chunk, _encoding, cb) {
            cb();
          },
        }),
      );
      uploaded = true;
      return info;
    }),
  };
  const notifier: any = {
    isEnabled: () => true,
    notifyCritical: jest.fn().mockResolvedValue(undefined),
  };
  const cache = { delete: jest.fn().mockResolvedValue(true) };
  return {
    row,
    prisma,
    provider,
    storage,
    notifier,
    cache,
    service: new MessageMediaService(prisma, provider, notifier, storage, cache),
  };
}
it('stores a GCS path only after stream validation and emits a fresh update event', async () => {
  const { service, storage, row, notifier, provider, cache } = setup();
  await service.reconcile();
  expect(row.processingState).toBe('stored');
  expect(row.storageKey).toBe('conversations/original-line/conv/att-sample.png');
  expect(row.driveFileId).toBeNull();
  expect(cache.delete).toHaveBeenCalledWith('media', 'original-line');
  expect(provider.downloadMediaStream).toHaveBeenCalledWith('media', {
    lineExternalIdentifier: 'phone',
    allowDefault: false,
  });
  expect(storage.put).toHaveBeenCalledWith(
    expect.objectContaining({ attachmentId: 'att', stream: expect.any(Readable) }),
  );
  const event = notifier.notifyCritical.mock.calls[0][1];
  expect(event.eventId).not.toBe('msg');
  expect(event.notificationPatch).toBeUndefined();
  expect(event.eventType).toBe('conversation.updated');
});
it('recovers a successful upload after database failure without downloading expired provider media or duplicating GCS objects', async () => {
  const { service, prisma, provider, storage, row } = setup();
  prisma.$transaction.mockRejectedValueOnce(new Error('database unavailable'));
  await service.reconcile();
  expect(row.processingState).toBe('pending');
  provider.downloadMediaStream.mockRejectedValue(new Error('MEDIA_HTTP_404'));
  await service.reconcile();
  expect(row.processingState).toBe('stored');
  expect(provider.downloadMediaStream).toHaveBeenCalledTimes(1);
  expect(storage.put).toHaveBeenCalledTimes(1);
});
it('leaves the message intact and retries a temporary storage failure', async () => {
  const { service, row, storage } = setup();
  storage.put.mockRejectedValueOnce(new GoogleProviderError('GCS_UPLOAD_429', true));
  await service.reconcile();
  expect(row.processingState).toBe('pending');
  expect(row.messageId).toBe('msg');
  expect(row.lastErrorCode).toBe('GCS_UPLOAD_429');
});
it('fails closed for a permanent format error without uploading or publishing readiness', async () => {
  const { service, row, provider, storage, notifier } = setup();
  provider.downloadMediaStream.mockResolvedValue(Readable.from([Buffer.from('not an image')]));
  await service.reconcile();
  expect(row.processingState).toBe('failed');
  expect(row.storageKey).toBeUndefined();
  expect(notifier.notifyCritical).not.toHaveBeenCalled();
});
it('does no provider or storage work when another worker wins the claim', async () => {
  const { service, prisma, provider, storage, cache } = setup();
  prisma.attachment.updateMany.mockImplementation(async ({ data }: any) => ({
    count: data.processingState === 'processing' ? 0 : 1,
  }));
  await service.reconcile();
  expect(provider.downloadMediaStream).not.toHaveBeenCalled();
  expect(storage.put).not.toHaveBeenCalled();
  expect(cache.delete).not.toHaveBeenCalled();
});
