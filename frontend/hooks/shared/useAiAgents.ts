'use client';

import { messagingApi, type AiAgentSummaryApi } from '@/lib/shared/messaging-api';
import { useEffect, useState } from 'react';

/**
 * Lista de agentes IA activos, compartida por la bandeja y el modal de
 * notificaciones (fuente única de opciones del ConversationFilter).
 */
export function useAiAgents() {
  const [aiAgents, setAiAgents] = useState<AiAgentSummaryApi[]>([]);

  useEffect(() => {
    let cancelled = false;
    void messagingApi.getAiAgents().then((result) => {
      if (!cancelled && result.ok) setAiAgents(result.data.agents);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return aiAgents;
}
