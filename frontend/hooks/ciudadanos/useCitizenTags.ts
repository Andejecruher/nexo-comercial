'use client';

import { citizensApi } from '@/lib/shared/citizens-api';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

interface BulkTagActionInput {
  citizenIds: string[];
  tagIds: string[];
  operation?: 'assign' | 'remove';
}

export function useCitizenTags() {
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);

  const assignTag = useCallback(async (citizenId: string, tagId: string) => {
    setAssigning(true);
    const result = await citizensApi.assignTag(citizenId, tagId);
    setAssigning(false);

    if (!result.ok) {
      toast.error('No se pudo asignar la etiqueta', { description: result.message });
      return { success: false, message: result.message };
    }

    toast.success('Etiqueta asignada');
    return { success: true };
  }, []);

  const removeTag = useCallback(async (citizenId: string, tagId: string) => {
    setRemoving(true);
    const result = await citizensApi.removeTag(citizenId, tagId);
    setRemoving(false);

    if (!result.ok) {
      toast.error('No se pudo remover la etiqueta', { description: result.message });
      return { success: false, message: result.message };
    }

    toast.success('Etiqueta removida');
    return { success: true };
  }, []);

  const bulkTagAction = useCallback(async (input: BulkTagActionInput) => {
    setBulkRunning(true);
    const result = await citizensApi.bulkTagAssignment({
      citizenIds: input.citizenIds,
      tagIds: input.tagIds,
      operation: input.operation ?? 'assign',
    });
    setBulkRunning(false);

    if (!result.ok) {
      toast.error('No se pudo ejecutar la asignación masiva', { description: result.message });
      return { success: false, message: result.message };
    }

    if (result.data.errors.length > 0) {
      toast.warning('Operación masiva parcial', {
        description: `Actualizados: ${result.data.updated} · Omitidos: ${result.data.skipped}`,
      });
    } else {
      toast.success('Operación masiva aplicada', {
        description: `${result.data.updated} asignaciones actualizadas`,
      });
    }

    return { success: true, data: result.data };
  }, []);

  return {
    assigning,
    removing,
    bulkRunning,
    assignTag,
    removeTag,
    bulkTagAction,
  };
}
