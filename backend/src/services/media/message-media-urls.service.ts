import type { Attachment } from '@prisma/client';
import type { MessageWithStatuses } from '../../repositories/message.repository';
import { isGcsMediaKey } from '../storage/object-path';
import { GcsMediaStorage } from './gcs-media-storage';

export interface MediaUrlFields {
  mediaUrl?: string | null;
  mediaDownloadUrl?: string | null;
  mediaUrlExpiresAt?: string;
  mediaError?: 'MEDIA_URL_UNAVAILABLE';
}

export type MessageWithMediaUrls = Omit<MessageWithStatuses, 'attachmentsViaMessageId'> &
  MediaUrlFields & {
    attachmentsViaMessageId: (Attachment & MediaUrlFields)[];
  };

/** Signs only committed objects. URLs belong to the response, never persisted metadata. */
export async function withSignedMediaUrls(
  items: MessageWithStatuses[],
  storage: Pick<GcsMediaStorage, 'getSignedUrl'> = new GcsMediaStorage(),
): Promise<MessageWithMediaUrls[]> {
  return Promise.all(
    items.map(async (message) => {
      const attachments = await Promise.all(
        message.attachmentsViaMessageId.map(
          async (attachment): Promise<Attachment & MediaUrlFields> => {
            if (attachment.processingState !== 'stored' || !isGcsMediaKey(attachment.storageKey))
              return attachment;
            try {
              const filename = attachment.originalFilename ?? 'archivo';
              const [inline, download] = await Promise.all([
                storage.getSignedUrl(attachment.storageKey, filename, attachment.mimeType),
                storage.getSignedUrl(attachment.storageKey, filename, attachment.mimeType, true),
              ]);
              return {
                ...attachment,
                mediaUrl: inline.url,
                mediaDownloadUrl: download.url,
                mediaUrlExpiresAt: inline.expiresAt,
              };
            } catch (error: unknown) {
              console.error('Error getting signed media urls', error);
              // One IAM/signing failure must not hide text or other attachments.
              return {
                ...attachment,
                mediaUrl: null,
                mediaDownloadUrl: null,
                mediaError: 'MEDIA_URL_UNAVAILABLE',
              };
            }
          },
        ),
      );
      const primary = attachments[0];
      return {
        ...message,
        mediaUrl: primary?.mediaUrl,
        mediaDownloadUrl: primary?.mediaDownloadUrl,
        mediaUrlExpiresAt: primary?.mediaUrlExpiresAt,
        mediaError: primary?.mediaError,
        attachmentsViaMessageId: attachments,
      };
    }),
  );
}
