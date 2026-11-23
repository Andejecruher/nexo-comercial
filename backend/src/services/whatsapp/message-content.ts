import { MessageType } from '@prisma/client';
import { z } from 'zod';
import type { WaInboundMessage } from '../../types/whatsapp.types';

const contactName = z.object({
  formatted_name: z.string().min(1).max(512),
  first_name: z.string().max(512).optional(),
  last_name: z.string().max(512).optional(),
  middle_name: z.string().max(512).optional(),
  prefix: z.string().max(128).optional(),
  suffix: z.string().max(128).optional(),
});
export const contactsSchema = z
  .array(
    z.object({
      name: contactName,
      phones: z
        .array(
          z.object({
            phone: z.string().min(1).max(64).optional(),
            type: z.string().max(32).optional(),
            wa_id: z
              .string()
              .regex(/^\d{1,64}$/)
              .optional(),
          }),
        )
        .max(20)
        .optional(),
      emails: z
        .array(
          z.object({ email: z.string().email().max(320), type: z.string().max(32).optional() }),
        )
        .max(20)
        .optional(),
      org: z
        .object({
          company: z.string().max(512).optional(),
          department: z.string().max(512).optional(),
          title: z.string().max(512).optional(),
        })
        .optional(),
      addresses: z
        .array(z.record(z.string().max(32), z.string().max(512)))
        .max(20)
        .optional(),
      urls: z
        .array(z.object({ url: z.string().url().max(2048), type: z.string().max(32).optional() }))
        .max(20)
        .optional(),
      birthday: z.string().max(16).optional(),
    }),
  )
  .min(1)
  .max(20);

export function canonicalMessageType(type: string): MessageType {
  return Object.values(MessageType).includes(type as MessageType)
    ? (type as MessageType)
    : MessageType.unsupported;
}

/** Allowlist persisted content; never save provider download URLs or arbitrary webhook keys. */
export function inboundContent(
  message: WaInboundMessage,
  phoneNumberId?: string,
): Record<string, unknown> {
  const msg = message as unknown as Record<string, unknown>;
  const meta: Record<string, unknown> = {
    schemaVersion: 1,
    type: message.type,
    rawId: message.id,
    providerTimestamp: message.timestamp,
  };
  const context = msg.context as { id?: unknown; from?: unknown } | undefined;
  if (typeof context?.id === 'string') meta.context = { id: context.id };
  if (['image', 'audio', 'video', 'document', 'sticker'].includes(message.type)) {
    const media = msg[message.type] as Record<string, unknown> | undefined;
    if (media && typeof media.id === 'string') {
      meta.media = {
        id: media.id,
        ...(phoneNumberId ? { phoneNumberId } : {}),
        ...Object.fromEntries(
          ['mime_type', 'sha256', 'caption', 'filename', 'voice', 'animated']
            .filter((key) => ['string', 'boolean'].includes(typeof media[key]))
            .map((key) => [key, media[key]]),
        ),
      };
    }
  }
  if (message.type === 'contacts') {
    const parsed = contactsSchema.safeParse(message.contacts);
    if (parsed.success) meta.contacts = parsed.data;
    else meta.contentIncomplete = true;
  }
  if (message.type === 'location') meta.location = message.location;
  if (message.type === 'interactive') meta.interactive = message.interactive;
  if (message.type === 'reaction') meta.reaction = message.reaction;
  return meta;
}
