'use client';

import {
  type AiTool,
  type AiListParams,
  type CreateToolPayload,
  type UpdateToolPayload,
  toolsApi,
} from '@/lib/shared/ai-api';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export function useTools(params?: AiListParams) {
  const [tools, setTools] = useState<AiTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);

  const search = params?.search;
  const isActive = params?.isActive;

  const fetchTools = useCallback(
    async (targetCursor?: string) => {
      setLoading(true);
      setError(undefined);
      const result = await toolsApi.list({ search, isActive, cursor: targetCursor, limit: 50 });
      if (result.ok) {
        setTools(result.data.tools);
        setCursor(result.data.meta.nextCursor);
        setHasNextPage(result.data.meta.hasNextPage);
        setTotalCount(result.data.meta.count);
      } else {
        setError(result.message);
        toast.error('Error al cargar herramientas', { description: result.message });
      }
      setLoading(false);
    },
    [search, isActive],
  );

  useEffect(() => {
    setCursorHistory([]);
    fetchTools(undefined);
  }, [fetchTools]);

  const refresh = useCallback(() => {
    setCursorHistory([]);
    fetchTools(undefined);
  }, [fetchTools]);

  const nextPage = useCallback(() => {
    if (!hasNextPage || !cursor) return;
    setCursorHistory((prev) => [...prev, prev[prev.length - 1]]);
    fetchTools(cursor);
  }, [hasNextPage, cursor, fetchTools]);

  const previousPage = useCallback(() => {
    if (cursorHistory.length === 0) return;
    const newHistory = [...cursorHistory];
    const previousCursor = newHistory.pop();
    setCursorHistory(newHistory);
    fetchTools(previousCursor);
  }, [cursorHistory, fetchTools]);

  const createTool = useCallback(
    async (payload: CreateToolPayload) => {
      const result = await toolsApi.create(payload);
      if (result.ok) {
        toast.success('Herramienta creada');
        refresh();
        return { success: true, data: result.data.tool };
      } else {
        toast.error('Error al crear herramienta', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [refresh],
  );

  const updateTool = useCallback(async (id: string, payload: UpdateToolPayload) => {
    const result = await toolsApi.update(id, payload);
    if (result.ok) {
      setTools((prev) => prev.map((t) => (t.id === id ? result.data.tool : t)));
      toast.success('Herramienta actualizada');
      return { success: true, data: result.data.tool };
    } else {
      toast.error('Error al actualizar herramienta', { description: result.message });
      return { success: false, error: result.message };
    }
  }, []);

  const toggleTool = useCallback(
    async (id: string) => {
      const current = tools.find((t) => t.id === id);
      if (!current) return { success: false, error: 'Herramienta no encontrada' };
      const newState = !current.isActive;
      setTools((prev) => prev.map((t) => (t.id === id ? { ...t, isActive: newState } : t)));
      const result = await toolsApi.toggle(id, newState);
      if (result.ok) {
        toast.success(newState ? 'Herramienta activada' : 'Herramienta desactivada');
        return { success: true };
      } else {
        setTools((prev) => prev.map((t) => (t.id === id ? { ...t, isActive: !newState } : t)));
        toast.error('Error al cambiar estado', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [tools],
  );

  const deleteTool = useCallback(
    async (id: string) => {
      const result = await toolsApi.delete(id);
      if (result.ok) {
        toast.success('Herramienta eliminada');
        refresh();
        return { success: true };
      } else {
        toast.error('Error al eliminar herramienta', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [refresh],
  );

  return {
    tools,
    loading,
    error,
    hasNextPage,
    hasPreviousPage: cursorHistory.length > 0,
    currentPage: cursorHistory.length + 1,
    totalCount,
    refresh,
    nextPage,
    previousPage,
    createTool,
    updateTool,
    toggleTool,
    deleteTool,
  };
}
