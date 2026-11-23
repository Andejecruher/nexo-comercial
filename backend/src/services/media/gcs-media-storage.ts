import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { gcsStorage } from '../../config/gcs.client';
import { safeFilename } from '../whatsapp/media-policy';
import { MediaValidationStream } from './media-validation-stream';
import { assertObjectPath } from '../storage/object-path';
import { gcsUrlSigner, type GcsUrlSigner } from '../storage/gcs-url-signer';

export interface StoredMedia {
  storageKey: string;
  mimeType: string;
  fileSizeBytes: bigint;
  checksumSha256: string;
  checksumMd5: string;
  driveFileId: null;
  driveFolderId: null;
  cdnUrl: string;
}

export class GcsMediaStorage {
  constructor(
    private readonly storage = gcsStorage,
    readonly bucketName = process.env.GCS_MEDIA_BUCKET || 'voz_ciudadana',
    private readonly urlSigner: GcsUrlSigner = gcsUrlSigner,
  ) {}

  key(lineId: string, conversationId: string, attachmentId: string, filename: string): string {
    return assertObjectPath(
      `conversations/${lineId}/${conversationId}/${attachmentId}-${safeFilename(filename)}`,
    );
  }

  objectName(key: string): string {
    const prefix = `gs://${this.bucketName}/`;
    const name = key.startsWith(prefix) ? key.slice(prefix.length) : key;
    if (!name.startsWith('messages/') && !/^conversations\/[^/]+\/[^/]+\/[^/]+$/.test(name))
      throw new Error('MEDIA_STORAGE_KEY_REJECTED');
    try {
      return assertObjectPath(name);
    } catch {
      throw new Error('MEDIA_STORAGE_KEY_REJECTED');
    }
  }

  private file(key: string) {
    return this.storage.bucket(this.bucketName).file(this.objectName(key));
  }

  async recover(key: string, attachmentId: string): Promise<StoredMedia | null> {
    const file = this.file(key);
    let metadata;
    try {
      [metadata] = await file.getMetadata();
    } catch (error) {
      if (Number((error as { code?: number }).code) === 404) return null;
      throw error;
    }
    const custom = metadata.metadata;
    if (custom?.attachmentId !== attachmentId) throw new Error('MEDIA_STORAGE_KEY_REJECTED');
    if (custom.validated !== 'true') {
      // An interrupted upload/metadata update is never published. Generation guards
      // prevent deleting a replacement created by another worker.
      await file.delete({ ifGenerationMatch: metadata.generation });
      return null;
    }
    if (
      !custom.sha256 ||
      !custom.md5 ||
      !metadata.size ||
      !metadata.contentType ||
      !metadata.md5Hash ||
      metadata.md5Hash !== Buffer.from(String(custom.md5), 'hex').toString('base64')
    )
      throw new Error('MEDIA_INTEGRITY_FAILED');
    return {
      storageKey: this.objectName(key),
      mimeType: metadata.contentType!,
      fileSizeBytes: BigInt(metadata.size),
      checksumSha256: String(custom.sha256),
      checksumMd5: String(custom.md5),
      driveFileId: null,
      driveFolderId: null,
      cdnUrl: this.objectName(key),
    };
  }

  async put(input: {
    key: string;
    attachmentId: string;
    stream: Readable;
    mimeType: string;
    kind: string;
    expectedHash?: string;
  }): Promise<StoredMedia> {
    try {
      const file = this.file(input.key);
      const validator = new MediaValidationStream(input.mimeType, input.kind, input.expectedHash);
      const destination = file.createWriteStream({
        resumable: false,
        validation: 'crc32c',
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: input.mimeType,
          cacheControl: 'private, no-store',
          metadata: { attachmentId: input.attachmentId },
        },
      });
      // pipeline propagates source/destination errors and destroys both streams.
      await pipeline(input.stream, validator, destination, {
        signal: AbortSignal.timeout(120_000),
      });
      const checked = validator.result!;
      const [metadata] = await file.getMetadata();
      if (
        Number(metadata.size) !== checked.size ||
        metadata.md5Hash !== Buffer.from(checked.md5, 'hex').toString('base64')
      )
        throw new Error('MEDIA_INTEGRITY_FAILED');
      await file.setMetadata(
        {
          contentType: checked.mimeType,
          metadata: {
            attachmentId: input.attachmentId,
            validated: 'true',
            sha256: checked.sha256,
            md5: checked.md5,
          },
        },
        { ifGenerationMatch: metadata.generation },
      );
      const stored = await this.recover(input.key, input.attachmentId);
      if (!stored) throw new Error('MEDIA_INTEGRITY_FAILED');
      return stored;
    } catch (error) {
      // Also close a source when setup fails before pipeline can own it.
      input.stream.destroy();
      throw error;
    }
  }

  async getSignedUrl(
    objectName: string,
    filename: string,
    mimeType: string,
    download = false,
  ): Promise<{ url: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const inline =
      !download &&
      /^(image\/(jpeg|png|webp)|audio\/(ogg|mpeg|mp4|aac)|video\/(mp4|3gpp)|application\/pdf)$/.test(
        mimeType,
      );
    const url = await this.urlSigner.getSignedUrl({
      bucket: this.bucketName,
      objectName: this.objectName(objectName),
      method: 'GET',
      expires: expiresAt,
      responseType: inline ? mimeType : 'application/octet-stream',
      responseDisposition: `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(safeFilename(filename))}`,
    });
    return { url, expiresAt: expiresAt.toISOString() };
  }
}
