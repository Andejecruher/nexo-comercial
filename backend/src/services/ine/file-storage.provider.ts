export type StoredObject = {
  provider: string;
  objectId: string;
  folderId: string;
  path: string;
  driveId?: string;
};

export const GOOGLE_DRIVE_PERSONAL_OAUTH_PROVIDER = 'google_drive_personal_oauth';
export const GCS_FILE_STORAGE_PROVIDER = 'google_cloud_storage';

export class UnsupportedFileStorageProviderError extends Error {
  readonly code = 'INE_STORAGE_PROVIDER_UNSUPPORTED';

  constructor() {
    super('Stored file uses an unsupported storage provider');
    this.name = 'UnsupportedFileStorageProviderError';
  }
}

export function assertSupportedFileStorageProvider(provider: string): void {
  if (provider !== GCS_FILE_STORAGE_PROVIDER) {
    throw new UnsupportedFileStorageProviderError();
  }
}

export interface FileStorageProvider {
  put(input: {
    /** Logical path recorded in `StoredFile.storagePath`. */
    path: string;
    /**
     * Logical path segments relative to the provider root. GCS uses these as
     * object-name prefixes; it does not create folders.
     */
    folderPath?: string[];
    mimeType: string;
    filename: string;
    contents: Buffer;
  }): Promise<StoredObject>;
  get(objectId: string): Promise<Buffer>;
  delete(objectId: string): Promise<void>;
}
