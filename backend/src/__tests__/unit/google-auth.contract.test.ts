import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from '@jest/globals';
import { envSchema } from '../../config/env.config';
import {
  GCS_FILE_STORAGE_PROVIDER,
  UnsupportedFileStorageProviderError,
  assertSupportedFileStorageProvider,
} from '../../services/ine/file-storage.provider';
import { requiredTestEnv } from '../setup/test-env';

describe('INE Google configuration contract', () => {
  it('accepts only the approved Google credential names', () => {
    const parsed = envSchema.parse({
      ...requiredTestEnv,
      GOOGLE_CLOUD_PROJECT_ID: 'test-project',
      DOCUMENT_AI_LOCATION: 'europe-west1',
      DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
      GOOGLE_DRIVE_FOLDER_ID: 'test-folder',
      GOOGLE_OAUTH_CLIENT_ID: 'test-client',
      GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_DRIVE_REFRESH_TOKEN: 'test-refresh-token',
    });

    expect(parsed.GOOGLE_CLOUD_PROJECT_ID).toBe('test-project');
    expect(parsed.DOCUMENT_AI_LOCATION).toBe('europe-west1');
    expect(parsed.GOOGLE_DRIVE_FOLDER_ID).toBe('test-folder');
    for (const name of [
      'GOOGLE_CLOUD_PROJECT_ID',
      'DOCUMENT_AI_LOCATION',
      'DOCUMENT_AI_PROCESSOR_ID',
      'GOOGLE_DRIVE_FOLDER_ID',
      'GOOGLE_OAUTH_CLIENT_ID',
      'GOOGLE_OAUTH_CLIENT_SECRET',
      'GOOGLE_DRIVE_REFRESH_TOKEN',
    ]) {
      expect(envSchema.shape).toHaveProperty(name);
    }
    expect(
      Object.keys(envSchema.shape).filter((key) =>
        /^(?:INE_(?:GOOGLE|DRIVE|DOCUMENT_AI)_)/.test(key),
      ),
    ).toEqual([]);
  });

  it('does not retain legacy INE Google credential consumption', () => {
    const serviceDirectory = join(__dirname, '../../services/ine');
    const sources = [
      '../../config/env.config.ts',
      '../../services/ine/google-auth.ts',
      '../../services/ine/google-drive-file-storage.provider.ts',
      '../../services/ine/google-document-ai-ocr.provider.ts',
    ].map((path) => readFileSync(join(__dirname, path), 'utf8'));
    expect(sources.join('\n')).not.toMatch(/\bINE_(?:GOOGLE|DRIVE|DOCUMENT_AI)_/);
    expect(sources.join('\n')).not.toMatch(/supportsAllDrives/);
    expect(existsSync(join(serviceDirectory, 'google-service-account.ts'))).toBe(false);
  });
});

describe('stored file provider compatibility', () => {
  it('accepts GCS records and rejects historical Drive providers', () => {
    expect(() => assertSupportedFileStorageProvider(GCS_FILE_STORAGE_PROVIDER)).not.toThrow();
    expect(() => assertSupportedFileStorageProvider('google_drive_personal_oauth')).toThrow(
      UnsupportedFileStorageProviderError,
    );
    try {
      assertSupportedFileStorageProvider('google_drive_personal_oauth');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INE_STORAGE_PROVIDER_UNSUPPORTED' });
    }
  });
});
