'use client';

import {
  type CreateEventPayload,
  type EventListQueryParams,
  type EventRecord,
  type EventStatus,
  type EventType,
  type EventVisibility,
  type UpdateEventPayload,
  eventsApi,
} from '@/lib/eventos/events-api';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const DEFAULT_PAGE_SIZE = 20;

interface ParsedEventFilters {
  search: string;
  status?: EventStatus;
  eventType?: EventType;
  visibility?: EventVisibility;
  cursor?: string;
}

function parseFilters(searchParams: URLSearchParams): ParsedEventFilters {
  const status = searchParams.get('status') as EventStatus | null;
  const eventType = searchParams.get('eventType') as EventType | null;
  const visibility = searchParams.get('visibility') as EventVisibility | null;
  const validStatuses: EventStatus[] = ['draft', 'published', 'completed', 'cancelled'];
  const validTypes: EventType[] = ['townhall', 'community', 'volunteer', 'campaign', 'rally'];
  const validVisibilities: EventVisibility[] = ['public', 'private'];

  return {
    search: searchParams.get('search') ?? '',
    status: status && validStatuses.includes(status) ? status : undefined,
    eventType: eventType && validTypes.includes(eventType) ? eventType : undefined,
    visibility: visibility && validVisibilities.includes(visibility) ? visibility : undefined,
    cursor: searchParams.get('cursor') ?? undefined,
  };
}

export function useEvents() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const parsedFilters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [totalCount, setTotalCount] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);

  const setUrlFilters = useCallback(
    (
      partial: Partial<Omit<ParsedEventFilters, 'cursor'>> & { cursor?: string },
      resetCursor = true,
    ) => {
      const next = new URLSearchParams(searchParams.toString());
      const merged: ParsedEventFilters = {
        ...parsedFilters,
        ...partial,
      };

      if (merged.search.trim()) next.set('search', merged.search.trim());
      else next.delete('search');

      if (merged.status) next.set('status', merged.status);
      else next.delete('status');

      if (merged.eventType) next.set('eventType', merged.eventType);
      else next.delete('eventType');

      if (merged.visibility) next.set('visibility', merged.visibility);
      else next.delete('visibility');

      const finalCursor = resetCursor ? undefined : merged.cursor;
      if (finalCursor) next.set('cursor', finalCursor);
      else next.delete('cursor');

      router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ''}`);
    },
    [pathname, parsedFilters, router, searchParams],
  );

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    const query: EventListQueryParams = {
      limit: DEFAULT_PAGE_SIZE,
      cursor: parsedFilters.cursor,
      search: parsedFilters.search.trim() || undefined,
      status: parsedFilters.status,
      eventType: parsedFilters.eventType,
      visibility: parsedFilters.visibility,
    };

    const result = await eventsApi.list(query);

    if (result.ok) {
      setEvents(result.data.events);
      setHasNextPage(result.data.meta.hasNextPage);
      setNextCursor(result.data.meta.nextCursor);
      setTotalCount(result.data.meta.count);
    } else {
      setError(result.message);
      toast.error('No se pudo cargar eventos', { description: result.message });
    }

    setLoading(false);
  }, [parsedFilters]);

  /** Solo el listado en `/admin/eventos`; evita GET redundante en `/new` o `/[id]`. */
  const isEventsListRoute = pathname === '/admin/eventos' || pathname === '/admin/eventos/';

  useEffect(() => {
    if (!isEventsListRoute) return;
    void fetchEvents();
  }, [fetchEvents, isEventsListRoute]);

  const clearFilters = useCallback(() => {
    setCursorHistory([]);
    setUrlFilters({ search: '', status: undefined, eventType: undefined, visibility: undefined });
  }, [setUrlFilters]);

  const setSearch = useCallback(
    (value: string) => {
      setCursorHistory([]);
      setUrlFilters({ search: value });
    },
    [setUrlFilters],
  );

  const setStatusFilter = useCallback(
    (value?: EventStatus) => {
      setCursorHistory([]);
      setUrlFilters({ status: value });
    },
    [setUrlFilters],
  );

  const setEventTypeFilter = useCallback(
    (value?: EventType) => {
      setCursorHistory([]);
      setUrlFilters({ eventType: value });
    },
    [setUrlFilters],
  );

  const setVisibilityFilter = useCallback(
    (value?: EventVisibility) => {
      setCursorHistory([]);
      setUrlFilters({ visibility: value });
    },
    [setUrlFilters],
  );

  const nextPage = useCallback(() => {
    if (!hasNextPage || !nextCursor) return;
    setCursorHistory((prev) => [...prev, parsedFilters.cursor]);
    setUrlFilters({ cursor: nextCursor }, false);
  }, [hasNextPage, nextCursor, parsedFilters.cursor, setUrlFilters]);

  const previousPage = useCallback(() => {
    setCursorHistory((prev) => {
      if (prev.length === 0) return prev;
      const nextHistory = [...prev];
      const previousCursor = nextHistory.pop();
      setUrlFilters({ cursor: previousCursor }, false);
      return nextHistory;
    });
  }, [setUrlFilters]);

  const firstPage = useCallback(() => {
    setCursorHistory([]);
    setUrlFilters({ cursor: undefined }, false);
  }, [setUrlFilters]);

  const createEvent = useCallback(async (payload: CreateEventPayload) => {
    const result = await eventsApi.create(payload);
    if (result.ok) {
      toast.success('Evento creado');
      return { ok: true as const, event: result.data.event };
    }
    toast.error('No se pudo crear el evento', { description: result.message });
    return { ok: false as const, message: result.message };
  }, []);

  const updateEvent = useCallback(async (id: string, payload: UpdateEventPayload) => {
    const result = await eventsApi.update(id, payload);
    if (result.ok) {
      toast.success('Evento actualizado');
      return { ok: true as const, event: result.data.event };
    }
    toast.error('No se pudo actualizar el evento', { description: result.message });
    return { ok: false as const, message: result.message };
  }, []);

  const getEvent = useCallback(async (id: string) => {
    const result = await eventsApi.getById(id);
    if (result.ok) {
      return { ok: true as const, event: result.data.event };
    }
    return { ok: false as const, message: result.message };
  }, []);

  return {
    events,
    loading,
    error,
    hasNextPage,
    hasPreviousPage: cursorHistory.length > 0,
    totalCount,
    currentPage: cursorHistory.length + 1,
    filters: parsedFilters,

    setSearch,
    setStatusFilter,
    setEventTypeFilter,
    setVisibilityFilter,
    clearFilters,
    refresh: fetchEvents,

    nextPage,
    previousPage,
    firstPage,

    createEvent,
    updateEvent,
    getEvent,
  };
}
