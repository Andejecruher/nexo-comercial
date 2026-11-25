'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/shared/api-client';
import type { MessageRenderable } from '@/components/shared/messaging/MessageBubble';

type CustomerWindow = { isOpen: boolean; expiresAt: string | null; serverNow: string };
export function useCustomerWindow(
  conversationId: string | undefined,
  messages: MessageRenderable[],
) {
  const [state, setState] = useState<{ id: string; open: boolean; error?: string }>();
  const inboundVersion = messages
    .filter((m) => m.direction === 'inbound')
    .map((m) => m.id)
    .join(',');
  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    let expiration: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      const result = await apiClient.get<CustomerWindow>(`/conversations/${conversationId}/window`);
      pending = false;
      if (!active) return;
      if (!result.ok) {
        setState({ id: conversationId, open: false, error: result.message });
        return;
      }
      if (expiration) clearTimeout(expiration);
      const remaining = result.data.expiresAt
        ? Date.parse(result.data.expiresAt) - Date.parse(result.data.serverNow)
        : 0;
      setState({ id: conversationId, open: result.data.isOpen && remaining > 0 });
      if (remaining > 0)
        expiration = setTimeout(() => {
          setState({ id: conversationId, open: false });
          void refresh();
        }, remaining);
    };
    const closed = () => {
      setState({ id: conversationId, open: false });
      void refresh();
    };
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    window.addEventListener('vc:whatsapp-window-closed', closed);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      clearInterval(interval);
      if (expiration) clearTimeout(expiration);
      window.removeEventListener('vc:whatsapp-window-closed', closed);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [conversationId, inboundVersion]);
  return {
    isOpen: state?.id === conversationId && state?.open === true,
    loading: state?.id !== conversationId,
    error: state?.id === conversationId ? state?.error : undefined,
  };
}
