import { GCSFileStorageProvider } from '../../services/ine/gcs-file-storage.provider';

function setup() {
  const contents = Buffer.from('synthetic INE image');
  const file = {
    save: jest.fn(async (_contents: Buffer, _options: unknown) => undefined),
    download: jest.fn(async () => [contents]),
    delete: jest.fn(async (_options: unknown) => undefined),
  };
  const bucket = { file: jest.fn(() => file) };
  const storage = { bucket: jest.fn(() => bucket) };
  return {
    provider: new GCSFileStorageProvider(storage as never, 'ine-test'),
    storage,
    bucket,
    file,
    contents,
  };
}

it('stores an INE image under a GCS prefix and returns a Buffer for OCR', async () => {
  const { provider, storage, bucket, file, contents } = setup();
  const path = 'INE/upload-1/front-ine.png';

  const stored = await provider.put({
    path,
    folderPath: ['INE', 'upload-1'],
    filename: 'ine.png',
    mimeType: 'image/png',
    contents,
  });

  expect(stored).toEqual({
    provider: 'google_cloud_storage',
    objectId: path,
    folderId: 'INE/upload-1',
    path,
  });
  expect(storage.bucket).toHaveBeenCalledWith('ine-test');
  expect(bucket.file).toHaveBeenCalledWith(path);
  expect(file.save).toHaveBeenCalledWith(contents, {
    resumable: false,
    validation: 'crc32c',
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { contentType: 'image/png' },
  });
  expect(await provider.get(stored.objectId)).toEqual(contents);
  await provider.delete(stored.objectId);
  expect(file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
});

it('reports a missing GCS object with a non-retryable download code', async () => {
  const { provider, file } = setup();
  file.download.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 404 }));
  await expect(provider.get('INE/upload-1/front-ine.png')).rejects.toMatchObject({
    code: 'GCS_DOWNLOAD_404',
    retryable: false,
  });
});
