import { randomUUID } from 'crypto';
import { env } from '../../../config/env.config';
import { createStructuredLogger } from '../../../utils/structured-logger';
import { FfmpegAudioTranscoder } from '../../whatsapp/audio-transcoder';
import type {
  MediaMetadataProvider,
  MultimodalTestFile,
  MultimodalTestOptions,
  MultimodalTestPipeline,
  MultimodalTestResult,
  SttProvider,
} from '../contracts';
import { PipelineRunner, StageError } from '../pipeline-runner';
import { pipelinePolicy, ProviderRegistry, runWithFallback } from '../provider-registry';
import { RIVA_SUPPORTED_AUDIO_MIMES } from '../providers/riva-stt.provider';

const log = createStructuredLogger('AudioTestPipeline');

export class AudioTestPipeline implements MultimodalTestPipeline {
  readonly kind = 'audio';
  readonly supportedMimeTypes: readonly string[] = [
    ...RIVA_SUPPORTED_AUDIO_MIMES,
    'audio/webm',
    'audio/3gpp',
  ];
  private readonly transcoder: Pick<FfmpegAudioTranscoder, 'transcodeToOggOpus'>;

  constructor(
    private readonly registry: ProviderRegistry,
    deps: { transcoder?: Pick<FfmpegAudioTranscoder, 'transcodeToOggOpus'> } = {},
  ) {
    this.transcoder = deps.transcoder ?? new FfmpegAudioTranscoder();
  }

  async run(
    file: MultimodalTestFile,
    options: MultimodalTestOptions = {},
  ): Promise<MultimodalTestResult> {
    const correlationId = options.correlationId ?? randomUUID();
    const policy = pipelinePolicy(this.kind, options);
    const runner = new PipelineRunner(this.kind, file, correlationId, policy);
    const mimeType = file.mimeType.toLowerCase().split(';')[0]!.trim();
    let metadata: Record<string, unknown> = { bytes: file.buffer.byteLength, mimeType };
    log('info', 'audio_test.pipeline_started', correlationId, { bytes: file.buffer.byteLength });

    try {
      await runner.runStep(
        'validation',
        () => {
          if (!mimeType || !this.supportedMimeTypes.includes(mimeType)) {
            throw new StageError(
              'Formato de audio no permitido',
              'validation',
              'VALIDATION_UNSUPPORTED_MIME',
              { statusCode: 400 },
            );
          }
          if (!file.buffer.byteLength) {
            throw new StageError(
              'El archivo de audio está vacío',
              'validation',
              'VALIDATION_EMPTY_FILE',
              { statusCode: 400 },
            );
          }
          if (file.buffer.byteLength > env.MULTIMODAL_TEST_MAX_FILE_MB * 1024 * 1024) {
            throw new StageError(
              'El archivo de audio supera el tamaño permitido',
              'validation',
              'VALIDATION_FILE_TOO_LARGE',
              { statusCode: 413 },
            );
          }
          return Promise.resolve();
        },
        { metadata },
      );

      if (this.registry.providersFor('mediaMetadata', { mimeType }).length > 0) {
        try {
          const probeMetadata = await runWithFallback(
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
                timeoutMs: ctx.timeoutMs,
              }),
            { mimeType },
          );
          metadata = { ...metadata, ...probeMetadata };
        } catch (error) {
          // Metadata is best effort; retain failures without discarding usable audio.
          this.collectFallbackError(runner, error);
        }
      } else {
        runner.skipStep('metadata', 'no metadata provider registered');
      }

      const selectedProvider = this.registry.providersFor('stt', {
        preferredId: options.provider,
      })[0];
      const acceptsSource = selectedProvider
        ? this.registry.providersFor('stt', { mimeType }).includes(selectedProvider)
        : RIVA_SUPPORTED_AUDIO_MIMES.includes(mimeType);
      let sttBuffer = file.buffer;
      let sttMimeType = mimeType;
      if (acceptsSource) {
        runner.skipStep('conversion', 'format already accepted by provider');
      } else {
        sttBuffer = await runner.runStep(
          'conversion',
          async ({ signal }) => {
            signal.throwIfAborted();
            const converted = await this.transcoder.transcodeToOggOpus(file.buffer);
            signal.throwIfAborted();
            return converted;
          },
          { metadata: { inputMimeType: mimeType, outputMimeType: 'audio/ogg' } },
        );
        sttMimeType = 'audio/ogg';
      }

      const output = await runWithFallback(
        runner,
        'stt',
        'stt',
        this.registry,
        policy,
        (provider, ctx) =>
          (provider as SttProvider).transcribe({
            buffer: sttBuffer,
            mimeType: sttMimeType,
            correlationId,
            abortSignal: ctx.signal,
            timeoutMs: ctx.timeoutMs,
          }),
        { mimeType: sttMimeType, preferredId: options.provider },
      );
      const result = runner.buildResult('completed', { transcript: output.transcript }, metadata);
      log('info', 'audio_test.pipeline_finished', correlationId, {
        status: result.status,
        durationMs: result.durationMs,
      });
      return result;
    } catch (error) {
      this.collectFallbackError(runner, error);
      const result = runner.buildResult('failed', {}, metadata);
      log('error', 'audio_test.pipeline_failed', correlationId, {
        status: result.status,
        durationMs: result.durationMs,
        stage: error instanceof StageError ? error.stage : undefined,
        code: error instanceof StageError ? error.code : undefined,
      });
      return result;
    }
  }

  private collectFallbackError(runner: PipelineRunner, error: unknown): void {
    // Attempt errors and NO_PROVIDER are already collected by the shared helpers.
    if (error instanceof StageError && error.code.endsWith('_FALLBACK_EXHAUSTED')) {
      runner.collectError(error);
    }
  }
}
