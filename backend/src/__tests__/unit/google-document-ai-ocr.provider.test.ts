import { describe, expect, it, jest } from '@jest/globals';
import { env } from '../../config/env.config';
import { GoogleDocumentAiOcrProvider } from '../../services/ine/google-document-ai-ocr.provider';
import { parseIneDocument } from '../../services/ine/ine-parser';
import type { OcrProvider } from '../../services/ine/ocr.provider';
import { syntheticDocumentAiRawFixture } from './ine-document-ai-raw.fixture';
import { withEnvConfig } from '../helpers/with-env';

type AsyncMock<Args extends unknown[], Result> = (...args: Args) => Promise<Result>;
type FetchMock = (...args: Parameters<typeof fetch>) => Promise<Response>;
type DocumentAiAuthLike = {
  getAccessToken: AsyncMock<[], string | { token?: string | null }>;
};

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

function withEnv(values: Partial<typeof env>): () => void {
  return withEnvConfig(env, values);
}

describe('GoogleDocumentAiOcrProvider', () => {
  it('does not invoke a Google endpoint when OCR is disabled by configuration', async () => {
    const fetchMock = jest.fn<FetchMock>();
    const originalFetch = global.fetch;
    const restore = withEnv({ INE_OCR_ENABLED: false });
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider();

    try {
      await expect(
        provider.process({ mimeType: 'image/png', contents: Buffer.from('synthetic') }),
      ).rejects.toMatchObject({ code: 'INE_OCR_DISABLED' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('throws DOCUMENT_AI_CONFIGURATION_MISSING when processor env values are absent', async () => {
    const fetchMock = jest.fn<FetchMock>();
    const originalFetch = global.fetch;
    const restore = withEnv({
      INE_OCR_ENABLED: true,
      GOOGLE_CLOUD_PROJECT_ID: '',
      DOCUMENT_AI_LOCATION: '',
      DOCUMENT_AI_PROCESSOR_ID: '',
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider();

    try {
      await expect(
        provider.process({ mimeType: 'image/png', contents: Buffer.from('synthetic') }),
      ).rejects.toMatchObject({ code: 'DOCUMENT_AI_CONFIGURATION_MISSING' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('authorizes with the ADC access token (string shape) and posts to the configured processor', async () => {
    const restore = withEnv({
      INE_OCR_ENABLED: true,
      GOOGLE_CLOUD_PROJECT_ID: 'test-project',
      DOCUMENT_AI_LOCATION: 'europe-west1',
      DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
    });
    const getAccessToken = jest.fn<AsyncMock<[], string>>().mockResolvedValue('adc-token');
    const fetchMock = jest
      .fn<FetchMock>()
      .mockResolvedValue(
        jsonResponse(200, { document: { text: 'synthetic OCR text', pages: [] } }),
      );
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken,
    } as unknown as DocumentAiAuthLike);

    try {
      await provider.process({ mimeType: 'image/png', contents: Buffer.from('synthetic') });

      const endpoint =
        'https://europe-west1-documentai.googleapis.com/v1/projects/test-project/locations/europe-west1/processors/test-processor:process';
      expect(getAccessToken).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        endpoint,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer adc-token' }),
        }),
      );
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('authorizes with the ADC access token (object shape) when the client returns { token }', async () => {
    const restore = withEnv({
      INE_OCR_ENABLED: true,
      GOOGLE_CLOUD_PROJECT_ID: 'test-project',
      DOCUMENT_AI_LOCATION: 'europe-west1',
      DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
    });
    const getAccessToken = jest
      .fn<AsyncMock<[], { token?: string }>>()
      .mockResolvedValue({ token: 'object-token' });
    const fetchMock = jest
      .fn<FetchMock>()
      .mockResolvedValue(
        jsonResponse(200, { document: { text: 'synthetic OCR text', pages: [] } }),
      );
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken,
    } as unknown as DocumentAiAuthLike);

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

  it('fails at the ADC boundary without calling Document AI when credentials are unavailable', async () => {
    const restore = withEnv({
      INE_OCR_ENABLED: true,
      GOOGLE_CLOUD_PROJECT_ID: 'test-project',
      DOCUMENT_AI_LOCATION: 'europe-west1',
      DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
    });
    const fetchMock = jest.fn<FetchMock>();
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken: jest
        .fn<AsyncMock<[], string>>()
        .mockRejectedValue(new Error('ADC unavailable')),
    } as unknown as DocumentAiAuthLike);

    try {
      await expect(
        provider.process({ mimeType: 'image/png', contents: Buffer.from('synthetic') }),
      ).rejects.toMatchObject({ code: 'DOCUMENT_AI_ADC_UNAVAILABLE' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('fails when ADC resolves to an empty/missing token', async () => {
    const restore = withEnv({
      INE_OCR_ENABLED: true,
      GOOGLE_CLOUD_PROJECT_ID: 'test-project',
      DOCUMENT_AI_LOCATION: 'europe-west1',
      DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
    });
    const fetchMock = jest.fn<FetchMock>();
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken: jest.fn<AsyncMock<[], string>>().mockResolvedValue(''),
    } as unknown as DocumentAiAuthLike);

    try {
      await expect(
        provider.process({ mimeType: 'image/png', contents: Buffer.from('synthetic') }),
      ).rejects.toMatchObject({ code: 'DOCUMENT_AI_ADC_UNAVAILABLE' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('maps a 401 from Document AI to a non-retryable GoogleProviderError and exposes the gapi reason', async () => {
    const restore = withEnv({
      INE_OCR_ENABLED: true,
      GOOGLE_CLOUD_PROJECT_ID: 'test-project',
      DOCUMENT_AI_LOCATION: 'europe-west1',
      DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
    });
    const fetchMock = jest.fn<FetchMock>().mockResolvedValue(
      jsonResponse(401, {
        error: {
          code: 401,
          message: 'Request is missing required authentication credential.',
          status: 'UNAUTHENTICATED',
        },
      }),
    );
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken: jest.fn<AsyncMock<[], string>>().mockResolvedValue('adc-token'),
    } as unknown as DocumentAiAuthLike);

    try {
      await expect(
        provider.process({ mimeType: 'image/png', contents: Buffer.from('synthetic') }),
      ).rejects.toMatchObject({
        code: 'DOCUMENT_AI_401',
        retryable: false,
      });
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('maps a 403 from Document AI to a non-retryable GoogleProviderError', async () => {
    const restore = withEnv({
      INE_OCR_ENABLED: true,
      GOOGLE_CLOUD_PROJECT_ID: 'test-project',
      DOCUMENT_AI_LOCATION: 'europe-west1',
      DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
    });
    const fetchMock = jest.fn<FetchMock>().mockResolvedValue(
      jsonResponse(403, {
        error: { code: 403, message: 'Permission denied', status: 'PERMISSION_DENIED' },
      }),
    );
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken: jest.fn<AsyncMock<[], string>>().mockResolvedValue('adc-token'),
    } as unknown as DocumentAiAuthLike);

    try {
      await expect(
        provider.process({ mimeType: 'image/png', contents: Buffer.from('synthetic') }),
      ).rejects.toMatchObject({ code: 'DOCUMENT_AI_403', retryable: false });
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('maps a 400 from Document AI to a non-retryable GoogleProviderError and exposes the gapi message', async () => {
    const restore = withEnv({
      INE_OCR_ENABLED: true,
      GOOGLE_CLOUD_PROJECT_ID: 'test-project',
      DOCUMENT_AI_LOCATION: 'europe-west1',
      DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
    });
    const fetchMock = jest.fn<FetchMock>().mockResolvedValue(
      jsonResponse(400, {
        error: { code: 400, message: 'Invalid image content', status: 'INVALID_ARGUMENT' },
      }),
    );
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken: jest.fn<AsyncMock<[], string>>().mockResolvedValue('adc-token'),
    } as unknown as DocumentAiAuthLike);

    try {
      await expect(
        provider.process({ mimeType: 'image/png', contents: Buffer.from('synthetic') }),
      ).rejects.toMatchObject({ code: 'DOCUMENT_AI_400', retryable: false });
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('maps a 429 from Document AI to a retryable GoogleProviderError', async () => {
    const restore = withEnv({
      INE_OCR_ENABLED: true,
      GOOGLE_CLOUD_PROJECT_ID: 'test-project',
      DOCUMENT_AI_LOCATION: 'europe-west1',
      DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
    });
    const fetchMock = jest.fn<FetchMock>().mockResolvedValue(
      jsonResponse(429, {
        error: { code: 429, message: 'Rate limit exceeded', status: 'RESOURCE_EXHAUSTED' },
      }),
    );
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken: jest.fn<AsyncMock<[], string>>().mockResolvedValue('adc-token'),
    } as unknown as DocumentAiAuthLike);

    try {
      await expect(
        provider.process({ mimeType: 'image/png', contents: Buffer.from('synthetic') }),
      ).rejects.toMatchObject({ code: 'DOCUMENT_AI_429', retryable: true });
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('never sends the access token in the request body and keeps it only in the Authorization header', async () => {
    const restore = withEnv({
      INE_OCR_ENABLED: true,
      GOOGLE_CLOUD_PROJECT_ID: 'test-project',
      DOCUMENT_AI_LOCATION: 'europe-west1',
      DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
    });
    const fetchMock = jest
      .fn<FetchMock>()
      .mockResolvedValue(jsonResponse(200, { document: { text: 'ok', pages: [] } }));
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken: jest.fn<AsyncMock<[], string>>().mockResolvedValue('secret-token'),
    } as unknown as DocumentAiAuthLike);

    try {
      await provider.process({ mimeType: 'image/png', contents: Buffer.from('synthetic') });
      const call = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(call[1].body as string);
      expect(body.rawDocument.mimeType).toBe('image/png');
      expect(JSON.stringify(body)).not.toContain('secret-token');
      expect(call[1].headers).toMatchObject({ Authorization: 'Bearer secret-token' });
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('maps the synthetic raw Document AI fixture through layout into the INE parser', async () => {
    const restore = withEnv({
      INE_OCR_ENABLED: true,
      GOOGLE_CLOUD_PROJECT_ID: 'test-project',
      DOCUMENT_AI_LOCATION: 'europe-west1',
      DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
    });
    const originalFetch = global.fetch;
    global.fetch = jest
      .fn<FetchMock>()
      .mockResolvedValue(
        jsonResponse(200, syntheticDocumentAiRawFixture),
      ) as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken: jest.fn<AsyncMock<[], string>>().mockResolvedValue('adc-token'),
    } as unknown as DocumentAiAuthLike);

    try {
      const result = await provider.process({
        mimeType: 'image/png',
        contents: Buffer.from('synthetic'),
      });
      const parsed = parseIneDocument(result.document);

      expect(result.rawResult).toEqual(syntheticDocumentAiRawFixture);
      expect(result.document.pages[0]?.lines).toHaveLength(18);
      expect(result.document.pages[0]?.tokens).toHaveLength(46);
      expect(result.document.pages[0]?.lines[0]?.tokens[0]).toBe(
        result.document.pages[0]?.tokens[0],
      );
      expect(result.document.pages[0]?.lines[6]?.tokens[3]).toMatchObject({
        text: '101',
        segment: expect.any(Object),
        box: expect.any(Object),
        confidence: 0.86,
      });
      expect(result.document.pages[0]?.lines[1]?.tokens[0]).toMatchObject({
        text: 'EDUARDO',
        segment: { start: 7, end: 10 },
        segments: [
          { start: 7, end: 10 },
          { start: 10, end: 14 },
        ],
      });
      expect(result.document.pages[0]?.tokens[45]?.segment).toEqual({ start: 6, end: 7 });
      expect(result.document.pages[0]?.lines.flatMap((line) => line.tokens)).not.toContain(
        result.document.pages[0]?.tokens[45],
      );
      expect(result.document.pages[0]?.tokens[0]?.box).toEqual({
        min: { x: 420, y: 180 },
        max: { x: 500, y: 198 },
      });
      expect(parsed.fields.curp?.normalized).toBe('GODE561231HDFRRN09');
      expect(parsed.fields.birthDate?.normalized).toBe('31/12/1956');
      expect(parsed.fields.sex?.normalized).toBe('HOMBRE');
      expect(parsed.fields.electoralSection?.normalized).toBe('0042');
      expect(parsed.fields.registrationYear?.normalized).toBe('2018');
      expect(parsed.fields.postalCode?.normalized).toBe('12345');
      expect(parsed.validationSummary.missing).toEqual([]);
      expect(parsed.fields.electoralSection?.box?.max.x).toBeLessThanOrEqual(1);
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });

  it('keeps synthetic line.tokens layouts when page.tokens is absent', async () => {
    const restore = withEnv({
      INE_OCR_ENABLED: true,
      GOOGLE_CLOUD_PROJECT_ID: 'test-project',
      DOCUMENT_AI_LOCATION: 'europe-west1',
      DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
    });
    const legacyFixture = {
      document: {
        text: 'COLONIA DEMO',
        pages: [
          {
            layout: { textAnchor: { content: 'COLONIA DEMO' } },
            lines: [
              {
                layout: {
                  textAnchor: { textSegments: [{ startIndex: '0', endIndex: '12' }] },
                },
                tokens: [
                  {
                    layout: {
                      textAnchor: { textSegments: [{ startIndex: '0', endIndex: '7' }] },
                      boundingPoly: {
                        normalizedVertices: [
                          { x: 0.4, y: 0.2 },
                          { x: 0.5, y: 0.2 },
                          { x: 0.5, y: 0.21 },
                          { x: 0.4, y: 0.21 },
                        ],
                      },
                    },
                  },
                  {
                    layout: {
                      textAnchor: { textSegments: [{ startIndex: '8', endIndex: '12' }] },
                      boundingPoly: {
                        normalizedVertices: [
                          { x: 0.51, y: 0.2 },
                          { x: 0.56, y: 0.2 },
                          { x: 0.56, y: 0.21 },
                          { x: 0.51, y: 0.21 },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const originalFetch = global.fetch;
    global.fetch = jest
      .fn<FetchMock>()
      .mockResolvedValue(jsonResponse(200, legacyFixture)) as unknown as typeof fetch;
    const provider = new GoogleDocumentAiOcrProvider({
      getAccessToken: jest.fn<AsyncMock<[], string>>().mockResolvedValue('adc-token'),
    } as unknown as DocumentAiAuthLike);

    try {
      const result = await provider.process({
        mimeType: 'image/png',
        contents: Buffer.from('synthetic'),
      });
      expect(result.document.pages[0]?.tokens).toHaveLength(2);
      expect(result.document.pages[0]?.lines[0]?.tokens[0]).toBe(
        result.document.pages[0]?.tokens[0],
      );
      expect(parseIneDocument(result.document).fields.neighborhood?.normalized).toBe('DEMO');
    } finally {
      global.fetch = originalFetch;
      restore();
    }
  });
});

describe('OcrProvider result contract', () => {
  it('keeps raw provider output opaque while exposing neutral parsing evidence', async () => {
    const provider: OcrProvider = {
      process: async () => ({
        document: {
          text: 'synthetic OCR text',
          pages: [{ pageNumber: 1, text: 'synthetic OCR text', lines: [], tokens: [] }],
        },
        rawResult: { providerOnly: { opaque: true } },
        evidence: { confidence: 0.91, confidenceCount: 3, pageCount: 1 },
      }),
    };

    const result = await provider.process({
      mimeType: 'image/png',
      contents: Buffer.from('synthetic'),
    });
    expect(result.document.text).toBe('synthetic OCR text');
    expect(result.evidence.confidence).toBe(0.91);
    expect(result.rawResult).toEqual({ providerOnly: { opaque: true } });
  });
});
