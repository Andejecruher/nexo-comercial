import { randomUUID } from 'node:crypto';
import { env } from '../../../config/env.config';
import { createStructuredLogger } from '../../../utils/structured-logger';
import type {
  DocumentTextExtractor,
  MediaMetadataProvider,
  MultimodalPayload,
  MultimodalTestFile,
  MultimodalTestOptions,
  MultimodalTestPipeline,
  MultimodalTestResult,
  OcrProvider,
  TextSummarizerProvider,
} from '../contracts';
import { PipelineRunner, StageError } from '../pipeline-runner';
import { pipelinePolicy, ProviderRegistry, runWithFallback } from '../provider-registry';
import { DOCUMENT_AI_OCR_MIME_TYPES } from '../providers/document-ai-ocr.provider';
import { NATIVE_DOCUMENT_MIME_TYPES } from '../providers/native-document-text.stub';

const log = createStructuredLogger('DocumentTestPipeline');

/** Chunk size is a target: a single oversized word stays intact. */
function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const word of text.match(/\S+/gu) ?? []) {
    if (current && current.length + 1 + word.length > size) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current} ${word}` : word;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Attempts are already recorded; only the registry's terminal error needs collecting. */
function collectExhausted(runner: PipelineRunner, error: unknown): void {
  if (error instanceof StageError && error.code.endsWith('_FALLBACK_EXHAUSTED')) {
    runner.collectError(error);
  }
}

export class DocumentTestPipeline implements MultimodalTestPipeline {
  readonly kind = 'document' as const;
  readonly supportedMimeTypes: readonly string[] = [
    ...new Set([...NATIVE_DOCUMENT_MIME_TYPES, ...DOCUMENT_AI_OCR_MIME_TYPES]),
  ];

  constructor(private readonly registry: ProviderRegistry) {}

  async run(
    file: MultimodalTestFile,
    options: MultimodalTestOptions = {},
  ): Promise<MultimodalTestResult> {
    const correlationId = options.correlationId ?? randomUUID();
    const policy = pipelinePolicy(this.kind, options);
    const runner = new PipelineRunner(this.kind, file, correlationId, policy);
    const mimeType = file.mimeType.toLowerCase().split(';')[0]!.trim();
    const payload: MultimodalPayload = {};
    const metadata: Record<string, unknown> = { sizeBytes: file.buffer.byteLength };
    const raw: Record<string, unknown> = {};
    const input = { buffer: file.buffer, mimeType, correlationId, abortSignal: runner.signal };

    const finish = (): MultimodalTestResult => {
      const status = !payload.normalizedText
        ? 'failed'
        : runner.errorCount
          ? 'partial'
          : 'completed';
      const result = runner.buildResult(
        status,
        payload,
        metadata,
        options.includeRawProviderResponse && Object.keys(raw).length
          ? { rawProviderResponse: raw }
          : undefined,
      );
      log('info', 'document.completed', correlationId, {
        status,
        durationMs: result.durationMs,
        errorCount: result.errors.length,
        extractedTextLength: payload.extractedText?.length ?? 0,
        ocrTextLength: payload.ocrText?.length ?? 0,
        normalizedTextLength: payload.normalizedText?.length ?? 0,
      });
      return result;
    };

    try {
      await runner.runStep(
        'validation',
        () => {
          if (!this.supportedMimeTypes.includes(mimeType)) {
            throw new StageError(
              'Tipo de documento no soportado',
              'validation',
              'VALIDATION_UNSUPPORTED_MIME',
              { statusCode: 415 },
            );
          }
          if (!file.buffer.byteLength) {
            throw new StageError('El archivo está vacío', 'validation', 'VALIDATION_EMPTY_FILE', {
              statusCode: 400,
            });
          }
          if (file.buffer.byteLength > env.MULTIMODAL_TEST_MAX_FILE_MB * 1024 * 1024) {
            throw new StageError(
              'El archivo supera el tamaño máximo permitido',
              'validation',
              'VALIDATION_FILE_TOO_LARGE',
              { statusCode: 413 },
            );
          }
          if (
            options.chunkText &&
            options.chunkSize !== undefined &&
            (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)
          ) {
            throw new StageError(
              'El tamaño de fragmento debe ser un entero positivo',
              'validation',
              'VALIDATION_CHUNK_SIZE',
              { statusCode: 400 },
            );
          }
          return Promise.resolve();
        },
        { metadata: { mimeType, sizeBytes: file.buffer.byteLength } },
      );
    } catch {
      return finish();
    }

    if (this.registry.providersFor('mediaMetadata', { mimeType }).length) {
      try {
        const probed = await runWithFallback(
          runner,
          'metadata',
          'mediaMetadata',
          this.registry,
          policy,
          (provider) => (provider as MediaMetadataProvider).probe(input),
          { mimeType },
        );
        Object.assign(metadata, probed);
        if (typeof probed.pages === 'number') payload.pages = probed.pages;
      } catch (error) {
        collectExhausted(runner, error);
      }
    } else {
      runner.skipStep('metadata', 'no metadata provider registered');
    }

    try {
      const native = await runWithFallback(
        runner,
        'native_text',
        'documentText',
        this.registry,
        policy,
        (provider) => (provider as DocumentTextExtractor).extractNativeText(input),
        { mimeType },
      );
      if (native) {
        payload.extractedText = native.text;
        if (native.pages !== undefined) payload.pages = native.pages;
      }
    } catch (error) {
      // Native extraction is non-fatal: OCR may still recover the document.
      collectExhausted(runner, error);
    }

    if (payload.extractedText?.trim() && !options.forceOcr) {
      runner.skipStep('ocr', 'native text available');
    } else if (options.ocrFallback === false && !options.forceOcr) {
      runner.skipStep('ocr', 'OCR fallback disabled');
    } else {
      try {
        const ocr = await runWithFallback(
          runner,
          'ocr',
          'ocr',
          this.registry,
          policy,
          (provider) => (provider as OcrProvider).extractText(input),
          { mimeType, preferredId: options.provider },
        );
        payload.ocrText = ocr.text;
        if (ocr.pages !== undefined) payload.pages = ocr.pages;
        if (ocr.confidence !== undefined) payload.confidence = ocr.confidence;
        if (options.includeRawProviderResponse && ocr.raw !== undefined) raw.ocr = ocr.raw;
      } catch (error) {
        collectExhausted(runner, error);
      }
    }

    try {
      await runner.runStep('parser', () => {
        const text = payload.ocrText?.trim() ? payload.ocrText : (payload.extractedText ?? '');
        payload.normalizedText = text
          .normalize('NFC')
          .trim()
          .replace(/\s{3,}/gu, ' ');
        if (options.chunkText)
          payload.chunks = chunkText(payload.normalizedText, options.chunkSize ?? 1000);
        return Promise.resolve();
      });
    } catch {
      return finish();
    }

    // TODO: Register a production summarizer when approved; no LLM dependency is invented here.
    if (!options.summary) {
      runner.skipStep('summary', 'summary not requested');
    } else if (!this.registry.providersFor('summarizer', { mimeType }).length) {
      runner.skipStep('summary', 'no summarizer registered');
    } else if (!payload.normalizedText) {
      runner.skipStep('summary', 'no text available');
    } else {
      try {
        const summary = await runWithFallback(
          runner,
          'summary',
          'summarizer',
          this.registry,
          policy,
          (provider) =>
            (provider as TextSummarizerProvider).summarize({
              text: payload.normalizedText!,
              correlationId,
              abortSignal: runner.signal,
            }),
          { mimeType },
        );
        payload.summaryText = summary.summary;
        if (options.includeRawProviderResponse && summary.raw !== undefined)
          raw.summary = summary.raw;
      } catch (error) {
        collectExhausted(runner, error);
      }
    }

    return finish();
  }
}
