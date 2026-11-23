/**
 * contracts.ts — Strongly typed contracts for the decoupled multimodal test layer.
 *
 * This layer is intentionally independent of the conversational agent, WhatsApp,
 * FSM, orchestrator, and realtime flow. Pipelines depend only on these contracts
 * and on the provider ports declared here. Existing production services are
 * reused exclusively through adapters that implement these ports.
 */

/** Supported top-level file kinds handled by the test layer. */
export type MultimodalFileKind = 'audio' | 'document' | 'image' | 'video';

/** Overall status of one pipeline execution. */
export type MultimodalExecutionStatus = 'completed' | 'partial' | 'failed';

/** Status of a single pipeline step. */
export type MultimodalStepStatus = 'ok' | 'failed' | 'skipped';

/**
 * Named pipeline stages. Errors must always be attributed to one of these
 * stages — never a generic "prepare failed". Stages map 1:1 to the failure
 * origins the caller asked to distinguish (validation, download, conversion,
 * OCR, STT, parser, frame extraction, summary, provider timeout, fallback).
 */
export type MultimodalStage =
  | 'validation'
  | 'metadata'
  | 'conversion'
  | 'native_text'
  | 'ocr'
  | 'stt'
  | 'parser'
  | 'audio_extraction'
  | 'frame_extraction'
  | 'visual_analysis'
  | 'summary'
  | 'download';

/** A normalized error attributed to a specific pipeline stage. */
export interface MultimodalStageError {
  stage: MultimodalStage;
  /** Machine-readable code, e.g. VALIDATION_UNSUPPORTED_MIME, STT_PROVIDER_TIMEOUT. */
  code: string;
  /** Human-readable message (Spanish, consistent with AppError messages). */
  message: string;
  /** HTTP-ish status code carried from AppError when available. */
  statusCode?: number;
  /** Provider id that produced the failure, when applicable. */
  provider?: string;
  /** Whether the underlying cause looks transient and a retry could help. */
  retriable?: boolean;
  /** Sanitized technical details (never credentials or raw payloads). */
  details?: unknown;
}

/** One executed (or skipped) step of a pipeline, with timing evidence. */
export interface MultimodalStep {
  stage: MultimodalStage;
  status: MultimodalStepStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  /** Technical metadata for the step (bytes, codec, pages, dims…). */
  metadata?: Record<string, unknown>;
  /** Populated only when status === 'failed'. */
  error?: MultimodalStageError;
}

/** Input file as received by the orchestration layer. */
export interface MultimodalTestFile {
  /** Original filename as uploaded. */
  filename: string;
  /** Mimetype declared by the client (validated against content when possible). */
  mimeType: string;
  /** Raw file bytes. */
  buffer: Buffer;
  /** Optional size in bytes; defaults to buffer.byteLength. */
  sizeBytes?: number;
}

/** Caller options for a pipeline execution. */
export interface MultimodalTestOptions {
  correlationId?: string;
  /** Force OCR even when native text exists (document/image). */
  forceOcr?: boolean;
  /** Run OCR when native extraction yields no text (document, default true). */
  ocrFallback?: boolean;
  /** Extract key frames (video, default false — expensive). */
  extractFrames?: boolean;
  /** Maximum frames to extract when extractFrames is true. */
  maxFrames?: number;
  /** Split normalized text into chunks (document). */
  chunkText?: boolean;
  /** Target characters per chunk when chunkText is true. */
  chunkSize?: number;
  /** Generate a short summary when a summarizer provider is configured. */
  summary?: boolean;
  /** Force a specific provider id for the primary capability (STT/OCR…). */
  provider?: string;
  /** Override the per-kind timeout from env. */
  timeoutMs?: number;
  /** Include sanitized raw provider responses in the result. */
  includeRawProviderResponse?: boolean;
}

/** Payload pieces a pipeline can produce. All optional except by kind. */
export interface MultimodalPayload {
  /** Transcript produced by STT (audio, video). */
  transcript?: string;
  /** Native extracted text (document). */
  extractedText?: string;
  /** Text produced by OCR (document, image). */
  ocrText?: string;
  /** Normalized text ready for downstream use (document). */
  normalizedText?: string;
  /** Optional text chunks (document, when chunkText). */
  chunks?: string[];
  /** Short summary when requested and a summarizer is configured. */
  summaryText?: string;
  /** Visual description produced by an image analysis provider (image, video frames). */
  description?: string;
  /** Labels extracted from visual analysis (image). */
  labels?: string[];
  /** Number of pages processed, when the format exposes pages. */
  pages?: number;
  /** Confidence reported by a provider, when available (0..1). */
  confidence?: number;
}

/** Standard result envelope returned by every pipeline execution. */
export interface MultimodalTestResult {
  correlationId: string;
  kind: MultimodalFileKind;
  filename: string;
  mimeType: string;
  status: MultimodalExecutionStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  steps: MultimodalStep[];
  errors: MultimodalStageError[];
  payload: MultimodalPayload;
  /** Technical metadata of the file (duration, sample rate, dimensions, codec…). */
  metadata: Record<string, unknown>;
  /** Providers actually used, in capability order (e.g. ['riva', 'document-ai']). */
  providersUsed: string[];
  /** Sanitized raw provider response, only when includeRawProviderResponse. */
  rawProviderResponse?: unknown;
}

/** Common provider execution context shared by all ports. */
export interface ProviderContext {
  correlationId?: string;
  abortSignal?: AbortSignal;
  /** Remaining execution budget assigned by the pipeline for this provider attempt. */
  timeoutMs?: number;
}

/** Base shape every provider port must expose. */
export interface ProviderDescriptor {
  /** Stable provider id used by the registry and by options.provider. */
  readonly id: string;
  /** Mime types the provider can handle (lowercase, no parameters). */
  readonly supportedMimeTypes: readonly string[];
  /**
   * Optional MIME routing strategy for families that cannot be represented by
   * a finite list, such as every audio/* or video/* format. Takes precedence
   * over supportedMimeTypes when supplied.
   */
  readonly supportsMimeType?: (mimeType: string) => boolean;
  /** The provider owns transport retries, so the registry must only select fallbacks. */
  readonly managesOwnRetries?: boolean;
}

/** ─── Provider ports (one per capability) ─────────────────────────────────── */

/** Speech-to-text port (audio pipelines, and video after audio extraction). */
export interface SttProvider extends ProviderDescriptor {
  transcribe(
    input: ProviderContext & { buffer: Buffer; mimeType: string },
  ): Promise<SttProviderOutput>;
}

export interface SttProviderOutput {
  transcript: string;
  providerId: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
  raw?: unknown;
}

/** OCR port (documents without native text, images). */
export interface OcrProvider extends ProviderDescriptor {
  extractText(
    input: ProviderContext & { buffer: Buffer; mimeType: string },
  ): Promise<OcrProviderOutput>;
}

export interface OcrProviderOutput {
  text: string;
  providerId: string;
  durationMs: number;
  pages?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
  raw?: unknown;
}

/** Native text extraction port (digital PDFs, DOCX…). Stub until a lib is added. */
export interface DocumentTextExtractor extends ProviderDescriptor {
  /**
   * @returns null when the document has no native text layer (scanned PDF) so
   * the pipeline can fall back to OCR.
   */
  extractNativeText(
    input: ProviderContext & { buffer: Buffer; mimeType: string },
  ): Promise<DocumentTextExtractorOutput | null>;
}

export interface DocumentTextExtractorOutput {
  text: string;
  providerId: string;
  durationMs: number;
  pages?: number;
  metadata?: Record<string, unknown>;
}

/** Image analysis port (visual description / labels). */
export interface ImageAnalysisProvider extends ProviderDescriptor {
  analyze(
    input: ProviderContext & { buffer: Buffer; mimeType: string },
  ): Promise<ImageAnalysisOutput>;
}

export interface ImageAnalysisOutput {
  description: string;
  labels: string[];
  providerId: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
  raw?: unknown;
}

/** Frame extraction port (video). Implementations use ffmpeg. */
export interface VideoFrameExtractor extends ProviderDescriptor {
  extractFrames(
    input: ProviderContext & { buffer: Buffer; mimeType: string; maxFrames: number },
  ): Promise<VideoFrameExtractorOutput>;
}

export interface VideoFrameExtractorOutput {
  frames: ReadonlyArray<{ index: number; bytes: Buffer }>;
  providerId: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

/** Audio-track extraction port (video → audio for STT). Implementations use ffmpeg. */
export interface VideoAudioExtractor extends ProviderDescriptor {
  extractAudio(
    input: ProviderContext & { buffer: Buffer; mimeType: string },
  ): Promise<VideoAudioExtractorOutput>;
}

export interface VideoAudioExtractorOutput {
  audio: Buffer;
  audioMimeType: string;
  providerId: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

/** Metadata probing port (dimensions, duration, codec, sample rate…). */
export interface MediaMetadataProvider extends ProviderDescriptor {
  probe(
    input: ProviderContext & { buffer: Buffer; mimeType: string },
  ): Promise<Record<string, unknown>>;
}

/** Summarizer port (optional, document/video). Stub until a provider is wired. */
export interface TextSummarizerProvider extends ProviderDescriptor {
  summarize(
    input: ProviderContext & { text: string; maxWords?: number },
  ): Promise<TextSummarizerOutput>;
}

export interface TextSummarizerOutput {
  summary: string;
  providerId: string;
  durationMs: number;
  raw?: unknown;
}

/** ─── Timeout / retry policy ─────────────────────────────────────────────── */

/** Per-capability execution policy applied by the registry fallback loop. */
export interface ProviderPolicy {
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

/** Union of every provider port for registry bookkeeping. */
export type AnyProvider =
  | SttProvider
  | OcrProvider
  | DocumentTextExtractor
  | ImageAnalysisProvider
  | VideoFrameExtractor
  | VideoAudioExtractor
  | MediaMetadataProvider
  | TextSummarizerProvider;

/** Capability identifiers supported by the registry. */
export type ProviderCapability =
  | 'stt'
  | 'ocr'
  | 'documentText'
  | 'imageAnalysis'
  | 'videoFrames'
  | 'videoAudio'
  | 'mediaMetadata'
  | 'summarizer';

/** ─── Pipeline port (what the orchestrator dispatches to) ────────────────── */

/** A per-kind pipeline: validates, processes, and traces one file execution. */
export interface MultimodalTestPipeline {
  readonly kind: MultimodalFileKind;
  /** Mime types the pipeline accepts (lowercase). Empty list = accept any. */
  readonly supportedMimeTypes: readonly string[];
  /** Runs the pipeline and returns the standard result envelope. */
  run(file: MultimodalTestFile, options?: MultimodalTestOptions): Promise<MultimodalTestResult>;
}
