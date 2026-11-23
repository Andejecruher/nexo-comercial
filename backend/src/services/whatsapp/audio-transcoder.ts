import { spawn } from 'child_process';
import { AppError } from '../../utils/app-error';

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const TRANSCODE_TIMEOUT_MS = 30_000;

const OGG_OPUS_ARGS = [
  '-hide_banner',
  '-loglevel',
  'error',
  '-nostdin',
  '-i',
  'pipe:0',
  '-vn',
  '-ac',
  '1',
  '-c:a',
  'libopus',
  '-b:a',
  '32k',
  '-vbr',
  'on',
  '-application',
  'voip',
  '-f',
  'ogg',
  'pipe:1',
] as const;

const PCM_16K_ARGS = [
  '-hide_banner',
  '-loglevel',
  'error',
  '-nostdin',
  '-i',
  'pipe:0',
  '-vn',
  '-ac',
  '1',
  '-ar',
  '16000',
  '-c:a',
  'pcm_s16le',
  '-f',
  's16le',
  'pipe:1',
] as const;

export interface AudioTranscoder {
  transcodeToOggOpus(source: Buffer): Promise<Buffer>;
}

export type AudioTranscodeRunner = (
  args: readonly string[],
  source: Buffer,
  abortSignal?: AbortSignal,
) => Promise<Buffer>;

async function runFfmpeg(
  args: readonly string[],
  source: Buffer,
  abortSignal?: AbortSignal,
): Promise<Buffer> {
  abortSignal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputSize = 0;
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      abortSignal?.removeEventListener('abort', onAbort);
      callback();
    };
    const fail = (message: string) => settle(() => reject(new Error(message)));
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      fail('AUDIO_TRANSCODE_TIMEOUT');
    }, TRANSCODE_TIMEOUT_MS);
    const onAbort = () => {
      child.kill('SIGKILL');
      settle(() => reject(new Error('AUDIO_TRANSCODE_CANCELLED')));
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });

    child.once('error', () => fail('AUDIO_TRANSCODER_UNAVAILABLE'));
    child.stdin.once('error', () => fail('AUDIO_TRANSCODER_INPUT_FAILED'));
    child.stdout.on('data', (chunk: Buffer) => {
      outputSize += chunk.length;
      if (outputSize > MAX_AUDIO_BYTES) {
        child.kill('SIGKILL');
        fail('AUDIO_TRANSCODE_OUTPUT_TOO_LARGE');
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('close', (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString('utf8').trim();
        fail(`AUDIO_TRANSCODE_FAILED${detail ? `: ${detail.slice(0, 512)}` : ''}`);
        return;
      }
      settle(() => resolve(Buffer.concat(stdout)));
    });

    child.stdin.end(source);
  });
}

export class FfmpegAudioTranscoder implements AudioTranscoder {
  constructor(private readonly runner: AudioTranscodeRunner = runFfmpeg) {}

  /** PCM sin cabecera, mono, 16 bits LE y 16 kHz para el contrato de NVIDIA Riva. */
  async transcodeToPcm16k(source: Buffer, abortSignal?: AbortSignal): Promise<Buffer> {
    abortSignal?.throwIfAborted();
    if (!source.byteLength || source.byteLength > MAX_AUDIO_BYTES) {
      throw AppError.badRequest('Audio vacío o mayor a 16 MB');
    }
    try {
      const output = await this.runner(PCM_16K_ARGS, source, abortSignal);
      abortSignal?.throwIfAborted();
      if (
        !output.byteLength ||
        output.byteLength > MAX_AUDIO_BYTES ||
        output.byteLength % 2 !== 0
      ) {
        throw AppError.badRequest('La conversión produjo audio PCM vacío o fuera de los límites');
      }
      return output;
    } catch (error) {
      abortSignal?.throwIfAborted();
      if (error instanceof AppError) throw error;
      throw AppError.badRequest('No se pudo convertir el audio para transcripción');
    }
  }

  async transcodeToOggOpus(source: Buffer): Promise<Buffer> {
    if (!source.byteLength) throw AppError.badRequest('Audio vacío');
    if (source.byteLength > MAX_AUDIO_BYTES) throw AppError.badRequest('El audio supera 16 MB');

    try {
      const output = await this.runner(OGG_OPUS_ARGS, source);
      if (!output.byteLength) throw new Error('AUDIO_TRANSCODE_EMPTY');
      return output;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw AppError.badRequest('No se pudo convertir el audio a OGG Opus');
    }
  }
}
