import { describe, expect, it, jest } from '@jest/globals';
import { env } from '../../../config/env.config';
import { GoogleConfigurationError } from '../../../services/ine/google-auth';
import type { OcrProvider as DocumentAiProvider } from '../../../services/ine/ocr.provider';
import type {
  DocumentTextExtractor,
  MultimodalTestFile,
  OcrProvider,
} from '../../../services/multimodal-test/contracts';
import { DocumentTestPipeline } from '../../../services/multimodal-test/pipelines/document-test.pipeline';
import { ProviderRegistry } from '../../../services/multimodal-test/provider-registry';
import { DocumentAiOcrProvider } from '../../../services/multimodal-test/providers/document-ai-ocr.provider';
import { NativeDocumentTextStub } from '../../../services/multimodal-test/providers/native-document-text.stub';

const file: MultimodalTestFile = {
  filename: 'document.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('fake document'),
};

function setup(nativeText: string | null = null) {
  const native = jest
    .fn<DocumentTextExtractor['extractNativeText']>()
    .mockResolvedValue(
      nativeText === null
        ? null
        : { text: nativeText, providerId: 'native', durationMs: 0, pages: 2 },
    );
  const ocr = jest.fn<OcrProvider['extractText']>().mockResolvedValue({
    text: 'OCR text',
    providerId: 'ocr',
    durationMs: 0,
    pages: 3,
    confidence: 0.9,
    raw: { document: { text: 'OCR text' } },
  });
  const registry = new ProviderRegistry()
    .register('documentText', { id: 'native', supportedMimeTypes: [], extractNativeText: native })
    .register('ocr', { id: 'ocr', supportedMimeTypes: [], extractText: ocr });
  return { native, ocr, registry, pipeline: new DocumentTestPipeline(registry) };
}

describe('DocumentTestPipeline', () => {
  it('normalizes native text and skips OCR with an explicit reason', async () => {
    const { pipeline, ocr } = setup('  Cafe\u0301   report  ');
    const result = await pipeline.run(file, { correlationId: 'document-test' });
    expect(result).toMatchObject({
      kind: 'document',
      correlationId: 'document-test',
      status: 'completed',
      errors: [],
      payload: {
        extractedText: '  Cafe\u0301   report  ',
        normalizedText: 'Café report',
        pages: 2,
      },
      providersUsed: ['native'],
    });
    expect(result.steps.map((step) => step.stage)).toEqual([
      'validation',
      'metadata',
      'native_text',
      'ocr',
      'parser',
      'summary',
    ]);
    expect(result.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'ocr',
          status: 'skipped',
          metadata: { reason: 'native text available' },
        }),
        expect.objectContaining({
          stage: 'metadata',
          status: 'skipped',
          metadata: { reason: 'no metadata provider registered' },
        }),
        expect.objectContaining({
          stage: 'summary',
          status: 'skipped',
          metadata: { reason: 'summary not requested' },
        }),
      ]),
    );
    expect(ocr).not.toHaveBeenCalled();
    for (const step of result.steps) {
      expect(Number.isFinite(Date.parse(step.startedAt))).toBe(true);
      expect(Number.isFinite(Date.parse(step.endedAt))).toBe(true);
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it.each([null, '', '   '])('uses OCR when native text is %p', async (nativeText) => {
    const { pipeline, ocr } = setup(nativeText);
    const result = await pipeline.run(file);
    expect(ocr).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'completed',
      errors: [],
      payload: {
        ocrText: 'OCR text',
        normalizedText: 'OCR text',
        pages: 3,
        confidence: 0.9,
      },
    });
    expect(result.rawProviderResponse).toBeUndefined();
  });

  it('forces the preferred OCR provider even when native text exists', async () => {
    const { pipeline, registry, ocr } = setup('Native text');
    const preferred = jest.fn<OcrProvider['extractText']>().mockResolvedValue({
      text: 'Preferred text',
      providerId: 'preferred',
      durationMs: 0,
    });
    registry.register('ocr', { id: 'preferred', supportedMimeTypes: [], extractText: preferred });
    const result = await pipeline.run(file, { forceOcr: true, provider: 'preferred' });
    expect(result).toMatchObject({
      status: 'completed',
      payload: {
        extractedText: 'Native text',
        ocrText: 'Preferred text',
        normalizedText: 'Preferred text',
      },
    });
    expect(preferred).toHaveBeenCalledTimes(1);
    expect(ocr).not.toHaveBeenCalled();
  });

  it('fails with the exhausted OCR error when both extraction stages fail', async () => {
    const { pipeline, native, ocr } = setup();
    native.mockRejectedValue(new Error('Native extraction failed'));
    ocr.mockRejectedValue(new Error('OCR failed'));
    const result = await pipeline.run(file);
    expect(result.status).toBe('failed');
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'native_text', message: 'Native extraction failed' }),
        expect.objectContaining({ stage: 'ocr', code: 'OCR_FALLBACK_EXHAUSTED' }),
      ]),
    );
    expect(result.payload.normalizedText).toBe('');
  });

  it('keeps native errors when OCR recovers the text', async () => {
    const { pipeline, native } = setup();
    native.mockRejectedValue(new Error('Native extraction failed'));
    const result = await pipeline.run(file);
    expect(result.status).toBe('partial');
    expect(result.payload.normalizedText).toBe('OCR text');
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'native_text', message: 'Native extraction failed' }),
      ]),
    );
  });

  it('skips ffprobe metadata for PDFs and lets OCR complete', async () => {
    const { pipeline, registry, ocr } = setup();
    const probe = jest.fn(async () => {
      throw new Error('ffprobe must not receive a PDF');
    });
    registry.register('mediaMetadata', {
      id: 'ffprobe',
      supportedMimeTypes: [],
      supportsMimeType: (mimeType) =>
        mimeType.startsWith('audio/') || mimeType.startsWith('video/'),
      probe,
    });

    const result = await pipeline.run(file);

    expect(probe).not.toHaveBeenCalled();
    expect(ocr).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'completed',
      errors: [],
      payload: {
        ocrText: 'OCR text',
        normalizedText: 'OCR text',
      },
    });
    expect(result.steps).toContainEqual(
      expect.objectContaining({
        stage: 'metadata',
        status: 'skipped',
        metadata: { reason: 'no metadata provider registered' },
      }),
    );
  });

  it('retains native text when forced OCR fails', async () => {
    const { pipeline, ocr } = setup('Native text');
    ocr.mockRejectedValue(new Error('OCR failed'));
    const result = await pipeline.run(file, { forceOcr: true });
    expect(result.status).toBe('partial');
    expect(result.payload.normalizedText).toBe('Native text');
  });

  it('chunks at word boundaries and keeps oversized words intact', async () => {
    const { pipeline } = setup('one two three four extraordinarilylong');
    const result = await pipeline.run(file, { chunkText: true, chunkSize: 10 });
    expect(result.payload.chunks).toEqual(['one two', 'three four', 'extraordinarilylong']);
    expect(result.payload.chunks?.map((chunk) => chunk.length)).toEqual([7, 10, 19]);
    expect(result.status).toBe('completed');
  });

  it('defaults chunks to a 1000-character target', async () => {
    const { pipeline } = setup(`${'a'.repeat(500)} ${'b'.repeat(499)} end`);
    const result = await pipeline.run(file, { chunkText: true });
    expect(result.payload.chunks?.map((chunk) => chunk.length)).toEqual([1000, 3]);
  });

  it.each([
    [{ ...file, mimeType: 'application/unknown' }, 'VALIDATION_UNSUPPORTED_MIME', 415],
    [{ ...file, buffer: Buffer.alloc(0) }, 'VALIDATION_EMPTY_FILE', 400],
    [
      {
        ...file,
        buffer: Buffer.alloc(env.MULTIMODAL_TEST_MAX_FILE_MB * 1024 * 1024 + 1),
        sizeBytes: 1,
      },
      'VALIDATION_FILE_TOO_LARGE',
      413,
    ],
  ] as const)('rejects invalid files before invoking providers (%s)', async (...caseArgs) => {
    const [input, code, statusCode] = caseArgs;
    const { pipeline, native, ocr } = setup();
    const result = await pipeline.run(input);
    expect(result.status).toBe('failed');
    expect(result.errors).toEqual([
      expect.objectContaining({ stage: 'validation', code, statusCode }),
    ]);
    expect(result.steps).toHaveLength(1);
    expect(result.payload).toEqual({});
    expect(result.providersUsed).toEqual([]);
    expect(native).not.toHaveBeenCalled();
    expect(ocr).not.toHaveBeenCalled();
  });

  it('accepts the exact size limit and normalizes MIME parameters', async () => {
    const { pipeline } = setup('Native text');
    const result = await pipeline.run({
      ...file,
      mimeType: 'Application/PDF; charset=utf-8',
      buffer: Buffer.alloc(env.MULTIMODAL_TEST_MAX_FILE_MB * 1024 * 1024),
    });
    expect(result.status).toBe('completed');
  });

  it('fails when both providers return no usable text', async () => {
    const { pipeline, ocr } = setup();
    ocr.mockResolvedValue({ text: '   ', providerId: 'ocr', durationMs: 0 });
    expect((await pipeline.run(file)).status).toBe('failed');
  });

  it('skips a requested summary when no summarizer is registered', async () => {
    const { pipeline } = setup('Native text');
    const result = await pipeline.run(file, { summary: true });
    expect(result.steps).toContainEqual(
      expect.objectContaining({
        stage: 'summary',
        status: 'skipped',
        metadata: { reason: 'no summarizer registered' },
      }),
    );
    expect(result.status).toBe('completed');
  });

  it('uses registered metadata and summarizer providers', async () => {
    const { pipeline, registry } = setup('Native text');
    const summarize = jest.fn(async () => ({
      summary: 'Short summary',
      providerId: 'summary',
      durationMs: 0,
    }));
    registry.register('mediaMetadata', {
      id: 'metadata',
      supportedMimeTypes: [],
      probe: async () => ({ pages: 2, format: 'pdf' }),
    });
    registry.register('summarizer', { id: 'summary', supportedMimeTypes: [], summarize });
    const result = await pipeline.run(file, { summary: true });
    expect(result).toMatchObject({
      status: 'completed',
      metadata: { pages: 2, format: 'pdf' },
      payload: { summaryText: 'Short summary' },
      providersUsed: ['metadata', 'native', 'summary'],
    });
    expect(summarize).toHaveBeenCalledWith(expect.objectContaining({ text: 'Native text' }));
  });

  it('returns optional raw OCR output only when requested', async () => {
    const { pipeline } = setup();
    expect(
      (await pipeline.run(file, { includeRawProviderResponse: true })).rawProviderResponse,
    ).toEqual({ ocr: { document: { text: 'OCR text' } } });
  });
});

describe('document provider adapters', () => {
  it('leaves native extraction as an explicit null-returning integration point', async () => {
    const stub = new NativeDocumentTextStub();
    expect(stub.id).toBe('native-stub');
    expect(stub.supportedMimeTypes).toEqual([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ]);
    await expect(stub.extractNativeText(file)).resolves.toBeNull();
  });

  it('lazily reuses the shared Document AI provider and maps its result', async () => {
    const process = jest.fn<DocumentAiProvider['process']>().mockResolvedValue({
      document: { text: 'Recognized text', pages: [] },
      evidence: { pageCount: 2, confidenceCount: 4, confidence: 0.8 },
      rawResult: { document: {} },
    });
    const factory = jest.fn((): DocumentAiProvider => ({ process }));
    const adapter = new DocumentAiOcrProvider(factory);
    expect(factory).not.toHaveBeenCalled();
    expect([...adapter.supportedMimeTypes].sort()).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
    ]);
    await expect(adapter.extractText(file)).resolves.toMatchObject({
      text: 'Recognized text',
      providerId: 'document-ai',
      pages: 2,
      confidence: 0.8,
      raw: { document: {} },
      durationMs: expect.any(Number),
    });
    await adapter.extractText(file);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledWith({ mimeType: 'application/pdf', contents: file.buffer });
  });

  it('maps missing configuration to an unavailable OCR stage error', async () => {
    const adapter = new DocumentAiOcrProvider(() => ({
      process: async () => {
        throw new GoogleConfigurationError('DOCUMENT_AI_CONFIGURATION_MISSING');
      },
    }));
    await expect(adapter.extractText(file)).rejects.toMatchObject({
      stage: 'ocr',
      code: 'OCR_PROVIDER_UNAVAILABLE',
      statusCode: 503,
      provider: 'document-ai',
    });
  });
});
