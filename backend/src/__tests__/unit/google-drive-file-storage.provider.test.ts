import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { env } from '../../config/env.config';

type AsyncMock<Args extends unknown[], Result> = (...args: Args) => Promise<Result>;
type DriveCreateResponse = { data: { id?: string | null } };
type DriveGetResponse = { data: Buffer | ArrayBuffer };
type DriveDeleteResponse = { data: unknown };

const mockSetCredentials = jest.fn();
const mockOAuth2 = jest.fn(() => ({ setCredentials: mockSetCredentials }));
const mockFilesCreate = jest.fn<AsyncMock<[unknown], DriveCreateResponse>>();
const mockFilesList = jest.fn<AsyncMock<[unknown], { data: { files?: Array<{ id?: string }> } }>>();
const mockFilesGet = jest.fn<AsyncMock<[unknown, unknown], DriveGetResponse>>();
const mockFilesDelete = jest.fn<AsyncMock<[unknown], DriveDeleteResponse>>();
const mockPermissionsCreate = jest.fn();
const mockDrive = jest.fn(() => ({
  files: {
    create: mockFilesCreate,
    list: mockFilesList,
    get: mockFilesGet,
    delete: mockFilesDelete,
  },
  permissions: { create: mockPermissionsCreate },
}));

jest.mock('googleapis', () => ({
  google: { auth: { OAuth2: mockOAuth2 }, drive: mockDrive },
}));

import { GoogleDriveFileStorageProvider } from '../../services/ine/google-drive-file-storage.provider';

const originalConfiguration = {
  GOOGLE_DRIVE_FOLDER_ID: env.GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_OAUTH_CLIENT_ID: env.GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET: env.GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_DRIVE_REFRESH_TOKEN: env.GOOGLE_DRIVE_REFRESH_TOKEN,
};

function configureDrive(): void {
  Object.assign(env, {
    GOOGLE_DRIVE_FOLDER_ID: 'private-folder',
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
    GOOGLE_DRIVE_REFRESH_TOKEN: 'refresh-token',
  });
}

afterEach(() => {
  Object.assign(env, originalConfiguration);
  jest.clearAllMocks();
});

describe('GoogleDriveFileStorageProvider', () => {
  it('uses OAuth2 and the Drive v3 client to upload an in-memory private file', async () => {
    configureDrive();
    mockFilesCreate.mockResolvedValue({ data: { id: 'drive-file-1' } });

    const result = await new GoogleDriveFileStorageProvider().put({
      path: 'uploads/INE/upload-1/front.png',
      filename: 'front.png',
      mimeType: 'image/png',
      contents: Buffer.from('synthetic image'),
    });

    expect(mockOAuth2).toHaveBeenCalledWith('client-id', 'client-secret');
    expect(mockSetCredentials).toHaveBeenCalledWith({ refresh_token: 'refresh-token' });
    expect(mockDrive).toHaveBeenCalledWith({ version: 'v3', auth: expect.anything() });
    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: { name: 'front.png', parents: ['private-folder'] },
        media: expect.objectContaining({ mimeType: 'image/png' }),
        fields: 'id',
      }),
    );
    const [{ media }] = mockFilesCreate.mock.calls[0] as [
      { media: { body: NodeJS.ReadableStream } },
    ];
    expect(await readBuffer(media.body)).toEqual(Buffer.from('synthetic image'));
    expect(result).toEqual({
      provider: 'google_drive_personal_oauth',
      objectId: 'drive-file-1',
      folderId: 'private-folder',
      path: 'uploads/INE/upload-1/front.png',
    });
    expect(mockPermissionsCreate).not.toHaveBeenCalled();
  });

  it('creates the uploads/INE/<uploadId> chain and uploads inside it', async () => {
    configureDrive();
    mockFilesList
      .mockResolvedValueOnce({ data: { files: [] } })
      .mockResolvedValueOnce({ data: { files: [] } })
      .mockResolvedValueOnce({ data: { files: [{ id: 'folder-upload-1' }] } });
    mockFilesCreate
      .mockResolvedValueOnce({ data: { id: 'folder-uploads' } })
      .mockResolvedValueOnce({ data: { id: 'folder-ine' } })
      .mockResolvedValueOnce({ data: { id: 'drive-file-1' } });

    const provider = new GoogleDriveFileStorageProvider();
    const result = await provider.put({
      path: 'uploads/INE/upload-1/front.png',
      folderPath: ['uploads', 'INE', 'upload-1'],
      filename: 'front.png',
      mimeType: 'image/png',
      contents: Buffer.from('synthetic image'),
    });

    expect(mockFilesList).toHaveBeenNthCalledWith(1, {
      q: folderQuery('private-folder', 'uploads'),
      fields: 'files(id)',
      pageSize: 1,
    });
    expect(mockFilesCreate).toHaveBeenNthCalledWith(1, {
      requestBody: {
        name: 'uploads',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['private-folder'],
      },
      fields: 'id',
    });
    expect(mockFilesCreate).toHaveBeenNthCalledWith(2, {
      requestBody: {
        name: 'INE',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['folder-uploads'],
      },
      fields: 'id',
    });
    expect(mockFilesCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestBody: { name: 'front.png', parents: ['folder-upload-1'] },
        fields: 'id',
      }),
    );
    expect(mockFilesCreate).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      provider: 'google_drive_personal_oauth',
      objectId: 'drive-file-1',
      folderId: 'folder-upload-1',
      path: 'uploads/INE/upload-1/front.png',
    });
  });

  it('reuses cached folder ids across uploads of the same upload record', async () => {
    configureDrive();
    mockFilesList
      .mockResolvedValueOnce({ data: { files: [] } })
      .mockResolvedValueOnce({ data: { files: [] } })
      .mockResolvedValueOnce({ data: { files: [{ id: 'folder-upload-1' }] } });
    mockFilesCreate
      .mockResolvedValueOnce({ data: { id: 'folder-uploads' } })
      .mockResolvedValueOnce({ data: { id: 'folder-ine' } })
      .mockResolvedValueOnce({ data: { id: 'drive-file-front' } })
      .mockResolvedValueOnce({ data: { id: 'drive-file-back' } });

    const provider = new GoogleDriveFileStorageProvider();
    await provider.put({
      path: 'uploads/INE/upload-1/front.png',
      folderPath: ['uploads', 'INE', 'upload-1'],
      filename: 'front.png',
      mimeType: 'image/png',
      contents: Buffer.from('front'),
    });
    await provider.put({
      path: 'uploads/INE/upload-1/back.png',
      folderPath: ['uploads', 'INE', 'upload-1'],
      filename: 'back.png',
      mimeType: 'image/png',
      contents: Buffer.from('back'),
    });

    expect(mockFilesList).toHaveBeenCalledTimes(3);
    expect(mockFilesCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestBody: { name: 'back.png', parents: ['folder-upload-1'] },
      }),
    );
  });

  it('downloads media as a Buffer and deletes through the v3 client', async () => {
    configureDrive();
    mockFilesGet.mockResolvedValue({ data: Buffer.from('downloaded INE') });
    mockFilesDelete.mockResolvedValue({ data: {} });
    const provider = new GoogleDriveFileStorageProvider();

    await expect(provider.get('drive-file-1')).resolves.toEqual(Buffer.from('downloaded INE'));
    await expect(provider.delete('drive-file-1')).resolves.toBeUndefined();

    expect(mockFilesGet).toHaveBeenCalledWith(
      { fileId: 'drive-file-1', alt: 'media' },
      { responseType: 'arraybuffer' },
    );
    expect(mockFilesDelete).toHaveBeenCalledWith({ fileId: 'drive-file-1' });
    expect(mockPermissionsCreate).not.toHaveBeenCalled();
  });

  it('treats a missing object during compensation as an already completed delete', async () => {
    configureDrive();
    mockFilesDelete.mockRejectedValue(
      Object.assign(new Error('not found'), { response: { status: 404 } }),
    );

    await expect(
      new GoogleDriveFileStorageProvider().delete('missing-file'),
    ).resolves.toBeUndefined();

    expect(mockFilesDelete).toHaveBeenCalledWith({ fileId: 'missing-file' });
    expect(mockPermissionsCreate).not.toHaveBeenCalled();
  });
});

function folderQuery(parentId: string, name: string): string {
  return `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
}

async function readBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
