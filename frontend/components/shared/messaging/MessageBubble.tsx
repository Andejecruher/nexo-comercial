'use client';

/**
 * MessageBubble — ÚNICO renderizador de mensajes de la aplicación.
 *
 * Regla R-UI-1: las vistas de solo lectura de una entidad reutilizan el
 * componente canónico. chat-window.tsx, ConversationThread.tsx y
 * TicketChat.tsx consumen este componente; está prohibido renderizar
 * burbujas inline por vista.
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MESSAGE_TIME_ZONE } from '@/lib/shared/message-dates';
import type { MessageStatusValueApi } from '@/lib/shared/messaging-api';
import { cn } from '@/lib/shared/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftRight, Info } from 'lucide-react';
import { memo } from 'react';
import { MessageContent } from '@/components/shared/messaging/MessageContent';

import { MessageStatusIndicator } from '@/components/shared/messaging/MessageStatusIndicator';

// ─── Tipo estructural: acepta MessageApi (messaging-api) y MessageWithStatusesDto (conversations-api) ───

export interface MessageSenderLike {
  id: string;
  fullName?: string | null;
  email?: string;
}

export interface MessageStatusLike {
  status: string;
  timestamp?: string;
  createdAt?: string;
}

export interface MessageAttachmentLike {
  mediaUrl?: string;
  mediaDownloadUrl?: string;
  mediaUrlExpiresAt?: string;
  mediaError?: 'MEDIA_URL_UNAVAILABLE';
  id: string;
  processingState?: string;
  fileSizeBytes?: string | number;
  storageKey?: string;
  mimeType?: string;
  originalFilename?: string;
  cdnUrl?: string;
}

export interface MessageRenderable {
  mediaUrl?: string;
  mediaDownloadUrl?: string;
  mediaUrlExpiresAt?: string;
  mediaError?: 'MEDIA_URL_UNAVAILABLE';
  conversationId?: string;
  id: string;
  externalMessageId?: string;
  body: string;
  direction: 'inbound' | 'outbound';
  messageType: string;
  createdAt: string;
  sendByUserId?: string | null;
  sender?: MessageSenderLike | null;
  meta: Record<string, unknown>;
  statuses?: MessageStatusLike[];
  attachmentsViaMessageId?: MessageAttachmentLike[];
}

/**
 * Reacción de WhatsApp sobre un mensaje — vive en `meta.reaction`.
 * `emoji: null` significa que el ciudadano retiró su reacción.
 */
export interface MessageReactionLike {
  emoji: string | null;
  from?: string;
  updated_at?: string;
}

function readReaction(meta: Record<string, unknown> | undefined): MessageReactionLike | null {
  const raw = meta?.reaction;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { emoji, from, updated_at } = raw as Record<string, unknown>;
  // Sin emoji la reacción fue retirada → no se renderiza badge.
  if (typeof emoji !== 'string' || emoji.trim().length === 0) return null;
  return {
    emoji,
    ...(typeof from === 'string' ? { from } : {}),
    ...(typeof updated_at === 'string' ? { updated_at } : {}),
  };
}

export interface MessageBubbleProps {
  message: MessageRenderable;
  /** id del usuario autenticado — para etiquetar "Tú" los mensajes propios */
  currentUserId?: string;
  /** animación de entrada (framer-motion) */
  animate?: boolean;
  /** 'time' (HH:mm) | 'datetime' (fecha + hora) */
  timestamp?: 'time' | 'datetime';
}

type Variant = 'citizen' | 'self' | 'agent' | 'bot';

interface VariantCfg {
  wrapper: 'self-start' | 'self-end';
  bubble: string;
  meta: string;
}

const VARIANTS: Record<Variant, VariantCfg> = {
  citizen: {
    wrapper: 'self-start',
    bubble: 'bg-muted text-foreground rounded-bl-md',
    meta: 'text-muted-foreground',
  },
  self: {
    wrapper: 'self-end',
    bubble: 'bg-primary text-primary-foreground rounded-br-md',
    meta: 'text-primary-foreground/80',
  },
  agent: {
    wrapper: 'self-end',
    bubble: 'bg-primary text-primary-foreground rounded-br-md',
    meta: 'text-primary-foreground/80',
  },
  bot: {
    wrapper: 'self-end',
    bubble: 'bg-primary text-primary-foreground rounded-br-md',
    meta: 'text-primary-foreground/80',
  },
} as const;

function resolveVariant(
  message: MessageRenderable,
  currentUserId?: string,
): { variant: Variant; isSelf: boolean } {
  if (message.direction === 'inbound') return { variant: 'citizen', isSelf: false };

  const sender = message.sender;
  if (sender) {
    const isSelf = currentUserId !== undefined && currentUserId === sender.id;
    return { variant: isSelf ? 'self' : 'agent', isSelf };
  }

  return { variant: 'bot', isSelf: false };
}

function labelFor(variant: Exclude<Variant, 'citizen'>, message: MessageRenderable): string {
  const sender = message.sender;
  switch (variant) {
    case 'self':
      return sender?.fullName || 'Tú';
    case 'agent':
      return sender?.fullName || 'Agente';
    case 'bot':
      return 'Bot IA';
  }
}

function readAiAgentName(meta: Record<string, unknown> | undefined): string | undefined {
  const value = meta?.aiAgentName;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatTimestamp(iso: string, mode: 'time' | 'datetime'): string {
  const ts = new Date(iso);
  if (!Number.isFinite(ts.getTime())) return 'Fecha desconocida';
  if (mode === 'time') {
    return ts.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: MESSAGE_TIME_ZONE,
    });
  }
  return `${ts.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', timeZone: MESSAGE_TIME_ZONE })} · ${ts.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: MESSAGE_TIME_ZONE })}`;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  currentUserId,
  animate = false,
  timestamp = 'time',
}: MessageBubbleProps) {
  const { variant, isSelf } = resolveVariant(message, currentUserId);
  const cfg = VARIANTS[variant];

  const sender = message.sender;
  const isInbound = variant === 'citizen';
  const isContact = Array.isArray(message.meta?.contacts) && message.meta.contacts.length > 0;
  const reaction = readReaction(message.meta);

  const statuses = (message.statuses ?? [])
    .map((s) => ({
      status: s.status as MessageStatusValueApi,
      timestamp: s.timestamp ?? s.createdAt ?? '',
    }))
    .filter((s) => Boolean(s.timestamp));

  if (message.meta?.deliveryState === 'failed')
    statuses.push({ status: 'failed', timestamp: message.createdAt });

  if (message.messageType === 'system' && !message.meta?.media) {
    const kind = typeof message.meta?.kind === 'string' ? message.meta.kind : undefined;
    const SystemIcon = kind === 'transfer' ? ArrowLeftRight : Info;
    const pill = (
      <div className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-muted/60 px-3 py-1 text-[11px] leading-snug text-muted-foreground">
        <SystemIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 whitespace-pre-wrap wrap-anywhere">{message.body}</span>
        <span className="shrink-0 opacity-60">
          {formatTimestamp(
            typeof message.meta?.eventAt === 'string' ? message.meta.eventAt : message.createdAt,
            timestamp,
          )}
        </span>
      </div>
    );
    return (
      <div className="flex w-full justify-center">
        {animate ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {pill}
          </motion.div>
        ) : (
          pill
        )}
      </div>
    );
  }

  const name =
    variant === 'citizen' ? null : (
      <span
        title={labelFor(variant, message)}
        className={cn(
          'inline-block max-w-full truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider',
          cfg.meta,
        )}
      >
        {labelFor(variant, message)}
      </span>
    );

  const botAgentName = variant === 'bot' ? readAiAgentName(message.meta) : undefined;
  const isSticker = message.messageType === 'sticker' || message.meta?.type === 'sticker';
  const isTemplate = message.messageType === 'template' || message.meta?.type === 'template';
  const senderLabel =
    name === null ? null : variant === 'bot' && !botAgentName ? (
      name
    ) : (
      <Tooltip>
        <TooltipTrigger className="block min-w-0 max-w-full w-fit cursor-default text-left">
          {name}
        </TooltipTrigger>
        <TooltipContent className="font-medium normal-case tracking-normal">
          {variant === 'bot' ? botAgentName : `${isSelf ? 'Tú — ' : ''}${sender?.email ?? ''}`}
        </TooltipContent>
      </Tooltip>
    );

  const bubble = (
    <div
      className={cn(
        'min-w-0 rounded-2xl px-3 py-2.5 text-sm shadow-sm wrap-anywhere sm:px-4',
        cfg.bubble,
        isContact &&
          'w-[min(20rem,calc(100vw-3rem))] max-w-full rounded-xl px-0 py-0 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] sm:px-0',
        isSticker && 'bg-transparent px-0 py-0 shadow-none',
        isTemplate &&
          'overflow-hidden rounded-xl bg-white px-0 py-0 text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
      )}
    >
      <MessageContent message={message} />

      <div
        className={cn(
          'flex flex-wrap items-center gap-1 mt-1',
          isInbound ? 'justify-start' : 'justify-end',
          isTemplate && 'px-3 pb-2 text-[#667781]',
          isContact && 'px-3 pb-2 opacity-75',
        )}
      >
        {senderLabel}
        <span className={cn('whitespace-nowrap text-[10px]', cfg.meta)}>
          {formatTimestamp(
            typeof message.meta?.eventAt === 'string' ? message.meta.eventAt : message.createdAt,
            timestamp,
          )}
        </span>
        {!isInbound && (
          <MessageStatusIndicator
            accepted={message.externalMessageId?.startsWith('wamid.')}
            statuses={statuses}
            className={isTemplate ? 'text-[#53bdeb]' : 'text-primary-foreground'}
          />
        )}
      </div>
    </div>
  );

  // La reacción se superpone a la esquina inferior del mensaje original, del
  // lado opuesto a la "cola" de la burbuja — nunca como una burbuja propia.
  const reactionBadge = reaction ? (
    <span
      role="img"
      aria-label={`Reacción: ${reaction.emoji}`}
      title={reaction.from ? `Reacción de ${reaction.from}` : 'Reacción'}
      className={cn(
        'pointer-events-none absolute bottom-0 z-10 flex size-5 items-center justify-center rounded-full border border-border/60 bg-background text-[11px] leading-none shadow-sm',
        isInbound ? 'left-1 translate-y-1/2' : 'right-1 translate-y-1/2',
      )}
    >
      {reaction.emoji}
    </span>
  ) : null;

  return (
    <div className={cn('relative min-w-0 w-fit max-w-[90%] sm:max-w-[80%]', cfg.wrapper)}>
      {animate ? (
        <AnimatePresence initial={false}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {bubble}
          </motion.div>
        </AnimatePresence>
      ) : (
        bubble
      )}
      {reactionBadge}
    </div>
  );
});
