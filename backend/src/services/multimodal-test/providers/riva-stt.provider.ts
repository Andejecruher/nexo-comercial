import { NvidiaRivaService } from '../../../ai/services/nvidia-riva.service';
import type { SttProvider, SttProviderOutput } from '../contracts';

// Mirrors NvidiaRivaService's private ALLOWED_AUDIO_MIMES without changing production code.
export const RIVA_SUPPORTED_AUDIO_MIMES: readonly string[] = [
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/amr',
  'audio/ogg',
  'audio/wav',
  'audio/flac',
];

/** Delegates recognition, including PCM16k conversion, to the existing Riva service. */
export class RivaSttProvider implements SttProvider {
  readonly id = 'riva';
  readonly supportedMimeTypes = RIVA_SUPPORTED_AUDIO_MIMES;
  readonly managesOwnRetries = true;

  constructor(
    private readonly service: Pick<NvidiaRivaService, 'transcribeAudio'> = new NvidiaRivaService(),
  ) {}

  async transcribe(input: Parameters<SttProvider['transcribe']>[0]): Promise<SttProviderOutput> {
    const startedAt = Date.now();
    const transcript = await this.service.transcribeAudio({
      bytes: input.buffer,
      mimeType: input.mimeType,
      correlationId: input.correlationId,
      abortSignal: input.abortSignal,
      timeoutMs: input.timeoutMs,
    });
    return {
      transcript,
      providerId: this.id,
      durationMs: Date.now() - startedAt,
      metadata: { inputBytes: input.buffer.byteLength },
    };
  }
}
