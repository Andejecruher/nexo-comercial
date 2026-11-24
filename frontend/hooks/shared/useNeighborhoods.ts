/**
 * useNeighborhoods Hook — Neighborhoods catalog management
 *
 * Fetching con paginación backend, CRUD operations con optimistic updates.
 */

'use client';

import {
  type CreateNeighborhoodPayload,
  type Neighborhood,
  neighborhoodsApi,
  type UpdateNeighborhoodPayload,
} from '@/lib/shared/catalog-api';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface UseNeighborhoodsOptions {
  autoFetch?: boolean;
  pageSize?: number;
}

export function useNeighborhoods(options: UseNeighborhoodsOptions = {}) {
  const { autoFetch = true, pageSize = 50 } = options;

  // ─── State ─────────────────────────────────────────────────────────────────
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Pagination
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState<string | undefined>(undefined);
  const [municipalityFilter, setMunicipalityFilter] = useState<string | undefined>(undefined);

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchNeighborhoods = useCallback(
    async (targetCursor?: string) => {
      setLoading(true);
      setError(undefined);

      // Ensure limit <= 100
      const limit = Math.min(pageSize, 100);

      const result = await neighborhoodsApi.list({
        limit,
        cursor: targetCursor,
        search: search.trim() || undefined,
        zone: zoneFilter,
        municipality: municipalityFilter,
      });

      if (result.ok) {
        setNeighborhoods(result.data.neighborhoods);
        setCursor(result.data.meta.nextCursor);
        setHasNextPage(result.data.meta.hasNextPage);
        setTotalCount(result.data.meta.count);
      } else {
        setError(result.message);
        toast.error('Error al cargar barrios', { description: result.message });
      }

      setLoading(false);
    },
    [pageSize, search, zoneFilter, municipalityFilter],
  );

  useEffect(() => {
    if (autoFetch) {
      // Reset to first page when filters change
      setCursorHistory([]);
      fetchNeighborhoods(undefined);
    }
  }, [autoFetch, search, zoneFilter, municipalityFilter, fetchNeighborhoods]);

  // ─── Pagination Navigation ─────────────────────────────────────────────────

  const nextPage = useCallback(() => {
    if (!hasNextPage || !cursor) return;

    // Save current state to history
    setCursorHistory((prev) => [...prev, cursorHistory[cursorHistory.length - 1] || undefined]);

    // Fetch next page
    fetchNeighborhoods(cursor);
  }, [hasNextPage, cursor, cursorHistory, fetchNeighborhoods]);

  const previousPage = useCallback(() => {
    if (cursorHistory.length === 0) return;

    // Get previous cursor
    const newHistory = [...cursorHistory];
    const previousCursor = newHistory.pop();
    setCursorHistory(newHistory);

    // Fetch previous page
    fetchNeighborhoods(previousCursor);
  }, [cursorHistory, fetchNeighborhoods]);

  const firstPage = useCallback(() => {
    setCursorHistory([]);
    fetchNeighborhoods(undefined);
  }, [fetchNeighborhoods]);

  // ─── CRUD Operations ───────────────────────────────────────────────────────

  const createNeighborhood = useCallback(
    async (payload: CreateNeighborhoodPayload) => {
      // Optimistic update
      const tempId = `temp-${Date.now()}`;
      const optimisticNeighborhood: Neighborhood = {
        id: tempId,
        ...payload,
        state: 'Chiapas',
        stateCode: 'CHP',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setNeighborhoods((prev) => [optimisticNeighborhood, ...prev]);

      const result = await neighborhoodsApi.create(payload);

      if (result.ok) {
        // Replace optimistic with real, then refresh to get accurate pagination
        setNeighborhoods((prev) =>
          prev.map((n) => (n.id === tempId ? result.data.neighborhood : n)),
        );
        toast.success('Barrio creado exitosamente');

        // Refresh first page to show new item
        setTimeout(() => firstPage(), 500);

        return { success: true, data: result.data.neighborhood };
      } else {
        // Rollback
        setNeighborhoods((prev) => prev.filter((n) => n.id !== tempId));
        toast.error('Error al crear barrio', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [firstPage],
  );

  const updateNeighborhood = useCallback(
    async (id: string, payload: UpdateNeighborhoodPayload) => {
      // Backup for rollback
      const backup = neighborhoods.find((n) => n.id === id);
      if (!backup) return { success: false, error: 'Barrio no encontrado' };

      // Optimistic update
      setNeighborhoods((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, ...payload, updatedAt: new Date().toISOString() } : n,
        ),
      );

      const result = await neighborhoodsApi.update(id, payload);

      if (result.ok) {
        // Replace with real data
        setNeighborhoods((prev) => prev.map((n) => (n.id === id ? result.data.neighborhood : n)));
        toast.success('Barrio actualizado exitosamente');
        return { success: true, data: result.data.neighborhood };
      } else {
        // Rollback
        setNeighborhoods((prev) => prev.map((n) => (n.id === id ? backup : n)));
        toast.error('Error al actualizar barrio', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [neighborhoods],
  );

  const deleteNeighborhood = useCallback(
    async (id: string) => {
      // NO optimistic delete — wait for confirmation
      const result = await neighborhoodsApi.delete(id);

      if (result.ok) {
        setNeighborhoods((prev) => prev.filter((n) => n.id !== id));
        toast.success('Barrio eliminado exitosamente');

        // Refresh current page to get accurate data
        setTimeout(() => {
          fetchNeighborhoods(cursorHistory[cursorHistory.length - 1]);
        }, 500);

        return { success: true };
      } else {
        toast.error('Error al eliminar barrio', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [cursorHistory, fetchNeighborhoods],
  );

  return {
    // Data
    neighborhoods,
    loading,
    error,

    // Pagination
    hasNextPage,
    hasPreviousPage: cursorHistory.length > 0,
    totalCount,
    pageSize,
    currentPage: cursorHistory.length + 1,

    // Filters
    search,
    setSearch,
    zoneFilter,
    setZoneFilter,
    municipalityFilter,
    setMunicipalityFilter,

    // Actions
    refresh: firstPage,
    nextPage,
    previousPage,
    firstPage,
    createNeighborhood,
    updateNeighborhood,
    deleteNeighborhood,
  };
}
