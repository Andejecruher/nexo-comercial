'use client';

import {
  type EventRegistrationRecord,
  type RegistrationStatus,
  type RegistrationsListQueryParams,
  eventsApi,
} from '@/lib/eventos/events-api';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

const DEFAULT_LIMIT = 50;

export interface UseEventRegistrationsOptions {
  eventId: string;
  registrationStatus?: RegistrationStatus;
  autoFetch?: boolean;
}

export function useEventRegistrations(options: UseEventRegistrationsOptions) {
  const { eventId, registrationStatus, autoFetch = true } = options;

  const [registrations, setRegistrations] = useState<EventRegistrationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);

  const fetchPage = useCallback(
    async (cursor: string | undefined, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(undefined);

      const params: RegistrationsListQueryParams = {
        limit: DEFAULT_LIMIT,
        cursor,
        registrationStatus,
      };

      const result = await eventsApi.listRegistrations(eventId, params);

      if (result.ok) {
        setRegistrations((prev) =>
          append ? [...prev, ...result.data.registrations] : result.data.registrations,
        );
        setNextCursor(result.data.meta.nextCursor);
        setHasNextPage(result.data.meta.hasNextPage);
      } else {
        setError(result.message);
        toast.error('No se pudieron cargar registros', { description: result.message });
      }

      if (append) setLoadingMore(false);
      else setLoading(false);
    },
    [eventId, registrationStatus],
  );

  useEffect(() => {
    if (!autoFetch || !eventId) return;
    setRegistrations([]);
    setNextCursor(undefined);
    setHasNextPage(false);
    void fetchPage(undefined, false);
  }, [autoFetch, eventId, registrationStatus, fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasNextPage || !nextCursor || loadingMore) return;
    void fetchPage(nextCursor, true);
  }, [hasNextPage, nextCursor, loadingMore, fetchPage]);

  const refresh = useCallback(() => {
    void fetchPage(undefined, false);
  }, [fetchPage]);

  const upsertRegistration = useCallback((updated: EventRegistrationRecord) => {
    setRegistrations((prev) => {
      const idx = prev.findIndex((r) => r.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      const copy = [...prev];
      copy[idx] = updated;
      return copy;
    });
  }, []);

  return {
    registrations,
    loading,
    loadingMore,
    error,
    hasNextPage,
    nextCursor,
    refresh,
    loadMore,
    upsertRegistration,
  };
}
