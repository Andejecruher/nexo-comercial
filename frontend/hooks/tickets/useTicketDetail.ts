'use client';

import { useMessageHistory } from '@/hooks/useMessageHistory';

/**
 * useTicketDetail — Hook para el detalle de un ticket real (caso).
 *
 * - Carga el ticket (`GET /tickets/:ticketId`) y sus mensajes aislados
 *   (`GET /tickets/:ticketId/messages`).
 * - Se suscribe al canal realtime de la conversación subyacente
 *   (`ticket.conversationId`) — los eventos siguen siendo conversation-scoped.
 * - Polling + reconexión de socket.
 */

import { useRealtimeManager } from '@/components/providers/realtime-provider';
import type { MessageWithStatusesDto } from '@/lib/conversations-api';
import { tryApplyRealtimePatch } from '@/lib/realtime/patch-helpers';
import { reportTicketLifecycle } from '@/lib/realtime/telemetry';
import {
  rebaseTicketDetail,
  ticketDetailFromApi,
  ticketsApi,
  type TicketDetailDto,
} from '@/lib/tickets-api';
import { useConnectionStore } from '@/stores/use-connection-store';
import { useCallback, useEffect, useRef, useState } from 'react';

const fetchHistory = (id: string, cursor?: string) =>
  ticketsApi.getMessages(id, { cursor, limit: 20 });
const POLL_MS = 15_000;
const POLL_MS_CONNECTED = 60_000;

export function useTicketDetail(ticketId: string) {
  const manager = useRealtimeManager();
  const activeIdentity = useRef<string | undefined>(ticketId);
  useEffect(() => {
    activeIdentity.current = ticketId;
    return () => {
      activeIdentity.current = undefined;
    };
  }, [ticketId]);

  const [ticket, setTicket] = useState<TicketDetailDto | undefined>(undefined);
  const {
    messages,
    setMessages,
    loading: messagesLoading,
    loadingOlder,
    hasOlder,
    historyError,
    refreshHistory: loadMessages,
    loadOlder,
  } = useMessageHistory<MessageWithStatusesDto>(ticketId, fetchHistory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const socketConnected = useConnectionStore((state) => state.status === 'connected');
  const [botTyping, setBotTyping] = useState(false);
  const [aiDraftText, setAiDraftText] = useState('');

  // Conversation id derived from the loaded ticket — realtime events are
  // conversation-scoped, so subscriptions key on it rather than the ticket id.
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);

  const ticketRef = useRef(ticket);
  const messagesRef = useRef(messages);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== undefined) clearTimeout(typingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    ticketRef.current = ticket;
  }, [ticket]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const loadTicket = useCallback(async () => {
    const currentConversationId = ticketRef.current?.conversationId;
    const versionBefore = currentConversationId
      ? manager?.getConversationVersion?.(currentConversationId)
      : undefined;
    const res = await ticketsApi.getById(ticketId);
    if (res.ok) {
      const next = ticketDetailFromApi(res.data.ticket);
      if (activeIdentity.current !== ticketId) return;
      if (
        !currentConversationId ||
        manager?.getConversationVersion?.(currentConversationId) === versionBefore
      )
        setTicket(next);
      setConversationId(next.conversationId);
      setError(undefined);
    } else {
      setError(res.message);
    }
  }, [ticketId, manager]);

  const refresh = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    await loadTicket();
    await loadMessages();
    setLoading(false);
  }, [loadTicket, loadMessages]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Reset when switching tickets.
  useEffect(() => {
    setTicket(undefined);
    setConversationId(undefined);
  }, [ticketId]);

  // ─── Polling ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void loadTicket();
      void loadMessages();
    };
    const pollMs = socketConnected ? POLL_MS_CONNECTED : POLL_MS;
    const id = window.setInterval(tick, pollMs);
    return () => window.clearInterval(id);
  }, [loadTicket, loadMessages, socketConnected]);

  // Refetch immediately when the socket reconnects (replay-via-REST).
  const prevSocketConnected = useRef(socketConnected);
  useEffect(() => {
    if (!prevSocketConnected.current && socketConnected) {
      void loadTicket();
      void loadMessages();
    }
    prevSocketConnected.current = socketConnected;
  }, [socketConnected, loadTicket, loadMessages]);

  // ─── Socket ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!manager || !conversationId) return;

    const consumerId = `ticket-${ticketId}`;
    const activeConversationId = conversationId;

    const refreshThread = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void loadTicket();
      void loadMessages();
    };

    const handler = (event: string, payload: unknown) => {
      if (typeof payload !== 'object' || payload === null) return;
      const rec = payload as Record<string, unknown>;
      if (rec.conversationId !== activeConversationId) return;

      switch (event) {
        case 'conversation.subscribed':
          refreshThread();
          break;
        case 'conversation.message.new': {
          const messageTicketId = (rec.messagePatch as { ticketId?: string } | undefined)?.ticketId;
          if (!messageTicketId) {
            // Legacy payloads need the authoritative ticket-scoped snapshot.
            refreshThread();
            break;
          }
          if (messageTicketId !== ticketId) break;
          if (rec.direction === 'outbound') {
            setAiDraftText('');
          }

          const currentTicket = ticketRef.current;
          const applyResult = tryApplyRealtimePatch({
            event,
            payload,
            conversationId: activeConversationId,
            conversation: currentTicket?._rawDetail,
            messages: messagesRef.current,
            ticket: currentTicket,
          });

          if (applyResult.applied) {
            if (applyResult.messages) {
              messagesRef.current = applyResult.messages;
              setMessages(applyResult.messages);
            }
            if (applyResult.ticket) {
              setTicket(applyResult.ticket);
            } else if (applyResult.conversation && currentTicket) {
              setTicket(rebaseTicketDetail(currentTicket, applyResult.conversation));
            }
          } else {
            refreshThread();
          }
          break;
        }
        case 'conversation.updated':
        case 'conversation.handover': {
          const currentTicket = ticketRef.current;
          const applyResult = tryApplyRealtimePatch({
            event,
            payload,
            conversationId: activeConversationId,
            conversation: currentTicket?._rawDetail,
            messages: messagesRef.current,
            ticket: currentTicket,
          });

          if (applyResult.applied) {
            if (applyResult.ticket) {
              setTicket(applyResult.ticket);
            } else if (applyResult.conversation && currentTicket) {
              setTicket(rebaseTicketDetail(currentTicket, applyResult.conversation));
            }
            reportTicketLifecycle(payload, 'applied');
          } else {
            refreshThread();
          }
          break;
        }
        case 'message.status.changed': {
          const result = tryApplyRealtimePatch({
            event,
            payload,
            conversationId: activeConversationId,
            conversation: ticketRef.current?._rawDetail,
            messages: messagesRef.current,
            ticket: ticketRef.current,
          });
          if (result.applied && result.messages) {
            messagesRef.current = result.messages;
            setMessages(result.messages);
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
            typingTimerRef.current = setTimeout(() => {
              setBotTyping(false);
              typingTimerRef.current = undefined;
            }, typingPayload.ttlMs ?? 10_000);
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
        default:
          break;
      }
    };

    manager.router.register({
      id: consumerId,
      conversationId: activeConversationId,
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

    manager.subscribe(activeConversationId);

    return () => {
      manager.router.unregister(consumerId);
      manager.unsubscribe(activeConversationId);
    };
  }, [ticketId, conversationId, loadTicket, loadMessages, manager, setMessages]);

  return {
    loadingOlder,
    hasOlder,
    historyError,
    loadOlder,
    ticket,
    messages,
    loading,
    messagesLoading,
    error,
    refresh,
    botTyping,
    aiDraftText,
  };
}
