'use client';

/**
 * TicketChat — Panel de chat completo del ticket.
 *
 * Muestra el hilo de mensajes con auto-scroll al final.
 * Reutiliza el historial canónico de mensajes en modo consulta.
 */

import { MessageHistory, type HistoryProps } from '@/components/domain/messaging/MessageHistory';
import { Skeleton } from '@/components/ui/skeleton';
import { TypingIndicator } from '@/components/ui/typing-indicator';
import type { MessageWithStatusesDto } from '@/lib/conversations-api';
import { memo } from 'react';

interface TicketChatProps extends Pick<
  HistoryProps,
  'hasOlder' | 'loadingOlder' | 'loadOlder' | 'historyError' | 'identity'
> {
  messages: MessageWithStatusesDto[];
  loading: boolean;
  messagesLoading: boolean;
  botTyping: boolean;
  aiDraftText?: string;
}

function TypingBubble() {
  return (
    <div className="flex justify-end">
      <div className="bg-violet-600/80 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm max-w-50">
        <TypingIndicator label="IA escribiendo…" dotClassName="bg-white/80" />
      </div>
    </div>
  );
}

export const TicketChat = memo(function TicketChat({
  messages,
  loading,
  messagesLoading,
  botTyping,
  aiDraftText,
  hasOlder,
  loadingOlder,
  loadOlder,
  historyError,
  identity,
}: TicketChatProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0">
        <h3 className="text-sm font-bold tracking-tight">Mensajes</h3>
        {messagesLoading && (
          <span className="text-xs text-muted-foreground animate-pulse">Sincronizando…</span>
        )}
      </div>
      {/* Messages */}
      <MessageHistory
        messages={messages}
        identity={identity}
        hasOlder={hasOlder}
        loadingOlder={loadingOlder}
        loadOlder={loadOlder}
        historyError={historyError}
      >
        {loading && messages.length === 0 && <Skeleton className="h-16 w-2/3" />}
        {!loading && !messagesLoading && messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin mensajes aún.</p>
        )}

        {aiDraftText && aiDraftText.trim().length > 0 && (
          <div className="flex justify-end">
            <div className="bg-violet-600/80 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm max-w-[75%] animate-pulse">
              <p className="whitespace-pre-wrap wrap-anywhere">{aiDraftText}</p>
              <TypingIndicator
                label="IA escribiendo…"
                className="mt-1"
                dotClassName="bg-white/80"
              />
            </div>
          </div>
        )}

        {botTyping && <TypingBubble />}
      </MessageHistory>
    </div>
  );
});
