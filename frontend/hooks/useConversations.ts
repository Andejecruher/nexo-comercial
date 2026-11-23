'use client';

import { useRealtimeManager } from '@/components/providers/realtime-provider';
import type { ConversationFlowState } from '@/lib/conversation-fsm';
import { type ConversationListItemDto, conversationsApi } from '@/lib/conversations-api';
import { useConnectionStore } from '@/stores/use-connection-store';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

const PAGE_LIMIT = 80;
const POLL_MS = 15_000;
const POLL_MS_CONNECTED = 60_000;

export type InboxStatusFilter = 'all' | 'open' | 'closed';
export type InboxAssignmentFilter = 'all' | 'unassigned' | 'mine';

interface ParsedInboxFilters {
  status: InboxStatusFilter;
  assignment: InboxAssignmentFilter;
  flowState: ConversationFlowState | 'all';
  departmentSlug: string | undefined;
}

function parseFilters(searchParams: URLSearchParams): ParsedInboxFilters {
  const status = (searchParams.get('status') as InboxStatusFilter) || 'all';
  const assignment = (searchParams.get('assignment') as InboxAssignmentFilter) || 'all';
  const fs = searchParams.get('flowState') || 'all';
  const flowState = fs === 'all' || fs === '' ? 'all' : (fs as ConversationFlowState);
  const departmentSlug = searchParams.get('dept')?.trim() || undefined;

  return {
    status: ['all', 'open', 'closed'].includes(status) ? status : 'all',
    assignment: ['all', 'unassigned', 'mine'].includes(assignment) ? assignment : 'all',
    flowState,
    departmentSlug,
  };
}

function matchesFilters(
  item: ConversationListItemDto,
  f: ParsedInboxFilters,
  userId: string | undefined,
): boolean {
  if (f.status !== 'all' && item.status !== f.status) return false;

  if (f.assignment === 'unassigned' && item.assignedUserId) return false;
  if (f.assignment === 'mine') {
    if (!userId || item.assignedUserId !== userId) return false;
  }

  if (f.flowState !== 'all') {
    const st = item.meta?.flowState;
    if (st !== f.flowState) return false;
  }

  if (f.departmentSlug) {
    const slug = item.meta?.departmentSlug?.trim() || item.assignedDept?.trim() || undefined;
    if (slug !== f.departmentSlug) return false;
  }

  return true;
}

export function useConversations(currentUserId: string | undefined) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const parsed = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [rawItems, setRawItems] = useState<ConversationListItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const socketConnected = useConnectionStore((state) => state.status === 'connected');

  const filterKey = useMemo(
    () =>
      `${parsed.status}|${parsed.assignment}|${parsed.flowState}|${parsed.departmentSlug ?? ''}`,
    [parsed],
  );

  const setUrl = useCallback(
    (partial: Partial<ParsedInboxFilters>) => {
      const next = new URLSearchParams(searchParams.toString());
      const merged: ParsedInboxFilters = {
        ...parsed,
        ...partial,
      };

      if (merged.status !== 'all') next.set('status', merged.status);
      else next.delete('status');

      if (merged.assignment !== 'all') next.set('assignment', merged.assignment);
      else next.delete('assignment');

      if (merged.flowState !== 'all') next.set('flowState', merged.flowState);
      else next.delete('flowState');

      if (merged.departmentSlug) next.set('dept', merged.departmentSlug);
      else next.delete('dept');

      router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ''}`);
    },
    [pathname, parsed, router, searchParams],
  );

  const fetchPage = useCallback(async (cursor: string | undefined, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(undefined);

    const result = await conversationsApi.list({ cursor, limit: PAGE_LIMIT });

    if (result.ok) {
      setRawItems((prev) => (append ? [...prev, ...result.data.items] : result.data.items));
      setNextCursor(result.data.meta.nextCursor);
      setHasNextPage(result.data.meta.hasNextPage);
    } else {
      setError(result.message);
      toast.error('No se pudo cargar conversaciones', { description: result.message });
    }

    if (append) setLoadingMore(false);
    else setLoading(false);
  }, []);

  useEffect(() => {
    setRawItems([]);
    setNextCursor(undefined);
    setHasNextPage(false);
    void fetchPage(undefined, false);
  }, [filterKey, fetchPage]);

  const filteredItems = useMemo(() => {
    return rawItems.filter((item) => matchesFilters(item, parsed, currentUserId));
  }, [parsed, rawItems, currentUserId]);

  const refresh = useCallback(async () => {
    await fetchPage(undefined, false);
  }, [fetchPage]);

  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void fetchPage(undefined, false);
    };

    const pollMs = socketConnected ? POLL_MS_CONNECTED : POLL_MS;
    const id = window.setInterval(tick, pollMs);
    return () => window.clearInterval(id);
  }, [fetchPage, socketConnected]);

  // Refetch immediately when the socket reconnects (replay-via-REST).
  const prevSocketConnected = useRef(socketConnected);
  useEffect(() => {
    if (!prevSocketConnected.current && socketConnected) {
      void fetchPage(undefined, false);
    }
    prevSocketConnected.current = socketConnected;
  }, [socketConnected, fetchPage]);

  // Realtime-driven refresh: trigger a REST refetch whenever any conversation
  // updates. Uses a debounce so rapid bursts result in a single fetch.
  const manager = useRealtimeManager();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!manager) return;

    const handler = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (debounceRef.current) return;
      debounceRef.current = setTimeout(() => {
        debounceRef.current = undefined;
        void fetchPage(undefined, false);
      }, 300);
    };

    manager.router.register({
      id: 'conversations-inbox',
      events: ['conversation.updated', 'conversation.message.new'],
      handler: (_event, _payload) => handler(),
    });

    return () => {
      manager.router.unregister('conversations-inbox');
      clearTimeout(debounceRef.current);
    };
  }, [manager, fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasNextPage || !nextCursor || loadingMore) return;
    void fetchPage(nextCursor, true);
  }, [hasNextPage, nextCursor, loadingMore, fetchPage]);

  const clearFilters = useCallback(() => {
    router.replace(pathname);
  }, [pathname, router]);

  return {
    items: filteredItems,
    rawItems,
    loading,
    loadingMore,
    error,
    hasNextPage,
    filters: parsed,

    setStatusFilter: (status: InboxStatusFilter) => setUrl({ status }),
    setAssignmentFilter: (assignment: InboxAssignmentFilter) => setUrl({ assignment }),
    setFlowStateFilter: (flowState: ConversationFlowState | 'all') => setUrl({ flowState }),
    setDepartmentSlug: (departmentSlug: string | undefined) =>
      setUrl({ departmentSlug: departmentSlug?.trim() || undefined }),

    refresh,
    loadMore,
    clearFilters,
  };
}
