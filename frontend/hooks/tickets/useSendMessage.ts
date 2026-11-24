'use client';

/**
 * useSendMessage — Hook para enviar mensajes en un ticket.
 *
 * - Valida que el body no esté vacío
 * - Genera idempotency key para evitar duplicados
 * - Llama a ticketsApi.sendMessage
 * - Notifica error vía toast
 */

import { ticketsApi } from '@/lib/shared/tickets-api';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

interface UseSendMessageOptions {
  /** Callback invocado si el envío fue exitoso (para refrescar mensajes) */
  onSuccess?: () => void | Promise<void>;
}

export function useSendMessage(conversationId: string, options: UseSendMessageOptions = {}) {
  const [sending, setSending] = useState(false);

  const sendMessage = useCallback(
    async (body: string): Promise<{ ok: boolean; message?: string }> => {
      const trimmed = body.trim();
      if (!trimmed) return { ok: false, message: 'El mensaje no puede estar vacío.' };

      setSending(true);

      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const res = await ticketsApi.sendMessage(conversationId, trimmed, idempotencyKey);

      setSending(false);

      if (res.ok) {
        await options.onSuccess?.();
        return { ok: true };
      }

      toast.error('No se pudo enviar el mensaje', { description: res.message });
      return { ok: false, message: res.message };
    },
    [conversationId, options],
  );

  return { sendMessage, sending };
}
