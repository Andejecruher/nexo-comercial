'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiResponse } from '@/lib/shared/api-client';
import { mergeMessageSnapshot } from '@/lib/shared/realtime/snapshot-merge';

type Page<T> = { items: T[]; meta: { nextCursor?: string; hasNextPage: boolean } };
export function useMessageHistory<T extends { id: string; createdAt: string }>(
  identity: string | undefined,
  fetchPage: (identity: string, cursor?: string) => Promise<ApiResponse<Page<T>>>,
) {
  const [messages, setMessages] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [historyError, setHistoryError] = useState<string>();
  const epoch = useRef(0);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const cursor = useRef<string | undefined>(undefined);
  const initialized = useRef(false);
  const requests = useRef(new Set<string>());
  useEffect(() => {
    const generation = ++epoch.current;
    cursor.current = undefined;
    initialized.current = false;
    requests.current.clear();
    messagesRef.current = [];
    setMessages([]);
    setLoading(false);
    setLoadingOlder(false);
    setHasOlder(false);
    setHistoryError(undefined);
    return () => {
      epoch.current = generation + 1;
    };
  }, [identity]);
  const load = useCallback(
    async (older = false) => {
      if (!identity || (older && !cursor.current)) return;
      const key = older ? cursor.current! : 'latest';
      if (requests.current.has(key)) return;
      requests.current.add(key);
      const version = epoch.current;
      const captured = new Map(messagesRef.current.map((message) => [message.id, message]));
      if (older) setLoadingOlder(true);
      else setLoading(true);
      setHistoryError(undefined);
      try {
        const result = await fetchPage(identity, older ? cursor.current : undefined);
        if (version !== epoch.current) return;
        if (!result.ok) {
          setHistoryError(result.message);
          return;
        }
        setMessages((current) => {
          const changed = current.filter((m) => captured.get(m.id) !== m);
          return mergeMessageSnapshot(
            mergeMessageSnapshot(result.data.items, current),
            changed,
            true,
          );
        });
        if (older || !initialized.current) {
          cursor.current = result.data.meta.nextCursor;
          setHasOlder(result.data.meta.hasNextPage);
          initialized.current = true;
        }
      } catch {
        if (version === epoch.current) setHistoryError('No se pudieron cargar los mensajes');
      } finally {
        if (version === epoch.current) {
          requests.current.delete(key);
          if (older) setLoadingOlder(false);
          else setLoading(false);
        }
      }
    },
    [identity, fetchPage],
  );
  const refreshHistory = useCallback(() => load(false), [load]);
  const loadOlder = useCallback(() => load(true), [load]);
  useEffect(() => {
    if (!identity) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshHistory();
    }, 30_000);
    return () => clearInterval(timer);
  }, [identity, refreshHistory]);
  return {
    messages,
    setMessages,
    loading,
    loadingOlder,
    hasOlder,
    historyError,
    refreshHistory,
    loadOlder,
  };
}
