import { gcsStorage } from '../../config/gcs.client';
import { createAttachmentMediaFallback } from '../../services/media/attachment-media.fallback';

jest.mock('../../config/gcs.client', () => ({
  gcsStorage: { bucket: jest.fn() },
}));

const bucket = (gcsStorage as unknown as { bucket: jest.Mock }).bucket;

function prismaWith(row: { storageKey: string } | null) {
  const findFirst = jest.fn(async () => row);
  return { attachment: { findFirst } } as unknown as Parameters<
    typeof createAttachmentMediaFallback
  >[0] & { attachment: { findFirst: jest.Mock } };
}

describe('createAttachmentMediaFallback', () => {
  const file = jest.fn();
  const download = jest.fn();

  beforeEach(() => {
    file.mockReset();
    download.mockReset();
    bucket.mockReset();
    bucket.mockReturnValue({ file });
    file.mockReturnValue({ download });
  });

  it('downloads the archived object for a stored attachment', async () => {
    const prisma = prismaWith({ storageKey: 'conversations/line/conv/att-photo.jpg' });
    download.mockResolvedValue([Buffer.from('archived')]);

    await expect(createAttachmentMediaFallback(prisma)('123', 'line')).resolves.toEqual(
      Buffer.from('archived'),
    );
    expect(prisma.attachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerMediaId: '123', processingState: 'stored', communicationLineId: 'line' },
      }),
    );
    expect(file).toHaveBeenCalledWith('conversations/line/conv/att-photo.jpg');
  });

  it('returns null when the attachment is not archived yet', async () => {
    const prisma = prismaWith(null);

    await expect(createAttachmentMediaFallback(prisma)('123')).resolves.toBeNull();
    expect(prisma.attachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerMediaId: '123', processingState: 'stored' },
      }),
    );
    expect(bucket).not.toHaveBeenCalled();
  });

  it('returns null when the object no longer exists in the bucket', async () => {
    const prisma = prismaWith({ storageKey: 'conversations/line/conv/att-photo.jpg' });
    download.mockRejectedValue(Object.assign(new Error('not found'), { code: 404 }));

    await expect(createAttachmentMediaFallback(prisma)('123')).resolves.toBeNull();
  });

  it('propagates non-404 storage errors so the caller can fall back to Meta', async () => {
    const prisma = prismaWith({ storageKey: 'conversations/line/conv/att-photo.jpg' });
    download.mockRejectedValue(Object.assign(new Error('boom'), { code: 500 }));

    await expect(createAttachmentMediaFallback(prisma)('123')).rejects.toThrow('boom');
  });
});
