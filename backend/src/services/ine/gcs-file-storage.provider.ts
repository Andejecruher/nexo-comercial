import { Storage } from '@google-cloud/storage';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { gcsStorage } from '../../config/gcs.client';
import { assertObjectPath } from '../storage/object-path';
import { gcsUrlSigner, type GcsUrlSigner } from '../storage/gcs-url-signer';
import {
  GCS_FILE_STORAGE_PROVIDER,
  type FileStorageProvider,
  type StoredObject,
} from './file-storage.provider';
import { GoogleProviderError } from './google-auth';

export class GCSFileStorageProvider implements FileStorageProvider {
  constructor(
    private readonly storage: Storage = gcsStorage,
    private readonly bucketName = process.env.GCS_MEDIA_BUCKET || 'voz_ciudadana',
    private readonly urlSigner: GcsUrlSigner = gcsUrlSigner,
  ) {}

  private objectName(path: string): string {
    try {
      return assertObjectPath(path);
    } catch {
      throw new GoogleProviderError('GCS_OBJECT_NAME_INVALID', false);
    }
  }

  async uploadStream(input: {
    path: string;
    mimeType: string;
    readable: Readable;
  }): Promise<StoredObject> {
    const objectName = this.objectName(input.path);
    try {
      await pipeline(
        input.readable,
        this.storage
          .bucket(this.bucketName)
          .file(objectName)
          .createWriteStream({
            resumable: false,
            validation: 'crc32c',
            preconditionOpts: { ifGenerationMatch: 0 },
            metadata: { contentType: input.mimeType, cacheControl: 'private, no-store' },
          }),
        { signal: AbortSignal.timeout(120_000) },
      );
      return {
        provider: GCS_FILE_STORAGE_PROVIDER,
        objectId: objectName,
        path: objectName,
        folderId: objectName.slice(0, objectName.lastIndexOf('/')),
      };
    } catch (error) {
      input.readable.destroy();
      throw this.providerError('UPLOAD', error);
    }
  }

  async getSignedUrl(path: string, ttlMs = 2 * 60 * 60 * 1000): Promise<string> {
    const objectName = assertObjectPath(path);
    if (!/^exports\/[^/]+\/[^/]+$/.test(objectName)) throw new Error('GCS_OBJECT_NAME_INVALID');
    return this.urlSigner.getSignedUrl({
      bucket: this.bucketName,
      objectName,
      method: 'GET',
      expires: new Date(Date.now() + ttlMs),
    });
  }

  private providerError(operation: 'UPLOAD' | 'DOWNLOAD' | 'DELETE', error: unknown) {
    const status = Number((error as { code?: unknown })?.code);
    const code = Number.isInteger(status) && status >= 400 ? String(status) : 'FAILED';
    return new GoogleProviderError(
      `GCS_${operation}_${code}`,
      code === 'FAILED' || status === 429 || status >= 500,
    );
  }

  async put(input: {
    path: string;
    folderPath?: string[];
    mimeType: string;
    filename: string;
    contents: Buffer;
  }): Promise<StoredObject> {
    const objectName = this.objectName(input.path);
    const prefix = input.folderPath?.join('/') ?? '';
    if (prefix && !objectName.startsWith(`${prefix}/`)) {
      throw new GoogleProviderError('GCS_OBJECT_NAME_INVALID', false);
    }
    try {
      await this.storage
        .bucket(this.bucketName)
        .file(objectName)
        .save(input.contents, {
          resumable: false,
          validation: 'crc32c',
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: { contentType: input.mimeType },
        });
    } catch (error) {
      throw this.providerError('UPLOAD', error);
    }
    return {
      provider: GCS_FILE_STORAGE_PROVIDER,
      objectId: objectName,
      folderId: prefix,
      path: input.path,
    };
  }

  async get(objectId: string): Promise<Buffer> {
    const objectName = this.objectName(objectId);
    try {
      const [contents] = await this.storage.bucket(this.bucketName).file(objectName).download();
      return contents;
    } catch (error) {
      throw this.providerError('DOWNLOAD', error);
    }
  }

  async delete(objectId: string): Promise<void> {
    const objectName = this.objectName(objectId);
    try {
      await this.storage.bucket(this.bucketName).file(objectName).delete({ ignoreNotFound: true });
    } catch (error) {
      throw this.providerError('DELETE', error);
    }
  }
}
