import { gcsStorage } from '../../config/gcs.client';
import type { PrismaService } from '../prisma.service';
import { assertObjectPath } from '../storage/object-path';
import type { MediaBytesFallback } from '../whatsapp/private-media.store';

/**
 * Reads already-archived bytes from GCS by provider media ID.
 *
 * `PrivateMediaStore` is a bounded cache: when an entry is evicted (TTL or size
 * cap) the bytes must come back from the durable archive instead of Meta, whose
 * media URLs expire.
 */
export function createAttachmentMediaFallback(
  prisma: Pick<PrismaService, 'attachment'>,
  bucketName = process.env.GCS_MEDIA_BUCKET || 'voz_ciudadana',
): MediaBytesFallback {
  return async (id, lineId) => {
    const row = await prisma.attachment.findFirst({
      where: {
        providerMediaId: id,
        processingState: 'stored',
        ...(lineId ? { communicationLineId: lineId } : {}),
      },
      orderBy: { storedAt: 'desc' },
      select: { storageKey: true },
    });
    if (!row) return null;
    try {
      const [bytes] = await gcsStorage
        .bucket(bucketName)
        .file(assertObjectPath(row.storageKey))
        .download();
      return bytes;
    } catch (error) {
      if (Number((error as { code?: number }).code) === 404) return null;
      throw error;
    }
  };
}
