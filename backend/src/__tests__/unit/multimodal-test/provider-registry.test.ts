import { describe, expect, it } from '@jest/globals';
import {
  OcrProvider,
  ProviderCapability,
  SttProvider,
} from '../../../services/multimodal-test/contracts';
import { PipelineRunner, StageError } from '../../../services/multimodal-test/pipeline-runner';
import {
  ProviderRegistry,
  runWithFallback,
} from '../../../services/multimodal-test/provider-registry';

function fakeStt(id: string, impl: (input: { buffer: Buffer }) => Promise<string>): SttProvider {
  return {
    id,
    supportedMimeTypes: ['audio/ogg', 'audio/mpeg', 'audio/wav'],
    transcribe: jest.fn(async (input) => {
      const transcript = await impl(input);
      return {
        transcript,
        providerId: id,
        durationMs: 1,
      };
    }),
  } as SttProvider;
}

function fakeOcr(id: string): OcrProvider {
  return {
    id,
    supportedMimeTypes: ['image/png'],
    extractText: jest.fn(async () => ({ text: 'texto', providerId: id, durationMs: 1 })),
  } as unknown as OcrProvider;
}

const capability: ProviderCapability = 'stt';

describe('ProviderRegistry', () => {
  it('returns providers in registration order and dedupes by id', () => {
    const registry = new ProviderRegistry();
    registry.register(
      capability,
      fakeStt('primary', async () => 'a'),
    );
    registry.register(
      capability,
      fakeStt('primary', async () => 'a'),
    );
    registry.register(
      capability,
      fakeStt('secondary', async () => 'b'),
    );
    expect(registry.providersFor(capability).map((provider) => provider.id)).toEqual([
      'primary',
      'secondary',
    ]);
  });

  it('moves the preferred provider first when it exists', () => {
    const registry = new ProviderRegistry();
    registry.register(
      capability,
      fakeStt('primary', async () => 'a'),
    );
    registry.register(
      capability,
      fakeStt('secondary', async () => 'b'),
    );
    expect(
      registry.providersFor(capability, { preferredId: 'secondary' }).map((p) => p.id),
    ).toEqual(['secondary', 'primary']);
  });

  it('filters providers by supported mimetype', () => {
    const registry = new ProviderRegistry();
    registry.register(
      capability,
      fakeStt('stt-ogg', async () => 'a'),
    );
    registry.register('ocr', fakeOcr('ocr-png'));
    expect(registry.providersFor(capability, { mimeType: 'audio/ogg' }).map((p) => p.id)).toEqual([
      'stt-ogg',
    ]);
    expect(registry.providersFor(capability, { mimeType: 'video/mp4' })).toEqual([]);
  });
});

describe('runWithFallback', () => {
  const policy = { timeoutMs: 5_000, maxRetries: 1, retryDelayMs: 0 };
  const file = {
    filename: 'a.ogg',
    mimeType: 'audio/ogg',
    buffer: Buffer.from('audio'),
  };

  it('returns the primary provider result and records one ok step', async () => {
    const registry = new ProviderRegistry();
    registry.register(
      capability,
      fakeStt('primary', async () => 'hola'),
    );
    const runner = new PipelineRunner('audio', file, 'corr-2', policy);
    const run = jest.fn(async (provider, _ctx?: unknown) =>
      (provider as SttProvider).transcribe({ buffer: file.buffer, mimeType: file.mimeType }),
    );
    const transcript = await runWithFallback(
      runner,
      'stt',
      capability,
      registry,
      policy,
      (provider, ctx) => run(provider, ctx),
      { mimeType: file.mimeType },
    );
    expect(transcript.transcript).toBe('hola');
    const result = runner.buildResult('completed', { transcript: 'hola' }, {});
    expect(result.steps.filter((step) => step.status === 'ok')).toHaveLength(1);
    expect(result.providersUsed).toEqual(['primary']);
  });

  it('falls back to the secondary provider after primary failure', async () => {
    const registry = new ProviderRegistry();
    registry.register(
      capability,
      fakeStt('primary', async () => {
        throw new Error('boom');
      }),
    );
    registry.register(
      capability,
      fakeStt('secondary', async () => 'hola'),
    );
    const runner = new PipelineRunner('audio', file, 'corr-3', policy);
    const outcome = await runWithFallback(
      runner,
      'stt',
      capability,
      registry,
      policy,
      async (provider) =>
        (provider as SttProvider).transcribe({ buffer: file.buffer, mimeType: file.mimeType }),
    );
    expect(outcome.transcript).toBe('hola');
    const result = runner.buildResult('completed', {}, {});
    expect(result.providersUsed).toEqual(['secondary']);
    expect(result.errors.map((error) => error.provider)).toContain('primary');
    // Primary failure and secondary success are both traceable as steps.
    expect(result.steps.filter((step) => step.stage === 'stt').length).toBeGreaterThanOrEqual(2);
  });

  it('does not multiply retries for a provider that owns its transport retries', async () => {
    const registry = new ProviderRegistry();
    const primaryTranscribe = jest.fn(async () => {
      throw new StageError('worker unavailable', 'stt', 'AI_RIVA_UNAVAILABLE', {
        statusCode: 503,
        retriable: true,
      });
    });
    const primary: SttProvider = {
      id: 'riva',
      supportedMimeTypes: ['audio/ogg'],
      managesOwnRetries: true,
      transcribe: primaryTranscribe,
    };
    const secondaryTranscribe = jest.fn(async () => ({
      transcript: 'fallback transcript',
      providerId: 'secondary',
      durationMs: 1,
    }));
    const secondary: SttProvider = {
      id: 'secondary',
      supportedMimeTypes: ['audio/ogg'],
      transcribe: secondaryTranscribe,
    };
    registry.register(capability, primary);
    registry.register(capability, secondary);
    const runner = new PipelineRunner('audio', file, 'corr-own-retries', policy);

    const outcome = await runWithFallback(
      runner,
      'stt',
      capability,
      registry,
      policy,
      async (provider) =>
        (provider as SttProvider).transcribe({ buffer: file.buffer, mimeType: file.mimeType }),
    );

    expect(outcome.transcript).toBe('fallback transcript');
    expect(primaryTranscribe).toHaveBeenCalledTimes(1);
    expect(secondaryTranscribe).toHaveBeenCalledTimes(1);
    expect(runner.buildResult('completed', {}, {}).steps[0]?.metadata?.attempt).toBe(1);
  });

  it('throws FALLBACK_EXHAUSTED with per-provider evidence when everything fails', async () => {
    const registry = new ProviderRegistry();
    registry.register(
      capability,
      fakeStt('primary', async () => {
        throw new Error('boom');
      }),
    );
    registry.register(
      capability,
      fakeStt('secondary', async () => {
        throw new Error('boom-2');
      }),
    );
    const runner = new PipelineRunner('audio', file, 'corr-4', policy);
    await expect(
      runWithFallback(runner, 'stt', capability, registry, policy, async (provider) =>
        (provider as SttProvider).transcribe({ buffer: file.buffer, mimeType: file.mimeType }),
      ),
    ).rejects.toMatchObject({ code: 'STT_FALLBACK_EXHAUSTED', stage: 'stt' });
  });

  it('throws NO_PROVIDER when no provider supports the mimetype', async () => {
    const registry = new ProviderRegistry();
    const runner = new PipelineRunner('audio', file, 'corr-5', policy);
    await expect(
      runWithFallback(runner, 'stt', capability, registry, policy, async () => 'unused', {
        mimeType: 'video/mp4',
      }),
    ).rejects.toMatchObject({ code: 'STT_NO_PROVIDER', stage: 'stt' });
  });
});
