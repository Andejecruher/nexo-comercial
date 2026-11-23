'use client';

import { citizensApi, type Citizen, type CitizenLeadStatus } from '@/lib/citizens-api';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ParsedFilters {
  search: string;
  phone: string;
  leadStatus?: CitizenLeadStatus;
  neighborhood?: string;
  cursor?: string;
}

const DEFAULT_PAGE_SIZE = 20;

function parseFilters(searchParams: URLSearchParams): ParsedFilters {
  const leadStatus = searchParams.get('leadStatus') ?? undefined;
  const neighborhood = searchParams.get('neighborhood') ?? undefined;
  const search = searchParams.get('search') ?? '';
  const phone = searchParams.get('phone') ?? '';
  const cursor = searchParams.get('cursor') ?? undefined;

  return {
    search,
    phone,
    neighborhood,
    leadStatus: leadStatus as CitizenLeadStatus | undefined,
    cursor,
  };
}

export function useCitizens() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const parsedFilters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [citizens, setCitizens] = useState<Citizen[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [totalCount, setTotalCount] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);

  const [selectedCitizenIds, setSelectedCitizenIds] = useState<string[]>([]);

  const setUrlFilters = useCallback(
    (partial: Partial<Omit<ParsedFilters, 'cursor'>> & { cursor?: string }, resetCursor = true) => {
      const next = new URLSearchParams(searchParams.toString());
      const merged: ParsedFilters = {
        ...parsedFilters,
        ...partial,
      };

      if (merged.search) next.set('search', merged.search);
      else next.delete('search');

      if (merged.phone.trim()) next.set('phone', merged.phone.trim());
      else next.delete('phone');

      if (merged.leadStatus) next.set('leadStatus', merged.leadStatus);
      else next.delete('leadStatus');

      if (merged.neighborhood) next.set('neighborhood', merged.neighborhood);
      else next.delete('neighborhood');

      const finalCursor = resetCursor ? undefined : merged.cursor;
      if (finalCursor) next.set('cursor', finalCursor);
      else next.delete('cursor');

      router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ''}`);
    },
    [pathname, parsedFilters, router, searchParams],
  );

  const fetchCitizens = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    const result = await citizensApi.list({
      limit: DEFAULT_PAGE_SIZE,
      cursor: parsedFilters.cursor,
      leadStatus: parsedFilters.leadStatus,
      neighborhoodId: parsedFilters.neighborhood,
      search: parsedFilters.search.trim() || undefined,
      phone: parsedFilters.phone.trim() || undefined,
    });

    if (result.ok) {
      setCitizens(result.data.citizens);
      setHasNextPage(result.data.meta.hasNextPage);
      setNextCursor(result.data.meta.nextCursor);
      setTotalCount(result.data.meta.count);

      setSelectedCitizenIds((prev) =>
        prev.filter((id) => result.data.citizens.some((c) => c.id === id)),
      );
    } else {
      setError(result.message);
      toast.error('No se pudo cargar el listado de ciudadanos', { description: result.message });
    }

    setLoading(false);
  }, [parsedFilters]);

  useEffect(() => {
    fetchCitizens();
  }, [fetchCitizens]);

  const clearFilters = useCallback(() => {
    setCursorHistory([]);
    setUrlFilters({
      search: '',
      phone: '',
      leadStatus: undefined,
      neighborhood: undefined,
    });
  }, [setUrlFilters]);

  const setSearch = useCallback(
    (value: string) => {
      setCursorHistory([]);
      setUrlFilters({ search: value });
    },
    [setUrlFilters],
  );

  const setPhone = useCallback(
    (value: string) => {
      setCursorHistory([]);
      setUrlFilters({ phone: value });
    },
    [setUrlFilters],
  );

  const setLeadStatus = useCallback(
    (value?: CitizenLeadStatus) => {
      setCursorHistory([]);
      setUrlFilters({ leadStatus: value });
    },
    [setUrlFilters],
  );

  const setNeighborhood = useCallback(
    (value?: string) => {
      setCursorHistory([]);
      setUrlFilters({ neighborhood: value });
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

  const toggleCitizenSelection = useCallback((citizenId: string) => {
    setSelectedCitizenIds((prev) =>
      prev.includes(citizenId) ? prev.filter((id) => id !== citizenId) : [...prev, citizenId],
    );
  }, []);

  const toggleSelectAllCurrentPage = useCallback(() => {
    const allSelected =
      citizens.length > 0 && citizens.every((citizen) => selectedCitizenIds.includes(citizen.id));

    if (allSelected) {
      setSelectedCitizenIds((prev) =>
        prev.filter((id) => !citizens.some((citizen) => citizen.id === id)),
      );
      return;
    }

    setSelectedCitizenIds((prev) => {
      const merged = new Set(prev);
      citizens.forEach((citizen) => merged.add(citizen.id));
      return Array.from(merged);
    });
  }, [citizens, selectedCitizenIds]);

  const clearSelection = useCallback(() => setSelectedCitizenIds([]), []);
  const updateCitizenLocally = useCallback((citizen: Citizen) => {
    setCitizens((current) => current.map((item) => (item.id === citizen.id ? citizen : item)));
  }, []);
  const removeCitizenLocally = useCallback((id: string) => {
    setCitizens((current) => current.filter((item) => item.id !== id));
    setSelectedCitizenIds((current) => current.filter((item) => item !== id));
    setTotalCount((current) => Math.max(0, current - 1));
  }, []);

  return {
    citizens,
    loading,
    error,
    hasNextPage,
    hasPreviousPage: cursorHistory.length > 0,
    totalCount,
    currentPage: cursorHistory.length + 1,
    selectedCitizenIds,
    filters: parsedFilters,

    setSearch,
    setPhone,
    setLeadStatus,
    setNeighborhood,
    clearFilters,
    refresh: fetchCitizens,

    nextPage,
    previousPage,
    firstPage,

    toggleCitizenSelection,
    toggleSelectAllCurrentPage,
    clearSelection,
    updateCitizenLocally,
    removeCitizenLocally,
  };
}
