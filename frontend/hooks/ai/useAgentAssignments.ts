'use client';

/**
 * useAgentAssignments
 *
 * Persiste selecciones de departamentos del agente (departmentIds)
 * en agent.metadata usando agentsApi.update.
 *
 * Estrategia: metadata como fuente de verdad para selecciones del admin.
 * Fallback: arrays vacíos si la clave no existe.
 */

import { agentsApi } from '@/lib/ai-api';
import type { AiAgent } from '@/lib/ai-api';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

type AssignmentKey = 'departmentIds';

function getIds(agent: AiAgent, key: AssignmentKey): string[] {
  const raw = agent.metadata?.[key];
  if (Array.isArray(raw)) return raw as string[];
  return [];
}

export function useAgentAssignments(agent: AiAgent, onAgentUpdated: (updated: AiAgent) => void) {
  const [saving, setSaving] = useState<AssignmentKey | undefined>(undefined);

  const getAssigned = useCallback((key: AssignmentKey): string[] => getIds(agent, key), [agent]);

  const toggle = useCallback(
    async (key: AssignmentKey, id: string) => {
      const current = getIds(agent, key);
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];

      setSaving(key);
      const result = await agentsApi.update(agent.id, {
        metadata: { ...agent.metadata, [key]: next },
      });
      setSaving(undefined);

      if (result.ok) {
        onAgentUpdated(result.data.agent);
        toast.success('Asignación actualizada');
      } else {
        toast.error('Error al guardar asignación', { description: result.message });
      }
    },
    [agent, onAgentUpdated],
  );

  const setAll = useCallback(
    async (key: AssignmentKey, ids: string[]) => {
      setSaving(key);
      const result = await agentsApi.update(agent.id, {
        metadata: { ...agent.metadata, [key]: ids },
      });
      setSaving(undefined);

      if (result.ok) {
        onAgentUpdated(result.data.agent);
        toast.success('Asignaciones guardadas');
      } else {
        toast.error('Error al guardar asignaciones', { description: result.message });
      }
    },
    [agent, onAgentUpdated],
  );

  return { getAssigned, toggle, setAll, saving };
}
