/**
 * agent-context.builder.ts — Agent adaptation layer.
 *
 * Transforms multimodal test results into a structured textual context the
 * conversational agent can consume without knowing how it was produced:
 * attachments (typed per kind) + a combined context text built with the same
 * payload builder the agent flow already uses.
 */
import { MultimediaContext, buildMultimodalPayload } from '../../utils/payload-builder';
import { MultimodalTestResult } from './contracts';

export interface AgentMultimodalContext {
  attachments: MultimediaContext[];
  combinedContextText: string;
}

const firstNonEmpty = (...parts: Array<string | undefined>): string | undefined =>
  parts.find((part) => typeof part === 'string' && part.trim().length > 0);

const joinNonEmpty = (separator: string, ...parts: Array<string | undefined>): string | undefined => {
  const present = parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
  return present.length > 0 ? present.join(separator) : undefined;
};

function attachmentFor(result: MultimodalTestResult): MultimediaContext | null {
  if (result.status === 'failed') return null; // no reliable payload to hand over
  const payload = result.payload;
  switch (result.kind) {
    case 'audio': {
      const text = firstNonEmpty(payload.transcript);
      return text ? { type: 'AUDIO_TRANSCRITO', text } : null;
    }
    case 'document': {
      const text = firstNonEmpty(
        payload.normalizedText,
        payload.extractedText,
        payload.summaryText,
        payload.ocrText,
      );
      return text ? { type: 'DOCUMENTO_EXTRAIDO', text } : null;
    }
    case 'image': {
      const text = joinNonEmpty('\n', payload.ocrText, payload.description);
      return text ? { type: 'IMAGEN_ANALIZADA', text } : null;
    }
    case 'video': {
      const text = joinNonEmpty('\n', payload.transcript, payload.summaryText);
      return text ? { type: 'VIDEO_TRANSCRITO', text } : null;
    }
  }
}

/**
 * Builds the agent context from one or more multimodal results:
 * - audio → transcript
 * - document → extracted text (or summary)
 * - image → OCR + visual description
 * - video → transcript + visual summary
 */
export function buildAgentContext(results: readonly MultimodalTestResult[]): AgentMultimodalContext {
  const attachments = results
    .map((result) => attachmentFor(result))
    .filter((attachment): attachment is MultimediaContext => attachment !== null);

  // userText stays empty: the agent combines this context with its own message.
  const combinedContextText =
    attachments.length > 0 ? buildMultimodalPayload('', attachments) : '';
  return { attachments, combinedContextText };
}
