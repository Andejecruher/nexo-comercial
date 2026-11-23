import { describe, expect, it } from '@jest/globals';
import { AppError } from '../../../utils/app-error';
import {
  MultimodalStage,
  MultimodalTestFile,
  ProviderPolicy,
} from '../../../services/multimodal-test/contracts';
import {
  PipelineRunner,
  StageError,
  toStageError,
} from '../../../services/multimodal-test/pipeline-runner';

const file: MultimodalTestFile = {
  filename: 'sample.ogg',
  mimeType: 'audio/ogg',
  buffer: Buffer.from('fake-audio'),
};

const policy: ProviderPolicy = { timeoutMs: 5_000, maxRetries: 1, retryDelayMs: 0 };

function createRunner(): PipelineRunner {
  return new PipelineRunner('audio', file, 'corr-1', policy);
}

describe('PipelineRunner', () => {
  it('records a successful step with timing and metadata', async () => {
    const runner = createRunner();
    const transcript = await runner.runStep('stt', async () => 'hola mundo', {
      metadata: { provider: 'fake' },
    });
    expect(transcript).toBe('hola mundo');
    const result = runner.buildResult('completed', { transcript }, { durationSeconds: 1 });
    expect(result.status).toBe('completed');
    expect(result.correlationId).toBe('corr-1');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      stage: 'stt',
      status: 'ok',
      metadata: { provider: 'fake' },
    });
    expect(result.steps[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.errors).toHaveLength(0);
  });

  it('attributes failures to the stage with a normalized error', async () => {
    const runner = createRunner();
    await expect(
      runner.runStep('conversion', async () => {
        throw new Error('AUDIO_TRANSCODE_FAILED');
      }),
    ).rejects.toBeInstanceOf(StageError);
    const result = runner.buildResult('failed', {}, {});
    const failedStep = result.steps.find((step) => step.status === 'failed');
    expect(failedStep?.stage).toBe('conversion');
    expect(failedStep?.error?.code).toBe('Error');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ stage: 'conversion' });
  });

  it('marks provider timeouts with PROVIDER_TIMEOUT when the stage exceeds its budget', async () => {
    const runner = createRunner();
    await expect(
      runner.runStep(
        'stt',
        () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('late')), 120)),
        { timeoutMs: 10, timeoutCode: 'PROVIDER_TIMEOUT' },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', stage: 'stt' });
    const result = runner.buildResult('failed', {}, {});
    expect(result.errors[0]?.retriable).toBe(true);
    expect(result.errors[0]?.statusCode).toBe(504);
  });

  it('uses an attempt-local timeout signal so later fallback work can continue', async () => {
    const runner = createRunner();
    await expect(
      runner.runStep(
        'stt',
        ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('attempt aborted')), {
              once: true,
            });
          }),
        { timeoutMs: 10, timeoutCode: 'PROVIDER_TIMEOUT' },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });

    await expect(runner.runStep('stt', async ({ signal }) => signal.aborted)).resolves.toBe(false);
    expect(runner.signal.aborted).toBe(false);
  });

  it('propagates a prior pipeline cancellation to a new attempt signal', async () => {
    const runner = createRunner();
    runner.abort();

    await expect(runner.runStep('stt', async ({ signal }) => signal.aborted)).resolves.toBe(true);
  });

  it('records skipped steps with a reason', () => {
    const runner = createRunner();
    runner.skipStep('frame_extraction', 'extractFrames=false');
    const result = runner.buildResult('partial', {}, {});
    expect(result.steps[0]).toMatchObject({
      stage: 'frame_extraction',
      status: 'skipped',
      metadata: { reason: 'extractFrames=false' },
    });
  });

  it('tracks providers used without duplicates', () => {
    const runner = createRunner();
    runner.markProviderUsed('riva');
    runner.markProviderUsed('riva');
    runner.markProviderUsed('document-ai');
    expect(runner.buildResult('completed', {}, {}).providersUsed).toEqual(['riva', 'document-ai']);
  });
});

describe('toStageError', () => {
  it('preserves AppError code and marks transient failures as retriable', () => {
    const error = toStageError(
      new AppError('satellite down', 503, 'AI_PROVIDER_UNAVAILABLE'),
      'stt',
      'riva',
    );
    expect(error).toBeInstanceOf(StageError);
    expect(error).toMatchObject({
      stage: 'stt',
      code: 'AI_PROVIDER_UNAVAILABLE',
      statusCode: 503,
      retriable: true,
      provider: 'riva',
    });
  });

  it('maps unknown throwables to a stage error with a fallback code', () => {
    const error = toStageError(new Error('boom'), 'ocr' satisfies MultimodalStage);
    expect(error.stage).toBe('ocr');
    expect(error.code).toBe('Error');
    expect(error.retriable).toBe(false);
  });
});
