'use client';

import {
  getStructureApiErrorMessage,
  structuresApi,
  type CreateStructurePayload,
  type OrganizationalStructureDto,
  type UpdateStructurePayload,
} from '@/lib/structures-api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const EMPTY: OrganizationalStructureDto[] = [];
const UNEXPECTED_ERROR = 'Ocurrió un error inesperado. Intentá nuevamente.';

interface MutationResult {
  success: boolean;
  error?: string;
  structure?: OrganizationalStructureDto;
}

async function runMutation(action: () => Promise<MutationResult>): Promise<MutationResult> {
  try {
    return await action();
  } catch {
    toast.error(UNEXPECTED_ERROR);
    return { success: false, error: UNEXPECTED_ERROR };
  }
}

export function useStructures(options: { includeInactive?: boolean } = {}) {
  const [structures, setStructures] = useState<OrganizationalStructureDto[]>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await structuresApi.list({ includeInactive: options.includeInactive });
    setLoading(false);
    if (result.ok) {
      setStructures(result.data.structures ?? []);
      return;
    }
    toast.error(getStructureApiErrorMessage(result.status, result.message));
    setStructures(EMPTY);
  }, [options.includeInactive]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createStructure = useCallback(
    (payload: CreateStructurePayload) =>
      runMutation(async () => {
        const result = await structuresApi.create(payload);
        if (!result.ok) {
          const error = getStructureApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        toast.success('Estructura creada correctamente.');
        await refresh();
        return { success: true as const, structure: result.data.structure };
      }),
    [refresh],
  );

  const updateStructure = useCallback(
    (id: string, payload: UpdateStructurePayload) =>
      runMutation(async () => {
        const result = await structuresApi.update(id, payload);
        if (!result.ok) {
          const error = getStructureApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        toast.success(
          payload.isActive === false
            ? 'Estructura desactivada correctamente.'
            : payload.isActive === true
              ? 'Estructura reactivada correctamente.'
              : 'Estructura actualizada correctamente.',
        );
        await refresh();
        return { success: true as const, structure: result.data.structure };
      }),
    [refresh],
  );

  const removeStructure = useCallback(
    (id: string) =>
      runMutation(async () => {
        const result = await structuresApi.remove(id);
        if (!result.ok) {
          const error = getStructureApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        toast.success('Estructura desactivada correctamente.');
        await refresh();
        return { success: true as const, structure: result.data.structure };
      }),
    [refresh],
  );

  const activeStructures = useMemo(
    () => structures.filter((structure) => structure.isActive),
    [structures],
  );

  return useMemo(
    () => ({
      structures,
      activeStructures,
      loading,
      refresh,
      createStructure,
      updateStructure,
      removeStructure,
    }),
    [
      structures,
      activeStructures,
      loading,
      refresh,
      createStructure,
      updateStructure,
      removeStructure,
    ],
  );
}
