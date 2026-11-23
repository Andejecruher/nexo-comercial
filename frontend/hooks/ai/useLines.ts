'use client';

import {
  type CommunicationLine,
  type AiListParams,
  type CreateLinePayload,
  type UpdateLinePayload,
  linesApi,
} from '@/lib/ai-api';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export function useLines(params?: AiListParams) {
  const [lines, setLines] = useState<CommunicationLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);

  const search = params?.search;
  const isActive = params?.isActive;

  const fetchLines = useCallback(
    async (targetCursor?: string) => {
      setLoading(true);
      setError(undefined);
      const result = await linesApi.list({ search, isActive, cursor: targetCursor, limit: 50 });
      if (result.ok) {
        setLines(result.data.lines);
        setCursor(result.data.meta.nextCursor);
        setHasNextPage(result.data.meta.hasNextPage);
        setTotalCount(result.data.meta.count);
      } else {
        setError(result.message);
        toast.error('Error al cargar líneas', { description: result.message });
      }
      setLoading(false);
    },
    [search, isActive],
  );

  useEffect(() => {
    setCursorHistory([]);
    fetchLines(undefined);
  }, [fetchLines]);

  const refresh = useCallback(() => {
    setCursorHistory([]);
    fetchLines(undefined);
  }, [fetchLines]);

  const nextPage = useCallback(() => {
    if (!hasNextPage || !cursor) return;
    setCursorHistory((prev) => [...prev, prev[prev.length - 1]]);
    fetchLines(cursor);
  }, [hasNextPage, cursor, fetchLines]);

  const previousPage = useCallback(() => {
    if (cursorHistory.length === 0) return;
    const newHistory = [...cursorHistory];
    const previousCursor = newHistory.pop();
    setCursorHistory(newHistory);
    fetchLines(previousCursor);
  }, [cursorHistory, fetchLines]);

  const createLine = useCallback(async (payload: CreateLinePayload) => {
    const result = await linesApi.create(payload);
    if (result.ok) {
      setLines((prev) => [result.data.line, ...prev]);
      setTotalCount((prev) => prev + 1);
      toast.success('Línea creada correctamente');
      return { success: true, data: result.data.line };
    } else {
      toast.error('Error al crear línea', { description: result.message });
      return { success: false, error: result.message };
    }
  }, []);

  const updateLine = useCallback(
    async (id: string, payload: UpdateLinePayload) => {
      const backup = lines.find((l) => l.id === id);
      if (!backup) return { success: false, error: 'Línea no encontrada' };
      setLines((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                ...payload,
                agentId: payload.agentId !== undefined ? payload.agentId : l.agentId,
                updatedAt: new Date().toISOString(),
              }
            : l,
        ),
      );
      const result = await linesApi.update(id, payload);
      if (result.ok) {
        setLines((prev) => prev.map((l) => (l.id === id ? result.data.line : l)));
        toast.success('Línea actualizada');
        return { success: true, data: result.data.line };
      } else {
        setLines((prev) => prev.map((l) => (l.id === id ? backup : l)));
        toast.error('Error al actualizar línea', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [lines],
  );

  return {
    lines,
    loading,
    error,
    hasNextPage,
    hasPreviousPage: cursorHistory.length > 0,
    currentPage: cursorHistory.length + 1,
    totalCount,
    refresh,
    nextPage,
    previousPage,
    createLine,
    updateLine,
  };
}
