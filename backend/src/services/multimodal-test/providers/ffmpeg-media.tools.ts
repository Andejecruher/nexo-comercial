import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AppError } from '../../../utils/app-error';
import { createStructuredLogger } from '../../../utils/structured-logger';
import type {
  MediaMetadataProvider,
  VideoAudioExtractor,
  VideoAudioExtractorOutput,
  VideoFrameExtractor,
  VideoFrameExtractorOutput,
} from '../contracts';

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_STDERR_BYTES = 4 * 1024;
const TOOL_TIMEOUT_MS = 30_000;
const TERMINATION_GRACE_MS = 1_000;
const FFMPEG_FLAGS = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
const log = createStructuredLogger('FfmpegMediaTools');

type MediaToolDiagnostic = {
  executable: string;
  exitCode?: number | null;
  signal?: string | null;
  stderr?: string;
  durationMs: number;
};

class MediaToolFailure extends Error {
  constructor(
    readonly code: string,
    readonly diagnostic: MediaToolDiagnostic,
  ) {
    super(code);
  }
}

function executableName(executable: string): string {
  const normalized = executable.replace(/[\\/]+$/, '');
  return normalized.split(/[\\/]/).pop() || 'unknown';
}

function sanitizeStderr(stderr: Buffer): string | undefined {
  if (!stderr.length) return undefined;
  const text = stderr
    .toString('utf8')
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g'), '')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
        ? character
        : ' ';
    })
    .join('')
    .replace(/["'](?:[A-Za-z]:\\|\/)[^'"]*["']/g, '[path]')
    .replace(
      /(?:[A-Za-z]:\\|\/)[^'"]*?(?=\s+(?:authorization\s*:|[A-Za-z_][\w-]*\s*[:=])|$)/gi,
      '[path]',
    )
    .replace(/(?:[A-Za-z]:\\|\/)[^\s'"`]+/g, '[path]')
    .replace(/authorization\s*:\s*(?:[^\s]+\s+)?[^\s]+/gi, 'Authorization: [redacted]')
    .replace(
      /\b(api[_-]?key|access[_-]?token|token|password|secret)\s*[:=]\s*[^\s]+/gi,
      '$1=[redacted]',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
}

/** Same injection seam as AudioTranscodeRunner; tests never require binaries. */
export type MediaToolRunner = (
  args: readonly string[],
  source: Buffer,
  abortSignal?: AbortSignal,
  pipeInput?: boolean,
) => Promise<Buffer>;

async function withTemporaryInput<T>(
  source: Buffer,
  run: (inputFilePath: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'voz-media-'));
  const inputFilePath = join(directory, 'input.media');
  try {
    await writeFile(inputFilePath, source, { mode: 0o600 });
    return await run(inputFilePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Bounded, cancellable pipe runner following the existing audio-transcoder pattern. */
function runMediaTool(
  executable: string,
  args: readonly string[],
  source: Buffer,
  abortSignal?: AbortSignal,
  pipeInput = true,
): Promise<Buffer> {
  abortSignal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams;
    } catch {
      reject(new MediaToolFailure('UNAVAILABLE', {
        executable: executableName(executable),
        durationMs: Date.now() - startedAt,
      }));
      return;
    }
    const stdout: Buffer[] = [];
    let stderr = Buffer.alloc(0);
    let outputSize = 0;
    let settled = false;
    let requestedFailure: { code: string; details: Pick<MediaToolDiagnostic, 'exitCode' | 'signal'> } | undefined;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    const diagnostic = (
      details: Pick<MediaToolDiagnostic, 'exitCode' | 'signal'> = {},
    ): MediaToolDiagnostic => {
      const sanitizedStderr = sanitizeStderr(stderr);
      return {
        executable: executableName(executable),
        ...details,
        ...(sanitizedStderr === undefined ? {} : { stderr: sanitizedStderr }),
        durationMs: Date.now() - startedAt,
      };
    };

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      abortSignal?.removeEventListener('abort', onAbort);
      callback();
    };
    const requestTermination = (
      code: string,
      details: Pick<MediaToolDiagnostic, 'exitCode' | 'signal'> = {},
    ) => {
      if (settled || requestedFailure) return;
      requestedFailure = { code, details };
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        if (!settled && child.exitCode === null) child.kill('SIGKILL');
      }, TERMINATION_GRACE_MS);
    };
    const timeout = setTimeout(() => requestTermination('TIMEOUT'), TOOL_TIMEOUT_MS);
    const onAbort = () => requestTermination('CANCELLED');
    abortSignal?.addEventListener('abort', onAbort, { once: true });

    child.once('error', () => {
      settle(() => reject(new MediaToolFailure('UNAVAILABLE', diagnostic())));
    });
    child.stdin.once('error', () => requestTermination('INPUT_FAILED'));
    child.stdout.once('error', () => requestTermination('FAILED'));
    child.stderr.once('error', () => requestTermination('FAILED'));
    child.stdout.on('data', (chunk: Buffer) => {
      if (settled) return;
      outputSize += chunk.length;
      if (outputSize > MAX_OUTPUT_BYTES) {
        requestTermination('OUTPUT_TOO_LARGE');
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const remaining = MAX_STDERR_BYTES - stderr.length;
      if (remaining > 0) stderr = Buffer.concat([stderr, chunk.subarray(0, remaining)]);
    });
    child.once('close', (code, signal) => {
      if (requestedFailure) {
        settle(() => reject(new MediaToolFailure(requestedFailure!.code, diagnostic({
          ...requestedFailure!.details,
          exitCode: code,
          signal,
        }))));
        return;
      }
      if (code !== 0) {
        settle(() => reject(new MediaToolFailure('FAILED', diagnostic({ exitCode: code, signal }))));
        return;
      }
      settle(() => resolve(Buffer.concat(stdout)));
    });

    if (abortSignal?.aborted) {
      onAbort();
      return;
    }
    child.stdin.end(pipeInput ? source : undefined);
  });
}

const runFfmpeg: MediaToolRunner = (args, source, signal, pipeInput) =>
  runMediaTool(process.env.FFMPEG_PATH || 'ffmpeg', args, source, signal, pipeInput);
const runFfprobe: MediaToolRunner = (args, source, signal, pipeInput) =>
  runMediaTool(process.env.FFPROBE_PATH || 'ffprobe', args, source, signal, pipeInput);

const FAILURE_SUFFIXES = new Set([
  'TIMEOUT', 'CANCELLED', 'UNAVAILABLE', 'INPUT_FAILED', 'OUTPUT_TOO_LARGE', 'EMPTY', 'FAILED',
]);

async function executeTool(
  runner: MediaToolRunner,
  args: readonly string[],
  source: Buffer,
  signal: AbortSignal | undefined,
  prefix: string,
  context: { correlationId?: string; stage: string; provider: string },
  options: { allowEmptyOutput?: boolean; pipeInput?: boolean } = {},
): Promise<Buffer> {
  const startedAt = Date.now();
  try {
    if (signal?.aborted) throw new Error('CANCELLED');
    const output = options.pipeInput === false
      ? await runner(args, source, signal, false)
      : await runner(args, source, signal);
    if (signal?.aborted) throw new Error('CANCELLED');
    if (!options.allowEmptyOutput && !output.length) throw new Error('EMPTY');
    if (output.length > MAX_OUTPUT_BYTES) throw new Error('OUTPUT_TOO_LARGE');
    return output;
  } catch (error) {
    const suffix = signal?.aborted ? 'CANCELLED'
      : error instanceof Error && FAILURE_SUFFIXES.has(error.message) ? error.message : 'FAILED';
    const diagnostic = error instanceof MediaToolFailure ? error.diagnostic : undefined;
    log('warn', 'media.tool_failed', context.correlationId, {
      stage: context.stage,
      provider: context.provider,
      ...(diagnostic?.executable === undefined ? {} : { executable: diagnostic.executable }),
      ...(diagnostic?.exitCode === undefined ? {} : { exitCode: diagnostic.exitCode }),
      ...(diagnostic?.signal === undefined ? {} : { signal: diagnostic.signal }),
      ...(diagnostic?.stderr === undefined ? {} : { stderr: diagnostic.stderr }),
      errorCode: suffix,
      durationMs: diagnostic?.durationMs ?? Date.now() - startedAt,
      inputBytes: source.byteLength,
      inputExists: Buffer.isBuffer(source),
    });
    throw new AppError(
      'No se pudo procesar el contenido multimedia',
      suffix === 'TIMEOUT' ? 504 : 400,
      prefix === 'FFPROBE' ? 'FFPROBE_FAILED' : `${prefix}_${suffix}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

/** ffprobe is a media probe; documents must be routed to document-specific adapters. */
function supportsFfprobeMimeType(mimeType: string): boolean {
  return mimeType.startsWith('audio/') || mimeType.startsWith('video/');
}

export class FfprobeMetadataProvider implements MediaMetadataProvider {
  readonly id = 'ffprobe';
  readonly supportedMimeTypes: readonly string[] = [];
  readonly supportsMimeType = supportsFfprobeMimeType;

  constructor(private readonly runner: MediaToolRunner = runFfprobe) {}

  async probe(input: Parameters<MediaMetadataProvider['probe']>[0]): Promise<Record<string, unknown>> {
    const output = await withTemporaryInput(input.buffer, (inputFilePath) =>
      executeTool(this.runner, [
        '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', inputFilePath,
      ], input.buffer, input.abortSignal, 'FFPROBE', {
        correlationId: input.correlationId,
        stage: 'metadata',
        provider: this.id,
      }, { pipeInput: false }),
    );
    try {
      const parsed: unknown = JSON.parse(output.toString('utf8'));
      if (!isRecord(parsed)) throw new Error('Invalid metadata');
      const format = isRecord(parsed.format) ? parsed.format : {};
      const streams = Array.isArray(parsed.streams) ? parsed.streams.filter(isRecord) : [];
      const video = streams.find((stream) => stream.codec_type === 'video');
      const audio = streams.find((stream) => stream.codec_type === 'audio');
      const metadata: Record<string, unknown> = {
        durationSeconds: finiteNumber(format.duration),
        container: typeof format.format_name === 'string' ? format.format_name : undefined,
        videoCodec: typeof video?.codec_name === 'string' ? video.codec_name : undefined,
        widthPx: finiteNumber(video?.width),
        heightPx: finiteNumber(video?.height),
        audioCodec: typeof audio?.codec_name === 'string' ? audio.codec_name : undefined,
        sampleRateHz: finiteNumber(audio?.sample_rate),
      };
      return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined));
    } catch {
      throw new AppError('No se pudo leer la metadata del archivo', 400, 'FFPROBE_FAILED');
    }
  }
}

export class FfmpegVideoAudioExtractor implements VideoAudioExtractor {
  readonly id = 'ffmpeg-audio';
  readonly supportedMimeTypes: readonly string[] = [];

  constructor(private readonly runner: MediaToolRunner = runFfmpeg) {}

  async extractAudio(input: Parameters<VideoAudioExtractor['extractAudio']>[0]): Promise<VideoAudioExtractorOutput> {
    const startedAt = Date.now();
    const audio = await withTemporaryInput(input.buffer, (inputFilePath) =>
      executeTool(this.runner, [
        '-i', inputFilePath, '-vn', '-map', '0:a?', '-c:a', 'libmp3lame', '-f', 'mp3', 'pipe:1',
      ], input.buffer, input.abortSignal, 'VIDEO_AUDIO_EXTRACTION', {
        correlationId: input.correlationId,
        stage: 'audio_extraction',
        provider: this.id,
      }, { allowEmptyOutput: true, pipeInput: false }),
    );
    return { audio, audioMimeType: 'audio/mpeg', providerId: this.id, durationMs: Date.now() - startedAt };
  }
}

/** Splits complete JPEG SOI/EOI pairs, ignoring garbage and an incomplete tail. */
export function splitMjpegStream(stream: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  const soi = Buffer.from([0xff, 0xd8]);
  const eoi = Buffer.from([0xff, 0xd9]);
  let offset = 0;
  while (offset < stream.length) {
    const start = stream.indexOf(soi, offset);
    if (start === -1) break;
    const end = stream.indexOf(eoi, start + 2);
    if (end === -1) break;
    frames.push(stream.subarray(start, end + 2));
    offset = end + 2;
  }
  return frames;
}

export class FfmpegVideoFrameExtractor implements VideoFrameExtractor {
  readonly id = 'ffmpeg-frames';
  readonly supportedMimeTypes: readonly string[] = [];

  constructor(private readonly runner: MediaToolRunner = runFfmpeg) {}

  async extractFrames(input: Parameters<VideoFrameExtractor['extractFrames']>[0]): Promise<VideoFrameExtractorOutput> {
    if (!Number.isSafeInteger(input.maxFrames) || input.maxFrames < 1) {
      throw new AppError('El límite de frames debe ser un entero positivo', 400, 'VIDEO_FRAME_EXTRACTION_INVALID_LIMIT');
    }
    const startedAt = Date.now();
    // One frame per second is a bounded sampling approximation, not a scene detector.
    const output = await executeTool(this.runner, [
      ...FFMPEG_FLAGS, '-i', 'pipe:0', '-vf', 'fps=1', '-frames:v', String(input.maxFrames),
      '-f', 'mjpeg', 'pipe:1',
    ], input.buffer, input.abortSignal, 'VIDEO_FRAME_EXTRACTION', {
      correlationId: input.correlationId,
      stage: 'frame_extraction',
      provider: this.id,
    });
    const frames = splitMjpegStream(output).slice(0, input.maxFrames)
      .map((bytes, index) => ({ index, bytes }));
    if (!frames.length) {
      throw new AppError('No se extrajeron frames del video', 400, 'VIDEO_FRAME_EXTRACTION_EMPTY');
    }
    return { frames, providerId: this.id, durationMs: Date.now() - startedAt };
  }
}
