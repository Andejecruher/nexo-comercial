const storageConstructor = jest.fn();

jest.mock('@google-cloud/storage', () => ({
  Storage: storageConstructor,
}));

describe('GCS client', () => {
  beforeEach(() => {
    jest.resetModules();
    storageConstructor.mockClear();
  });

  it('uses Application Default Credentials without loading a private key file', () => {
    jest.isolateModules(() => {
      require('../../config/gcs.client');
    });

    expect(storageConstructor).toHaveBeenCalledWith();
  });
});
