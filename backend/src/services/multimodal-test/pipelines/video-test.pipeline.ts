import { randomUUID } from 'crypto';
import { env } from '../../../config/env.config';
import { AppError } from '../../../utils/app-error';
import { createStructuredLogger } from '../../../utils/structured-logger';
import type {
  MediaMetadataProvider,
  MultimodalPayload,
  MultimodalTestFile,
  MultimodalTestOptions,
  MultimodalTestPipeline,
  MultimodalTestResult,
  SttProvider,
  TextSummarizerProvider,
  VideoAudioExtractor,
  VideoFrameExtractor,
} from '../contracts';
import { PipelineRunner } from '../pipeline-runner';
import { pipelinePolicy, ProviderRegistry, runWithFallback } from '../provider-registry';

const log = createStructuredLogger('VideoTestPipeline');

export class VideoTestPipeline implements MultimodalTestPipeline {
  readonly kind = 'video' as const;
  readonly supportedMimeTypes = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-matroska',
    'video/3gpp',
    'video/x-msvideo',
  ];

  constructor(private readonly registry: ProviderRegistry) {}

  async run(
    file: MultimodalTestFile,
    options: MultimodalTestOptions = {},
  ): Promise<MultimodalTestResult> {
    const correlationId = options.correlationId ?? randomUUID();
    const policy = pipelinePolicy('video', options);
    const runner = new PipelineRunner('video', file, correlationId, policy);
    const payload: MultimodalPayload = {};
    const metadata: Record<string, unknown> = { sizeBytes: file.buffer.byteLength };
    const mimeType = file.mimeType.toLowerCase().split(';')[0]!.trim();
    const finish = (): MultimodalTestResult => {
      const status = !payload.transcript ? 'failed' : runner.errorCount ? 'partial' : 'completed';
      const result = runner.buildResult(status, payload, metadata);
      log(status === 'failed' ? 'warn' : 'info', 'video.completed', correlationId, {
        status,
        durationMs: result.durationMs,
        errorCount: result.errors.length,
        transcriptLength: payload.transcript?.length ?? 0,
      });
      return result;
    };
    log('info', 'video.started', correlationId, { sizeBytes: file.buffer.byteLength });

    try {
      await runner.runStep('validation', () => {
        if (!this.supportedMimeTypes.includes(mimeType)) {
          throw new AppError('Formato de video no compatible', 400, 'VALIDATION_UNSUPPORTED_MIME');
        }
        if (!file.buffer.byteLength) {
          throw new AppError('El archivo de video está vacío', 400, 'VALIDATION_EMPTY_FILE');
        }
        if (file.buffer.byteLength > env.MULTIMODAL_TEST_MAX_FILE_MB * 1024 * 1024) {
          throw new AppError(
            'El archivo de video supera el tamaño permitido',
            400,
            'VALIDATION_FILE_TOO_LARGE',
          );
        }
        return Promise.resolve();
      });
    } catch {
      return finish();
    }

    if (this.registry.providersFor('mediaMetadata', { mimeType }).length === 0) {
      runner.skipStep('metadata', 'no metadata provider registered');
    } else {
      try {
        Object.assign(
          metadata,
          await runWithFallback(
            runner,
            'metadata',
            'mediaMetadata',
            this.registry,
            policy,
            (provider, ctx) =>
              (provider as MediaMetadataProvider).probe({
                buffer: file.buffer,
                mimeType,
                correlationId,
                abortSignal: ctx.signal,
              }),
            { mimeType },
          ),
        );
      } catch {
        // The runner retains metadata failures; transcription can still succeed.
      }
    }

    try {
      const extracted = await runWithFallback(
        runner,
        'audio_extraction',
        'videoAudio',
        this.registry,
        policy,
        (provider, ctx) =>
          (provider as VideoAudioExtractor).extractAudio({
            buffer: file.buffer,
            mimeType,
            correlationId,
            abortSignal: ctx.signal,
          }),
        { mimeType },
      );
      Object.assign(metadata, extracted.metadata, { audioSizeBytes: extracted.audio.byteLength });
      if (!extracted.audio.byteLength) {
        runner.skipStep('stt', 'video has no audio stream');
        return finish();
      }
      const stt = await runWithFallback(
        runner,
        'stt',
        'stt',
        this.registry,
        policy,
        async (provider, ctx) => {
          const output = await (provider as SttProvider).transcribe({
            buffer: extracted.audio,
            mimeType: extracted.audioMimeType,
            correlationId,
            abortSignal: ctx.signal,
          });
          if (!output.transcript.trim()) {
            throw new AppError(
              'No se obtuvo una transcripción del video',
              400,
              'STT_EMPTY_TRANSCRIPT',
            );
          }
          return output;
        },
        { mimeType: extracted.audioMimeType, preferredId: options.provider },
      );
      payload.transcript = stt.transcript;
      Object.assign(metadata, stt.metadata);
    } catch {
      return finish();
    }

    if (!options.extractFrames) {
      runner.skipStep('frame_extraction', 'frame extraction not requested');
    } else if (this.registry.providersFor('videoFrames', { mimeType }).length === 0) {
      runner.skipStep('frame_extraction', 'no frame extractor registered');
    } else {
      try {
        const extracted = await runWithFallback(
          runner,
          'frame_extraction',
          'videoFrames',
          this.registry,
          policy,
          (provider, ctx) =>
            (provider as VideoFrameExtractor).extractFrames({
              buffer: file.buffer,
              mimeType,
              correlationId,
              abortSignal: ctx.signal,
              maxFrames: options.maxFrames ?? 3,
            }),
          { mimeType },
        );
        metadata.frameCount = extracted.frames.length;
        metadata.frameSizesBytes = extracted.frames.map((frame) => frame.bytes.byteLength);
        // TODO: Analyze frames through a visual-description port; never embed frame bytes in JSON.
      } catch {
        // Optional frame failures must not discard the transcript.
      }
    }

    if (!options.summary) {
      runner.skipStep('summary', 'summary not requested');
    } else if (this.registry.providersFor('summarizer').length === 0) {
      runner.skipStep('summary', 'no summarizer provider registered');
      // TODO: Register a summarizer provider and combine transcript with future frame descriptions.
    } else {
      try {
        const summary = await runWithFallback(
          runner,
          'summary',
          'summarizer',
          this.registry,
          policy,
          (provider, ctx) =>
            (provider as TextSummarizerProvider).summarize({
              text: payload.transcript!,
              correlationId,
              abortSignal: ctx.signal,
            }),
        );
        payload.summaryText = summary.summary;
      } catch {
        // Summary is optional; its failed attempts remain visible in the trace.
      }
    }
    return finish();
  }
}
