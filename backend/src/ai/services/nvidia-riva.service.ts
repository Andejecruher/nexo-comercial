import {
  CallOptions,
  ChannelCredentials,
  Client,
  ClientDuplexStream,
  credentials,
  status as grpcStatus,
  loadPackageDefinition,
  Metadata,
  ServiceError,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { join } from 'path';
import { env } from '../../config/env.config';
import { FfmpegAudioTranscoder } from '../../services/whatsapp/audio-transcoder';
import { AppError } from '../../utils/app-error';
import { createStructuredLogger } from '../../utils/structured-logger';

export interface RivaAudioInput {
  bytes: Buffer;
  mimeType: string;
  abortSignal?: AbortSignal;
  correlationId?: string;
  sourceMessageId?: string;
  /** Caller budget, additionally bounded by the configured Riva operation budget. */
  timeoutMs?: number;
}

interface RivaRequest {
  streamingConfig?: {
    config: {
      encoding: 'LINEAR_PCM';
      sampleRateHertz: number;
      languageCode: string;
      audioChannelCount: number;
      maxAlternatives: number;
    };
    interimResults: boolean;
  };
  audioContent?: Buffer;
}

interface RivaResponse {
  results?: { isFinal?: boolean; alternatives?: { transcript?: string }[] }[];
}

export interface RivaRecognitionClient {
  streamingRecognize(
    metadata: Metadata,
    options: CallOptions,
  ): ClientDuplexStream<RivaRequest, RivaResponse>;
  close(): void;
}

interface RivaServiceDeps {
  createClient?: () => RivaRecognitionClient;
  transcoder?: Pick<FfmpegAudioTranscoder, 'transcodeToPcm16k'>;
}

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/amr',
  'audio/ogg',
  'audio/wav',
  'audio/flac',
]);
const RIVA_ENDPOINT = 'grpc.nvcf.nvidia.com:443';
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
const RPC_DEADLINE_SAFETY_MARGIN_MS = 50;
const log = createStructuredLogger('NvidiaRivaService');

const RETRYABLE_GRPC_CODES = new Set([
  grpcStatus.UNAVAILABLE,
  grpcStatus.DEADLINE_EXCEEDED,
  grpcStatus.RESOURCE_EXHAUSTED,
  grpcStatus.ABORTED,
]);

interface RecognitionAttemptResult {
  text: string;
  audioChunks: number;
}

function getGrpcError(error: unknown): ServiceError | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as Partial<ServiceError>;
  return typeof candidate.code === 'number' && typeof candidate.details === 'string'
    ? (candidate as ServiceError)
    : undefined;
}

function errorCode(error: unknown): string | number | undefined {
  if (error instanceof AppError) return error.code;
  const grpcError = getGrpcError(error);
  if (grpcError) return grpcError.code;
  return error instanceof Error ? error.name : undefined;
}

function asRivaError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const grpcError = getGrpcError(error);
  const details = grpcError
    ? { grpcCode: grpcError.code, grpcDetails: grpcError.details.slice(0, 512) }
    : {
        causeCode: errorCode(error),
        causeMessage: error instanceof Error ? error.message.slice(0, 512) : undefined,
      };
  switch (grpcError?.code) {
    case grpcStatus.DEADLINE_EXCEEDED:
      return new AppError('NVIDIA Riva transcription timed out', 504, 'AI_RIVA_TIMEOUT', details);
    case grpcStatus.UNAVAILABLE:
      return new AppError('NVIDIA Riva worker is unavailable', 503, 'AI_RIVA_UNAVAILABLE', details);
    case grpcStatus.RESOURCE_EXHAUSTED:
      return new AppError(
        'NVIDIA Riva capacity is exhausted',
        429,
        'AI_RIVA_RESOURCE_EXHAUSTED',
        details,
      );
    case grpcStatus.UNAUTHENTICATED:
      return new AppError(
        'NVIDIA Riva authentication failed',
        401,
        'AI_RIVA_UNAUTHENTICATED',
        details,
      );
    case grpcStatus.PERMISSION_DENIED:
      return new AppError(
        'NVIDIA Riva permission denied',
        403,
        'AI_RIVA_PERMISSION_DENIED',
        details,
      );
    case grpcStatus.INVALID_ARGUMENT:
      return new AppError(
        'NVIDIA Riva rejected the recognition request',
        400,
        'AI_RIVA_INVALID_ARGUMENT',
        details,
      );
    case grpcStatus.CANCELLED:
      return new AppError('NVIDIA Riva transcription cancelled', 499, 'AI_RIVA_CANCELLED', details);
  }
  return new AppError('NVIDIA Riva transcription failed', 502, 'AI_ASR_FAILED', details);
}

function abortError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new DOMException(
    typeof reason === 'string' ? reason : 'The operation was aborted',
    'AbortError',
  );
}

/** Cliente del Riva alojado en NVIDIA: no requiere gateway, contenedor ni GPU propios. */
export class NvidiaRivaService {
  private client?: RivaRecognitionClient;
  private readonly transcoder: Pick<FfmpegAudioTranscoder, 'transcodeToPcm16k'>;

  constructor(private readonly deps: RivaServiceDeps = {}) {
    this.transcoder = deps.transcoder ?? new FfmpegAudioTranscoder();
  }

  async transcribeAudio(input: RivaAudioInput): Promise<string> {
    input.abortSignal?.throwIfAborted();
    const mimeType = input.mimeType.toLowerCase().split(';')[0].trim();
    if (
      !ALLOWED_AUDIO_MIMES.has(mimeType) ||
      !input.bytes.length ||
      input.bytes.length > MAX_AUDIO_BYTES
    ) {
      throw AppError.badRequest('Audio vacío, demasiado grande o de formato no permitido');
    }
    if (!env.NVIDIA_API_KEY) {
      throw new AppError('NVIDIA_API_KEY is missing', 503, 'AI_PROVIDER_UNAVAILABLE');
    }

    const controller = new AbortController();
    const timeoutMs = Math.min(
      input.timeoutMs ?? env.NVIDIA_RIVA_TIMEOUT_MS,
      env.NVIDIA_RIVA_TIMEOUT_MS,
    );
    let timedOut = false;
    const startedAt = Date.now();
    const abort = () => controller.abort(input.abortSignal?.reason);
    input.abortSignal?.addEventListener('abort', abort, { once: true });
    const deadline = Date.now() + timeoutMs;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    log('info', 'nvidia_riva.transcription_started', input.correlationId, {
      providerId: 'riva',
      modelId: env.NVIDIA_RIVA_FUNCTION_ID,
      functionId: env.NVIDIA_RIVA_FUNCTION_ID,
      sourceMessageId: input.sourceMessageId,
      inputMimeType: mimeType,
      inputBytes: input.bytes.byteLength,
      encoding: 'LINEAR_PCM',
      sampleRateHertz: 16_000,
      audioChannelCount: 1,
      timeoutMs,
      maxRetries: env.NVIDIA_RIVA_MAX_RETRIES,
    });
    try {
      log('debug', 'nvidia_riva.conversion_started', input.correlationId, {
        providerId: 'riva',
        sourceMessageId: input.sourceMessageId,
        inputMimeType: mimeType,
        inputBytes: input.bytes.byteLength,
      });
      const pcm = await this.transcoder.transcodeToPcm16k(input.bytes, controller.signal);
      controller.signal.throwIfAborted();
      log('info', 'nvidia_riva.conversion_finished', input.correlationId, {
        providerId: 'riva',
        sourceMessageId: input.sourceMessageId,
        inputMimeType: mimeType,
        inputBytes: input.bytes.byteLength,
        pcmBytes: pcm.byteLength,
        conversionDurationMs: Date.now() - startedAt,
        audioDurationMs: Math.floor((pcm.byteLength / (16_000 * 2)) * 1_000),
        encoding: 'LINEAR_PCM',
        sampleRateHertz: 16_000,
        audioChannelCount: 1,
      });
      const text = await this.recognize(pcm, controller.signal, deadline, input.correlationId);
      log('info', 'nvidia_riva.transcription_finished', input.correlationId, {
        providerId: 'riva',
        sourceMessageId: input.sourceMessageId,
        status: 'success',
        durationMs: Date.now() - startedAt,
      });
      return text;
    } catch (error) {
      const grpcError = getGrpcError(error);
      const preservedGrpc =
        error instanceof AppError && error.details && typeof error.details === 'object'
          ? (error.details as { grpcCode?: number; grpcDetails?: string })
          : undefined;
      const timeoutError = timedOut
        ? new AppError('NVIDIA Riva transcription timed out', 504, 'AI_RIVA_TIMEOUT', {
            timeoutMs,
            grpcCode: grpcError?.code ?? preservedGrpc?.grpcCode,
            grpcDetails: grpcError?.details?.slice(0, 512) ?? preservedGrpc?.grpcDetails,
          })
        : undefined;
      const isRivaTimeout =
        timeoutError !== undefined ||
        (error instanceof AppError && error.code === 'AI_RIVA_TIMEOUT');
      log('error', 'nvidia_riva.transcription_failed', input.correlationId, {
        providerId: 'riva',
        sourceMessageId: input.sourceMessageId,
        status: isRivaTimeout ? 'timeout' : input.abortSignal?.aborted ? 'cancelled' : 'failed',
        cancellationCause: timeoutError
          ? 'riva_timeout'
          : isRivaTimeout
            ? 'grpc_deadline'
            : input.abortSignal?.aborted
              ? 'external'
              : undefined,
        errorCode: errorCode(timeoutError ?? error),
        causeCode: timeoutError ? errorCode(error) : undefined,
        grpcCode: grpcError?.code ?? preservedGrpc?.grpcCode,
        grpcDetails: grpcError?.details?.slice(0, 512) ?? preservedGrpc?.grpcDetails,
        totalDurationMs: Date.now() - startedAt,
      });
      if (timeoutError) throw timeoutError;
      if (input.abortSignal?.aborted) {
        throw new AppError('NVIDIA Riva transcription cancelled', 499, 'AI_ASR_CANCELLED', {
          cancellationCause: 'external',
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      input.abortSignal?.removeEventListener('abort', abort);
    }
  }

  close(): void {
    this.client?.close();
    this.client = undefined;
  }

  private getClient(): RivaRecognitionClient {
    if (this.client) return this.client;
    if (this.deps.createClient) {
      this.client = this.deps.createClient();
      return this.client;
    }
    const definition = loadSync(join(__dirname, 'riva/proto/riva_asr.proto'), {
      includeDirs: [__dirname],
      enums: String,
      bytes: Buffer,
    });
    const packages = loadPackageDefinition(definition) as unknown as {
      nvidia: {
        riva: {
          asr: {
            RivaSpeechRecognition: new (
              address: string,
              credentials: ChannelCredentials,
            ) => Client & RivaRecognitionClient;
          };
        };
      };
    };
    this.client = new packages.nvidia.riva.asr.RivaSpeechRecognition(
      RIVA_ENDPOINT,
      credentials.createSsl(),
    );
    return this.client;
  }

  private async recognize(
    pcm: Buffer,
    signal: AbortSignal,
    deadline: number,
    correlationId?: string,
  ): Promise<string> {
    let lastGrpcError: ServiceError | undefined;
    for (let attempt = 0; attempt <= env.NVIDIA_RIVA_MAX_RETRIES; attempt += 1) {
      const attemptStartedAt = Date.now();
      let attemptDeadline = deadline;
      try {
        const hasRetry = attempt < env.NVIDIA_RIVA_MAX_RETRIES;
        attemptDeadline = this.attemptDeadline(deadline, hasRetry);
        const result = await this.recognizeAttempt(pcm, signal, attemptDeadline);
        log('debug', 'nvidia_riva.stream_finished', correlationId, {
          attempt: attempt + 1,
          audioChunks: result.audioChunks,
          durationMs: Date.now() - attemptStartedAt,
          grpcDeadlineMs: Math.max(0, attemptDeadline - attemptStartedAt),
          remainingBudgetMs: Math.max(0, deadline - Date.now()),
          resultStatus: 'final',
        });
        return result.text;
      } catch (error) {
        const attemptElapsedMs = Date.now() - attemptStartedAt;
        const remainingMs = Math.max(0, deadline - Date.now());
        const grpcError = getGrpcError(error);
        if (grpcError) lastGrpcError = grpcError;
        if (signal.aborted) {
          // El temporizador total abortó el stream: conservar el último error gRPC real
          // para que `transcribeAudio` no reporte un timeout sin causa.
          throw new AppError('NVIDIA Riva transcription cancelled', 499, 'AI_ASR_CANCELLED', {
            cancellationCause: 'riva_timeout',
            ...(lastGrpcError
              ? { grpcCode: lastGrpcError.code, grpcDetails: lastGrpcError.details.slice(0, 512) }
              : {}),
          });
        }
        const retryable = grpcError !== undefined && RETRYABLE_GRPC_CODES.has(grpcError.code);
        // Un intento que consumió al menos el presupuesto restante no puede completarse
        // dentro del presupuesto total: mejor exponer el error gRPC real que agotar el reloj.
        const hasBudgetForRetry = remainingMs > attemptElapsedMs;
        log('warn', 'nvidia_riva.grpc_attempt_failed', correlationId, {
          attempt: attempt + 1,
          maxAttempts: env.NVIDIA_RIVA_MAX_RETRIES + 1,
          retryable,
          hasBudgetForRetry,
          grpcCode: grpcError?.code,
          grpcDetails: grpcError?.details?.slice(0, 512),
          errorCode: errorCode(error),
          grpcDeadlineMs: Math.max(0, attemptDeadline - attemptStartedAt),
          remainingBudgetMs: remainingMs,
        });
        if (!retryable || attempt >= env.NVIDIA_RIVA_MAX_RETRIES || !hasBudgetForRetry) {
          throw asRivaError(error);
        }
        await this.waitBeforeRetry(signal);
      }
    }

    throw new AppError('NVIDIA Riva transcription failed', 502, 'AI_ASR_FAILED');
  }

  private attemptDeadline(totalDeadline: number, hasRetry: boolean): number {
    const now = Date.now();
    const remainingMs = totalDeadline - now;
    const reserveMs = hasRetry ? env.NVIDIA_RIVA_RETRY_DELAY_MS + RPC_DEADLINE_SAFETY_MARGIN_MS : 0;
    const attemptBudget = remainingMs > reserveMs ? remainingMs - reserveMs : remainingMs;

    if (attemptBudget < 1) {
      throw new AppError('NVIDIA Riva transcription timed out', 504, 'AI_RIVA_TIMEOUT', {
        timeoutMs: Math.max(0, remainingMs),
      });
    }

    return now + attemptBudget;
  }

  private waitBeforeRetry(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (env.NVIDIA_RIVA_RETRY_DELAY_MS === 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const retryTimer = setTimeout(done, env.NVIDIA_RIVA_RETRY_DELAY_MS);
      const onAbort = () => {
        clearTimeout(retryTimer);
        signal.removeEventListener('abort', onAbort);
        reject(abortError(signal.reason));
      };
      function done(): void {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private recognizeAttempt(
    pcm: Buffer,
    signal: AbortSignal,
    deadline: number,
  ): Promise<RecognitionAttemptResult> {
    signal.throwIfAborted();
    const metadata = new Metadata();
    metadata.set('authorization', `Bearer ${env.NVIDIA_API_KEY}`);
    metadata.set('function-id', env.NVIDIA_RIVA_FUNCTION_ID);
    const stream = this.getClient().streamingRecognize(metadata, { deadline });

    return new Promise<RecognitionAttemptResult>((resolve, reject) => {
      let settled = false;
      let offset = 0;
      let audioChunks = 0;
      let receivedEnd = false;
      const transcripts: string[] = [];
      const seenTranscripts = new Set<string>();
      const settle = (error?: Error, cancel = false) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        stream.removeListener('drain', upload);
        stream.removeListener('data', onData);
        stream.removeListener('end', onEnd);
        stream.removeListener('close', onClose);
        if (cancel) {
          const swallowCancellation = () => undefined;
          stream.once('error', swallowCancellation);
          try {
            stream.cancel();
          } catch {
            stream.removeListener('error', swallowCancellation);
          }
        }
        stream.removeListener('error', onError);
        if (error) reject(error);
        else {
          const text = transcripts.join(' ').trim();
          if (text) resolve({ text, audioChunks });
          else reject(new AppError('Empty audio transcription', 502, 'AI_EMPTY_TRANSCRIPTION'));
        }
      };
      const onAbort = () => {
        settle(new AppError('Riva transcription cancelled', 499, 'AI_ASR_CANCELLED'), true);
      };
      const upload = () => {
        if (settled) return;
        try {
          while (offset < pcm.length) {
            const audioContent = pcm.subarray(offset, offset + CHUNK_BYTES);
            offset += audioContent.length;
            audioChunks += 1;
            if (!stream.write({ audioContent })) {
              stream.once('drain', upload);
              return;
            }
          }
          stream.end();
        } catch {
          settle(new AppError('Riva audio upload failed', 502, 'AI_ASR_FAILED'), true);
        }
      };

      const onData = (response: RivaResponse) => {
        if (settled) return;
        for (const result of response.results ?? []) {
          const text = result.alternatives?.[0]?.transcript?.trim();
          if (result.isFinal && text && !seenTranscripts.has(text)) {
            seenTranscripts.add(text);
            transcripts.push(text);
          }
        }
      };
      const onError = (error: Error) => settle(error);
      const onEnd = () => {
        receivedEnd = true;
        settle();
      };
      const onClose = () => {
        if (!receivedEnd) {
          settle(
            new AppError('Riva stream closed before final response', 502, 'AI_ASR_STREAM_CLOSED'),
          );
        }
      };
      stream.on('data', onData);
      stream.once('error', onError);
      stream.once('end', onEnd);
      stream.once('close', onClose);
      signal.addEventListener('abort', onAbort, { once: true });

      try {
        const ready = stream.write({
          streamingConfig: {
            config: {
              encoding: 'LINEAR_PCM',
              sampleRateHertz: 16_000,
              languageCode: env.NVIDIA_RIVA_LANGUAGE_CODE,
              audioChannelCount: 1,
              maxAlternatives: 1,
            },
            interimResults: false,
          },
        });
        if (ready) upload();
        else stream.once('drain', upload);
      } catch {
        settle(new AppError('Riva stream initialization failed', 502, 'AI_ASR_FAILED'), true);
      }
    });
  }
}
