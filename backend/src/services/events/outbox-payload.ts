import { WaOutboundMessage } from '../../types/whatsapp.types';

export interface OutboxLineContext {
  lineId?: string;
  lineExternalIdentifier?: string;
}

export interface ParsedOutboxPayload {
  waPayload: WaOutboundMessage;
  lineContext?: OutboxLineContext;
}

interface OutboxPayloadEnvelope {
  waPayload: WaOutboundMessage;
  lineContext?: OutboxLineContext;
}

export function serializeOutboxPayload(
  waPayload: WaOutboundMessage,
  lineContext?: OutboxLineContext,
): OutboxPayloadEnvelope {
  if (!lineContext || (!lineContext.lineId && !lineContext.lineExternalIdentifier)) {
    return { waPayload };
  }

  return {
    waPayload,
    lineContext: {
      ...(lineContext.lineId ? { lineId: lineContext.lineId } : {}),
      ...(lineContext.lineExternalIdentifier
        ? { lineExternalIdentifier: lineContext.lineExternalIdentifier }
        : {}),
    },
  };
}

export function parseOutboxPayload(payload: unknown): ParsedOutboxPayload | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if ('waPayload' in candidate) {
    const waPayload = candidate.waPayload;
    if (!isWaOutboundMessage(waPayload)) {
      return null;
    }

    const parsedLineContext = parseLineContext(candidate.lineContext);
    return {
      waPayload,
      ...(parsedLineContext ? { lineContext: parsedLineContext } : {}),
    };
  }

  if (!isWaOutboundMessage(candidate)) {
    return null;
  }

  return { waPayload: candidate };
}

function parseLineContext(value: unknown): OutboxLineContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const lineId = typeof source.lineId === 'string' ? source.lineId : undefined;
  const lineExternalIdentifier =
    typeof source.lineExternalIdentifier === 'string' ? source.lineExternalIdentifier : undefined;

  if (!lineId && !lineExternalIdentifier) {
    return undefined;
  }

  return {
    ...(lineId ? { lineId } : {}),
    ...(lineExternalIdentifier ? { lineExternalIdentifier } : {}),
  };
}

function isWaOutboundMessage(value: unknown): value is WaOutboundMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<WaOutboundMessage>;
  return (
    candidate.messaging_product === 'whatsapp' &&
    typeof candidate.type === 'string' &&
    typeof candidate.to === 'string'
  );
}
