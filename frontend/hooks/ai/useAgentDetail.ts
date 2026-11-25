'use client';

import { agentDetailApi, type AgentDetailResponse } from '@/lib/shared/ai-api';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export function useAgentDetail(id: string) {
  const [data, setData] = useState<AgentDetailResponse | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(undefined);
    const result = await agentDetailApi.get(id);
    if (result.ok) {
      setData(result.data);
    } else {
      setError(result.message);
      toast.error('Error al cargar detalle del agente', { description: result.message });
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { data, loading, error, refresh: fetch };
}
