'use client';

import { getLeaderApiErrorMessage } from '@/components/admin/leaders/leader-utils';
import { ineOcrApi, type ElectoralLeader, type LeaderProfilePayload } from '@/lib/ine-ocr-api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

export type LeaderListFilters = {
  sectionId?: string;
  coordinatorId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  includeInactive?: boolean;
};

interface AsyncState<T> {
  data: T;
  loading: boolean;
  error?: string;
  totalCount: number;
  hasNextPage: boolean;
}

const EMPTY_LEADERS: ElectoralLeader[] = [];
const UNEXPECTED_ERROR = 'Ocurrió un error inesperado. Intentá nuevamente.';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

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

export function useLeaders(filters: LeaderListFilters = {}) {
  const [state, setState] = useState<AsyncState<ElectoralLeader[]>>({
    data: EMPTY_LEADERS,
    loading: true,
    totalCount: 0,
    hasNextPage: false,
  });
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    const result = await ineOcrApi.catalog.listLeaders({
      sectionId: filters.sectionId,
      coordinatorId: filters.coordinatorId,
      q: filters.q,
      includeInactive: filters.includeInactive ?? true,
      page: filters.page,
      pageSize: filters.pageSize,
    });
    if (requestId !== requestIdRef.current) return;
    if (result.ok) {
      const leaders = result.data.leaders ?? [];
      setState({
        data: leaders,
        loading: false,
        totalCount: result.data.totalCount ?? leaders.length,
        hasNextPage: result.data.hasNextPage ?? false,
      });
      return;
    }
    const error = getLeaderApiErrorMessage(result.status, result.message);
    toast.error(error);
    setState({ data: EMPTY_LEADERS, loading: false, error, totalCount: 0, hasNextPage: false });
  }, [
    filters.sectionId,
    filters.coordinatorId,
    filters.q,
    filters.includeInactive,
    filters.page,
    filters.pageSize,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createLeader = useCallback(
    (payload: { sectionId: string; fullName: string } & LeaderProfilePayload) =>
      runMutation(async () => {
        const result = await ineOcrApi.catalog.createLeader({
          ...payload,
          fullName: payload.fullName.trim(),
          email: payload.email ? normalizeEmail(payload.email) : payload.email,
        });
        if (!result.ok) {
          const error = getLeaderApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        if (result.data.warning) {
          toast.warning(result.data.warning.message);
        } else if (result.data.invitation?.status === 'sent') {
          toast.success('Líder creado e invitación enviada correctamente.');
        } else {
          toast.success('Líder creado. La invitación quedó pendiente de envío.');
        }
        await refresh();
        return { success: true as const, leader: result.data.leader };
      }),
    [refresh],
  );

  const updateLeader = useCallback(
    (
      id: string,
      payload: Partial<Pick<ElectoralLeader, 'sectionId' | 'fullName' | 'isActive'>> &
        LeaderProfilePayload,
    ) =>
      runMutation(async () => {
        const result = await ineOcrApi.catalog.updateLeader(id, {
          ...payload,
          fullName: payload.fullName?.trim(),
        });
        if (!result.ok) {
          const error = getLeaderApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        toast.success('Líder actualizado correctamente');
        await refresh();
        return { success: true as const, leader: result.data.leader };
      }),
    [refresh],
  );

  const removeLeader = useCallback(
    (id: string) =>
      runMutation(async () => {
        const result = await ineOcrApi.catalog.deleteLeader(id);
        if (!result.ok) {
          const error = getLeaderApiErrorMessage(result.status, result.message);
          toast.error(error);
          return { success: false as const, error };
        }
        toast.success('Líder desactivado correctamente');
        await refresh();
        return { success: true as const, leader: result.data.leader };
      }),
    [refresh],
  );

  const reinviteLeader = useCallback(
    (id: string) =>
      runMutation(async () => {
        const result = await ineOcrApi.catalog.reinviteLeader(id);
        if (!result.ok) {
          const error = getLeaderApiErrorMessage(result.status, result.message);
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
      leaders: state.data,
      loading: state.loading,
      error: state.error,
      totalCount: state.totalCount,
      hasNextPage: state.hasNextPage,
      refresh,
      createLeader,
      updateLeader,
      removeLeader,
      reinviteLeader,
    }),
    [state, refresh, createLeader, updateLeader, removeLeader, reinviteLeader],
  );
}
