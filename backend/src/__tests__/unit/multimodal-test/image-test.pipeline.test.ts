import { describe, expect, it, jest } from '@jest/globals';
import type { NvidiaService } from '../../../ai/services/nvidia.service';
import type {
  ImageAnalysisProvider,
  MultimodalTestFile,
  OcrProvider,
} from '../../../services/multimodal-test/contracts';
import { ImageTestPipeline } from '../../../services/multimodal-test/pipelines/image-test.pipeline';
import { ProviderRegistry } from '../../../services/multimodal-test/provider-registry';
import { ImageHeaderMetadataProvider } from '../../../services/multimodal-test/providers/image-header-metadata.provider';
import { NvidiaVisionProvider } from '../../../services/multimodal-test/providers/nvidia-vision.provider';

// Keep this pure unit suite independent of local credentials and dotenv files.
jest.mock('../../../config/env.config', () => ({
  env: {
    MULTIMODAL_TEST_MAX_FILE_MB: 1,
    MULTIMODAL_TEST_IMAGE_TIMEOUT_MS: 60_000,
    MULTIMODAL_TEST_MAX_RETRIES: 0,
    MULTIMODAL_TEST_RETRY_DELAY_MS: 0,
  },
}));

function pngHeader(): Buffer {
  const buffer = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12);
  buffer.writeUInt32BE(7, 16);
  buffer.writeUInt32BE(5, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  // Header-only fixture: pixel data and CRC verification are outside this probe.
  return buffer;
}

function file(): MultimodalTestFile {
  return { filename: 'image.png', mimeType: 'image/png', buffer: pngHeader() };
}

function setup() {
  const registry = new ProviderRegistry();
  const analyze = jest.fn<ImageAnalysisProvider['analyze']>().mockResolvedValue({
    description: 'A damaged road', labels: ['road', 'damage'], providerId: 'vision', durationMs: 1,
  });
  const extractText = jest.fn<OcrProvider['extractText']>().mockResolvedValue({
    text: 'Main Street', providerId: 'ocr', durationMs: 1,
  });
  registry.register('mediaMetadata', new ImageHeaderMetadataProvider());
  registry.register('imageAnalysis', {
    id: 'vision', supportedMimeTypes: ['image/png', 'image/jpeg'], analyze,
  });
  return { registry, analyze, extractText, pipeline: new ImageTestPipeline(registry) };
}

function registerOcr(registry: ProviderRegistry, extractText: OcrProvider['extractText']) {
  registry.register('ocr', { id: 'ocr', supportedMimeTypes: ['image/png'], extractText });
}

describe('ImageTestPipeline', () => {
  it('returns visual analysis, OCR, dimensions and ordered step timings', async () => {
    const { registry, pipeline, analyze, extractText } = setup();
    registerOcr(registry, extractText);
    const input = file();
    const result = await pipeline.run(input, { correlationId: 'image-correlation' });
    expect(result).toMatchObject({
      correlationId: 'image-correlation', kind: 'image', filename: 'image.png',
      status: 'completed', errors: [],
      payload: { description: 'A damaged road', labels: ['road', 'damage'], ocrText: 'Main Street' },
      metadata: { format: 'png', widthPx: 7, heightPx: 5, bytes: 33 },
      providersUsed: ['image-headers', 'ocr', 'vision'],
    });
    expect(result.steps.map(({ stage, status }) => [stage, status])).toEqual([
      ['validation', 'ok'], ['metadata', 'ok'], ['ocr', 'ok'],
      ['visual_analysis', 'ok'], ['parser', 'ok'],
    ]);
    for (const step of result.steps) {
      expect(Number.isNaN(Date.parse(step.startedAt))).toBe(false);
      expect(Date.parse(step.endedAt)).toBeGreaterThanOrEqual(Date.parse(step.startedAt));
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({
      buffer: input.buffer, mimeType: 'image/png', correlationId: 'image-correlation',
      abortSignal: expect.any(AbortSignal),
    }));
    expect(extractText).toHaveBeenCalledTimes(1);
    expect(result.rawProviderResponse).toBeUndefined();
  });

  it('skips missing OCR and completes from vision alone with a generated correlation ID', async () => {
    const { pipeline } = setup();
    const result = await pipeline.run(file());
    expect(result.status).toBe('completed');
    expect(result.errors).toEqual([]);
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.steps).toContainEqual(expect.objectContaining({
      stage: 'ocr', status: 'skipped', metadata: { reason: 'no OCR provider registered' },
    }));
  });

  it('retains OCR and reports partial when visual analysis fails', async () => {
    const { registry, pipeline, analyze, extractText } = setup();
    registerOcr(registry, extractText);
    analyze.mockRejectedValue(new Error('vision unavailable'));
    const result = await pipeline.run(file());
    expect(result.status).toBe('partial');
    expect(result.payload).toMatchObject({ ocrText: 'Main Street', labels: [] });
    expect(result.errors).toEqual([expect.objectContaining({
      stage: 'visual_analysis', provider: 'vision', message: 'vision unavailable',
    })]);
  });

  it('retains vision and reports partial when OCR fails', async () => {
    const { registry, pipeline, extractText } = setup();
    registerOcr(registry, extractText);
    extractText.mockRejectedValue(new Error('OCR unavailable'));
    const result = await pipeline.run(file());
    expect(result.status).toBe('partial');
    expect(result.payload.description).toBe('A damaged road');
    expect(result.errors).toEqual([expect.objectContaining({ stage: 'ocr', provider: 'ocr' })]);
  });

  it('fails when both OCR and vision fail', async () => {
    const { registry, pipeline, analyze, extractText } = setup();
    registerOcr(registry, extractText);
    analyze.mockRejectedValue(new Error('vision unavailable'));
    extractText.mockRejectedValue(new Error('OCR unavailable'));
    const result = await pipeline.run(file());
    expect(result.status).toBe('failed');
    expect(result.errors.map(({ stage }) => stage)).toEqual(['ocr', 'visual_analysis']);
    expect(result.payload.description).toBeFalsy();
    expect(result.payload.ocrText).toBeFalsy();
  });

  it.each([
    ['unsupported MIME', { mimeType: 'image/webp' }, 'VALIDATION_UNSUPPORTED_MIME'],
    ['empty buffer', { buffer: Buffer.alloc(0) }, 'VALIDATION_EMPTY_FILE'],
    ['oversized buffer', { buffer: Buffer.alloc(1024 * 1024 + 1), sizeBytes: 1 }, 'VALIDATION_FILE_TOO_LARGE'],
  ])('rejects %s before invoking providers', async (_name, override, code) => {
    const { registry, pipeline, analyze, extractText } = setup();
    registerOcr(registry, extractText);
    const input = { ...file(), ...override };
    const original = Buffer.from(input.buffer);
    const result = await pipeline.run(input);
    expect(result.status).toBe('failed');
    expect(result.payload).toEqual({});
    expect(result.errors).toEqual([expect.objectContaining({ stage: 'validation', code, statusCode: 400 })]);
    expect(result.steps).toEqual([expect.objectContaining({ stage: 'validation', status: 'failed' })]);
    expect(analyze).not.toHaveBeenCalled();
    expect(extractText).not.toHaveBeenCalled();
    expect(result.providersUsed).toEqual([]);
    expect(input.buffer.equals(original)).toBe(true);
  });

  it('accepts the exact size boundary using actual buffer bytes', async () => {
    const { pipeline } = setup();
    const buffer = Buffer.alloc(1024 * 1024);
    pngHeader().copy(buffer);
    const result = await pipeline.run({ ...file(), buffer, sizeBytes: 999999999 });
    expect(result.status).toBe('completed');
    expect(result.metadata.bytes).toBe(buffer.length);
  });

  it('continues after a failed metadata probe', async () => {
    const { pipeline } = setup();
    const result = await pipeline.run({ ...file(), buffer: Buffer.from('invalid header') });
    expect(result.status).toBe('partial');
    expect(result.payload.description).toBe('A damaged road');
    expect(result.metadata.bytes).toBe(14);
    expect(result.steps).toContainEqual(expect.objectContaining({ stage: 'metadata', status: 'failed' }));
    expect(result.errors).toEqual([expect.objectContaining({ stage: 'metadata', code: 'VALIDATION_INVALID_IMAGE_HEADER' })]);
  });

  it('skips absent metadata and vision while completing from OCR', async () => {
    const registry = new ProviderRegistry();
    registerOcr(registry, async () => ({ text: 'Street sign', providerId: 'ocr', durationMs: 0 }));
    const result = await new ImageTestPipeline(registry).run(file());
    expect(result.status).toBe('completed');
    expect(result.errors).toEqual([]);
    expect(result.payload).toMatchObject({ ocrText: 'Street sign', labels: [] });
    expect(result.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'metadata', status: 'skipped', metadata: { reason: 'no metadata provider registered' } }),
      expect.objectContaining({ stage: 'visual_analysis', status: 'skipped', metadata: { reason: 'no image analysis provider registered' } }),
    ]));
  });

  it('fails without text even when a vision provider returns labels', async () => {
    const { pipeline, analyze } = setup();
    analyze.mockResolvedValue({ description: '  ', labels: ['road'], providerId: 'vision', durationMs: 0 });
    expect((await pipeline.run(file())).status).toBe('failed');
  });

  it('skips providers that do not support the MIME type', async () => {
    const registry = new ProviderRegistry();
    const extractText = jest.fn<OcrProvider['extractText']>();
    registry.register('ocr', { id: 'pdf-only', supportedMimeTypes: ['application/pdf'], extractText });
    const result = await new ImageTestPipeline(registry).run(file());
    expect(result.status).toBe('failed');
    expect(result.errors).toEqual([]);
    expect(extractText).not.toHaveBeenCalled();
    expect(result.steps.find(({ stage }) => stage === 'ocr')?.status).toBe('skipped');
  });

  it('uses registry fallback without losing the primary failure trace', async () => {
    const { registry, pipeline, analyze } = setup();
    analyze.mockRejectedValue(new Error('primary failed'));
    registry.register('imageAnalysis', {
      id: 'fallback', supportedMimeTypes: ['image/png'],
      analyze: async () => ({ description: 'Fallback description', labels: [], providerId: 'fallback', durationMs: 0 }),
    });
    const result = await pipeline.run(file());
    expect(result.status).toBe('partial');
    expect(result.payload.description).toBe('Fallback description');
    expect(result.errors).toHaveLength(1);
    expect(result.providersUsed).toContain('fallback');
  });
});

describe('ImageHeaderMetadataProvider', () => {
  it('reads PNG dimensions, bit depth and header alpha', async () => {
    const provider = new ImageHeaderMetadataProvider();
    expect(provider.id).toBe('image-headers');
    expect(provider.supportedMimeTypes).toEqual(['image/jpeg', 'image/png']);
    expect(await provider.probe({ buffer: pngHeader(), mimeType: 'image/png' })).toMatchObject({
      format: 'png', widthPx: 7, heightPx: 5, bitDepth: 8, hasAlpha: true,
    });
  });

  it.each([0xc0, 0xc2])('walks JPEG markers to SOF %i', async (marker) => {
    const buffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2,
      0xff, marker, 0, 17, 8, 0, 5, 0, 7, 3,
      1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0,
    ]);
    expect(await new ImageHeaderMetadataProvider().probe({ buffer, mimeType: 'image/jpeg' })).toMatchObject({
      format: 'jpeg', widthPx: 7, heightPx: 5,
    });
  });

  it.each(['image/png', 'image/jpeg'])('rejects invalid and truncated %s headers', async (mimeType) => {
    const provider = new ImageHeaderMetadataProvider();
    for (const buffer of [Buffer.alloc(0), Buffer.from('invalid'), pngHeader().subarray(0, 24)]) {
      await expect(provider.probe({ buffer, mimeType })).rejects.toMatchObject({
        statusCode: 400, code: 'VALIDATION_INVALID_IMAGE_HEADER',
      });
    }
  });

  it('reports unsupported formats as unknown', async () => {
    expect(await new ImageHeaderMetadataProvider().probe({ buffer: Buffer.from('GIF89a'), mimeType: 'image/gif' }))
      .toEqual({ format: 'unknown' });
  });
});

describe('NvidiaVisionProvider', () => {
  it.each([
    ['A road\nETIQUETAS: road, damage', ['road', 'damage']],
    ['A road\nLABELS: road, damage, ', ['road', 'damage']],
    ['road, damage', ['road', 'damage']],
    ['A damaged road.', []],
    ['A road, damaged by rain.', []],
  ])('delegates image analysis and parses labels from %s', async (description, labels) => {
    const analyzeImage = jest.fn<NvidiaService['analyzeImage']>().mockResolvedValue(description);
    const provider = new NvidiaVisionProvider({ analyzeImage });
    const input = { buffer: pngHeader(), mimeType: 'image/png', correlationId: 'vision-correlation', abortSignal: new AbortController().signal };
    const result = await provider.analyze(input);
    expect(provider.id).toBe('nvidia-vision');
    expect(provider.supportedMimeTypes).toEqual(['image/jpeg', 'image/png']);
    expect(analyzeImage).toHaveBeenCalledTimes(1);
    expect(analyzeImage).toHaveBeenCalledWith({
      bytes: input.buffer, mimeType: input.mimeType, correlationId: input.correlationId, abortSignal: input.abortSignal,
    });
    expect(result).toMatchObject({ description, labels, providerId: 'nvidia-vision' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('preserves the delegated service failure', async () => {
    const error = new Error('service failed');
    const analyzeImage = jest.fn<NvidiaService['analyzeImage']>().mockRejectedValue(error);
    await expect(new NvidiaVisionProvider({ analyzeImage }).analyze({ buffer: pngHeader(), mimeType: 'image/png' }))
      .rejects.toBe(error);
  });
});
