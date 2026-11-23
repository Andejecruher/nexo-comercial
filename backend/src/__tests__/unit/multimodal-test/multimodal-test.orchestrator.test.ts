import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { env } from '../../../config/env.config';
import {
  MultimodalFileKind,
  MultimodalTestPipeline,
  MultimodalTestResult,
} from '../../../services/multimodal-test/contracts';
import { MultimodalTestOrchestrator } from '../../../services/multimodal-test/multimodal-test.orchestrator';

function fakeResult(kind: MultimodalFileKind): MultimodalTestResult {
  return {
    correlationId: `corr-${kind}`,
    kind,
    filename: 'sample',
    mimeType: 'application/octet-stream',
    status: 'completed',
    startedAt: '2026-10-24T00:00:00.000Z',
    endedAt: '2026-10-24T00:00:01.000Z',
    durationMs: 1000,
    steps: [],
    errors: [],
    payload: {},
    metadata: {},
    providersUsed: [],
  };
}

function fakePipeline(kind: MultimodalFileKind): {
  pipeline: MultimodalTestPipeline;
  run: jest.MockedFunction<MultimodalTestPipeline['run']>;
} {
  const run = jest.fn<MultimodalTestPipeline['run']>(async () => fakeResult(kind));
  return {
    pipeline: { kind, supportedMimeTypes: [], run },
    run,
  };
}

const smallFile = {
  filename: 'f.bin',
  mimeType: 'audio/ogg',
  buffer: Buffer.from('tiny'),
};

describe('MultimodalTestOrchestrator.detectKind', () => {
  const orchestrator = new MultimodalTestOrchestrator({});

  it('maps mime families to kinds', () => {
    expect(orchestrator.detectKind('audio/ogg')).toBe('audio');
    expect(orchestrator.detectKind('audio/mpeg')).toBe('audio');
    expect(orchestrator.detectKind('video/mp4')).toBe('video');
    expect(orchestrator.detectKind('image/png')).toBe('image');
    expect(orchestrator.detectKind('application/pdf')).toBe('document');
    expect(orchestrator.detectKind('text/plain')).toBe('document');
  });

  it('returns null for unknown mime families', () => {
    expect(orchestrator.detectKind('application/octet-stream')).toBeNull();
    expect(orchestrator.detectKind('')).toBeNull();
  });
});

describe('MultimodalTestOrchestrator.run / runAs', () => {
  const originalMaxFileMb = env.MULTIMODAL_TEST_MAX_FILE_MB;
  beforeEach(() => {
    env.MULTIMODAL_TEST_MAX_FILE_MB = 1;
  });
  afterEach(() => {
    env.MULTIMODAL_TEST_MAX_FILE_MB = originalMaxFileMb;
  });

  it('auto-detects the kind and dispatches in run()', async () => {
    const { pipeline: audio, run } = fakePipeline('audio');
    const orchestrator = new MultimodalTestOrchestrator({ audio });
    const result = await orchestrator.run(smallFile, {});
    expect(result.kind).toBe('audio');
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'f.bin', mimeType: 'audio/ogg' }),
      expect.anything(),
    );
  });

  it('forces the kind in runAs() even for a generic mime type', async () => {
    const { pipeline: video } = fakePipeline('video');
    const orchestrator = new MultimodalTestOrchestrator({ video });
    const result = await orchestrator.runAs(
      'video',
      { ...smallFile, mimeType: 'application/octet-stream' },
      {},
    );
    expect(result.kind).toBe('video');
  });

  it('rejects an unsupported mime with a 400 validation error', async () => {
    const orchestrator = new MultimodalTestOrchestrator({ audio: fakePipeline('audio').pipeline });
    await expect(
      orchestrator.run({ ...smallFile, mimeType: 'application/octet-stream' }, {}),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_UNSUPPORTED_MIME' });
  });

  it('rejects an oversized file with 413 MULTIMODAL_FILE_TOO_LARGE', async () => {
    const orchestrator = new MultimodalTestOrchestrator({ audio: fakePipeline('audio').pipeline });
    const huge = Buffer.alloc(2 * 1024 * 1024); // 2 MB against a 1 MB cap
    await expect(
      orchestrator.runAs('audio', { ...smallFile, buffer: huge }, { timeoutMs: 5000 }),
    ).rejects.toMatchObject({ statusCode: 413 });
  });

  it('rejects with 503 when no pipeline is registered for the kind', async () => {
    const orchestrator = new MultimodalTestOrchestrator({});
    await expect(orchestrator.runAs('image', smallFile, {})).rejects.toMatchObject({
      statusCode: 503,
      code: 'MULTIMODAL_NO_PIPELINE',
    });
  });

  it('passes the options through to the pipeline', async () => {
    const { pipeline: audio, run } = fakePipeline('audio');
    const orchestrator = new MultimodalTestOrchestrator({ audio });
    await orchestrator.run(smallFile, { forceOcr: true, provider: 'riva' });
    expect(run).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ forceOcr: true, provider: 'riva' }),
    );
  });
});
