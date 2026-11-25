'use client';

import {
  type AiTopic,
  type AiListParams,
  type CreateTopicPayload,
  type UpdateTopicPayload,
  topicsApi,
} from '@/lib/shared/ai-api';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export function useTopics(params?: AiListParams) {
  const [topics, setTopics] = useState<AiTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);

  const search = params?.search;
  const isActive = params?.isActive;

  const fetchTopics = useCallback(
    async (targetCursor?: string) => {
      setLoading(true);
      setError(undefined);
      const result = await topicsApi.list({ search, isActive, cursor: targetCursor, limit: 50 });
      if (result.ok) {
        setTopics(result.data.topics);
        setCursor(result.data.meta.nextCursor);
        setHasNextPage(result.data.meta.hasNextPage);
        setTotalCount(result.data.meta.count);
      } else {
        setError(result.message);
        toast.error('Error al cargar tópicos', { description: result.message });
      }
      setLoading(false);
    },
    [search, isActive],
  );

  useEffect(() => {
    setCursorHistory([]);
    fetchTopics(undefined);
  }, [fetchTopics]);

  const refresh = useCallback(() => {
    setCursorHistory([]);
    fetchTopics(undefined);
  }, [fetchTopics]);

  const nextPage = useCallback(() => {
    if (!hasNextPage || !cursor) return;
    setCursorHistory((prev) => [...prev, prev[prev.length - 1]]);
    fetchTopics(cursor);
  }, [hasNextPage, cursor, fetchTopics]);

  const previousPage = useCallback(() => {
    if (cursorHistory.length === 0) return;
    const newHistory = [...cursorHistory];
    const previousCursor = newHistory.pop();
    setCursorHistory(newHistory);
    fetchTopics(previousCursor);
  }, [cursorHistory, fetchTopics]);

  const createTopic = useCallback(
    async (payload: CreateTopicPayload) => {
      const result = await topicsApi.create(payload);
      if (result.ok) {
        toast.success('Tópico creado');
        refresh();
        return { success: true, data: result.data.topic };
      } else {
        toast.error('Error al crear tópico', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [refresh],
  );

  const updateTopic = useCallback(async (id: string, payload: UpdateTopicPayload) => {
    const result = await topicsApi.update(id, payload);
    if (result.ok) {
      setTopics((prev) => prev.map((t) => (t.id === id ? result.data.topic : t)));
      toast.success('Tópico actualizado');
      return { success: true, data: result.data.topic };
    } else {
      toast.error('Error al actualizar tópico', { description: result.message });
      return { success: false, error: result.message };
    }
  }, []);

  const toggleTopic = useCallback(
    async (id: string) => {
      const current = topics.find((t) => t.id === id);
      if (!current) return { success: false, error: 'Tópico no encontrado' };
      const newState = !current.isActive;
      setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, isActive: newState } : t)));
      const result = await topicsApi.toggle(id, newState);
      if (result.ok) {
        toast.success(newState ? 'Tópico activado' : 'Tópico desactivado');
        return { success: true };
      } else {
        setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, isActive: !newState } : t)));
        toast.error('Error al cambiar estado', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [topics],
  );

  const deleteTopic = useCallback(
    async (id: string) => {
      const result = await topicsApi.delete(id);
      if (result.ok) {
        toast.success('Tópico eliminado');
        refresh();
        return { success: true };
      } else {
        toast.error('Error al eliminar tópico', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [refresh],
  );

  return {
    topics,
    loading,
    error,
    hasNextPage,
    hasPreviousPage: cursorHistory.length > 0,
    currentPage: cursorHistory.length + 1,
    totalCount,
    refresh,
    nextPage,
    previousPage,
    createTopic,
    updateTopic,
    toggleTopic,
    deleteTopic,
  };
}
