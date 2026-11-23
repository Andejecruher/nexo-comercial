import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { CallOptions, Metadata } from '@grpc/grpc-js';
import { loadSync, ServiceDefinition } from '@grpc/proto-loader';
import { join } from 'path';
import { env } from '../../../config/env.config';
import {
  NvidiaRivaService,
  RivaAudioInput,
  RivaRecognitionClient,
} from '../../../ai/services/nvidia-riva.service';

class FakeStream extends EventEmitter {
  write = jest.fn((_request: unknown) => true);
  end = jest.fn();
  cancel = jest.fn(() => {
    queueMicrotask(() => this.emit('error', new Error('Cancelled')));
  });
  complete(text = '  hay una fuga de agua  '): void {
    this.emit('data', { results: [{ isFinal: true, alternatives: [{ transcript: text }] }] });
    this.emit('end');
  }
}

const input: RivaAudioInput = {
  bytes: Buffer.from('ogg-input'),
  mimeType: 'audio/ogg; codecs=opus',
};

function setup(pcm: Buffer = Buffer.alloc(3200)) {
  const stream = new FakeStream();
  const streamingRecognize = jest.fn(
    (_metadata: Metadata, _options: CallOptions) => stream as never,
  );
  const close = jest.fn();
  const createClient = jest.fn(() => ({ streamingRecognize, close }) as RivaRecognitionClient);
  const transcodeToPcm16k = jest.fn(
    async (_bytes: Buffer, _signal?: AbortSignal): Promise<Buffer> => pcm,
  );
  const service = new NvidiaRivaService({ createClient, transcoder: { transcodeToPcm16k } });
  return { service, stream, streamingRecognize, close, createClient, transcodeToPcm16k, pcm };
}

Object.assign(env, { NVIDIA_API_KEY: env.NVIDIA_API_KEY });
beforeEach(() => {
  jest.replaceProperty(env, 'NVIDIA_API_KEY', 'nvapi-test');
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('NvidiaRivaService', () => {
  it('envía autenticación, función de español y PCM por el contrato oficial', async () => {
    const { service, stream, streamingRecognize, transcodeToPcm16k, pcm } = setup();
    const pending = service.transcribeAudio(input);
    await Promise.resolve();
    expect(transcodeToPcm16k).toHaveBeenCalledWith(input.bytes, expect.any(AbortSignal));
    const [metadata, options] = streamingRecognize.mock.calls[0]!;
    expect(metadata.get('authorization')).toEqual(['Bearer nvapi-test']);
    expect(metadata.get('function-id')).toEqual([env.NVIDIA_RIVA_FUNCTION_ID]);
    expect(Number(options.deadline)).toBeGreaterThan(Date.now());
    expect(stream.write.mock.calls[0]?.[0]).toEqual({
      streamingConfig: {
        config: {
          encoding: 'LINEAR_PCM',
          sampleRateHertz: 16000,
          languageCode: 'es-US',
          audioChannelCount: 1,
          maxAlternatives: 1,
        },
        interimResults: false,
      },
    });
    expect(stream.write.mock.calls[1]?.[0]).toEqual({ audioContent: pcm });
    expect(stream.end).toHaveBeenCalledTimes(1);
    stream.complete();
    await expect(pending).resolves.toBe('hay una fuga de agua');
  });

  it('une solo resultados finales y la primera hipótesis de cada segmento', async () => {
    const { service, stream } = setup();
    const pending = service.transcribeAudio(input);
    await Promise.resolve();
    stream.emit('data', {
      results: [
        { isFinal: false, alternatives: [{ transcript: 'hipótesis provisional' }] },
        {
          isFinal: true,
          alternatives: [{ transcript: 'hay una fuga' }, { transcript: 'alternativa' }],
        },
      ],
    });
    stream.emit('data', {
      results: [{ isFinal: true, alternatives: [{ transcript: 'hay una fuga' }] }],
    });
    stream.complete('en la calle Hidalgo');
    await expect(pending).resolves.toBe('hay una fuga en la calle Hidalgo');
  });

  it('respeta drain en configuración y audio, sin perder ni repetir bytes', async () => {
    const { service, stream, pcm } = setup(Buffer.alloc(200_000, 7));
    stream.write.mockReturnValueOnce(false);
    const pending = service.transcribeAudio(input);
    await Promise.resolve();
    expect(stream.write).toHaveBeenCalledTimes(1);
    stream.write.mockReturnValueOnce(false);
    stream.emit('drain');
    expect(stream.write).toHaveBeenCalledTimes(2);
    expect(stream.end).not.toHaveBeenCalled();
    stream.emit('drain');
    const chunks = stream.write.mock.calls
      .slice(1)
      .map(([request]) => (request as { audioContent: Buffer }).audioContent);
    expect(chunks.every((chunk) => chunk.length <= 65536)).toBe(true);
    expect(Buffer.concat(chunks)).toEqual(pcm);
    expect(stream.end).toHaveBeenCalledTimes(1);
    stream.complete();
    await pending;
  });

  it.each([
    { bytes: Buffer.alloc(0), mimeType: 'audio/ogg' },
    { bytes: Buffer.alloc(16 * 1024 * 1024 + 1), mimeType: 'audio/ogg' },
    { bytes: Buffer.from('x'), mimeType: 'text/html' },
  ])('rechaza entrada inválida sin iniciar FFmpeg ni gRPC', async (audio) => {
    const { service, createClient, transcodeToPcm16k } = setup();
    await expect(service.transcribeAudio(audio)).rejects.toMatchObject({ statusCode: 400 });
    expect(createClient).not.toHaveBeenCalled();
    expect(transcodeToPcm16k).not.toHaveBeenCalled();
  });

  it('falla de forma explícita cuando falta NVIDIA_API_KEY', async () => {
    jest.replaceProperty(env, 'NVIDIA_API_KEY', undefined);
    const { service, createClient } = setup();
    await expect(service.transcribeAudio(input)).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('propaga el fallo de conversión sin iniciar una llamada de NVIDIA', async () => {
    const { service, createClient, transcodeToPcm16k } = setup();
    transcodeToPcm16k.mockRejectedValueOnce(new Error('Decoder unavailable'));
    await expect(service.transcribeAudio(input)).rejects.toThrow('Decoder unavailable');
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each(['error', 'empty', 'partial-only'] as const)('rechaza respuestas %s', async (kind) => {
    const { service, stream } = setup();
    const pending = service.transcribeAudio(input);
    const assertion = expect(pending).rejects.toMatchObject({
      code: kind === 'error' ? 'AI_ASR_FAILED' : 'AI_EMPTY_TRANSCRIPTION',
    });
    await Promise.resolve();
    if (kind === 'error') stream.emit('error', new Error('UNAVAILABLE'));
    else if (kind === 'empty') stream.complete(' ');
    else {
      stream.emit('data', {
        results: [{ isFinal: false, alternatives: [{ transcript: 'incompleto' }] }],
      });
      stream.emit('end');
    }
    await assertion;
  });

  it('cancela el stream ante una cancelación de la FSM', async () => {
    const { service, stream } = setup();
    const controller = new AbortController();
    const pending = service.transcribeAudio({ ...input, abortSignal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'AI_ASR_CANCELLED',
      statusCode: 499,
    });
    await Promise.resolve();
    controller.abort();
    await assertion;
    expect(stream.cancel).toHaveBeenCalledTimes(1);
    stream.complete('resultado tardío');
  });

  it('expone el vencimiento del presupuesto total como un timeout recuperable', async () => {
    jest.useFakeTimers();
    jest.replaceProperty(env, 'NVIDIA_RIVA_TIMEOUT_MS', 100);
    const { service } = setup();
    const pending = service.transcribeAudio(input);
    const assertion = expect(pending).rejects.toMatchObject({
      statusCode: 504,
      code: 'AI_RIVA_TIMEOUT',
    });
    await jest.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('expone el timeout recuperable si el presupuesto vence durante la conversión', async () => {
    jest.useFakeTimers();
    jest.replaceProperty(env, 'NVIDIA_RIVA_TIMEOUT_MS', 100);
    const { service, createClient, transcodeToPcm16k } = setup();
    transcodeToPcm16k.mockImplementationOnce(
      (_bytes, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('conversion cancelled')), {
            once: true,
          });
        }),
    );
    const pending = service.transcribeAudio(input);
    const assertion = expect(pending).rejects.toMatchObject({
      statusCode: 504,
      code: 'AI_RIVA_TIMEOUT',
    });

    await jest.advanceTimersByTimeAsync(100);
    await assertion;
    expect(createClient).not.toHaveBeenCalled();
  });

  it('preserva código y detalle gRPC y no reintenta fallos permanentes', async () => {
    const { service, stream, streamingRecognize } = setup();
    const pending = service.transcribeAudio(input);
    await Promise.resolve();
    const grpcError = Object.assign(new Error('Unauthenticated'), {
      code: 16,
      details: 'invalid function authorization',
    });
    stream.emit('error', grpcError);
    await expect(pending).rejects.toMatchObject({
      code: 'AI_RIVA_UNAUTHENTICATED',
      details: { grpcCode: 16, grpcDetails: 'invalid function authorization' },
    });
    expect(streamingRecognize).toHaveBeenCalledTimes(1);
  });

  it.each([
    [14, 'worker unavailable', 503, 'AI_RIVA_UNAVAILABLE'],
    [8, 'capacity exhausted', 429, 'AI_RIVA_RESOURCE_EXHAUSTED'],
    [7, 'permission denied', 403, 'AI_RIVA_PERMISSION_DENIED'],
    [3, 'invalid request', 400, 'AI_RIVA_INVALID_ARGUMENT'],
  ])(
    'normaliza gRPC %i sin perder sus detalles',
    async (grpcCode, grpcDetails, statusCode, code) => {
      jest.replaceProperty(env, 'NVIDIA_RIVA_MAX_RETRIES', 0);
      const { service, stream, streamingRecognize } = setup();
      const pending = service.transcribeAudio(input);
      await Promise.resolve();
      stream.emit(
        'error',
        Object.assign(new Error(grpcDetails), { code: grpcCode, details: grpcDetails }),
      );

      await expect(pending).rejects.toMatchObject({
        statusCode,
        code,
        details: { grpcCode, grpcDetails },
      });
      expect(streamingRecognize).toHaveBeenCalledTimes(1);
    },
  );

  it('expone DEADLINE_EXCEEDED como timeout 504 conservando el detalle gRPC', async () => {
    jest.replaceProperty(env, 'NVIDIA_RIVA_MAX_RETRIES', 0);
    const { service, stream } = setup();
    const pending = service.transcribeAudio(input);
    await Promise.resolve();
    stream.emit(
      'error',
      Object.assign(new Error('Deadline exceeded'), { code: 4, details: 'Riva deadline' }),
    );

    await expect(pending).rejects.toMatchObject({
      statusCode: 504,
      code: 'AI_RIVA_TIMEOUT',
      details: { grpcCode: 4, grpcDetails: 'Riva deadline' },
    });
  });

  it('reintenta una vez los fallos gRPC transitorios con un stream nuevo', async () => {
    jest.replaceProperty(env, 'NVIDIA_RIVA_RETRY_DELAY_MS', 0);
    const { service, stream: firstStream, streamingRecognize } = setup();
    const secondStream = new FakeStream();
    streamingRecognize
      .mockImplementationOnce(() => firstStream as never)
      .mockImplementationOnce(() => secondStream as never);
    const pending = service.transcribeAudio(input);
    await Promise.resolve();
    firstStream.emit(
      'error',
      Object.assign(new Error('Unavailable'), { code: 14, details: 'temporarily unavailable' }),
    );
    await Promise.resolve();
    await Promise.resolve();
    secondStream.complete('recovered transcript');
    await expect(pending).resolves.toBe('recovered transcript');
    expect(streamingRecognize).toHaveBeenCalledTimes(2);
  });

  it('no inicia otro intento si el llamador cancela durante la espera de reintento', async () => {
    jest.useFakeTimers();
    jest.replaceProperty(env, 'NVIDIA_RIVA_RETRY_DELAY_MS', 100);
    const { service, stream, streamingRecognize } = setup();
    const caller = new AbortController();
    const pending = service.transcribeAudio({ ...input, abortSignal: caller.signal });
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'AI_ASR_CANCELLED',
      statusCode: 499,
    });
    await Promise.resolve();
    stream.emit(
      'error',
      Object.assign(new Error('Unavailable'), { code: 14, details: 'temporarily unavailable' }),
    );
    await Promise.resolve();
    await Promise.resolve();
    caller.abort();

    await assertion;
    expect(streamingRecognize).toHaveBeenCalledTimes(1);
  });

  it('no divide artificialmente el presupuesto gRPC entre reintentos', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-29T00:00:00.000Z'));
    jest.replaceProperty(env, 'NVIDIA_RIVA_TIMEOUT_MS', 1_000);
    jest.replaceProperty(env, 'NVIDIA_RIVA_MAX_RETRIES', 1);
    jest.replaceProperty(env, 'NVIDIA_RIVA_RETRY_DELAY_MS', 0);
    const startedAt = Date.now();
    const totalDeadline = startedAt + 1_000;
    const { service, stream: firstStream, streamingRecognize } = setup();
    const secondStream = new FakeStream();
    streamingRecognize
      .mockImplementationOnce(() => firstStream as never)
      .mockImplementationOnce(() => secondStream as never);

    const pending = service.transcribeAudio(input);
    await Promise.resolve();
    const firstDeadline = Number(streamingRecognize.mock.calls[0]![1].deadline);
    expect(firstDeadline - startedAt).toBeGreaterThan(900);
    expect(firstDeadline).toBeLessThan(totalDeadline);

    firstStream.emit(
      'error',
      Object.assign(new Error('Unavailable'), { code: 14, details: 'temporarily unavailable' }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(streamingRecognize).toHaveBeenCalledTimes(2);
    const secondDeadline = Number(streamingRecognize.mock.calls[1]![1].deadline);
    expect(firstDeadline).toBeLessThan(secondDeadline);
    expect(secondDeadline).toBeLessThanOrEqual(totalDeadline);

    secondStream.complete('recovered after deadline');
    await expect(pending).resolves.toBe('recovered after deadline');
  });

  it('no reintenta cuando el intento agotó el presupuesto restante y expone el error gRPC real', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-29T00:00:00.000Z'));
    jest.replaceProperty(env, 'NVIDIA_RIVA_TIMEOUT_MS', 1_000);
    jest.replaceProperty(env, 'NVIDIA_RIVA_MAX_RETRIES', 1);
    jest.replaceProperty(env, 'NVIDIA_RIVA_RETRY_DELAY_MS', 0);
    const { service, stream, streamingRecognize } = setup();
    streamingRecognize.mockImplementationOnce((_metadata, options) => {
      const attemptDeadline = Number(options.deadline);
      setTimeout(
        () =>
          stream.emit(
            'error',
            Object.assign(new Error('Deadline exceeded'), {
              code: 4,
              details: 'failed to establish link to worker',
            }),
          ),
        attemptDeadline - Date.now(),
      );
      return stream as never;
    });

    const pending = service.transcribeAudio(input);
    const assertion = expect(pending).rejects.toMatchObject({
      statusCode: 504,
      code: 'AI_RIVA_TIMEOUT',
      details: { grpcCode: 4, grpcDetails: 'failed to establish link to worker' },
    });
    await jest.advanceTimersByTimeAsync(950);
    await assertion;
    expect(streamingRecognize).toHaveBeenCalledTimes(1);
  });

  it('conserva el último error gRPC cuando el presupuesto total aborta un reintento', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-29T00:00:00.000Z'));
    jest.replaceProperty(env, 'NVIDIA_RIVA_TIMEOUT_MS', 1_000);
    jest.replaceProperty(env, 'NVIDIA_RIVA_MAX_RETRIES', 1);
    jest.replaceProperty(env, 'NVIDIA_RIVA_RETRY_DELAY_MS', 0);
    const { service, stream: firstStream, streamingRecognize } = setup();
    const secondStream = new FakeStream();
    streamingRecognize
      .mockImplementationOnce(() => firstStream as never)
      .mockImplementationOnce(() => secondStream as never);

    const pending = service.transcribeAudio(input);
    await Promise.resolve();
    firstStream.emit(
      'error',
      Object.assign(new Error('Deadline exceeded'), {
        code: 4,
        details: 'failed to establish link to worker',
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(streamingRecognize).toHaveBeenCalledTimes(2);

    const assertion = expect(pending).rejects.toMatchObject({
      statusCode: 504,
      code: 'AI_RIVA_TIMEOUT',
      details: { grpcCode: 4, grpcDetails: 'failed to establish link to worker' },
    });
    await jest.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it('inicia el primer RPC aunque el retraso de reintento exceda el presupuesto', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-29T00:00:00.000Z'));
    jest.replaceProperty(env, 'NVIDIA_RIVA_TIMEOUT_MS', 1_000);
    jest.replaceProperty(env, 'NVIDIA_RIVA_MAX_RETRIES', 1);
    jest.replaceProperty(env, 'NVIDIA_RIVA_RETRY_DELAY_MS', 2_000);
    const { service, stream, streamingRecognize } = setup();

    const pending = service.transcribeAudio(input);
    await Promise.resolve();

    expect(streamingRecognize).toHaveBeenCalledTimes(1);
    stream.complete('first attempt succeeds');
    await expect(pending).resolves.toBe('first attempt succeeds');
  });

  it('rechaza un cierre prematuro y libera listeners del stream', async () => {
    const { service, stream } = setup();
    const pending = service.transcribeAudio(input);
    await Promise.resolve();
    stream.emit('close');
    await expect(pending).rejects.toMatchObject({ code: 'AI_ASR_STREAM_CLOSED' });
    expect(stream.listenerCount('data')).toBe(0);
    expect(stream.listenerCount('end')).toBe(0);
    expect(stream.listenerCount('close')).toBe(0);
  });

  it('no inicia el stream si se cancela durante la conversión', async () => {
    const { service, createClient, transcodeToPcm16k } = setup();
    const controller = new AbortController();
    transcodeToPcm16k.mockImplementationOnce(async (_bytes, signal) => {
      controller.abort();
      signal?.throwIfAborted();
      return Buffer.alloc(2);
    });
    await expect(
      service.transcribeAudio({ ...input, abortSignal: controller.signal }),
    ).rejects.toMatchObject({ code: 'AI_ASR_CANCELLED', statusCode: 499 });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('rechaza una señal ya cancelada sin iniciar trabajo', async () => {
    const { service, createClient, transcodeToPcm16k } = setup();
    await expect(
      service.transcribeAudio({ ...input, abortSignal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(createClient).not.toHaveBeenCalled();
    expect(transcodeToPcm16k).not.toHaveBeenCalled();
  });

  it('reutiliza el canal entre turnos y permite cerrarlo de forma idempotente', async () => {
    const { service, stream, createClient, close } = setup();
    for (let turn = 0; turn < 2; turn += 1) {
      const pending = service.transcribeAudio(input);
      await Promise.resolve();
      stream.complete();
      await pending;
    }
    expect(createClient).toHaveBeenCalledTimes(1);
    service.close();
    service.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('convierte excepciones de escritura en un fallo recuperable y cancela el stream', async () => {
    const { service, stream } = setup();
    stream.write.mockImplementationOnce(() => {
      throw new Error('Stream closed');
    });
    await expect(service.transcribeAudio(input)).rejects.toMatchObject({ code: 'AI_ASR_FAILED' });
    expect(stream.cancel).toHaveBeenCalledTimes(1);
  });

  it('does not expose audio bytes or credentials through raw console logs', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, stream } = setup();
    const pending = service.transcribeAudio(input);
    await Promise.resolve();
    stream.complete('safe transcript');
    await expect(pending).resolves.toBe('safe transcript');

    const output = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(output).not.toContain(input.bytes.toString());
    expect(output).not.toContain('nvapi-test');
  });
});

describe('Protocolo oficial Riva', () => {
  it('serializa configuración y bytes con los nombres/IDs oficiales de StreamingRecognize', () => {
    const definition = loadSync(join(__dirname, '../../../ai/services/riva/proto/riva_asr.proto'), {
      includeDirs: [join(__dirname, '../../../ai/services')],
      enums: String,
      bytes: Buffer,
    });
    const service = definition['nvidia.riva.asr.RivaSpeechRecognition'] as ServiceDefinition;
    const method = service.StreamingRecognize!;
    expect(method.path).toBe('/nvidia.riva.asr.RivaSpeechRecognition/StreamingRecognize');
    expect(method.requestStream).toBe(true);
    expect(method.responseStream).toBe(true);
    const request = {
      streamingConfig: {
        config: {
          encoding: 'LINEAR_PCM',
          sampleRateHertz: 16000,
          languageCode: 'es-US',
          audioChannelCount: 1,
        },
        interimResults: false,
      },
    };
    expect(method.requestDeserialize(method.requestSerialize(request))).toEqual(request);
    const audio = { audioContent: Buffer.from([1, 2, 3, 4]) };
    expect(method.requestDeserialize(method.requestSerialize(audio))).toEqual(audio);
    const response = { results: [{ isFinal: true, alternatives: [{ transcript: 'una fuga' }] }] };
    expect(method.responseDeserialize(method.responseSerialize(response))).toEqual(response);
  });
});
