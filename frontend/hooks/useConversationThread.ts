'use client';

import { useMessageHistory } from '@/hooks/useMessageHistory';

import { useRealtimeManager } from '@/components/providers/realtime-provider';
import {
  type ConversationDetailDto,
  type MessageWithStatusesDto,
  conversationsApi,
} from '@/lib/conversations-api';
import { tryApplyRealtimePatch } from '@/lib/realtime/patch-helpers';
import { reportTicketLifecycle } from '@/lib/realtime/telemetry';
import { useConnectionStore } from '@/stores/use-connection-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const fetchHistory = (id: string, cursor?: string) =>
  conversationsApi.getMessages(id, { cursor, limit: 20 });

/** TTL de seguridad para auto-apagar el typing si no llega el evento 'false' */
const TYPING_AUTO_OFF_MS = 10_000;

export function useConversationThread(conversationId: string) {
  const manager = useRealtimeManager();
  const activeIdentity = useRef<string | undefined>(conversationId);
  useEffect(() => {
    activeIdentity.current = conversationId;
    return () => {
      activeIdentity.current = undefined;
    };
  }, [conversationId]);

  const [conversation, setConversation] = useState<ConversationDetailDto | undefined>(undefined);
  const {
    messages,
    setMessages,
    loading: messagesLoading,
    loadingOlder,
    hasOlder,
    historyError,
    refreshHistory: loadAllMessages,
    loadOlder,
  } = useMessageHistory<MessageWithStatusesDto>(conversationId, fetchHistory);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const socketConnected = useConnectionStore((state) => state.status === 'connected');
  const [botTyping, setBotTyping] = useState(false);
  const [aiDraftText, setAiDraftText] = useState('');

  useEffect(() => {
    setConversation(undefined);
    setBotTyping(false);
    setAiDraftText('');
  }, [conversationId]);

  // Refs to the latest state so realtime event handlers can apply patches
  // without depending on the state variables and re-registering on every change.
  const conversationRef = useRef(conversation);
  const messagesRef = useRef(messages);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /** Ref para el timer de auto-apagado del typing indicator */
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadConversation = useCallback(async () => {
    const versionBefore = manager?.getConversationVersion?.(conversationId);
    const res = await conversationsApi.getById(conversationId);
    if (res.ok) {
      if (
        activeIdentity.current === conversationId &&
        manager?.getConversationVersion?.(conversationId) === versionBefore
      )
        setConversation(res.data.conversation);
    } else {
      setError(res.message);
    }
  }, [conversationId, manager]);

  const refresh = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    await loadConversation();
    await loadAllMessages();
    setLoading(false);
  }, [loadAllMessages, loadConversation]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refetch immediately when the socket reconnects to recover any data that
  // arrived during the disconnection window (replay-via-REST).
  const prevSocketConnected = useRef(socketConnected);
  useEffect(() => {
    if (!prevSocketConnected.current && socketConnected) {
      void loadConversation();
      void loadAllMessages();
    }
    prevSocketConnected.current = socketConnected;
  }, [socketConnected, loadConversation, loadAllMessages]);

  /** Limpia el timer de auto-apagado cuando el componente se desmonta */
  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== undefined) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!manager) return;

    const consumerId = `thread-${conversationId}`;

    const refreshThread = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void loadConversation();
      void loadAllMessages();
    };

    const handler = (event: string, payload: unknown) => {
      if (typeof payload !== 'object' || payload === null) return;
      const rec = payload as Record<string, unknown>;
      if (rec.conversationId !== conversationId) return;

      switch (event) {
        case 'conversation.subscribed':
          refreshThread();
          break;
        case 'conversation.message.new': {
          if (rec.direction === 'outbound') {
            setAiDraftText('');
          }

          const applyResult = tryApplyRealtimePatch({
            event,
            payload,
            conversationId,
            conversation: conversationRef.current,
            messages: messagesRef.current,
          });

          if (applyResult.applied) {
            if (applyResult.messages) {
              messagesRef.current = applyResult.messages;
              setMessages(applyResult.messages);
            }
            if (applyResult.conversation) setConversation(applyResult.conversation);
          } else {
            console.warn(
              JSON.stringify({
                ts: new Date().toISOString(),
                component: 'useConversationThread',
                status: 'fallback_refetch',
                event,
                reason: applyResult.reason,
                eventId: rec.eventId,
                conversationId,
                correlationId: rec.correlationId,
              }),
            );
            refreshThread();
          }
          break;
        }
        case 'conversation.updated':
        case 'conversation.handover': {
          const applyResult = tryApplyRealtimePatch({
            event,
            payload,
            conversationId,
            conversation: conversationRef.current,
            messages: messagesRef.current,
          });

          if (applyResult.applied && applyResult.conversation) {
            setConversation(applyResult.conversation);
            reportTicketLifecycle(payload, 'applied');
          } else {
            console.warn(
              JSON.stringify({
                ts: new Date().toISOString(),
                component: 'useConversationThread',
                status: 'fallback_refetch',
                event,
                reason: applyResult.applied ? 'conversation_patch_missing' : applyResult.reason,
                eventId: rec.eventId,
                conversationId,
                correlationId: rec.correlationId,
              }),
            );
            refreshThread();
          }
          break;
        }
        case 'message.status.changed': {
          const applyResult = tryApplyRealtimePatch({
            event,
            payload,
            conversationId,
            conversation: conversationRef.current,
            messages: messagesRef.current,
          });

          if (applyResult.applied && applyResult.messages) {
            setMessages(applyResult.messages);
          }
          break;
        }
        case 'conversation.typing': {
          const typingPayload = rec as { typing?: boolean; ttlMs?: number };
          const isTyping = typingPayload.typing === true;

          if (typingTimerRef.current !== undefined) {
            clearTimeout(typingTimerRef.current);
            typingTimerRef.current = undefined;
          }

          setBotTyping(isTyping);

          if (isTyping) {
            const ttl = typingPayload.ttlMs ?? TYPING_AUTO_OFF_MS;
            typingTimerRef.current = setTimeout(() => {
              setBotTyping(false);
              typingTimerRef.current = undefined;
            }, ttl);
          }
          break;
        }
        case 'conversation.ai.chunk':
          if (typeof rec.accumulatedText === 'string') {
            setAiDraftText(rec.accumulatedText);
          } else if (typeof rec.textDelta === 'string' && rec.textDelta.length > 0) {
            setAiDraftText((prev) => `${prev}${rec.textDelta}`);
          }
          break;
        case 'conversation.ai.done':
          if (rec.handled === false) {
            setAiDraftText('');
          }
          break;
      }
    };

    manager.router.register({
      id: consumerId,
      conversationId,
      events: [
        'conversation.subscribed',
        'conversation.message.new',
        'conversation.updated',
        'conversation.handover',
        'conversation.typing',
        'conversation.ai.chunk',
        'conversation.ai.done',
        'message.status.changed',
      ],
      handler,
    });

    manager.subscribe(conversationId);

    return () => {
      manager.router.unregister(consumerId);
      manager.unsubscribe(conversationId);
    };
  }, [conversationId, loadAllMessages, loadConversation, manager, setMessages]);

  const sendMessage = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return { ok: false as const };

      setSending(true);
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const res = await conversationsApi.sendMessage(conversationId, trimmed, idempotencyKey);

      setSending(false);

      if (res.ok) {
        await loadAllMessages();
        await loadConversation();
        return { ok: true as const };
      }

      toast.error('No se pudo enviar el mensaje', { description: res.message });
      return { ok: false as const, message: res.message };
    },
    [conversationId, loadAllMessages, loadConversation],
  );

  return {
    loadingOlder,
    hasOlder,
    historyError,
    loadOlder,
    conversation,
    messages,
    loading,
    messagesLoading,
    error,
    sending,
    refresh,
    sendMessage,
    /** true mientras el bot/IA está procesando una respuesta */
    botTyping,
    /** borrador incremental del stream de IA */
    aiDraftText,
  };
}
