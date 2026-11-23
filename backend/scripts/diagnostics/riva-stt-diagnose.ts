/**
 * riva-stt-diagnose.ts — Diagnóstico aislado de NVIDIA Riva StreamingRecognize.
 *
 * No usa `AudioTestPipeline`, ni la FSM, ni la base de datos. Solo lee un archivo
 * de audio, opcionalmente lo convierte a PCM 16 kHz y ejecuta el RPC de Riva para
 * registrar endpoint, función, duración, código/detalle gRPC y transcripción.
 *
 * Modos:
 *   raw      Cliente gRPC mínimo, independiente de `NvidiaRivaService`.
 *   service  `NvidiaRivaService.transcribeAudio`, el camino real de producción.
 *   both     Ambos, primero raw y luego service (predeterminado).
 *
 * Nunca imprime la API key ni el contenido del audio.
 *
 * Uso (desde backend/):
 *   pnpm diagnose:riva /ruta/audio.ogg
 *   pnpm diagnose:riva /ruta/audio.ogg --mode service --language es-US
 *   pnpm diagnose:riva /ruta/audio.ogg --function-id <uuid> --timeout-ms 45000
 *
 * Uso dentro del contenedor de desarrollo:
 *   docker compose -f docker-compose.dev.yml exec api \
 *     npx ts-node --transpile-only --project scripts/tsconfig.json \
 *     scripts/diagnostics/riva-stt-diagnose.ts /workspace/backend/tmp/audio.ogg
 */
import { config } from 'dotenv';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import {
  CallOptions,
  ClientDuplexStream,
  Metadata,
  ServiceError,
  credentials,
  loadPackageDefinition,
  status as grpcStatus,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { FfmpegAudioTranscoder } from '../../src/services/whatsapp/audio-transcoder';

config({ path: resolve(__dirname, '../../.env') });

/** Debe coincidir con el valor predeterminado de `env.config.ts`. */
const DEFAULT_FUNCTION_ID = '71203149-d3b7-4460-8231-1be2543a1fca';
const DEFAULT_ENDPOINT = 'grpc.nvcf.nvidia.com:443';
const DEFAULT_LANGUAGE = 'es-US';
const DEFAULT_TIMEOUT_MS = 45_000;
const CHUNK_BYTES = 64 * 1024;
const SAMPLE_RATE_HERTZ = 16_000;
const MAX_REPORTED_AUDIO_BYTES = 16 * 1024 * 1024;

type Mode = 'raw' | 'service' | 'both';
type Level = 'info' | 'warn' | 'error';

interface Options {
  audioPath: string;
  mode: Mode;
  functionId: string;
  language: string;
  timeoutMs: number;
  endpoint: string;
  pcmInput: boolean;
}

interface RawRequest {
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

interface RawResponse {
  results?: { isFinal?: boolean; alternatives?: { transcript?: string }[] }[];
}

interface RawClient {
  streamingRecognize(
    metadata: Metadata,
    options: CallOptions,
  ): ClientDuplexStream<RawRequest, RawResponse>;
  close(): void;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.aac': 'audio/aac',
  '.amr': 'audio/amr',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'audio/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
};

function emit(level: Level, event: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    script: 'riva-stt-diagnose',
    event,
    ...data,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function usage(): void {
  console.log(`Uso: pnpm diagnose:riva <archivo-de-audio> [opciones]

Opciones:
  --mode <raw|service|both>   Modo de diagnóstico (predeterminado: both)
  --function-id <uuid>        Función NVCF (predeterminado: NVIDIA_RIVA_FUNCTION_ID o ${DEFAULT_FUNCTION_ID})
  --language <código>         Idioma Riva, p. ej. es-US (predeterminado: ${DEFAULT_LANGUAGE})
  --timeout-ms <número>       Presupuesto y deadline gRPC (predeterminado: ${DEFAULT_TIMEOUT_MS})
  --endpoint <host:puerto>    Endpoint gRPC solo para el modo raw (predeterminado: ${DEFAULT_ENDPOINT})
  --pcm                       El archivo ya es PCM16LE 16 kHz mono; no ejecutar FFmpeg (solo raw)
  --help                      Muestra esta ayuda

Ejemplo en Docker:
  docker compose -f docker-compose.dev.yml exec api \\
    npx ts-node --transpile-only --project scripts/tsconfig.json \\
    scripts/diagnostics/riva-stt-diagnose.ts /workspace/backend/tmp/audio.ogg`);
}

function fail(message: string): never {
  emit('error', 'invalid_arguments', { message });
  usage();
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const positional: string[] = [];
  let mode: Mode = 'both';
  let functionId = process.env['NVIDIA_RIVA_FUNCTION_ID']?.trim() || DEFAULT_FUNCTION_ID;
  let language = process.env['NVIDIA_RIVA_LANGUAGE_CODE']?.trim() || DEFAULT_LANGUAGE;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let endpoint = DEFAULT_ENDPOINT;
  let pcmInput = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = (): string => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail(`Falta el valor de ${arg}`);
      index += 1;
      return value;
    };
    switch (arg) {
      case '--mode':
        mode = next() as Mode;
        if (!['raw', 'service', 'both'].includes(mode)) fail(`Modo inválido: ${mode}`);
        break;
      case '--function-id':
        functionId = next();
        break;
      case '--language':
        language = next();
        break;
      case '--timeout-ms':
        timeoutMs = Number(next());
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000) {
          fail('--timeout-ms debe ser un entero mayor o igual a 1000');
        }
        break;
      case '--endpoint':
        endpoint = next();
        break;
      case '--pcm':
        pcmInput = true;
        break;
      case '--help':
      case '-h':
        usage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) fail(`Opción desconocida: ${arg}`);
        positional.push(arg);
    }
  }

  const audioPath = positional[0];
  if (!audioPath) fail('Falta la ruta del archivo de audio');
  if (positional.length > 1) fail('Solo se admite un archivo de audio');

  return {
    audioPath: resolve(audioPath),
    mode,
    functionId,
    language,
    timeoutMs,
    endpoint,
    pcmInput,
  };
}

function mimeTypeFor(audioPath: string): string {
  const mimeType = MIME_BY_EXTENSION[extname(audioPath).toLowerCase()];
  if (!mimeType)
    fail(`Extensión de audio no soportada: ${extname(audioPath) || '(sin extensión)'}`);
  return mimeType;
}

function grpcStatusName(code: number | undefined): string | undefined {
  if (code === undefined) return undefined;
  for (const [name, value] of Object.entries(grpcStatus)) {
    if (value === code) return name;
  }
  return `CODE_${code}`;
}

function errorDetails(error: unknown): {
  grpcCode?: number;
  grpcStatus?: string;
  grpcDetails?: string;
  errorName?: string;
  errorMessage?: string;
} {
  if (error && typeof error === 'object' && typeof (error as ServiceError).code === 'number') {
    const grpcError = error as ServiceError;
    return {
      grpcCode: grpcError.code,
      grpcStatus: grpcStatusName(grpcError.code),
      grpcDetails: grpcError.details?.slice(0, 1_024),
    };
  }
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message.slice(0, 1_024) };
  }
  return { errorMessage: String(error).slice(0, 1_024) };
}

async function preparePcm(options: Options, source: Buffer): Promise<Buffer> {
  if (options.pcmInput) {
    emit('info', 'pcm_input', { pcmBytes: source.byteLength });
    return source;
  }
  const startedAt = Date.now();
  const pcm = await new FfmpegAudioTranscoder().transcodeToPcm16k(source);
  emit('info', 'conversion_finished', {
    conversionDurationMs: Date.now() - startedAt,
    pcmBytes: pcm.byteLength,
    audioDurationMs: Math.floor((pcm.byteLength / (SAMPLE_RATE_HERTZ * 2)) * 1_000),
    encoding: 'LINEAR_PCM',
    sampleRateHertz: SAMPLE_RATE_HERTZ,
    audioChannelCount: 1,
  });
  return pcm;
}

function loadRawClient(endpoint: string): RawClient {
  const protoRoot = resolve(__dirname, '../../src/ai/services');
  const definition = loadSync(resolve(protoRoot, 'riva/proto/riva_asr.proto'), {
    includeDirs: [protoRoot],
    enums: String,
    bytes: Buffer,
  });
  const packages = loadPackageDefinition(definition) as unknown as {
    nvidia: {
      riva: {
        asr: {
          RivaSpeechRecognition: new (
            address: string,
            channelCredentials: ReturnType<typeof credentials.createSsl>,
          ) => RawClient;
        };
      };
    };
  };
  return new packages.nvidia.riva.asr.RivaSpeechRecognition(endpoint, credentials.createSsl());
}

async function runRaw(
  options: Options,
  pcm: Buffer,
  apiKey: string,
  signal: AbortSignal,
): Promise<{ ok: boolean; transcript?: string }> {
  emit('info', 'raw_started', {
    endpoint: options.endpoint,
    functionId: options.functionId,
    language: options.language,
    timeoutMs: options.timeoutMs,
    pcmBytes: pcm.byteLength,
    chunkBytes: CHUNK_BYTES,
    encoding: 'LINEAR_PCM',
    sampleRateHertz: SAMPLE_RATE_HERTZ,
    audioChannelCount: 1,
    interimResults: false,
  });

  const client = loadRawClient(options.endpoint);
  const metadata = new Metadata();
  metadata.set('authorization', `Bearer ${apiKey}`);
  metadata.set('function-id', options.functionId);

  const startedAt = Date.now();
  const deadline = startedAt + options.timeoutMs;

  return new Promise<{ ok: boolean; transcript?: string }>((resolveOutcome) => {
    const stream = client.streamingRecognize(metadata, { deadline });
    let settled = false;
    let offset = 0;
    let audioChunks = 0;
    let receivedEnd = false;
    const transcripts: string[] = [];
    const seenTranscripts = new Set<string>();

    const finish = (
      fields: { ok: boolean; transcript?: string } & ReturnType<typeof errorDetails>,
      cancel = false,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      stream.removeListener('drain', upload);
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('close', onClose);
      stream.removeListener('error', onError);
      if (cancel) {
        const swallow = (): undefined => undefined;
        stream.once('error', swallow);
        try {
          stream.cancel();
        } catch {
          stream.removeListener('error', swallow);
        }
      }
      const durationMs = Date.now() - startedAt;
      const outcome = {
        ...fields,
        durationMs,
        audioChunks,
        pcmBytes: pcm.byteLength,
      };
      emit(fields.ok ? 'info' : 'error', fields.ok ? 'raw_succeeded' : 'raw_failed', outcome);
      if (fields.ok && fields.transcript)
        emit('info', 'transcript', { transcript: fields.transcript });
      resolveOutcome({ ok: fields.ok, transcript: fields.transcript });
    };

    const onAbort = (): void => {
      finish({ ok: false, errorName: 'AbortError', errorMessage: 'cancelled by SIGINT' }, true);
    };

    const upload = (): void => {
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
      } catch (error) {
        finish({ ok: false, ...errorDetails(error) }, true);
      }
    };

    const onData = (response: RawResponse): void => {
      if (settled) return;
      for (const result of response.results ?? []) {
        const text = result.alternatives?.[0]?.transcript?.trim();
        if (result.isFinal && text && !seenTranscripts.has(text)) {
          seenTranscripts.add(text);
          transcripts.push(text);
        }
      }
    };

    const onError = (error: Error): void => {
      finish({ ok: false, ...errorDetails(error) });
    };
    const onEnd = (): void => {
      receivedEnd = true;
      const transcript = transcripts.join(' ').trim();
      finish(
        transcript.length > 0
          ? { ok: true, transcript }
          : {
              ok: false,
              errorName: 'AI_EMPTY_TRANSCRIPTION',
              errorMessage: 'el stream terminó sin resultados finales',
            },
      );
    };
    const onClose = (): void => {
      if (receivedEnd || settled) return;
      finish({
        ok: false,
        errorName: 'AI_ASR_STREAM_CLOSED',
        errorMessage: 'stream closed before final response',
      });
    };

    const timer = setTimeout(() => {
      finish(
        {
          ok: false,
          errorName: 'AI_RIVA_TIMEOUT',
          errorMessage: `sin respuesta en ${options.timeoutMs} ms`,
        },
        true,
      );
    }, options.timeoutMs);

    stream.on('data', onData);
    stream.once('error', onError);
    stream.once('end', onEnd);
    stream.once('close', onClose);
    signal.addEventListener('abort', onAbort, { once: true });

    if (signal.aborted) {
      onAbort();
      return;
    }

    try {
      const ready = stream.write({
        streamingConfig: {
          config: {
            encoding: 'LINEAR_PCM',
            sampleRateHertz: SAMPLE_RATE_HERTZ,
            languageCode: options.language,
            audioChannelCount: 1,
            maxAlternatives: 1,
          },
          interimResults: false,
        },
      });
      if (ready) upload();
      else stream.once('drain', upload);
    } catch (error) {
      finish({ ok: false, ...errorDetails(error) }, true);
    }
  }).finally(() => client.close());
}

async function runService(
  options: Options,
  source: Buffer,
  mimeType: string,
  signal: AbortSignal,
): Promise<{ ok: boolean; transcript?: string }> {
  const { NvidiaRivaService } = await import('../../src/ai/services/nvidia-riva.service');
  const { env } = await import('../../src/config/env.config');
  // El modo service debe ejecutar exactamente la función/idioma solicitados.
  env.NVIDIA_RIVA_FUNCTION_ID = options.functionId;
  env.NVIDIA_RIVA_LANGUAGE_CODE = options.language;
  const effectiveTimeoutMs = Math.min(options.timeoutMs, env.NVIDIA_RIVA_TIMEOUT_MS);

  emit('info', 'service_started', {
    functionId: env.NVIDIA_RIVA_FUNCTION_ID,
    language: env.NVIDIA_RIVA_LANGUAGE_CODE,
    requestedTimeoutMs: options.timeoutMs,
    effectiveTimeoutMs,
    inputBytes: source.byteLength,
    inputMimeType: mimeType,
  });
  if (effectiveTimeoutMs !== options.timeoutMs) {
    emit('warn', 'service_timeout_clamped', {
      requestedTimeoutMs: options.timeoutMs,
      effectiveTimeoutMs,
      envVar: 'NVIDIA_RIVA_TIMEOUT_MS',
    });
  }

  const service = new NvidiaRivaService();
  const startedAt = Date.now();
  try {
    const transcript = await service.transcribeAudio({
      bytes: source,
      mimeType,
      abortSignal: signal,
      timeoutMs: effectiveTimeoutMs,
    });
    emit('info', 'service_succeeded', { durationMs: Date.now() - startedAt });
    emit('info', 'transcript', { transcript });
    return { ok: true, transcript };
  } catch (error) {
    const details = errorDetails(error);
    const appError = error as { code?: unknown; statusCode?: unknown; details?: unknown };
    emit('error', 'service_failed', {
      durationMs: Date.now() - startedAt,
      appCode: typeof appError.code === 'string' ? appError.code : undefined,
      statusCode: typeof appError.statusCode === 'number' ? appError.statusCode : undefined,
      ...details,
      ...(appError.details && typeof appError.details === 'object' ? appError.details : {}),
    });
    return { ok: false };
  } finally {
    service.close();
  }
}

async function lookupFunction(
  functionId: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetch('https://api.nvcf.nvidia.com/v2/nvcf/functions', {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { functionLookupStatus: `HTTP ${response.status}` };
    const body = (await response.json()) as {
      functions?: Array<{ id?: string; name?: string; status?: string }>;
    };
    const match = body.functions?.find((candidate) => candidate.id === functionId);
    return match
      ? { functionName: match.name, functionStatus: match.status }
      : { functionName: null, functionLookupStatus: 'not-listed' };
  } catch (error) {
    return {
      functionLookupStatus: error instanceof Error ? error.message.slice(0, 256) : 'unknown',
    };
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env['NVIDIA_API_KEY']?.trim();
  if (!apiKey) {
    emit('error', 'missing_api_key', { message: 'NVIDIA_API_KEY no está definida' });
    process.exit(2);
  }

  const mimeType = options.pcmInput
    ? (MIME_BY_EXTENSION[extname(options.audioPath).toLowerCase()] ?? 'application/octet-stream')
    : mimeTypeFor(options.audioPath);
  const fileSize = statSync(options.audioPath).size;
  if (!fileSize || fileSize > MAX_REPORTED_AUDIO_BYTES) {
    emit('error', 'invalid_audio_file', {
      audioPath: options.audioPath,
      fileSize,
      maxBytes: MAX_REPORTED_AUDIO_BYTES,
    });
    process.exit(2);
  }

  const interrupt = new AbortController();
  let interrupted = false;
  process.once('SIGINT', () => {
    interrupted = true;
    emit('warn', 'sigint_received', { message: 'cancelando el RPC en curso' });
    interrupt.abort();
  });

  emit('info', 'diagnose_started', {
    mode: options.mode,
    audioPath: options.audioPath,
    inputBytes: fileSize,
    inputMimeType: mimeType,
    endpoint: options.endpoint,
    functionId: options.functionId,
    language: options.language,
    timeoutMs: options.timeoutMs,
    apiKeyPresent: true,
    ...(await lookupFunction(options.functionId, apiKey)),
  });

  const source = readFileSync(options.audioPath);
  const results: Array<{ mode: Mode; ok: boolean }> = [];

  if (options.mode === 'raw' || options.mode === 'both') {
    if (interrupted) {
      results.push({ mode: 'raw', ok: false });
    } else {
      try {
        const pcm = await preparePcm(options, source);
        const outcome = await runRaw(options, pcm, apiKey, interrupt.signal);
        results.push({ mode: 'raw', ok: outcome.ok });
      } catch (error) {
        emit('error', 'raw_preparation_failed', { ...errorDetails(error) });
        results.push({ mode: 'raw', ok: false });
      }
    }
  }

  if (options.mode === 'service' || options.mode === 'both') {
    if (interrupted) {
      results.push({ mode: 'service', ok: false });
    } else if (options.pcmInput) {
      emit('error', 'service_pcm_unsupported', {
        message: 'El modo service requiere un contenedor de audio, no PCM crudo',
      });
      results.push({ mode: 'service', ok: false });
    } else {
      const outcome = await runService(options, source, mimeType, interrupt.signal);
      results.push({ mode: 'service', ok: outcome.ok });
    }
  }

  const ok = results.length > 0 && results.every((result) => result.ok);
  emit(ok ? 'info' : 'error', 'diagnose_finished', { ok, results, interrupted });
  process.exitCode = ok ? 0 : 1;
}

void main().catch((error: unknown) => {
  emit('error', 'diagnose_crashed', { ...errorDetails(error) });
  process.exit(1);
});
