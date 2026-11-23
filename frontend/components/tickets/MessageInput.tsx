'use client';

/**
 * MessageInput — Input para enviar mensajes en el chat de ticket.
 *
 * - Deshabilita envío si body vacío o loading
 * - Ctrl+Enter / Cmd+Enter para enviar
 * - No permite enviar vacío
 */

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

interface MessageInputProps {
  /** Si false, el input se deshabilita y muestra tooltip explicativo */
  canSend: boolean;
  sending: boolean;
  onSend: (body: string) => Promise<{ ok: boolean }>;
}

export const MessageInput = memo(function MessageInput({
  canSend,
  sending,
  onSend,
}: MessageInputProps) {
  const [draft, setDraft] = useState('');

  const handleSend = useCallback(async () => {
    if (!draft.trim() || !canSend || sending) return;
    const res = await onSend(draft);
    if (res.ok) setDraft('');
  }, [draft, canSend, sending, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const isDisabled = !canSend || sending;
  const placeholder = canSend
    ? 'Escribí un mensaje al ciudadano (WhatsApp)… · Ctrl+Enter para enviar'
    : 'No podés enviar mensajes en el estado actual o sin asignación.';

  return (
    <div className="border-t bg-card p-4 space-y-2">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isDisabled}
        rows={3}
        className="resize-none focus-visible:ring-1"
        aria-label="Mensaje saliente al ciudadano"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {canSend ? 'Ctrl+Enter para enviar' : 'Cambiate la asignación para enviar'}
        </p>
        <Button
          size="sm"
          onClick={() => void handleSend()}
          disabled={isDisabled || !draft.trim()}
          className="gap-1.5"
          aria-label="Enviar mensaje"
        >
          <Send className="w-3.5 h-3.5" />
          {sending ? 'Enviando…' : 'Enviar'}
        </Button>
      </div>
    </div>
  );
});
