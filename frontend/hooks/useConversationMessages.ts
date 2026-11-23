'use client';

import { useMessageHistory } from '@/hooks/useMessageHistory';

import { useRealtimeManager } from '@/components/providers/realtime-provider';
import type { MessageWithStatusesDto } from '@/lib/conversations-api';
import { messagingApi, type MessageApi } from '@/lib/messaging-api';
import { applyMessagePatch, applyMessageStatusPatch } from '@/lib/realtime/patch-helpers';
import { isDurableEventPayload } from '@/lib/realtime/types';
import { useConnectionStore } from '@/stores/use-connection-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

const fetchHistory = (id: string, cursor?: string) =>
  messagingApi.listMessages(id, { cursor, limit: 20 });
const DEDUPE_WINDOW_MS = 4000;
const TYPING_AUTO_OFF_MS = 10_000;

export interface PreparedAttachmentPayload {
  file?: File;
  contactCitizenId?: string;
  template?: { id: string; variables: Record<string, string> };
  requestKey?: string;
  storageKey: string;
  mimeType: string;
  fileSizeBytes: string;
  originalFilename?: string;
  cdnUrl?: string;
  previewUrl?: string;
}

function buildPayloadSignature(text: string, attachments: PreparedAttachmentPayload[]): string {
  const keys = attachments
    .map((a) => JSON.stringify([a.storageKey, a.fileSizeBytes, a.contactCitizenId, a.template]))
    .join('|');
  return `${text.trim().toLowerCase()}#${keys}`;
}

const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/3gpp']);
export const VIDEO_CAPTION_MAX_CHARS = 1024;

/**
 * WhatsApp outbound video: el texto que acompaña a un único vídeo se envía
 * como caption del propio vídeo (truncado a 1024 caracteres) en lugar de un
 * mensaje de texto separado. Con imágenes, documentos u otros adjuntos se
 * mantiene el comportamiento actual (texto como mensaje aparte).
 */
export function resolveVideoCaption(
  text: string,
  attachments: PreparedAttachmentPayload[],
): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const files = attachments.filter((a) => !a.contactCitizenId && !a.template && a.file);
  if (files.length !== 1) return undefined;
  const mime = files[0].mimeType.split(';')[0].trim().toLowerCase();
  if (!VIDEO_MIME_TYPES.has(mime)) return undefined;
  if (trimmed.length <= VIDEO_CAPTION_MAX_CHARS) return trimmed;
  // Truncate by code points so a surrogate pair (emoji) is never split in half.
  return Array.from(trimmed).slice(0, VIDEO_CAPTION_MAX_CHARS).join('');
}

export function useConversationMessages(conversationId: string | undefined) {
  const activeIdentity = useRef<string | undefined>(conversationId);
  useEffect(() => {
    activeIdentity.current = conversationId;
    return () => {
      activeIdentity.current = undefined;
    };
  }, [conversationId]);

  const {
    messages,
    setMessages,
    loading: loading,
    loadingOlder,
    hasOlder,
    historyError,
    refreshHistory: loadMessages,
    loadOlder,
  } = useMessageHistory<MessageApi>(conversationId, fetchHistory);
  const [sending, setSending] = useState(false);
  const [botTyping, setBotTyping] = useState(false);
  const socketConnected = useConnectionStore((state) => state.status === 'connected');

  const lastSignatureRef = useRef<string | undefined>(undefined);
  const lastSignatureAtRef = useRef<number>(0);
  const inFlightRef = useRef(false);
  const attemptRef = useRef<{ signature: string; key: string } | undefined>(undefined);
  const messagesRef = useRef(messages);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const manager = useRealtimeManager();

  useEffect(() => {
    setBotTyping(false);
  }, [conversationId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const prevSocketConnected = useRef(socketConnected);
  useEffect(() => {
    if (!prevSocketConnected.current && socketConnected) {
      void loadMessages();
    }
    prevSocketConnected.current = socketConnected;
  }, [loadMessages, socketConnected]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== undefined) clearTimeout(typingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!manager || !conversationId) return;

    const consumerId = `inbox-messages-${conversationId}`;
    const handler = (event: string, payload: unknown) => {
      if (typeof payload !== 'object' || payload === null) return;
      const rec = payload as Record<string, unknown>;
      if (rec.conversationId !== conversationId) return;

      if (event === 'conversation.subscribed') {
        void loadMessages();
        return;
      }
      if (event === 'conversation.typing') {
        const isTyping = rec.typing === true;
        if (typingTimerRef.current !== undefined) {
          clearTimeout(typingTimerRef.current);
          typingTimerRef.current = undefined;
        }
        setBotTyping(isTyping);
        if (isTyping) {
          typingTimerRef.current = setTimeout(
            () => {
              setBotTyping(false);
              typingTimerRef.current = undefined;
            },
            typeof rec.ttlMs === 'number' ? rec.ttlMs : TYPING_AUTO_OFF_MS,
          );
        }
        return;
      }

      if (event === 'message.status.changed') {
        if (!isDurableEventPayload(payload) || !payload.messageStatusPatch) return;
        const statusResult = applyMessageStatusPatch(
          messagesRef.current as MessageWithStatusesDto[],
          payload.messageStatusPatch,
          conversationId,
        );
        if (statusResult.ok) {
          messagesRef.current = statusResult.messages as MessageApi[];
          setMessages(statusResult.messages as MessageApi[]);
        }
        return;
      }

      if (!isDurableEventPayload(payload) || !payload.messagePatch) {
        if (event === 'conversation.message.new') {
          console.warn(
            JSON.stringify({
              ts: new Date().toISOString(),
              component: 'useConversationMessages',
              status: 'fallback_refetch',
              event,
              reason: 'incompatible_payload',
              conversationId,
            }),
          );
          void loadMessages();
        }
        return;
      }

      const result = applyMessagePatch(
        messagesRef.current as MessageWithStatusesDto[],
        payload.messagePatch,
        conversationId,
      );
      if (!result.ok) {
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            component: 'useConversationMessages',
            status: 'fallback_refetch',
            event,
            reason: result.reason,
            eventId: payload.eventId,
            conversationId,
            correlationId: payload.correlationId,
          }),
        );
        void loadMessages();
        return;
      }
      messagesRef.current = result.messages as MessageApi[];
      setMessages(result.messages as MessageApi[]);
    };

    manager.router.register({
      id: consumerId,
      conversationId,
      events: [
        'conversation.subscribed',
        'conversation.message.new',
        'conversation.updated',
        'conversation.typing',
        'message.status.changed',
      ],
      handler,
    });

    manager.subscribe(conversationId);

    return () => {
      manager.router.unregister(consumerId);
      manager.unsubscribe(conversationId);
    };
  }, [conversationId, loadMessages, manager, setMessages]);

  const sendMessageSafe = useCallback(
    async (text: string, attachments: PreparedAttachmentPayload[] = []) => {
      if (!conversationId) return { ok: false as const, message: 'Sin conversación' };

      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) {
        return { ok: false as const, message: 'Mensaje vacío' };
      }

      if (inFlightRef.current) {
        return { ok: false as const, message: 'Envío en curso' };
      }

      const signature = buildPayloadSignature(
        trimmed || (attachments.length > 0 ? '__attach__' : ''),
        attachments,
      );
      const now = Date.now();
      if (
        lastSignatureRef.current === signature &&
        now - lastSignatureAtRef.current < DEDUPE_WINDOW_MS
      ) {
        return { ok: false as const, message: 'Duplicado' };
      }

      const requestSignature = JSON.stringify([
        conversationId,
        trimmed,
        attachments.map((a) => [
          a.originalFilename,
          a.fileSizeBytes,
          a.file?.lastModified,
          a.contactCitizenId,
          a.template,
        ]),
      ]);
      if (attemptRef.current?.signature !== requestSignature)
        attemptRef.current = { signature: requestSignature, key: crypto.randomUUID() };
      const idempotencyKey = attemptRef.current.key;
      inFlightRef.current = true;
      setSending(true);
      let created: MessageApi | undefined;
      const fail = (message: string) => {
        inFlightRef.current = false;
        setSending(false);
        toast.error('No se pudo enviar el mensaje', { description: message });
        return { ok: false as const, message };
      };
      // WhatsApp outbound video: si hay un único vídeo, el texto del borrador
      // viaja como caption del vídeo en el mismo payload (≤1024 caracteres).
      const videoCaption = resolveVideoCaption(trimmed, attachments);
      if (trimmed && !videoCaption) {
        const result = await messagingApi.sendMessage(
          conversationId,
          { body: trimmed },
          `${idempotencyKey}:text`,
        );
        if (!result.ok) return fail(result.message);
        created = result.data.message;
      }
      for (let index = 0; index < attachments.length; index++) {
        const attachment = attachments[index];
        if (attachment.contactCitizenId || attachment.template) {
          const result = attachment.contactCitizenId
            ? await messagingApi.sendContact(
                conversationId,
                attachment.contactCitizenId,
                `${idempotencyKey}:${index}`,
              )
            : await messagingApi.sendTemplate(
                conversationId,
                attachment.template!.id,
                attachment.template!.variables,
                `${idempotencyKey}:${index}`,
              );
          if (!result.ok) return fail(result.message);
          created = result.data.message;
          continue;
        }
        if (!attachment.file) return fail('Selecciona nuevamente el archivo para enviarlo');
        const form = new FormData();
        form.append('file', attachment.file);
        if (videoCaption) form.append('caption', videoCaption);
        const result = await apiClient.post<{ message: MessageApi }>(
          `/conversations/${conversationId}/messages/media`,
          form,
          { headers: { 'Idempotency-Key': `${idempotencyKey}:${index}` } },
        );
        if (!result.ok) {
          await loadMessages();
          return fail(result.message);
        }
        created = result.data.message;
      }
      attemptRef.current = undefined;

      lastSignatureRef.current = signature;
      lastSignatureAtRef.current = Date.now();

      inFlightRef.current = false;
      setSending(false);

      await loadMessages();

      return { ok: true as const, message: created };
    },
    [conversationId, loadMessages],
  );

  const sendAudioSafe = useCallback(
    async (file: File, durationSeconds: number) => {
      if (!conversationId) return { ok: false as const, message: 'Sin conversación' };
      if (inFlightRef.current) {
        return { ok: false as const, message: 'Envío en curso' };
      }

      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      inFlightRef.current = true;
      setSending(true);

      const sendResult = await messagingApi.sendAudio(
        conversationId,
        file,
        durationSeconds,
        idempotencyKey,
      );

      inFlightRef.current = false;
      setSending(false);

      if (!sendResult.ok) {
        toast.error('No se pudo enviar el audio', { description: sendResult.message });
        return { ok: false as const, message: sendResult.message };
      }

      await loadMessages();
      return { ok: true as const, message: sendResult.data.message };
    },
    [conversationId, loadMessages],
  );

  return {
    loadingOlder,
    hasOlder,
    historyError,
    loadOlder,
    messages,
    loading,
    sending,
    error: historyError,
    botTyping,
    socketConnected,
    refresh: loadMessages,
    sendMessageSafe,
    sendAudioSafe,
  };
}
