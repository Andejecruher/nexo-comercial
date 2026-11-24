'use client';

import {
  adminUsersApi,
  getAdminUserApiErrorMessage,
  type CreatePanelUserPayload,
  type PanelUserDto,
  type UpdatePanelUserPayload,
} from '@/lib/shared/admin-users-api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface AsyncState<T> {
  data: T;
  loading: boolean;
  error?: string;
}

const EMPTY_USERS: PanelUserDto[] = [];
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

export function useTeamUsers() {
  const [state, setState] = useState<AsyncState<PanelUserDto[]>>({
    data: EMPTY_USERS,
    loading: true,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    const result = await adminUsersApi.list();
    if (result.ok) {
      setState({ data: result.data.users, loading: false });
      return;
    }
    const error = getAdminUserApiErrorMessage(result.status, result.message);
    toast.error(error);
    setState({ data: EMPTY_USERS, loading: false, error });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createUser = useCallback(
    (payload: CreatePanelUserPayload) =>
      runMutation(async () => {
        const result = await adminUsersApi.create({
          ...payload,
          email: normalizeEmail(payload.email),
          fullName: payload.fullName.trim(),
        });
        if (!result.ok) {
          const error = getAdminUserApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        if (result.data.warning) {
          toast.warning(result.data.warning.message);
        } else if (result.data.invitation?.status === 'sent') {
          toast.success('Usuario creado e invitación enviada correctamente.');
        } else {
          toast.success('Usuario creado. La invitación quedó pendiente de envío.');
        }
        await refresh();
        return { success: true as const, user: result.data.user };
      }),
    [refresh],
  );

  const updateUser = useCallback(
    (id: string, payload: UpdatePanelUserPayload) =>
      runMutation(async () => {
        const cleanPayload = { ...payload, fullName: payload.fullName?.trim() };
        const result = await adminUsersApi.update(id, cleanPayload);
        if (!result.ok) {
          const error = getAdminUserApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        toast.success('Usuario actualizado correctamente');
        await refresh();
        return { success: true as const, user: result.data.user };
      }),
    [refresh],
  );

  const deactivateUser = useCallback(
    (id: string) =>
      runMutation(async () => {
        const result = await adminUsersApi.deactivate(id);
        if (!result.ok) {
          const error = getAdminUserApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        toast.success('Usuario desactivado correctamente');
        await refresh();
        return { success: true as const, user: result.data.user };
      }),
    [refresh],
  );

  const deleteUser = useCallback(
    (id: string) =>
      runMutation(async () => {
        const result = await adminUsersApi.delete(id);
        if (!result.ok) {
          const error = getAdminUserApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        toast.success('Integrante eliminado correctamente');
        await refresh();
        return { success: true as const };
      }),
    [refresh],
  );

  const resendInvitation = useCallback(
    (userId: string) =>
      runMutation(async () => {
        const result = await adminUsersApi.resendInvitation(userId);
        if (!result.ok) {
          const error = getAdminUserApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        if (result.data.warning) toast.warning(result.data.warning.message);
        else toast.success('Invitación reenviada correctamente.');
        await refresh();
        return { success: true as const, invitation: result.data.invitation };
      }),
    [refresh],
  );

  const replaceRoles = useCallback(
    (
      user: PanelUserDto,
      roleIds: string[],
      options?: { silent?: boolean },
    ): Promise<{ success: boolean; error?: string }> =>
      runMutation(async () => {
        const current = new Set(user.roles.map((role) => role.id));
        const next = new Set(roleIds);
        const toAdd = [...next].filter((id) => !current.has(id));
        const toRemove = [...current].filter((id) => !next.has(id));

        if (toAdd.length === 0 && toRemove.length === 0) {
          return { success: true as const };
        }

        for (const roleId of toAdd) {
          const result = await adminUsersApi.assignRole(user.id, roleId);
          if (!result.ok) {
            const error = getAdminUserApiErrorMessage(result.status, result.message);
            toast.error(error);
            await refresh();
            return { success: false as const, error };
          }
        }

        for (const roleId of toRemove) {
          const result = await adminUsersApi.removeRole(user.id, roleId);
          if (!result.ok) {
            const error = getAdminUserApiErrorMessage(result.status, result.message);
            toast.error(error);
            await refresh();
            return { success: false as const, error };
          }
        }

        if (!options?.silent) {
          toast.success('Roles del usuario actualizados correctamente');
        }
        await refresh();
        return { success: true as const };
      }),
    [refresh],
  );

  return useMemo(
    () => ({
      users: state.data,
      loading: state.loading,
      error: state.error,
      refresh,
      deleteUser,
      createUser,
      updateUser,
      deactivateUser,
      replaceRoles,
      resendInvitation,
    }),
    [
      state,
      refresh,
      createUser,
      updateUser,
      deactivateUser,
      replaceRoles,
      deleteUser,
      resendInvitation,
    ],
  );
}
