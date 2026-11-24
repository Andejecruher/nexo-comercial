'use client';

import {
  type AiPrompt,
  type AiListParams,
  type CreatePromptPayload,
  type UpdatePromptPayload,
  promptsApi,
} from '@/lib/shared/ai-api';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface UsePromptsParams extends AiListParams {
  topicId?: string;
}

export function usePrompts(params?: UsePromptsParams) {
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);

  const search = params?.search;
  const isActive = params?.isActive;
  const topicId = params?.topicId;

  const fetchPrompts = useCallback(
    async (targetCursor?: string) => {
      setLoading(true);
      setError(undefined);
      const result = await promptsApi.list({
        search,
        isActive,
        topicId,
        cursor: targetCursor,
        limit: 50,
      });
      if (result.ok) {
        setPrompts(result.data.prompts);
        setCursor(result.data.meta.nextCursor);
        setHasNextPage(result.data.meta.hasNextPage);
        setTotalCount(result.data.meta.count);
      } else {
        setError(result.message);
        toast.error('Error al cargar prompts', { description: result.message });
      }
      setLoading(false);
    },
    [search, isActive, topicId],
  );

  useEffect(() => {
    setCursorHistory([]);
    fetchPrompts(undefined);
  }, [fetchPrompts]);

  const refresh = useCallback(() => {
    setCursorHistory([]);
    fetchPrompts(undefined);
  }, [fetchPrompts]);

  const nextPage = useCallback(() => {
    if (!hasNextPage || !cursor) return;
    setCursorHistory((prev) => [...prev, prev[prev.length - 1]]);
    fetchPrompts(cursor);
  }, [hasNextPage, cursor, fetchPrompts]);

  const previousPage = useCallback(() => {
    if (cursorHistory.length === 0) return;
    const newHistory = [...cursorHistory];
    const previousCursor = newHistory.pop();
    setCursorHistory(newHistory);
    fetchPrompts(previousCursor);
  }, [cursorHistory, fetchPrompts]);

  const createPrompt = useCallback(
    async (payload: CreatePromptPayload) => {
      const result = await promptsApi.create(payload);
      if (result.ok) {
        toast.success('Prompt creado');
        refresh();
        return { success: true, data: result.data.prompt };
      } else {
        toast.error('Error al crear prompt', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [refresh],
  );

  const updatePrompt = useCallback(async (id: string, payload: UpdatePromptPayload) => {
    const result = await promptsApi.update(id, payload);
    if (result.ok) {
      setPrompts((prev) => prev.map((p) => (p.id === id ? result.data.prompt : p)));
      toast.success('Prompt actualizado');
      return { success: true, data: result.data.prompt };
    } else {
      toast.error('Error al actualizar prompt', { description: result.message });
      return { success: false, error: result.message };
    }
  }, []);

  const togglePrompt = useCallback(
    async (id: string) => {
      const current = prompts.find((p) => p.id === id);
      if (!current) return { success: false, error: 'Prompt no encontrado' };
      const newState = !current.isActive;
      setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: newState } : p)));
      const result = await promptsApi.toggle(id, newState);
      if (result.ok) {
        toast.success(newState ? 'Prompt activado' : 'Prompt desactivado');
        return { success: true };
      } else {
        setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: !newState } : p)));
        toast.error('Error al cambiar estado', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [prompts],
  );

  const deletePrompt = useCallback(
    async (id: string) => {
      const result = await promptsApi.delete(id);
      if (result.ok) {
        toast.success('Prompt eliminado');
        refresh();
        return { success: true };
      } else {
        toast.error('Error al eliminar prompt', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [refresh],
  );

  return {
    prompts,
    loading,
    error,
    hasNextPage,
    hasPreviousPage: cursorHistory.length > 0,
    currentPage: cursorHistory.length + 1,
    totalCount,
    refresh,
    nextPage,
    previousPage,
    createPrompt,
    updatePrompt,
    togglePrompt,
    deletePrompt,
  };
}
