'use client';

import { conversationsApi, type TransferTarget } from '@/lib/shared/conversations-api';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export function useAssignments(conversationId: string, onSuccess?: () => void | Promise<void>) {
  const [running, setRunning] = useState<string | undefined>(undefined);

  const wrap = useCallback(
    async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
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
        const r = await conversationsApi.assign(conversationId, { departmentSlug });
        if (r.ok) return { ok: true };
        return { ok: false, message: r.message };
      }),
    [conversationId, wrap],
  );

  const assignToUser = useCallback(
    (userId: string, departmentSlug?: string) =>
      wrap('assign-user', async () => {
        const r = await conversationsApi.assign(conversationId, { userId, departmentSlug });
        if (r.ok) return { ok: true };
        return { ok: false, message: r.message };
      }),
    [conversationId, wrap],
  );

  const transfer = useCallback(
    (target: TransferTarget) =>
      wrap('transfer', async () => {
        const r = await conversationsApi.transferChat(conversationId, target);
        if (r.ok) return { ok: true };
        return { ok: false, message: r.message };
      }),
    [conversationId, wrap],
  );

  const handover = useCallback(
    () =>
      wrap('handover', async () => {
        const r = await conversationsApi.handover(conversationId);
        if (r.ok) return { ok: true };
        return { ok: false, message: r.message };
      }),
    [conversationId, wrap],
  );

  const close = useCallback(
    () =>
      wrap('close', async () => {
        const r = await conversationsApi.close(conversationId);
        if (r.ok) return { ok: true };
        return { ok: false, message: r.message };
      }),
    [conversationId, wrap],
  );

  const reopen = useCallback(
    () =>
      wrap('reopen', async () => {
        const r = await conversationsApi.reopen(conversationId);
        if (r.ok) return { ok: true };
        return { ok: false, message: r.message };
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
