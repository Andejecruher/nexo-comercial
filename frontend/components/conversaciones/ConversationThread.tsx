'use client';

import { StartConversationDialog } from '@/components/conversaciones/start-conversation-dialog';
import { CustomerWindowBanner } from '@/components/conversaciones/CustomerWindowBanner';
import { MessageHistory, type HistoryProps } from '@/components/shared/messaging/MessageHistory';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TypingIndicator } from '@/components/ui/typing-indicator';
import { useCustomerWindow } from '@/hooks/conversaciones/useCustomerWindow';
import type { MessageWithStatusesDto } from '@/lib/shared/conversations-api';
import type { InboxConversation } from '@/lib/shared/messaging-api';
import { useState } from 'react';

interface ConversationThreadProps extends Pick<
  HistoryProps,
  'hasOlder' | 'loadingOlder' | 'loadOlder' | 'historyError' | 'identity'
> {
  chat?: InboxConversation;
  messages: MessageWithStatusesDto[];
  loading: boolean;
  messagesLoading: boolean;
  aiDraftText?: string;
  canSend: boolean;
  sending: boolean;
  onSend: (body: string) => Promise<{ ok: boolean }>;
  /** id del usuario autenticado — para etiquetar "Tú" los mensajes propios */
  currentUserId?: string;
}

export function ConversationThread({
  messages,
  chat,
  loading,
  messagesLoading,
  aiDraftText,
  canSend,
  sending,
  onSend,
  currentUserId,
  hasOlder,
  loadingOlder,
  loadOlder,
  historyError,
  identity,
}: ConversationThreadProps) {
  const [draft, setDraft] = useState('');
  const [templateOpen, setTemplateOpen] = useState(false);
  const windowState = useCustomerWindow(identity, messages);

  const handleSend = async () => {
    const res = await onSend(draft);
    if (res.ok) setDraft('');
  };

  if (loading && messages.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-muted-foreground">Cargando hilo…</div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card flex flex-col min-h-120 max-h-[70vh]">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
        <h2 className="text-sm font-black tracking-tight">Mensajes</h2>
        {messagesLoading && <span className="text-xs text-muted-foreground">Sincronizando…</span>}
      </div>
      <MessageHistory
        messages={messages}
        identity={identity}
        currentUserId={currentUserId}
        hasOlder={hasOlder}
        loadingOlder={loadingOlder}
        loadOlder={loadOlder}
        historyError={historyError}
      >
        {messages.length === 0 && !messagesLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">Sin mensajes aún.</p>
        )}

        {aiDraftText && aiDraftText.trim().length > 0 && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2 text-sm bg-primary/80 text-primary-foreground animate-pulse">
              <p className="whitespace-pre-wrap wrap-break-word">{aiDraftText}</p>
              <TypingIndicator
                label="IA escribiendo…"
                className="mt-1"
                dotClassName="bg-primary-foreground/80"
              />
            </div>
          </div>
        )}
      </MessageHistory>
      <div className="p-4 border-t space-y-2">
        {!windowState.isOpen && chat && (
          <CustomerWindowBanner {...windowState} onStart={() => setTemplateOpen(true)} />
        )}
        {chat && (
          <StartConversationDialog
            open={templateOpen}
            onOpenChange={setTemplateOpen}
            initialChat={chat}
            onSelect={() => setTemplateOpen(false)}
          />
        )}
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            canSend
              ? 'Escribí un mensaje al ciudadano (WhatsApp)…'
              : 'No podés enviar mensajes en este estado o asignación.'
          }
          disabled={!windowState.isOpen || !canSend || sending}
          className="min-h-22 resize-y"
          aria-label="Mensaje saliente"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={!windowState.isOpen || !canSend || sending || !draft.trim()}
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
