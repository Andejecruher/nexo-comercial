import { auth, drive, drive_v3 } from '@googleapis/drive';
import { Readable } from 'stream';
import { env } from '../../config/env.config';
import {
  GOOGLE_DRIVE_PERSONAL_OAUTH_PROVIDER,
  type FileStorageProvider,
  type StoredObject,
} from './file-storage.provider';
import {
  GoogleConfigurationError,
  googleDriveOAuthCredentials,
  GoogleProviderError,
} from './google-auth';

export class GoogleDriveFileStorageProvider implements FileStorageProvider {
  private assertConfigured(): { folderId: string } {
    if (!env.GOOGLE_DRIVE_FOLDER_ID) {
      throw new GoogleConfigurationError('GOOGLE_DRIVE_CONFIGURATION_MISSING');
    }
    return { folderId: env.GOOGLE_DRIVE_FOLDER_ID };
  }

  driveClient(): drive_v3.Drive {
    const credentials = googleDriveOAuthCredentials();
    const oauth2Client = new auth.OAuth2(credentials.clientId, credentials.clientSecret);
    oauth2Client.setCredentials({ refresh_token: credentials.refreshToken });
    return drive({ version: 'v3', auth: oauth2Client });
  }

  providerError(operation: 'UPLOAD' | 'DOWNLOAD' | 'DELETE', error: unknown): GoogleProviderError {
    const status =
      typeof error === 'object' && error !== null && 'response' in error
        ? (error as { response?: { status?: unknown } }).response?.status
        : undefined;
    const code = typeof status === 'number' ? status : 'FAILED';
    return new GoogleProviderError(
      `DRIVE_${operation}_${code}`,
      typeof status === 'number' && (status >= 500 || status === 429),
    );
  }

  async put(input: {
    path: string;
    folderPath?: string[];
    mimeType: string;
    filename: string;
    contents: Buffer;
  }): Promise<StoredObject> {
    const { folderId: rootFolderId } = this.assertConfigured();
    const folderId = input.folderPath?.length
      ? await this.resolveFolderPath(input.folderPath)
      : rootFolderId;
    let result: { id?: string | null };
    try {
      const response = await this.driveClient().files.create({
        requestBody: { name: input.filename, parents: [folderId] },
        media: { mimeType: input.mimeType, body: Readable.from([input.contents]) },
        fields: 'id',
      });
      result = response.data;
    } catch (error) {
      throw this.providerError('UPLOAD', error);
    }
    if (!result.id) throw new GoogleProviderError('DRIVE_UPLOAD_INVALID', false);
    return {
      provider: GOOGLE_DRIVE_PERSONAL_OAUTH_PROVIDER,
      objectId: result.id,
      folderId,
      path: input.path,
    };
  }

  private readonly folderCache = new Map<string, Promise<string>>();

  /**
   * Resolves a folder chain under the configured root, creating the missing
   * levels with the same `ensureFolder` strategy used for exports, campaigns
   * and conversation media. Every level is cached so repeated uploads reuse
   * the existing folder ids instead of listing Drive again.
   */
  private async resolveFolderPath(segments: string[]): Promise<string> {
    let folder = this.assertConfigured().folderId;
    for (const name of segments) {
      const key = `${folder}/${name}`;
      let pending = this.folderCache.get(key);
      if (!pending) {
        pending = this.ensureFolder(name, folder);
        this.folderCache.set(key, pending);
        void pending.catch(() => this.folderCache.delete(key));
      }
      folder = await pending;
    }
    return folder;
  }

  async uploadStream(input: {
    path: string;
    mimeType: string;
    filename: string;
    folderId: string;
    readable: Readable;
  }): Promise<StoredObject> {
    this.assertConfigured();
    try {
      const response = await this.driveClient().files.create({
        requestBody: { name: input.filename, parents: [input.folderId] },
        media: { mimeType: input.mimeType, body: input.readable },
        fields: 'id,parents',
      });
      if (!response.data.id) throw new GoogleProviderError('DRIVE_UPLOAD_INVALID', false);
      return {
        provider: GOOGLE_DRIVE_PERSONAL_OAUTH_PROVIDER,
        objectId: response.data.id,
        folderId: response.data.parents?.[0] ?? input.folderId,
        path: input.path,
      };
    } catch (error) {
      if (error instanceof GoogleProviderError) throw error;
      throw this.providerError('UPLOAD', error);
    }
  }

  async getStream(objectId: string): Promise<{ stream: Readable; contentLength?: number }> {
    this.assertConfigured();
    try {
      const response = await this.driveClient().files.get(
        { fileId: objectId, alt: 'media' },
        { responseType: 'stream' },
      );
      return {
        stream: response.data as unknown as Readable,
        contentLength: response.headers['content-length']
          ? Number(response.headers['content-length'])
          : undefined,
      };
    } catch (error) {
      throw this.providerError('DOWNLOAD', error);
    }
  }

  private readonly mediaFolders = new Map<string, Promise<string>>();

  async resolveMediaFolder(lineId: string, conversationId: string): Promise<string> {
    const root = this.assertConfigured().folderId;
    const key = `${root}/${lineId}/${conversationId}`;
    const cached = this.mediaFolders.get(key);
    if (cached) return cached;
    const pending = (async () => {
      let folder = root;
      for (const name of ['Media', 'Lineas', lineId, 'Conversaciones', conversationId]) {
        folder = await this.ensureFolder(name, folder);
      }
      return folder;
    })();
    this.mediaFolders.set(key, pending);
    try {
      return await pending;
    } catch (error) {
      this.mediaFolders.delete(key);
      throw error;
    }
  }

  async reserveMediaId(): Promise<string> {
    const response = await this.driveClient().files.generateIds({ count: 1, space: 'drive' });
    const id = response.data.ids?.[0];
    if (!id) throw new GoogleProviderError('DRIVE_ID_INVALID', true);
    return id;
  }

  async mediaInfo(
    id: string,
  ): Promise<{ size?: string | null; md5Checksum?: string | null } | null> {
    try {
      const response = await this.driveClient().files.get(
        { fileId: id, fields: 'id,size,md5Checksum,trashed' },
        { timeout: 30000 },
      );
      if (response.data.trashed) throw new GoogleProviderError('DRIVE_FILE_TRASHED', false);
      return response.data;
    } catch (error) {
      if ((error as { response?: { status?: number } }).response?.status === 404) return null;
      throw error;
    }
  }

  /** Preallocated id is checkpointed in PostgreSQL before upload: replay never creates a second object. */
  async putMessageMedia(input: {
    id: string;
    folderId: string;
    attachmentId: string;
    mimeType: string;
    contents: Buffer;
  }): Promise<void> {
    try {
      await this.driveClient().files.create(
        {
          requestBody: {
            id: input.id,
            name: input.attachmentId,
            parents: [input.folderId],
            appProperties: { attachmentId: input.attachmentId },
          },
          media: { mimeType: input.mimeType, body: Readable.from([input.contents]) },
          fields: 'id',
        },
        { timeout: 30000, retry: false },
      );
    } catch (error) {
      throw this.providerError('UPLOAD', error);
    }
  }

  async resolveExportFolder(module: string): Promise<string> {
    const { folderId } = this.assertConfigured();
    const exportsFolder = await this.ensureFolder('exports', folderId);
    return this.ensureFolder(module, exportsFolder);
  }

  async resolveCampaignFolder(name: string): Promise<string> {
    const { folderId } = this.assertConfigured();
    const campaigns = await this.ensureFolder('campaigns', folderId);
    return this.ensureFolder(name, campaigns);
  }

  private async ensureFolder(name: string, parentId: string): Promise<string> {
    try {
      const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const existing = await this.driveClient().files.list({
        q: `'${parentId}' in parents and name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)',
        pageSize: 1,
      });
      const found = existing.data.files?.[0]?.id;
      if (found) return found;
      const created = await this.driveClient().files.create({
        requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
        fields: 'id',
      });
      if (!created.data.id) throw new GoogleProviderError('DRIVE_UPLOAD_INVALID', false);
      return created.data.id;
    } catch (error) {
      if (error instanceof GoogleProviderError) throw error;
      throw this.providerError('UPLOAD', error);
    }
  }

  async get(objectId: string): Promise<Buffer> {
    this.assertConfigured();
    try {
      const response = await this.driveClient().files.get(
        { fileId: objectId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      return Buffer.isBuffer(response.data)
        ? response.data
        : Buffer.from(response.data as unknown as ArrayBuffer);
    } catch (error) {
      throw this.providerError('DOWNLOAD', error);
    }
  }

  async delete(objectId: string): Promise<void> {
    this.assertConfigured();
    try {
      await this.driveClient().files.delete({ fileId: objectId });
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { status?: unknown } }).response?.status
          : undefined;
      if (status !== 404) throw this.providerError('DELETE', error);
    }
  }
}
