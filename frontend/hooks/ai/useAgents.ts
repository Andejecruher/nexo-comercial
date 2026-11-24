'use client';

import {
  type AiAgent,
  type AiListParams,
  type CreateAgentPayload,
  type UpdateAgentPayload,
  agentsApi,
} from '@/lib/shared/ai-api';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export function useAgents(params?: AiListParams) {
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);

  const search = params?.search;
  const isActive = params?.isActive;

  const fetchAgents = useCallback(
    async (targetCursor?: string) => {
      setLoading(true);
      setError(undefined);
      const result = await agentsApi.list({ search, isActive, cursor: targetCursor, limit: 50 });
      if (result.ok) {
        setAgents(result.data.agents);
        setCursor(result.data.meta.nextCursor);
        setHasNextPage(result.data.meta.hasNextPage);
        setTotalCount(result.data.meta.count);
      } else {
        setError(result.message);
        toast.error('Error al cargar agentes', { description: result.message });
      }
      setLoading(false);
    },
    [search, isActive],
  );

  useEffect(() => {
    setCursorHistory([]);
    fetchAgents(undefined);
  }, [fetchAgents]);

  const nextPage = useCallback(() => {
    if (!hasNextPage || !cursor) return;
    setCursorHistory((prev) => [...prev, prev[prev.length - 1]]);
    fetchAgents(cursor);
  }, [hasNextPage, cursor, fetchAgents]);

  const previousPage = useCallback(() => {
    if (cursorHistory.length === 0) return;
    const newHistory = [...cursorHistory];
    const previousCursor = newHistory.pop();
    setCursorHistory(newHistory);
    fetchAgents(previousCursor);
  }, [cursorHistory, fetchAgents]);

  const refresh = useCallback(() => {
    setCursorHistory([]);
    fetchAgents(undefined);
  }, [fetchAgents]);

  const createAgent = useCallback(
    async (payload: CreateAgentPayload) => {
      const result = await agentsApi.create(payload);
      if (result.ok) {
        toast.success('Agente creado exitosamente');
        refresh();
        return { success: true, data: result.data.agent };
      } else {
        toast.error('Error al crear agente', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [refresh],
  );

  const updateAgent = useCallback(async (id: string, payload: UpdateAgentPayload) => {
    const result = await agentsApi.update(id, payload);
    if (result.ok) {
      setAgents((prev) => prev.map((a) => (a.id === id ? result.data.agent : a)));
      toast.success('Agente actualizado');
      return { success: true, data: result.data.agent };
    } else {
      toast.error('Error al actualizar agente', { description: result.message });
      return { success: false, error: result.message };
    }
  }, []);

  const toggleAgent = useCallback(
    async (id: string) => {
      const current = agents.find((a) => a.id === id);
      if (!current) return { success: false, error: 'Agente no encontrado' };
      const newState = !current.isActive;
      setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, isActive: newState } : a)));
      const result = await agentsApi.toggle(id, newState);
      if (result.ok) {
        toast.success(newState ? 'Agente activado' : 'Agente desactivado');
        return { success: true };
      } else {
        setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, isActive: !newState } : a)));
        toast.error('Error al cambiar estado del agente', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [agents],
  );

  const deleteAgent = useCallback(
    async (id: string) => {
      const result = await agentsApi.delete(id);
      if (result.ok) {
        toast.success('Agente eliminado');
        refresh();
        return { success: true };
      } else {
        toast.error('Error al eliminar agente', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [refresh],
  );

  return {
    agents,
    loading,
    error,
    hasNextPage,
    hasPreviousPage: cursorHistory.length > 0,
    totalCount,
    refresh,
    nextPage,
    previousPage,
    createAgent,
    updateAgent,
    toggleAgent,
    deleteAgent,
  };
}
