import { describe, expect, it, jest } from '@jest/globals';
import { env } from '../../config/env.config';
import { GoogleDocumentAiOcrProvider } from '../../services/ine/google-document-ai-ocr.provider';
import { withEnvConfig } from '../helpers/with-env';

type AsyncMock<Args extends unknown[], Result> = (...args: Args) => Promise<Result>;
type FetchMock = (...args: Parameters<typeof fetch>) => Promise<Response>;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERROR',
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: function () {
      return jsonResponse(status, body);
    },
  } as unknown as Response;
}

function configuredEnv(): () => void {
  return withEnvConfig(env, {
    GOOGLE_CLOUD_PROJECT_ID: 'test-project',
    DOCUMENT_AI_LOCATION: 'europe-west1',
    DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
  });
}

describe('GoogleDocumentAiOcrProvider', () => {
  it('validates Document AI configuration without an INE feature flag', async () => {
    const fetchMock = jest.fn<FetchMock>();
    const originalFetch = global.fetch;
    const restore = withEnvConfig(env, {
      GOOGLE_CLOUD_PROJECT_ID: '',
      DOCUMENT_AI_LOCATION: '',
      DOCUMENT_AI_PROCESSOR_ID: '',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      await expect(
        new GoogleDocumentAiOcrProvider().process({
          mimeType: 'image/png',
          contents: Buffer.from('synthetic'),
        }),
      ).rejects.toMatchObject({ code: 'DOCUMENT_AI_CONFIGURATION_MISSING' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('authorizes with ADC and posts to the configured processor', async () => {
    const restore = configuredEnv();
    const getAccessToken = jest.fn<AsyncMock<[], string>>().mockResolvedValue('adc-token');
    const fetchMock = jest
      .fn<FetchMock>()
      .mockResolvedValue(jsonResponse(200, { document: { text: 'OCR text', pages: [] } }));
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({ getAccessToken } as never);

    try {
      const result = await provider.process({
        mimeType: 'image/png',
        contents: Buffer.from('synthetic'),
      });

      expect(result.document.text).toBe('OCR text');
      expect(getAccessToken).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://europe-west1-documentai.googleapis.com/v1/projects/test-project/locations/europe-west1/processors/test-processor:process',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer adc-token' }),
        }),
      );
      const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(request.body).not.toContain('adc-token');
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('accepts the ADC object token shape', async () => {
    const restore = configuredEnv();
    const fetchMock = jest
      .fn<FetchMock>()
      .mockResolvedValue(jsonResponse(200, { document: { text: 'OCR text', pages: [] } }));
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken: jest
        .fn<AsyncMock<[], { token?: string }>>()
        .mockResolvedValue({ token: 'object-token' }),
    } as never);

    try {
      await provider.process({ mimeType: 'image/png', contents: Buffer.from('synthetic') });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer object-token' }),
        }),
      );
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('maps transient provider failures as retryable', async () => {
    const restore = configuredEnv();
    const originalFetch = global.fetch;
    global.fetch = jest
      .fn<FetchMock>()
      .mockResolvedValue(
        jsonResponse(429, {
          error: { status: 'RESOURCE_EXHAUSTED', message: 'Rate limit exceeded' },
        }),
      ) as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken: jest.fn<AsyncMock<[], string>>().mockResolvedValue('adc-token'),
    } as never);

    try {
      await expect(
        provider.process({ mimeType: 'image/png', contents: Buffer.from('synthetic') }),
      ).rejects.toMatchObject({ code: 'DOCUMENT_AI_429', retryable: true });
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });
});
