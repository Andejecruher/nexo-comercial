'use client';

/**
 * useAssignTicket — Hook para las acciones de asignación y cambio de estado de un ticket.
 *
 * Las acciones operan a nivel conversación, por lo que reciben `conversationId`.
 * Envuelve ticketsApi con loading state por acción y notificaciones.
 * Reutiliza el mismo patrón que useAssignments existente.
 */

import { ticketsApi, type AssignPayload, type TransferPayload } from '@/lib/tickets-api';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export function useAssignTicket(conversationId: string, onSuccess?: () => void | Promise<void>) {
  const [running, setRunning] = useState<string | undefined>(undefined);

  const wrap = useCallback(
    async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>): Promise<boolean> => {
      setRunning(key);
      const res = await fn();
      setRunning(undefined);
      if (res.ok) {
        await onSuccess?.();
      } else if (res.message) {
        toast.error(res.message);
      }
      return res.ok;
    },
    [onSuccess],
  );

  const assignToSelf = useCallback(
    (departmentSlug?: string) =>
      wrap('assign-self', async () => {
        const r = await ticketsApi.assign(conversationId, {
          departmentSlug,
        } satisfies AssignPayload);
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }),
    [conversationId, wrap],
  );

  const assignToUser = useCallback(
    (userId: string, departmentSlug?: string) =>
      wrap('assign-user', async () => {
        const r = await ticketsApi.assign(conversationId, {
          userId,
          departmentSlug,
        } satisfies AssignPayload);
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }),
    [conversationId, wrap],
  );

  const transfer = useCallback(
    (toUserId: string, departmentSlug?: string) =>
      wrap('transfer', async () => {
        const r = await ticketsApi.transfer(conversationId, {
          toUserId,
          departmentSlug,
        } satisfies TransferPayload);
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }),
    [conversationId, wrap],
  );

  const handover = useCallback(
    () =>
      wrap('handover', async () => {
        const r = await ticketsApi.handover(conversationId);
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }),
    [conversationId, wrap],
  );

  const close = useCallback(
    () =>
      wrap('close', async () => {
        const r = await ticketsApi.close(conversationId);
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }),
    [conversationId, wrap],
  );

  const reopen = useCallback(
    () =>
      wrap('reopen', async () => {
        const r = await ticketsApi.reopen(conversationId);
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }),
    [conversationId, wrap],
  );

  return {
    running,
    assignToSelf,
    assignToUser,
    transfer,
    handover,
    close,
    reopen,
  };
}
