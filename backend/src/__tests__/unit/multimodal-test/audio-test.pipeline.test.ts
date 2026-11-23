import { describe, expect, it, jest } from '@jest/globals';
import type { NvidiaRivaService } from '../../../ai/services/nvidia-riva.service';
import { env } from '../../../config/env.config';
import type {
  MediaMetadataProvider,
  MultimodalTestFile,
  SttProvider,
} from '../../../services/multimodal-test/contracts';
import { AudioTestPipeline } from '../../../services/multimodal-test/pipelines/audio-test.pipeline';
import { ProviderRegistry } from '../../../services/multimodal-test/provider-registry';
import { RivaSttProvider } from '../../../services/multimodal-test/providers/riva-stt.provider';

const acceptedMimes = [
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/amr',
  'audio/ogg',
  'audio/wav',
  'audio/flac',
];

function audio(mimeType = 'audio/ogg'): MultimodalTestFile {
  return { filename: 'recording', mimeType, buffer: Buffer.from('audio input') };
}

function stt(id = 'primary', supportedMimeTypes = acceptedMimes) {
  return {
    id,
    supportedMimeTypes,
    transcribe: jest.fn<SttProvider['transcribe']>().mockResolvedValue({
      transcript: 'A streetlight is broken.',
      providerId: id,
      durationMs: 2,
    }),
  } satisfies SttProvider;
}

function setup() {
  const registry = new ProviderRegistry();
  const primary = stt();
  registry.register('stt', primary);
  const transcoder = {
    transcodeToOggOpus: jest
      .fn<(source: Buffer) => Promise<Buffer>>()
      .mockResolvedValue(Buffer.from('converted ogg')),
  };
  return {
    registry,
    primary,
    transcoder,
    pipeline: new AudioTestPipeline(registry, { transcoder }),
  };
}

describe('AudioTestPipeline', () => {
  it('returns a transcript, metadata, ordered steps, and timing evidence', async () => {
    const { registry, primary, transcoder, pipeline } = setup();
    const metadata = {
      id: 'probe',
      supportedMimeTypes: [],
      probe: jest.fn<MediaMetadataProvider['probe']>().mockResolvedValue({ sampleRate: 16000 }),
    } satisfies MediaMetadataProvider;
    registry.register('mediaMetadata', metadata);
    const file = audio();
    const result = await pipeline.run(file, { correlationId: 'audio-correlation' });

    expect(result).toMatchObject({
      kind: 'audio',
      status: 'completed',
      correlationId: 'audio-correlation',
      filename: file.filename,
      mimeType: file.mimeType,
      payload: { transcript: 'A streetlight is broken.' },
      metadata: { bytes: file.buffer.length, mimeType: file.mimeType, sampleRate: 16000 },
      errors: [],
      providersUsed: ['probe', 'primary'],
    });
    expect(result.steps.map(({ stage, status }) => [stage, status])).toEqual([
      ['validation', 'ok'],
      ['metadata', 'ok'],
      ['conversion', 'skipped'],
      ['stt', 'ok'],
    ]);
    expect(result.steps[2]?.metadata).toEqual({ reason: 'format already accepted by provider' });
    expect(transcoder.transcodeToOggOpus).not.toHaveBeenCalled();
    for (const providerCall of [metadata.probe, primary.transcribe]) {
      expect(providerCall).toHaveBeenCalledWith({
        buffer: file.buffer,
        mimeType: file.mimeType,
        correlationId: 'audio-correlation',
        abortSignal: expect.any(AbortSignal),
        timeoutMs: expect.any(Number),
      });
    }
    for (const entry of [result, ...result.steps]) {
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
      expect(Date.parse(entry.endedAt)).toBeGreaterThanOrEqual(Date.parse(entry.startedAt));
    }
  });

  it.each(['audio/webm', 'audio/3gpp'])('converts %s before passing OGG to STT', async (mime) => {
    const { primary, transcoder, pipeline } = setup();
    const file = audio(mime);
    const original = Buffer.from(file.buffer);
    const result = await pipeline.run(file);

    expect(result.status).toBe('completed');
    expect(result.steps[2]).toMatchObject({ stage: 'conversion', status: 'ok' });
    expect(transcoder.transcodeToOggOpus).toHaveBeenCalledTimes(1);
    expect(transcoder.transcodeToOggOpus).toHaveBeenCalledWith(file.buffer);
    expect(primary.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: Buffer.from('converted ogg'),
        mimeType: 'audio/ogg',
      }),
    );
    expect(result.metadata).toEqual({ bytes: original.length, mimeType: mime });
    expect(file.buffer).toEqual(original);
    expect(file.mimeType).toBe(mime);
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(acceptedMimes)('preserves directly accepted %s input', async (mime) => {
    const { primary, transcoder, pipeline } = setup();
    const file = audio(mime);
    const result = await pipeline.run(file);
    expect(result.status).toBe('completed');
    expect(result.errors).toEqual([]);
    expect(transcoder.transcodeToOggOpus).not.toHaveBeenCalled();
    expect(primary.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: file.buffer,
        mimeType: mime,
      }),
    );
  });

  it.each(['', '   ', 'image/png'])(
    'rejects invalid MIME %j before any provider work',
    async (mime) => {
      const { registry, primary, transcoder, pipeline } = setup();
      const probe = jest.fn<MediaMetadataProvider['probe']>().mockResolvedValue({});
      registry.register('mediaMetadata', { id: 'probe', supportedMimeTypes: [], probe });
      const file = audio(mime);
      const original = Buffer.from(file.buffer);
      const result = await pipeline.run(file);

      expect(result.status).toBe('failed');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        stage: 'validation',
        code: expect.stringMatching(/^VALIDATION_/),
      });
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0]).toMatchObject({ stage: 'validation', status: 'failed' });
      expect(result.payload).toEqual({});
      expect(result.providersUsed).toEqual([]);
      expect(primary.transcribe).not.toHaveBeenCalled();
      expect(probe).not.toHaveBeenCalled();
      expect(transcoder.transcodeToOggOpus).not.toHaveBeenCalled();
      expect(file.buffer).toEqual(original);
    },
  );

  it('rejects an empty buffer before STT', async () => {
    const { primary, transcoder, pipeline } = setup();
    const result = await pipeline.run({ ...audio(), buffer: Buffer.alloc(0) });
    expect(result.status).toBe('failed');
    expect(result.errors).toEqual([
      expect.objectContaining({
        stage: 'validation',
        code: 'VALIDATION_EMPTY_FILE',
      }),
    ]);
    expect(result.steps).toHaveLength(1);
    expect(result.payload).toEqual({});
    expect(result.providersUsed).toEqual([]);
    expect(primary.transcribe).not.toHaveBeenCalled();
    expect(transcoder.transcodeToOggOpus).not.toHaveBeenCalled();
  });

  it('accepts the byte limit and rejects one byte over regardless of declared size', async () => {
    const { primary, transcoder, pipeline } = setup();
    const maxBytes = env.MULTIMODAL_TEST_MAX_FILE_MB * 1024 * 1024;
    const accepted = await pipeline.run({ ...audio(), buffer: Buffer.alloc(maxBytes) });
    expect(accepted.status).toBe('completed');
    primary.transcribe.mockClear();
    const rejected = await pipeline.run({
      ...audio(),
      buffer: Buffer.alloc(maxBytes + 1),
      sizeBytes: 1,
    });
    expect(rejected.status).toBe('failed');
    expect(rejected.errors).toEqual([
      expect.objectContaining({
        stage: 'validation',
        code: 'VALIDATION_FILE_TOO_LARGE',
      }),
    ]);
    expect(rejected.steps).toHaveLength(1);
    expect(rejected.providersUsed).toEqual([]);
    expect(rejected.payload).toEqual({});
    expect(primary.transcribe).not.toHaveBeenCalled();
    expect(transcoder.transcodeToOggOpus).not.toHaveBeenCalled();
  });

  it('normalizes MIME parameters and case before invoking providers', async () => {
    const { primary, pipeline } = setup();
    const result = await pipeline.run(audio('Audio/OGG; codecs=opus'));
    expect(result.status).toBe('completed');
    expect(primary.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'audio/ogg' }),
    );
  });

  it('falls back after primary failure and records both attempts', async () => {
    const { registry, primary, pipeline } = setup();
    primary.transcribe.mockRejectedValue(new Error('primary unavailable'));
    const secondary = stt('secondary');
    registry.register('stt', secondary);
    const result = await pipeline.run(audio());

    expect(result.status).toBe('completed');
    expect(result.payload.transcript).toBe('A streetlight is broken.');
    expect(
      result.steps
        .filter(({ stage }) => stage === 'stt')
        .map(({ status, metadata }) => [status, metadata?.provider]),
    ).toEqual([
      ['failed', 'primary'],
      ['ok', 'secondary'],
    ]);
    expect(result.errors).toEqual([expect.objectContaining({ stage: 'stt', provider: 'primary' })]);
    expect(result.providersUsed).toEqual(['secondary']);
    expect(primary.transcribe).toHaveBeenCalledTimes(1);
    expect(secondary.transcribe).toHaveBeenCalledTimes(1);
  });

  it('fails with exhaustion evidence when all STT providers fail', async () => {
    const { registry, primary, pipeline } = setup();
    primary.transcribe.mockRejectedValue(new Error('primary failed'));
    const secondary = stt('secondary');
    secondary.transcribe.mockRejectedValue(new Error('secondary failed'));
    registry.register('stt', secondary);
    const result = await pipeline.run(audio());

    expect(result.status).toBe('failed');
    expect(result.payload).toEqual({});
    expect(result.providersUsed).toEqual([]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[2]).toMatchObject({ stage: 'stt', code: 'STT_FALLBACK_EXHAUSTED' });
    expect(result.steps.filter(({ stage }) => stage === 'stt')).toEqual([
      expect.objectContaining({
        status: 'failed',
        metadata: expect.objectContaining({ provider: 'primary' }),
      }),
      expect.objectContaining({
        status: 'failed',
        metadata: expect.objectContaining({ provider: 'secondary' }),
      }),
    ]);
  });

  it('skips metadata explicitly when no eligible provider is registered', async () => {
    const { registry, pipeline } = setup();
    const probe = jest.fn<MediaMetadataProvider['probe']>();
    registry.register('mediaMetadata', {
      id: 'image-only',
      supportedMimeTypes: ['image/png'],
      probe,
    });
    const result = await pipeline.run(audio());
    expect(result.status).toBe('completed');
    expect(result.steps[1]).toMatchObject({
      stage: 'metadata',
      status: 'skipped',
      metadata: { reason: 'no metadata provider registered' },
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it('retains optional metadata errors while still producing a transcript', async () => {
    const { registry, pipeline } = setup();
    registry.register('mediaMetadata', {
      id: 'probe',
      supportedMimeTypes: [],
      probe: jest.fn<MediaMetadataProvider['probe']>().mockRejectedValue(new Error('probe failed')),
    });
    const result = await pipeline.run(audio());
    expect(result.status).toBe('completed');
    expect(result.payload.transcript).toBe('A streetlight is broken.');
    expect(result.errors).toEqual([
      expect.objectContaining({ stage: 'metadata', provider: 'probe' }),
      expect.objectContaining({ stage: 'metadata', code: 'MEDIAMETADATA_FALLBACK_EXHAUSTED' }),
    ]);
  });

  it('attributes conversion failure to conversion and never invokes STT', async () => {
    const { primary, transcoder, pipeline } = setup();
    transcoder.transcodeToOggOpus.mockRejectedValue(new Error('conversion failed'));
    const result = await pipeline.run(audio('audio/webm'));
    expect(result.status).toBe('failed');
    expect(result.errors).toEqual([expect.objectContaining({ stage: 'conversion' })]);
    expect(result.steps[2]).toMatchObject({ stage: 'conversion', status: 'failed' });
    expect(result.payload).toEqual({});
    expect(result.providersUsed).toEqual([]);
    expect(primary.transcribe).not.toHaveBeenCalled();
  });

  it('honors preferred provider and its native input support', async () => {
    const { registry, primary, transcoder, pipeline } = setup();
    const preferred = stt('webm-native', ['audio/webm']);
    registry.register('stt', preferred);
    const result = await pipeline.run(audio('audio/webm'), { provider: preferred.id });
    expect(result.status).toBe('completed');
    expect(result.providersUsed).toEqual(['webm-native']);
    expect(preferred.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'audio/webm' }),
    );
    expect(primary.transcribe).not.toHaveBeenCalled();
    expect(transcoder.transcodeToOggOpus).not.toHaveBeenCalled();
  });

  it('fails rather than completing when no STT provider is registered', async () => {
    const pipeline = new AudioTestPipeline(new ProviderRegistry(), {
      transcoder: { transcodeToOggOpus: jest.fn<(source: Buffer) => Promise<Buffer>>() },
    });
    const result = await pipeline.run(audio());
    expect(result.status).toBe('failed');
    expect(result.errors).toEqual([
      expect.objectContaining({ stage: 'stt', code: 'STT_NO_PROVIDER' }),
    ]);
    expect(result.payload).toEqual({});
    expect(result.providersUsed).toEqual([]);
  });
});

describe('RivaSttProvider', () => {
  it('delegates bytes, MIME, cancellation and correlation without changing the transcript', async () => {
    const transcribeAudio = jest
      .fn<NvidiaRivaService['transcribeAudio']>()
      .mockResolvedValue(' Riva text ');
    const provider = new RivaSttProvider({ transcribeAudio });
    const input = {
      buffer: Buffer.from('recording'),
      mimeType: 'audio/ogg',
      correlationId: 'riva-correlation',
      abortSignal: new AbortController().signal,
    };
    const result = await provider.transcribe(input);
    expect(provider.id).toBe('riva');
    expect(provider.supportedMimeTypes).toEqual(acceptedMimes);
    expect(transcribeAudio).toHaveBeenCalledTimes(1);
    expect(transcribeAudio).toHaveBeenCalledWith({
      bytes: input.buffer,
      mimeType: input.mimeType,
      correlationId: input.correlationId,
      abortSignal: input.abortSignal,
    });
    expect(result).toEqual({
      transcript: ' Riva text ',
      providerId: 'riva',
      durationMs: expect.any(Number),
      metadata: { inputBytes: input.buffer.length },
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('preserves service errors for the runner to normalize', async () => {
    const error = new Error('service failed');
    const transcribeAudio = jest
      .fn<NvidiaRivaService['transcribeAudio']>()
      .mockRejectedValue(error);
    const provider = new RivaSttProvider({ transcribeAudio });
    await expect(
      provider.transcribe({ buffer: Buffer.from('recording'), mimeType: 'audio/ogg' }),
    ).rejects.toBe(error);
    expect(transcribeAudio).toHaveBeenCalledTimes(1);
  });
});
