/**
 * multimodal-test.orchestrator.ts — Multimodal orchestration layer.
 *
 * Receives a file, detects/validates its type, and dispatches to the matching
 * per-kind pipeline. Returns the standard MultimodalTestResult envelope.
 * Completely independent of the agent/WhatsApp/FSM flow.
 */
import { randomUUID } from 'crypto';
import { env } from '../../config/env.config';
import { createStructuredLogger } from '../../utils/structured-logger';
import { AppError } from '../../utils/app-error';
import {
  MultimodalFileKind,
  MultimodalTestFile,
  MultimodalTestOptions,
  MultimodalTestPipeline,
  MultimodalTestResult,
} from './contracts';

const log = createStructuredLogger('MultimodalTestOrchestrator');

/** Document mimetypes accepted by the document pipeline. */
const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

export class MultimodalTestOrchestrator {
  constructor(
    private readonly pipelines: Partial<Record<MultimodalFileKind, MultimodalTestPipeline>>,
  ) {}

  /** Maps a mimetype to its file kind. Returns null for unknown families. */
  detectKind(mimeType: string): MultimodalFileKind | null {
    const normalized = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
    if (!normalized) return null;
    if (normalized.startsWith('audio/')) return 'audio';
    if (normalized.startsWith('video/')) return 'video';
    if (normalized.startsWith('image/')) return 'image';
    if (DOCUMENT_MIMES.has(normalized)) return 'document';
    return null;
  }

  /** Auto-detects the kind from the mimetype and runs the matching pipeline. */
  async run(file: MultimodalTestFile, options: MultimodalTestOptions = {}): Promise<MultimodalTestResult> {
    const kind = this.detectKind(file.mimeType);
    if (!kind) {
      throw new AppError(
        `Tipo de archivo no soportado: ${file.mimeType || '(sin mimetype)'}`,
        400,
        'VALIDATION_UNSUPPORTED_MIME',
      );
    }
    return this.runAs(kind, file, options);
  }

  /** Runs the pipeline for a forced kind (used by the type-specific endpoints). */
  async runAs(
    kind: MultimodalFileKind,
    file: MultimodalTestFile,
    options: MultimodalTestOptions = {},
  ): Promise<MultimodalTestResult> {
    const correlationId = options.correlationId ?? randomUUID();
    const maxBytes = env.MULTIMODAL_TEST_MAX_FILE_MB * 1024 * 1024;
    const bytes = file.buffer.byteLength;
    if (bytes <= 0 || bytes > maxBytes) {
      throw new AppError(
        `El archivo está vacío o supera ${env.MULTIMODAL_TEST_MAX_FILE_MB} MB`,
        413,
        'MULTIMODAL_FILE_TOO_LARGE',
      );
    }
    const pipeline = this.pipelines[kind];
    if (!pipeline) {
      throw new AppError(
        `No hay pipeline registrado para ${kind}`,
        503,
        'MULTIMODAL_NO_PIPELINE',
      );
    }
    const startedAt = Date.now();
    log('info', 'multimodal_test.dispatch', correlationId, {
      kind,
      filename: file.filename,
      mimeType: file.mimeType,
      bytes,
      timeoutMs: options.timeoutMs,
    });
    try {
      const result = await pipeline.run(file, { ...options, correlationId });
      log('info', 'multimodal_test.finished', correlationId, {
        kind,
        status: result.status,
        durationMs: Date.now() - startedAt,
        steps: result.steps.length,
        providers: result.providersUsed,
      });
      return result;
    } catch (error) {
      log('warn', 'multimodal_test.pipeline_error', correlationId, {
        kind,
        durationMs: Date.now() - startedAt,
        errorCode: error instanceof AppError ? error.code : undefined,
      });
      throw error;
    }
  }
}
