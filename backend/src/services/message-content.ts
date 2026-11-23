import { MessageType } from '@prisma/client';
import { z } from 'zod';
import { inboundContent as persistedContent } from './whatsapp/message-content';
import type { WaInboundMessage } from '../types/whatsapp.types';

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** One lossless, bounded content contract for ingress, REST and realtime. */
export function inboundContent(
  message: WaInboundMessage,
  phoneNumberId?: string,
): Record<string, unknown> {
  const raw = record(message);
  const content = record(raw[message.type]);
  const seconds = Number(message.timestamp);
  const validTime = Number.isFinite(seconds) && seconds > 0 && seconds * 1000 <= Date.now();
  return {
    ...persistedContent(message, phoneNumberId),
    type: message.type,
    rawId: message.id,
    ...(validTime
      ? { eventTimestamp: seconds, eventAt: new Date(seconds * 1000).toISOString() }
      : {}),
    ...(raw.context ? { context: raw.context } : {}),
    ...(raw.errors ? { errors: raw.errors } : {}),
    ...(!['image', 'audio', 'video', 'document', 'sticker'].includes(message.type) &&
    Object.keys(content).length
      ? { content }
      : {}),
    ...(['image', 'audio', 'video', 'document', 'sticker'].includes(message.type)
      ? {
          media: {
            ...record(persistedContent(message, phoneNumberId).media),
            id: content.id,
            mimeType: content.mime_type,
            filename: content.filename,
            caption: content.caption,
            animated: content.animated,
            voice: content.voice,
          },
        }
      : {}),
  };
}

export function internalMessageType(type: string): MessageType {
  if (type === 'sticker') return MessageType.sticker;
  return Object.values(MessageType).includes(type as MessageType)
    ? (type as MessageType)
    : MessageType.unsupported;
}

export function presentationMeta(message: {
  id: string;
  meta: unknown;
}): Record<string, z.infer<ReturnType<typeof z.json>>> {
  const meta = record(message.meta);
  const media = record(meta.media);
  const providerSeconds = Number(meta.providerTimestamp);
  const historicalTime =
    !meta.eventAt &&
    Number.isFinite(providerSeconds) &&
    providerSeconds > 0 &&
    providerSeconds * 1000 <= Date.now()
      ? { eventTimestamp: providerSeconds, eventAt: new Date(providerSeconds * 1000).toISOString() }
      : {};
  return JSON.parse(
    JSON.stringify({
      ...meta,
      ...historicalTime,
      ...(typeof media.id === 'string'
        ? {
            media: {
              ...media,
              mimeType: media.mimeType ?? media.mime_type,
            },
          }
        : {}),
    }),
  ) as Record<string, z.infer<ReturnType<typeof z.json>>>;
}

export interface CustomerServiceWindow {
  lastInboundAt: string | null;
  expiresAt: string | null;
  isOpen: boolean;
  serverNow: string;
}
export function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
