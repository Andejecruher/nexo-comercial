import { env } from '../../config/env.config';
import { PrivateMediaStore } from '../../services/whatsapp/private-media.store';
import { WhatsAppProvider } from '../../services/whatsapp/whatsapp.provider';
import { AppError } from '../../utils/app-error';
import { buildMultimodalPayload, MultimediaContext } from '../../utils/payload-builder';
import { createStructuredLogger } from '../../utils/structured-logger';
import { MULTIMODAL_FALLBACK_RESPONSE } from '../config/multimodal-prompts';
import { AIExecutionContext } from '../core/types';
import { NvidiaService } from './nvidia.service';

const log = createStructuredLogger('MultimodalService');

type MultimodalResult =
  | {
      status: 'ready';
      messageText: string;
      sourceMessageIds: string[];
      mediaCount: number;
    }
  | { status: 'fallback'; responseText: string };

interface MultimediaExtraction {
  contexts: MultimediaContext[];
  sourceMessageIds: string[];
}

function failureFields(error: unknown): Record<string, unknown> {
  if (error instanceof AppError) {
    return { failureCode: error.code, failureStatus: error.statusCode };
  }
  return { failureCode: error instanceof Error ? error.name : 'UNKNOWN' };
}

/** Preprocesamiento dentro del turno FSM: conserva el canal, el lease y la entrega por outbox. */
export class MultimodalService {
  constructor(
    private readonly whatsappProvider: WhatsAppProvider,
    private readonly nvidia: Pick<NvidiaService, 'transcribeAudio' | 'analyzeImage'>,
    private readonly mediaStore: Pick<PrivateMediaStore, 'get'> = new PrivateMediaStore(),
  ) {}

  async prepare(context: AIExecutionContext, lineId: string): Promise<MultimodalResult> {
    context.abortSignal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    context.abortSignal?.addEventListener('abort', abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    let timedOut = false;
    const startedAt = Date.now();

    try {
      const interrupted = new Promise<never>((_resolve, reject) => {
        onAbort = () =>
          reject(
            new AppError(
              timedOut ? 'Multimodal processing timed out' : 'Multimodal processing interrupted',
              504,
              timedOut ? 'AI_MULTIMODAL_TIMEOUT' : 'AI_MULTIMODAL_INTERRUPTED',
            ),
          );
        controller.signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => {
          timedOut = true;
          abort();
        }, env.NVIDIA_MULTIMODAL_TIMEOUT_MS);
      });
      const extraction = await Promise.race([
        this.extractContext(context, lineId, controller.signal),
        interrupted,
      ]);
      context.abortSignal?.throwIfAborted();
      if (extraction.contexts.length > 0) {
        log('info', 'multimodal.context_ready', context.correlationId, {
          conversationId: context.conversationId,
          messageId: context.messageId,
          sourceMessageIds: extraction.sourceMessageIds,
          mediaCount: extraction.contexts.length,
          durationMs: Date.now() - startedAt,
        });
      }
      return {
        status: 'ready',
        messageText: buildMultimodalPayload(context.messageText, extraction.contexts),
        sourceMessageIds: extraction.sourceMessageIds,
        mediaCount: extraction.contexts.length,
      };
    } catch (error) {
      // La cancelación del turno FSM no debe producir respuestas tardías.
      context.abortSignal?.throwIfAborted();
      log('warn', 'multimodal.satellite_failed', context.correlationId, {
        conversationId: context.conversationId,
        messageId: context.messageId,
        durationMs: Date.now() - startedAt,
        timedOut,
        ...failureFields(error),
      });
      return { status: 'fallback', responseText: MULTIMODAL_FALLBACK_RESPONSE };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (onAbort) controller.signal.removeEventListener('abort', onAbort);
      context.abortSignal?.removeEventListener('abort', abort);
    }
  }

  private async extractContext(
    context: AIExecutionContext,
    lineId: string,
    signal: AbortSignal,
  ): Promise<MultimediaExtraction> {
    const multimedia: MultimediaContext[] = [];
    const sourceMessageIds: string[] = [];
    for (const message of context.inboundMessages ?? []) {
      signal.throwIfAborted();
      switch (message.type) {
        case 'audio':
        case 'image': {
          const media = message.type === 'audio' ? message.audio : message.image;
          const downloadStartedAt = Date.now();
          log('info', 'multimodal.media_download_started', context.correlationId, {
            conversationId: context.conversationId,
            messageId: context.messageId,
            sourceMessageId: message.id,
            mediaType: message.type,
            mimeType: media.mime_type,
          });
          let bytes: Buffer;
          try {
            bytes = await this.mediaStore.get(media.id, this.whatsappProvider, { lineId });
          } catch (error) {
            log('warn', 'multimodal.media_download_failed', context.correlationId, {
              conversationId: context.conversationId,
              messageId: context.messageId,
              sourceMessageId: message.id,
              mediaType: message.type,
              durationMs: Date.now() - downloadStartedAt,
              ...failureFields(error),
            });
            throw error;
          }
          signal.throwIfAborted();
          log('info', 'multimodal.media_download_finished', context.correlationId, {
            conversationId: context.conversationId,
            messageId: context.messageId,
            sourceMessageId: message.id,
            mediaType: message.type,
            mimeType: media.mime_type,
            bytes: bytes.byteLength,
            durationMs: Date.now() - downloadStartedAt,
          });
          const input = { bytes, mimeType: media.mime_type ?? '', abortSignal: signal };
          const text =
            message.type === 'audio'
              ? await this.nvidia.transcribeAudio({
                  ...input,
                  correlationId: context.correlationId,
                  sourceMessageId: message.id,
                })
              : await this.nvidia.analyzeImage(input);
          if (!text.trim()) throw new AppError('Empty multimedia context', 502);
          sourceMessageIds.push(message.id);
          multimedia.push({
            type: message.type === 'audio' ? 'AUDIO_TRANSCRITO' : 'IMAGEN_ANALIZADA',
            text,
          });
          break;
        }
        case 'text':
          break;
        default:
          break;
      }
    }
    return { contexts: multimedia, sourceMessageIds };
  }
}
