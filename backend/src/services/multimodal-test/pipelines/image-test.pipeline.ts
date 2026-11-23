import { randomUUID } from 'node:crypto';
import { env } from '../../../config/env.config';
import { createStructuredLogger } from '../../../utils/structured-logger';
import type {
  ImageAnalysisOutput,
  ImageAnalysisProvider,
  MediaMetadataProvider,
  MultimodalPayload,
  MultimodalTestFile,
  MultimodalTestOptions,
  MultimodalTestPipeline,
  MultimodalTestResult,
  OcrProvider,
  OcrProviderOutput,
} from '../contracts';
import { PipelineRunner, StageError } from '../pipeline-runner';
import { pipelinePolicy, ProviderRegistry, runWithFallback } from '../provider-registry';

const log = createStructuredLogger('ImageTestPipeline');

export class ImageTestPipeline implements MultimodalTestPipeline {
  readonly kind = 'image';
  readonly supportedMimeTypes = ['image/jpeg', 'image/png'] as const;

  constructor(private readonly registry: ProviderRegistry) {}

  async run(
    file: MultimodalTestFile,
    options: MultimodalTestOptions = {},
  ): Promise<MultimodalTestResult> {
    const correlationId = options.correlationId ?? randomUUID();
    const policy = pipelinePolicy(this.kind, options);
    const runner = new PipelineRunner(this.kind, file, correlationId, policy);
    const mimeType = file.mimeType.toLowerCase().split(';')[0]!.trim();
    let metadata: Record<string, unknown> = { format: 'unknown', bytes: file.buffer.length };
    let payload: MultimodalPayload = {};

    const finish = (): MultimodalTestResult => {
      const hasText = Boolean(payload.description?.trim() || payload.ocrText?.trim());
      const status = !hasText ? 'failed' : runner.errorCount > 0 ? 'partial' : 'completed';
      const result = runner.buildResult(status, payload, metadata);
      log('info', 'image.completed', correlationId, {
        status,
        bytes: file.buffer.length,
        durationMs: result.durationMs,
        descriptionLength: payload.description?.length ?? 0,
        ocrTextLength: payload.ocrText?.length ?? 0,
        labelCount: payload.labels?.length ?? 0,
        errorCount: runner.errorCount,
      });
      return result;
    };

    try {
      await runner.runStep(
        'validation',
        () => {
          if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
            throw new StageError(
              'Formato de imagen no permitido',
              'validation',
              'VALIDATION_UNSUPPORTED_MIME',
              { statusCode: 400 },
            );
          }
          if (!file.buffer.length) {
            throw new StageError(
              'El archivo de imagen está vacío',
              'validation',
              'VALIDATION_EMPTY_FILE',
              { statusCode: 400 },
            );
          }
          if (file.buffer.length > env.MULTIMODAL_TEST_MAX_FILE_MB * 1024 * 1024) {
            throw new StageError(
              'El archivo de imagen supera el tamaño permitido',
              'validation',
              'VALIDATION_FILE_TOO_LARGE',
              { statusCode: 400 },
            );
          }
          return Promise.resolve();
        },
        { metadata: { bytes: file.buffer.length } },
      );
    } catch {
      return finish();
    }

    if (!this.registry.providersFor('mediaMetadata', { mimeType }).length) {
      runner.skipStep('metadata', 'no metadata provider registered');
    } else {
      try {
        const probed = await runWithFallback(
          runner,
          'metadata',
          'mediaMetadata',
          this.registry,
          policy,
          (provider, { signal }) =>
            (provider as MediaMetadataProvider).probe({
              buffer: file.buffer,
              mimeType,
              correlationId,
              abortSignal: signal,
            }),
          { mimeType },
        );
        metadata = { ...metadata, ...probed, bytes: file.buffer.length };
      } catch {
        // Metadata is best-effort; the runner retains each failed provider attempt.
      }
    }

    let ocr: OcrProviderOutput | undefined;
    if (!this.registry.providersFor('ocr', { mimeType }).length) {
      runner.skipStep('ocr', 'no OCR provider registered');
    } else {
      try {
        ocr = await runWithFallback(
          runner,
          'ocr',
          'ocr',
          this.registry,
          policy,
          (provider, { signal }) =>
            (provider as OcrProvider).extractText({
              buffer: file.buffer,
              mimeType,
              correlationId,
              abortSignal: signal,
            }),
          { mimeType },
        );
      } catch {
        // A visual description can still make this execution useful.
      }
    }

    let vision: ImageAnalysisOutput | undefined;
    if (!this.registry.providersFor('imageAnalysis', { mimeType }).length) {
      runner.skipStep('visual_analysis', 'no image analysis provider registered');
    } else {
      try {
        vision = await runWithFallback(
          runner,
          'visual_analysis',
          'imageAnalysis',
          this.registry,
          policy,
          (provider, { signal }) =>
            (provider as ImageAnalysisProvider).analyze({
              buffer: file.buffer,
              mimeType,
              correlationId,
              abortSignal: signal,
            }),
          { mimeType, preferredId: options.provider },
        );
      } catch {
        // Vision failure is fatal only when OCR also produced no usable text.
      }
    }

    payload = { description: vision?.description, ocrText: ocr?.text };
    try {
      payload.labels = await runner.runStep('parser', () => Promise.resolve(vision?.labels ?? []));
    } catch {
      // Keep any successfully extracted text if parsing fails.
    }
    return finish();
  }
}
