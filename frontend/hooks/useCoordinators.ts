'use client';

import {
  coordinatorsApi,
  getCoordinatorApiErrorMessage,
  type CoordinatorDto,
  type CreateCoordinatorPayload,
  type UpdateCoordinatorPayload,
} from '@/lib/coordinators-api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface AsyncState<T> {
  data: T;
  loading: boolean;
  error?: string;
}

const EMPTY_COORDINATORS: CoordinatorDto[] = [];
const UNEXPECTED_ERROR = 'Ocurrió un error inesperado. Intentá nuevamente.';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Garantiza que toda mutación notifique, incluso si la petición lanza (red caída, JSON inválido). */
async function runMutation<T extends { success: boolean }>(
  action: () => Promise<T>,
): Promise<T | { success: false; error: string }> {
  try {
    return await action();
  } catch {
    toast.error(UNEXPECTED_ERROR);
    return { success: false, error: UNEXPECTED_ERROR };
  }
}

export function useCoordinators() {
  const [state, setState] = useState<AsyncState<CoordinatorDto[]>>({
    data: EMPTY_COORDINATORS,
    loading: true,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    const result = await coordinatorsApi.list();
    if (result.ok) {
      setState({ data: result.data.coordinators ?? [], loading: false });
      return;
    }
    const error = getCoordinatorApiErrorMessage(result.status, result.message);
    toast.error(error);
    setState({ data: EMPTY_COORDINATORS, loading: false, error });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createCoordinator = useCallback(
    (payload: CreateCoordinatorPayload) =>
      runMutation(async () => {
        const result = await coordinatorsApi.create({
          ...payload,
          fullName: payload.fullName.trim(),
          email: normalizeEmail(payload.email),
        });
        if (!result.ok) {
          const error = getCoordinatorApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        if (result.data.warning) {
          toast.warning(result.data.warning.message);
        } else if (result.data.invitation?.status === 'sent') {
          toast.success('Coordinador creado e invitación enviada correctamente.');
        } else {
          toast.success('Coordinador creado. La invitación quedó pendiente de envío.');
        }
        await refresh();
        return { success: true as const, coordinator: result.data.coordinator };
      }),
    [refresh],
  );

  const updateCoordinator = useCallback(
    (id: string, payload: UpdateCoordinatorPayload) =>
      runMutation(async () => {
        const result = await coordinatorsApi.update(id, {
          ...payload,
          fullName: payload.fullName?.trim(),
        });
        if (!result.ok) {
          const error = getCoordinatorApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        toast.success('Coordinador actualizado correctamente');
        await refresh();
        return { success: true as const, coordinator: result.data.coordinator };
      }),
    [refresh],
  );

  const removeCoordinator = useCallback(
    (id: string) =>
      runMutation(async () => {
        const result = await coordinatorsApi.remove(id);
        if (!result.ok) {
          const error = getCoordinatorApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        toast.success('Coordinador desactivado correctamente');
        await refresh();
        return { success: true as const, coordinator: result.data.coordinator };
      }),
    [refresh],
  );

  const reinviteCoordinator = useCallback(
    (id: string) =>
      runMutation(async () => {
        const result = await coordinatorsApi.reinvite(id);
        if (!result.ok) {
          const error = getCoordinatorApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        if (result.data.warning) toast.warning(result.data.warning.message);
        else if (result.data.invitation?.status === 'sent') {
          toast.success('Invitación reenviada correctamente.');
        } else {
          toast.success('Invitación reenviada (estado: pendiente).');
        }
        await refresh();
        return { success: true as const, invitation: result.data.invitation };
      }),
    [refresh],
  );

  return useMemo(
    () => ({
      coordinators: state.data,
      loading: state.loading,
      error: state.error,
      refresh,
      createCoordinator,
      updateCoordinator,
      removeCoordinator,
      reinviteCoordinator,
    }),
    [state, refresh, createCoordinator, updateCoordinator, removeCoordinator, reinviteCoordinator],
  );
}
