import { describe, expect, it, jest } from '@jest/globals';
import { access, chmod, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type {
  MediaMetadataProvider,
  MultimodalTestFile,
  SttProvider,
  VideoAudioExtractor,
  VideoFrameExtractor,
} from '../../../services/multimodal-test/contracts';
import { ProviderRegistry } from '../../../services/multimodal-test/provider-registry';
import { VideoTestPipeline } from '../../../services/multimodal-test/pipelines/video-test.pipeline';
import {
  FfmpegVideoAudioExtractor,
  FfmpegVideoFrameExtractor,
  FfprobeMetadataProvider,
  MediaToolRunner,
  splitMjpegStream,
} from '../../../services/multimodal-test/providers/ffmpeg-media.tools';
import { AppError } from '../../../utils/app-error';

jest.mock('../../../config/env.config', () => ({
  env: {
    MULTIMODAL_TEST_VIDEO_TIMEOUT_MS: 30_000,
    MULTIMODAL_TEST_MAX_RETRIES: 0,
    MULTIMODAL_TEST_RETRY_DELAY_MS: 0,
    MULTIMODAL_TEST_MAX_FILE_MB: 1,
  },
}));

const file: MultimodalTestFile = {
  filename: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video'),
};
const wav = Buffer.from('wav');
const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]);

function setup() {
  const extractAudio = jest.fn<VideoAudioExtractor['extractAudio']>().mockResolvedValue({
    audio: wav, audioMimeType: 'audio/mpeg', providerId: 'audio', durationMs: 1,
  });
  const transcribe = jest.fn<SttProvider['transcribe']>().mockResolvedValue({
    transcript: 'A reusable transcript', providerId: 'stt', durationMs: 2,
    metadata: { language: 'en' },
  });
  const probe = jest.fn<MediaMetadataProvider['probe']>().mockResolvedValue({
    durationSeconds: 12, widthPx: 640, heightPx: 480, videoCodec: 'h264',
  });
  const extractFrames = jest.fn<VideoFrameExtractor['extractFrames']>().mockResolvedValue({
    frames: [{ index: 0, bytes: jpeg }], providerId: 'frames', durationMs: 1,
  });
  const registry = new ProviderRegistry()
    .register('videoAudio', { id: 'audio', supportedMimeTypes: [], extractAudio })
    .register('stt', { id: 'stt', supportedMimeTypes: ['audio/mpeg'], transcribe });
  return {
    registry, pipeline: new VideoTestPipeline(registry), extractAudio, transcribe, probe,
    extractFrames,
    metadataProvider: { id: 'metadata', supportedMimeTypes: [], probe },
    frameProvider: { id: 'frames', supportedMimeTypes: [], extractFrames },
  };
}

describe('VideoTestPipeline', () => {
  it('completes metadata, audio extraction and STT with ordered timed steps', async () => {
    const s = setup();
    s.registry.register('mediaMetadata', s.metadataProvider);
    const result = await s.pipeline.run(file, { correlationId: 'video-test' });
    expect(result).toMatchObject({
      kind: 'video', correlationId: 'video-test', filename: file.filename,
      mimeType: file.mimeType, status: 'completed', errors: [],
      payload: { transcript: 'A reusable transcript' },
      metadata: { durationSeconds: 12, widthPx: 640, heightPx: 480, videoCodec: 'h264', language: 'en' },
      providersUsed: ['metadata', 'audio', 'stt'],
    });
    expect(result.steps.map(({ stage, status }) => [stage, status])).toEqual([
      ['validation', 'ok'], ['metadata', 'ok'], ['audio_extraction', 'ok'], ['stt', 'ok'],
      ['frame_extraction', 'skipped'], ['summary', 'skipped'],
    ]);
    for (const step of result.steps) {
      expect(Number.isFinite(Date.parse(step.startedAt))).toBe(true);
      expect(Number.isFinite(Date.parse(step.endedAt))).toBe(true);
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(s.transcribe).toHaveBeenCalledWith(expect.objectContaining({
      buffer: wav, mimeType: 'audio/mpeg', correlationId: 'video-test', abortSignal: expect.any(AbortSignal),
    }));
    expect(result.rawProviderResponse).toBeUndefined();
  });

  it('fails at audio extraction and does not call STT', async () => {
    const s = setup();
    s.extractAudio.mockRejectedValue(new AppError('No se pudo extraer audio', 400, 'VIDEO_AUDIO_EXTRACTION_FAILED'));
    const result = await s.pipeline.run(file);
    expect(result.status).toBe('failed');
    expect(result.payload).toEqual({});
    expect(result.errors).toEqual([expect.objectContaining({
      stage: 'audio_extraction', code: 'VIDEO_AUDIO_EXTRACTION_FAILED',
    })]);
    expect(result.steps).toContainEqual(expect.objectContaining({ stage: 'audio_extraction', status: 'failed' }));
    expect(s.transcribe).not.toHaveBeenCalled();
  });

  it('retains the transcript and returns partial when metadata fails', async () => {
    const s = setup();
    s.probe.mockRejectedValue(new AppError('No se pudo leer metadata', 400, 'FFPROBE_FAILED'));
    s.registry.register('mediaMetadata', s.metadataProvider);
    const result = await s.pipeline.run(file);
    expect(result.status).toBe('partial');
    expect(result.payload.transcript).toBe('A reusable transcript');
    expect(result.errors).toEqual([expect.objectContaining({ stage: 'metadata', code: 'FFPROBE_FAILED' })]);
    expect(result.steps).toContainEqual(expect.objectContaining({ stage: 'metadata', status: 'failed' }));
  });

  it('records frame counts and sizes without embedding frame bytes', async () => {
    const s = setup();
    s.registry.register('videoFrames', s.frameProvider);
    const result = await s.pipeline.run(file, { extractFrames: true });
    expect(result.status).toBe('completed');
    expect(result.metadata).toMatchObject({ frameCount: 1, frameSizesBytes: [jpeg.length] });
    expect(s.extractFrames).toHaveBeenCalledWith(expect.objectContaining({ maxFrames: 3, buffer: file.buffer }));
    expect(result.steps).toContainEqual(expect.objectContaining({ stage: 'frame_extraction', status: 'ok' }));
    expect(JSON.stringify(result)).not.toContain('"type":"Buffer"');
    expect(result.payload).not.toHaveProperty('frames');
  });

  it('skips frames when disabled even when an extractor is registered', async () => {
    const s = setup();
    s.registry.register('videoFrames', s.frameProvider);
    const result = await s.pipeline.run(file, { extractFrames: false });
    expect(s.extractFrames).not.toHaveBeenCalled();
    expect(result.steps).toContainEqual(expect.objectContaining({
      stage: 'frame_extraction', status: 'skipped', metadata: { reason: 'frame extraction not requested' },
    }));
  });

  it('skips missing optional providers with explicit reasons', async () => {
    const result = await setup().pipeline.run(file, { extractFrames: true, summary: true });
    expect(result.status).toBe('completed');
    for (const [stage, reason] of [
      ['metadata', 'no metadata provider registered'],
      ['frame_extraction', 'no frame extractor registered'],
      ['summary', 'no summarizer provider registered'],
    ]) {
      expect(result.steps).toContainEqual(expect.objectContaining({ stage, status: 'skipped', metadata: { reason } }));
    }
  });

  it.each([
    ['unsupported mime', { mimeType: 'audio/wav' }, 'VALIDATION_UNSUPPORTED_MIME'],
    ['empty buffer', { buffer: Buffer.alloc(0) }, 'VALIDATION_EMPTY_FILE'],
    ['oversized buffer despite declared size', { buffer: Buffer.alloc(1024 * 1024 + 1), sizeBytes: 1 }, 'VALIDATION_FILE_TOO_LARGE'],
  ])('rejects %s without calling providers', async (_name, changes, code) => {
    const s = setup();
    const result = await s.pipeline.run({ ...file, ...(changes as Partial<MultimodalTestFile>) });
    expect(result.status).toBe('failed');
    expect(result.payload).toEqual({});
    expect(result.providersUsed).toEqual([]);
    expect(result.errors).toEqual([expect.objectContaining({ stage: 'validation', code })]);
    expect(result.steps).toHaveLength(1);
    expect(s.extractAudio).not.toHaveBeenCalled();
    expect(s.transcribe).not.toHaveBeenCalled();
  });

  it.each(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/3gpp', 'video/x-msvideo'])(
    'accepts %s and the exact file size limit', async (mimeType) => {
      const result = await setup().pipeline.run({ ...file, mimeType, buffer: Buffer.alloc(1024 * 1024) });
      expect(result.status).toBe('completed');
    },
  );

  it('uses the preferred STT provider and falls back after a failed audio provider', async () => {
    const s = setup();
    s.extractAudio.mockRejectedValue(new AppError('Sin audio', 400, 'VIDEO_AUDIO_EXTRACTION_FAILED'));
    s.registry.register('videoAudio', {
      id: 'backup-audio', supportedMimeTypes: [],
      extractAudio: async () => ({ audio: wav, audioMimeType: 'audio/mpeg', providerId: 'backup-audio', durationMs: 0 }),
    });
    s.registry.register('stt', {
      id: 'preferred', supportedMimeTypes: ['audio/mpeg'],
      transcribe: async () => ({ transcript: 'Preferred', providerId: 'preferred', durationMs: 0 }),
    });
    const result = await s.pipeline.run(file, { provider: 'preferred' });
    expect(result.status).toBe('partial');
    expect(result.payload.transcript).toBe('Preferred');
    expect(result.providersUsed).toEqual(['backup-audio', 'preferred']);
    expect(s.transcribe).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('fails when STT returns no usable transcript (%j)', async (transcript) => {
    const s = setup();
    s.transcribe.mockResolvedValue({ transcript, providerId: 'stt', durationMs: 0 });
    const result = await s.pipeline.run(file);
    expect(result.status).toBe('failed');
    expect(result.payload.transcript).toBeUndefined();
    expect(result.errors).toEqual([expect.objectContaining({ stage: 'stt', code: 'STT_EMPTY_TRANSCRIPT' })]);
  });

  it('returns failed for missing required providers', async () => {
    const result = await new VideoTestPipeline(new ProviderRegistry()).run(file);
    expect(result.status).toBe('failed');
    expect(result.errors).toEqual([expect.objectContaining({ stage: 'audio_extraction', code: 'VIDEOAUDIO_NO_PROVIDER' })]);
  });

  it('retains a transcript when frame extraction fails', async () => {
    const s = setup();
    s.extractFrames.mockRejectedValue(new AppError('Sin frames', 400, 'VIDEO_FRAME_EXTRACTION_FAILED'));
    s.registry.register('videoFrames', s.frameProvider);
    const result = await s.pipeline.run(file, { extractFrames: true, maxFrames: 2 });
    expect(result.status).toBe('partial');
    expect(result.payload.transcript).toBe('A reusable transcript');
    expect(result.errors).toEqual([expect.objectContaining({ stage: 'frame_extraction' })]);
    expect(s.extractFrames).toHaveBeenCalledWith(expect.objectContaining({ maxFrames: 2 }));
  });

  it('summarizes only when requested and a provider exists', async () => {
    const s = setup();
    const summarize = jest.fn(async () => ({ summary: 'Short summary', providerId: 'summary', durationMs: 0 }));
    s.registry.register('summarizer', { id: 'summary', supportedMimeTypes: [], summarize });
    const skipped = await s.pipeline.run(file);
    expect(summarize).not.toHaveBeenCalled();
    expect(skipped.steps).toContainEqual(expect.objectContaining({ stage: 'summary', status: 'skipped' }));
    const result = await s.pipeline.run(file, { summary: true });
    expect(result.status).toBe('completed');
    expect(result.payload.summaryText).toBe('Short summary');
    expect(summarize).toHaveBeenCalledWith(expect.objectContaining({ text: 'A reusable transcript' }));
  });
});

describe('splitMjpegStream', () => {
  it('extracts a single complete JPEG', () => expect(splitMjpegStream(jpeg)).toEqual([jpeg]));
  it('extracts two frames in order', () => {
    const second = Buffer.from([0xff, 0xd8, 3, 0xff, 0xd9]);
    expect(splitMjpegStream(Buffer.concat([jpeg, second]))).toEqual([jpeg, second]);
  });
  it('ignores leading and trailing garbage and incomplete frames', () => {
    expect(splitMjpegStream(Buffer.concat([Buffer.from([7]), jpeg, Buffer.from([8, 0xff, 0xd8, 9])]))).toEqual([jpeg]);
    expect(splitMjpegStream(Buffer.from([0xff, 0xd9, 7]))).toEqual([]);
  });
});

describe('ffmpeg media tools with injected runners', () => {
  it('parses metadata from the first audio and video streams', async () => {
    let inputFilePath = '';
    const runner = jest.fn<MediaToolRunner>().mockImplementation(async (args) => {
      inputFilePath = args[args.length - 1]!;
      await expect(access(inputFilePath)).resolves.toBeUndefined();
      return Buffer.from(JSON.stringify({
      format: { duration: '12.5', format_name: 'mov,mp4' },
      streams: [
        { codec_type: 'video', codec_name: 'h264', width: 640, height: 480 },
        { codec_type: 'video', codec_name: 'vp9', width: 100, height: 100 },
        { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000' },
      ],
      }));
    });
    const provider = new FfprobeMetadataProvider(runner);
    expect(provider.id).toBe('ffprobe');
    expect(provider.supportedMimeTypes).toEqual([]);
    expect(await provider.probe(file)).toEqual({
      durationSeconds: 12.5, container: 'mov,mp4', videoCodec: 'h264', widthPx: 640,
      heightPx: 480, audioCodec: 'aac', sampleRateHz: 48000,
    });
    expect(runner).toHaveBeenCalledWith([
      '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', inputFilePath,
    ], file.buffer, undefined, false);
    await expect(access(inputFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['not json', 'null', '[]'])('normalizes malformed ffprobe output (%s)', async (output) => {
    await expect(new FfprobeMetadataProvider(async () => Buffer.from(output)).probe(file))
      .rejects.toMatchObject({ code: 'FFPROBE_FAILED' });
  });

  it('omits unavailable and non-finite metadata', async () => {
    const provider = new FfprobeMetadataProvider(async () => Buffer.from('{"format":{"duration":"N/A"}}'));
    expect(await provider.probe(file)).toEqual({});
  });

  it('maps runner failures without exposing stderr', async () => {
    const runner: MediaToolRunner = async () => { throw new Error('private stderr'); };
    for (const [run, code] of [
      [() => new FfprobeMetadataProvider(runner).probe(file), 'FFPROBE_FAILED'],
      [() => new FfmpegVideoAudioExtractor(runner).extractAudio(file), 'VIDEO_AUDIO_EXTRACTION_FAILED'],
      [() => new FfmpegVideoFrameExtractor(runner).extractFrames({ ...file, maxFrames: 3 }), 'VIDEO_FRAME_EXTRACTION_FAILED'],
    ] as const) {
      await expect(run()).rejects.toMatchObject({ code });
      await expect(run()).rejects.not.toHaveProperty('message', 'private stderr');
    }
  });

  it('logs safe tool-failure diagnostics without changing the public error', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const runner: MediaToolRunner = async () => { throw new Error('private stderr'); };

    await expect(new FfmpegVideoAudioExtractor(runner).extractAudio({
      ...file,
      correlationId: 'video-tool-diagnostics',
    })).rejects.toMatchObject({
      code: 'VIDEO_AUDIO_EXTRACTION_FAILED',
      message: 'No se pudo procesar el contenido multimedia',
    });

    const entry = JSON.parse(warn.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(entry).toMatchObject({
      service: 'FfmpegMediaTools',
      event: 'media.tool_failed',
      correlationId: 'video-tool-diagnostics',
      stage: 'audio_extraction',
      provider: 'ffmpeg-audio',
      errorCode: 'FAILED',
      inputBytes: file.buffer.byteLength,
      inputExists: true,
    });
    expect(JSON.stringify(entry)).not.toContain('private stderr');
    warn.mockRestore();
  });

  it.each([
    ['unavailable executable', 'UNAVAILABLE', 'VIDEO_AUDIO_EXTRACTION_UNAVAILABLE'],
    ['closed child input', 'INPUT_FAILED', 'VIDEO_AUDIO_EXTRACTION_INPUT_FAILED'],
  ])('preserves the existing audio error code for %s', async (_scenario, failure, code) => {
    const runner: MediaToolRunner = async () => { throw new Error(failure); };
    await expect(new FfmpegVideoAudioExtractor(runner).extractAudio(file)).rejects.toMatchObject({
      code,
      message: 'No se pudo procesar el contenido multimedia',
    });
  });

  it('captures bounded and sanitized actual-process diagnostics only in internal logs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voz-ffmpeg-test-'));
    const executable = join(dir, 'ffmpeg-failure');
    const previous = process.env.FFMPEG_PATH;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await writeFile(
        executable,
        '#!/bin/sh\ncat >/dev/null\nprintf "bad input /private/citizen records.mp4 Authorization: Bearer CANARY-TOKEN api_key=CANARY-KEY\\n" >&2\nexit 7\n',
      );
      await chmod(executable, 0o700);
      process.env.FFMPEG_PATH = executable;

      await expect(new FfmpegVideoAudioExtractor().extractAudio({
        ...file,
        correlationId: 'video-real-process-failure',
      })).rejects.toMatchObject({ code: 'VIDEO_AUDIO_EXTRACTION_FAILED' });

      const entry = JSON.parse(warn.mock.calls[0]![0] as string) as Record<string, unknown>;
      expect(entry).toMatchObject({
        correlationId: 'video-real-process-failure',
        executable: 'ffmpeg-failure',
        exitCode: 7,
        stderr: 'bad input [path] Authorization: [redacted] api_key=[redacted]',
      });
    } finally {
      if (previous === undefined) delete process.env.FFMPEG_PATH;
      else process.env.FFMPEG_PATH = previous;
      warn.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('redacts quoted paths, Basic credentials, and a secret before bounded stderr capture', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voz-ffmpeg-test-'));
    const executable = join(dir, 'ffmpeg-failure');
    const previous = process.env.FFMPEG_PATH;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await writeFile(
        executable,
        '#!/bin/sh\ncat >/dev/null\nprintf "bad input \\"/private/citizen records.mp4\\" Authorization: Basic CANARY-BASIC api_key=CANARY-TAIL\\n" >&2\nhead -c 4084 /dev/zero | tr "\\000" "x" >&2\nexit 7\n',
      );
      await chmod(executable, 0o700);
      process.env.FFMPEG_PATH = executable;

      await expect(new FfmpegVideoAudioExtractor().extractAudio(file)).rejects.toMatchObject({
        code: 'VIDEO_AUDIO_EXTRACTION_FAILED',
      });

      const entry = JSON.parse(warn.mock.calls[0]![0] as string) as Record<string, unknown>;
      const serialized = JSON.stringify(entry);
      expect(entry.stderr).toContain('bad input [path] Authorization: [redacted] api_key=[redacted]');
      expect(serialized).not.toContain('/private/citizen records.mp4');
      expect(serialized).not.toContain('CANARY-BASIC');
      expect(serialized).not.toContain('CANARY-TAIL');
    } finally {
      if (previous === undefined) delete process.env.FFMPEG_PATH;
      else process.env.FFMPEG_PATH = previous;
      warn.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('logs only the executable name when the configured path has a trailing slash', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voz-ffmpeg-test-'));
    const executable = join(dir, 'ffmpeg-failure');
    const previous = process.env.FFMPEG_PATH;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await writeFile(executable, '#!/bin/sh\nexit 7\n');
      await chmod(executable, 0o700);
      process.env.FFMPEG_PATH = `${executable}/`;

      await expect(new FfmpegVideoAudioExtractor().extractAudio(file)).rejects.toMatchObject({
        message: 'No se pudo procesar el contenido multimedia',
      });

      const entry = JSON.parse(warn.mock.calls[0]![0] as string) as Record<string, unknown>;
      expect(entry.executable).toBe('ffmpeg-failure');
    } finally {
      if (previous === undefined) delete process.env.FFMPEG_PATH;
      else process.env.FFMPEG_PATH = previous;
      warn.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('terminates a cancelled default runner with SIGTERM before forcing SIGKILL', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voz-ffmpeg-test-'));
    const executable = join(dir, 'ffmpeg-terminate');
    const previous = process.env.FFMPEG_PATH;
    const readyPath = join(dir, 'ready');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const controller = new AbortController();
    try {
      await writeFile(
        executable,
        `#!${process.execPath}\nconst fs = require('fs');\nconst path = require('path');\nprocess.stdin.resume();\nprocess.on('SIGTERM', () => process.stderr.write('graceful shutdown\\n', () => process.exit(0)));\nfs.writeFileSync(path.join(__dirname, 'ready'), 'ready');\nsetInterval(() => undefined, 1_000);\n`,
      );
      await chmod(executable, 0o700);
      process.env.FFMPEG_PATH = executable;

      const extraction = new FfmpegVideoAudioExtractor().extractAudio({
        ...file,
        abortSignal: controller.signal,
      });
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          await access(readyPath);
          break;
        } catch {
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        }
      }
      await expect(access(readyPath)).resolves.toBeUndefined();
      controller.abort();

      await expect(extraction).rejects.toMatchObject({ code: 'VIDEO_AUDIO_EXTRACTION_CANCELLED' });

      const entry = JSON.parse(warn.mock.calls[0]![0] as string) as Record<string, unknown>;
      expect(entry.stderr).toContain('graceful shutdown');
      expect(entry.signal).not.toBe('SIGKILL');
    } finally {
      if (previous === undefined) delete process.env.FFMPEG_PATH;
      else process.env.FFMPEG_PATH = previous;
      warn.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not pipe upload bytes to a default audio runner that reads a temporary input file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voz-ffmpeg-test-'));
    const executable = join(dir, 'ffmpeg-file-input');
    const previous = process.env.FFMPEG_PATH;
    try {
      await writeFile(
        executable,
        `#!${process.execPath}\nconst fs = require('fs');\nconst stdin = fs.readFileSync(0);\nif (stdin.length) process.exit(9);\nfs.readFileSync(process.argv[3]);\nprocess.stdout.write('ID3');\n`,
      );
      await chmod(executable, 0o700);
      process.env.FFMPEG_PATH = executable;

      await expect(new FfmpegVideoAudioExtractor().extractAudio(file)).resolves.toMatchObject({
        audio: Buffer.from('ID3'),
        audioMimeType: 'audio/mpeg',
      });
    } finally {
      if (previous === undefined) delete process.env.FFMPEG_PATH;
      else process.env.FFMPEG_PATH = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not pipe upload bytes to a default metadata runner that reads a temporary input file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voz-ffprobe-test-'));
    const executable = join(dir, 'ffprobe-file-input');
    const previous = process.env.FFPROBE_PATH;
    try {
      await writeFile(
        executable,
        `#!${process.execPath}\nconst fs = require('fs');\nconst stdin = fs.readFileSync(0);\nif (stdin.length) process.exit(9);\nfs.readFileSync(process.argv.at(-1));\nprocess.stdout.write('{"format":{"duration":"2"},"streams":[]}');\n`,
      );
      await chmod(executable, 0o700);
      process.env.FFPROBE_PATH = executable;

      await expect(new FfprobeMetadataProvider().probe(file)).resolves.toEqual({ durationSeconds: 2 });
    } finally {
      if (previous === undefined) delete process.env.FFPROBE_PATH;
      else process.env.FFPROBE_PATH = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('extracts MP3 with an optional audio map and propagates cancellation', async () => {
    const runner = jest.fn<MediaToolRunner>().mockResolvedValue(wav);
    const signal = new AbortController().signal;
    const result = await new FfmpegVideoAudioExtractor(runner).extractAudio({ ...file, abortSignal: signal });
    expect(result).toMatchObject({ audio: wav, audioMimeType: 'audio/mpeg', providerId: 'ffmpeg-audio' });
    const inputFilePath = runner.mock.calls[0]![0][1]!;
    expect(runner).toHaveBeenCalledWith([
      '-i', inputFilePath, '-vn', '-map', '0:a?', '-c:a', 'libmp3lame', '-f', 'mp3', 'pipe:1',
    ], file.buffer, signal, false);
  });

  it('splits frames, applies the frame cap and forwards the ffmpeg arguments', async () => {
    const runner = jest.fn<MediaToolRunner>().mockResolvedValue(Buffer.concat([jpeg, jpeg, jpeg]));
    const result = await new FfmpegVideoFrameExtractor(runner).extractFrames({ ...file, maxFrames: 2 });
    expect(result.frames).toEqual([{ index: 0, bytes: jpeg }, { index: 1, bytes: jpeg }]);
    expect(result.providerId).toBe('ffmpeg-frames');
    expect(runner).toHaveBeenCalledWith([
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', 'pipe:0', '-vf', 'fps=1',
      '-frames:v', '2', '-f', 'mjpeg', 'pipe:1',
    ], file.buffer, undefined);
  });

  it.each([0, -1, 1.5, Infinity])('rejects an invalid frame limit (%s) before invoking a runner', async (maxFrames) => {
    const runner = jest.fn<MediaToolRunner>();
    await expect(new FfmpegVideoFrameExtractor(runner).extractFrames({ ...file, maxFrames }))
      .rejects.toMatchObject({ code: 'VIDEO_FRAME_EXTRACTION_INVALID_LIMIT' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('returns an empty MP3 buffer when a video has no audio stream', async () => {
    await expect(new FfmpegVideoAudioExtractor(async () => Buffer.alloc(0)).extractAudio(file))
      .resolves.toMatchObject({ audio: Buffer.alloc(0), audioMimeType: 'audio/mpeg' });
  });

  it('rejects oversized tool output', async () => {
    await expect(new FfmpegVideoAudioExtractor(async () => Buffer.alloc(16 * 1024 * 1024 + 1)).extractAudio(file))
      .rejects.toMatchObject({ code: 'VIDEO_AUDIO_EXTRACTION_OUTPUT_TOO_LARGE' });
  });

  it('does not spawn an injected runner after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const runner = jest.fn<MediaToolRunner>();
    await expect(new FfmpegVideoAudioExtractor(runner).extractAudio({ ...file, abortSignal: controller.signal }))
      .rejects.toMatchObject({ code: 'VIDEO_AUDIO_EXTRACTION_CANCELLED' });
    expect(runner).not.toHaveBeenCalled();
  });
});
