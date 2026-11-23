import { describe, expect, it, jest } from '@jest/globals';
import { FfmpegAudioTranscoder } from '../../../services/whatsapp/audio-transcoder';

describe('FfmpegAudioTranscoder', () => {
  it('normaliza audio a PCM mono de 16 kHz sin cabecera y propaga la señal', async () => {
    const output = Buffer.from([0, 0, 1, 0]);
    const runner = jest.fn<(...args: unknown[]) => Promise<Buffer>>().mockResolvedValue(output);
    const signal = new AbortController().signal;
    await expect(
      new FfmpegAudioTranscoder(runner).transcodeToPcm16k(Buffer.from('ogg'), signal),
    ).resolves.toBe(output);
    expect(runner).toHaveBeenCalledWith(
      [
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
      ],
      Buffer.from('ogg'),
      signal,
    );
  });

  it.each([0, 16 * 1024 * 1024 + 1])('rechaza entradas fuera de los límites PCM', async (size) => {
    const bytes = Buffer.alloc(size);
    const runner = jest.fn<() => Promise<Buffer>>();
    await expect(new FfmpegAudioTranscoder(runner).transcodeToPcm16k(bytes)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it.each([0, 3, 16 * 1024 * 1024 + 2])(
    'rechaza PCM vacío, incompleto o demasiado grande',
    async (size) => {
      const output = Buffer.alloc(size);
      const runner = jest.fn<() => Promise<Buffer>>().mockResolvedValue(output);
      await expect(
        new FfmpegAudioTranscoder(runner).transcodeToPcm16k(Buffer.from('audio')),
      ).rejects.toMatchObject({ statusCode: 400 });
    },
  );

  it('devuelve un error de aplicación cuando falla el decodificador PCM', async () => {
    const runner = jest
      .fn<() => Promise<Buffer>>()
      .mockRejectedValue(new Error('ffmpeg unavailable'));
    await expect(
      new FfmpegAudioTranscoder(runner).transcodeToPcm16k(Buffer.from('audio')),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('respeta la cancelación antes y después de convertir', async () => {
    const controller = new AbortController();
    const runner = jest.fn(async () => {
      controller.abort();
      return Buffer.alloc(2);
    });
    await expect(
      new FfmpegAudioTranscoder(runner).transcodeToPcm16k(Buffer.from('audio'), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    runner.mockClear();
    await expect(
      new FfmpegAudioTranscoder(runner).transcodeToPcm16k(Buffer.from('audio'), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('normalizes incoming audio to mono OGG Opus at the voice-note bitrate', async () => {
    const output = Buffer.from('encoded-ogg-opus');
    const runner = jest.fn<() => Promise<Buffer>>().mockResolvedValue(output);
    const transcoder = new FfmpegAudioTranscoder(runner);

    await expect(transcoder.transcodeToOggOpus(Buffer.from('source-audio'))).resolves.toBe(output);

    expect(runner).toHaveBeenCalledWith(
      [
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
      ],
      Buffer.from('source-audio'),
    );
  });
});
