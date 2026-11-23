/**
 * pipeline-runner.ts — Tracing engine for multimodal test pipelines.
 *
 * Every pipeline executes its stages through this runner so that each
 * execution produces a uniform trace: ordered steps with status, timestamps,
 * per-step duration, technical metadata, and normalized per-stage errors.
 * Stage errors are never generic: they always carry a MultimodalStage.
 */
import { AppError } from '../../utils/app-error';
import {
  MultimodalExecutionStatus,
  MultimodalFileKind,
  MultimodalPayload,
  MultimodalStage,
  MultimodalStageError,
  MultimodalStep,
  MultimodalTestFile,
  MultimodalTestResult,
  ProviderPolicy,
} from './contracts';

/** AppError subclass that always carries the stage where the failure happened. */
export class StageError extends AppError {
  readonly stage: MultimodalStage;
  readonly retriable: boolean;
  readonly provider?: string;
  /** Narrowed from AppError: a stage error always carries a machine code. */
  declare readonly code: string;

  constructor(
    message: string,
    stage: MultimodalStage,
    code: string,
    options?: {
      statusCode?: number;
      provider?: string;
      retriable?: boolean;
      details?: unknown;
    },
  ) {
    super(message, options?.statusCode ?? 500, code, options?.details);
    this.stage = stage;
    this.retriable = options?.retriable ?? false;
    this.provider = options?.provider;
  }
}

/** Heuristic set of AppError codes / HTTP statuses that look transient. */
const RETRIABLE_STATUS = new Set([502, 503, 504]);
const RETRIABLE_CODE_PATTERN = /TIMEOUT|UNAVAILABLE|DEADLINE|TRANSIENT/i;

/** Normalizes any thrown value into a MultimodalStageError. */
export function toStageError(
  error: unknown,
  stage: MultimodalStage,
  provider?: string,
): StageError {
  if (error instanceof StageError) return error;
  if (error instanceof AppError) {
    return new StageError(error.message, stage, error.code ?? 'APP_ERROR', {
      statusCode: error.statusCode,
      provider,
      retriable:
        RETRIABLE_STATUS.has(error.statusCode) || RETRIABLE_CODE_PATTERN.test(error.code ?? ''),
      details: error.details,
    });
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  const code = error instanceof Error ? error.name : 'UNKNOWN_ERROR';
  return new StageError(message, stage, code, { provider });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RunStepOptions {
  /** Per-step timeout (defaults to the remaining pipeline budget). */
  timeoutMs?: number;
  /** Timeout-specific error code (providers use PROVIDER_TIMEOUT). */
  timeoutCode?: string;
  /** Static technical metadata recorded on the step. */
  metadata?: Record<string, unknown>;
}

/**
 * Executes pipeline stages while recording timing and errors per stage.
 * One runner instance === one execution === one correlationId.
 */
export class PipelineRunner {
  private readonly steps: MultimodalStep[] = [];
  private readonly errors: MultimodalStageError[] = [];
  private readonly providersUsed: string[] = [];
  private readonly startedAtMs = Date.now();
  private readonly controller = new AbortController();

  constructor(
    private readonly kind: MultimodalFileKind,
    private readonly file: MultimodalTestFile,
    private readonly correlationId: string,
    private readonly policy: ProviderPolicy,
  ) {}

  /** Abort signal covering the whole pipeline budget. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** Remaining milliseconds of the total pipeline budget. */
  remainingMs(): number {
    return Math.max(0, this.policy.timeoutMs - (Date.now() - this.startedAtMs));
  }

  /** Throws when the pipeline budget is exhausted. */
  throwIfExpired(): void {
    if (this.remainingMs() <= 0) {
      throw new StageError(
        'Presupuesto de tiempo del pipeline agotado',
        this.lastStage(),
        'PIPELINE_BUDGET_EXHAUSTED',
        { statusCode: 504, retriable: true },
      );
    }
  }

  abort(): void {
    this.controller.abort();
  }

  markProviderUsed(providerId: string): void {
    if (!this.providersUsed.includes(providerId)) this.providersUsed.push(providerId);
  }

  /**
   * Runs one pipeline step: records timing, metadata, and normalized errors.
   * Each provider attempt should go through runStep so retries/fallbacks are
   * individually observable in the resulting step list.
   */
  async runStep<T>(
    stage: MultimodalStage,
    fn: (ctx: { timeoutMs: number; signal: AbortSignal }) => Promise<T>,
    options: RunStepOptions = {},
  ): Promise<T> {
    const timeoutMs = Math.max(
      1,
      Math.min(options.timeoutMs ?? this.remainingMs(), this.remainingMs()),
    );
    const startedAt = new Date();
    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort(this.controller.signal.reason);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      attemptController.abort();
    }, timeoutMs);
    this.controller.signal.addEventListener('abort', abortAttempt, { once: true });
    if (this.controller.signal.aborted) abortAttempt();
    try {
      const result = await fn({ timeoutMs, signal: attemptController.signal });
      this.recordStep(stage, startedAt, 'ok', options.metadata);
      return result;
    } catch (error) {
      const stageError = timedOut
        ? new StageError(
            `Timeout de la etapa ${stage}`,
            stage,
            options.timeoutCode ?? 'STAGE_TIMEOUT',
            { statusCode: 504, retriable: true, details: { timeoutMs } },
          )
        : toStageError(error, stage, options.metadata?.provider as string | undefined);
      this.recordStep(stage, startedAt, 'failed', options.metadata, stageError);
      throw stageError;
    } finally {
      clearTimeout(timer);
      this.controller.signal.removeEventListener('abort', abortAttempt);
    }
  }

  /** Records a step that was intentionally not executed. */
  skipStep(stage: MultimodalStage, reason: string): void {
    const now = new Date();
    this.steps.push({
      stage,
      status: 'skipped',
      startedAt: now.toISOString(),
      endedAt: now.toISOString(),
      durationMs: 0,
      metadata: { reason },
    });
  }

  /** Waits between retry attempts without exceeding the pipeline budget. */
  async waitRetryDelay(): Promise<void> {
    const delay = Math.min(this.policy.retryDelayMs, this.remainingMs());
    if (delay > 0) await sleep(delay);
  }

  /** Assembles the standard result envelope for this execution. */
  buildResult(
    status: MultimodalExecutionStatus,
    payload: MultimodalPayload,
    metadata: Record<string, unknown>,
    options?: { rawProviderResponse?: unknown },
  ): MultimodalTestResult {
    const endedAt = new Date();
    return {
      correlationId: this.correlationId,
      kind: this.kind,
      filename: this.file.filename,
      mimeType: this.file.mimeType,
      status,
      startedAt: new Date(this.startedAtMs).toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - this.startedAtMs,
      steps: this.steps,
      errors: this.errors.map((error) => ({
        stage: error.stage,
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        provider: error.provider,
        retriable: error.retriable,
        details: error.details,
      })),
      payload,
      metadata,
      providersUsed: this.providersUsed,
      ...(options?.rawProviderResponse !== undefined
        ? { rawProviderResponse: options.rawProviderResponse }
        : {}),
    };
  }

  /** Collects an error (called automatically by runStep failures). */
  collectError(error: StageError): void {
    this.errors.push(error);
  }

  get errorCount(): number {
    return this.errors.length;
  }

  private recordStep(
    stage: MultimodalStage,
    startedAt: Date,
    status: MultimodalStep['status'],
    metadata?: Record<string, unknown>,
    error?: StageError,
  ): void {
    const endedAt = new Date();
    this.steps.push({
      stage,
      status,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      ...(metadata !== undefined ? { metadata } : {}),
      ...(error !== undefined
        ? {
            error: {
              stage: error.stage,
              code: error.code,
              message: error.message,
              statusCode: error.statusCode,
              provider: error.provider,
              retriable: error.retriable,
              details: error.details,
            },
          }
        : {}),
    });
    if (error !== undefined) this.errors.push(error);
  }

  private lastStage(): MultimodalStage {
    return this.steps.length > 0 ? this.steps[this.steps.length - 1]!.stage : 'validation';
  }
}
