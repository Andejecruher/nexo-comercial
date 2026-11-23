/**
 * useTags Hook — Tags catalog management
 *
 * Fetching con paginación backend, CRUD operations con optimistic updates.
 */

'use client';

import { type CreateTagPayload, type Tag, tagsApi, type UpdateTagPayload } from '@/lib/catalog-api';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface UseTagsOptions {
  autoFetch?: boolean;
  pageSize?: number;
}

export function useTags(options: UseTagsOptions = {}) {
  const { autoFetch = true, pageSize = 50 } = options;

  // ─── State ─────────────────────────────────────────────────────────────────
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Pagination
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState<string | undefined>(undefined);

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchTags = useCallback(
    async (targetCursor?: string) => {
      setLoading(true);
      setError(undefined);

      // Ensure limit <= 100
      const limit = Math.min(pageSize, 100);

      const result = await tagsApi.list({
        limit,
        cursor: targetCursor,
        search: search.trim() || undefined,
        color: colorFilter,
      });

      if (result.ok) {
        setTags(result.data.tags);
        setCursor(result.data.meta.nextCursor);
        setHasNextPage(result.data.meta.hasNextPage);
        setTotalCount(result.data.meta.count);
      } else {
        setError(result.message);
        toast.error('Error al cargar etiquetas', { description: result.message });
      }

      setLoading(false);
    },
    [pageSize, search, colorFilter],
  );

  useEffect(() => {
    if (autoFetch) {
      // Reset to first page when filters change
      setCursorHistory([]);
      fetchTags(undefined);
    }
  }, [autoFetch, search, colorFilter, fetchTags]);

  // ─── Pagination Navigation ─────────────────────────────────────────────────

  const nextPage = useCallback(() => {
    if (!hasNextPage || !cursor) return;

    // Save current state to history
    setCursorHistory((prev) => [...prev, cursorHistory[cursorHistory.length - 1] || undefined]);

    // Fetch next page
    fetchTags(cursor);
  }, [hasNextPage, cursor, cursorHistory, fetchTags]);

  const previousPage = useCallback(() => {
    if (cursorHistory.length === 0) return;

    // Get previous cursor
    const newHistory = [...cursorHistory];
    const previousCursor = newHistory.pop();
    setCursorHistory(newHistory);

    // Fetch previous page
    fetchTags(previousCursor);
  }, [cursorHistory, fetchTags]);

  const firstPage = useCallback(() => {
    setCursorHistory([]);
    fetchTags(undefined);
  }, [fetchTags]);

  // ─── CRUD Operations ───────────────────────────────────────────────────────

  const createTag = useCallback(
    async (payload: CreateTagPayload) => {
      // Optimistic update
      const tempId = `temp-${Date.now()}`;
      const optimisticTag: Tag = {
        id: tempId,
        ...payload,
        createdAt: new Date().toISOString(),
      };

      setTags((prev) => [optimisticTag, ...prev]);

      const result = await tagsApi.create(payload);

      if (result.ok) {
        // Replace optimistic with real, then refresh to get accurate pagination
        setTags((prev) => prev.map((t) => (t.id === tempId ? result.data.tag : t)));
        toast.success('Etiqueta creada exitosamente');

        // Refresh first page to show new item
        setTimeout(() => firstPage(), 500);

        return { success: true, data: result.data.tag };
      } else {
        // Rollback
        setTags((prev) => prev.filter((t) => t.id !== tempId));
        toast.error('Error al crear etiqueta', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [firstPage],
  );

  const updateTag = useCallback(
    async (id: string, payload: UpdateTagPayload) => {
      // Backup for rollback
      const backup = tags.find((t) => t.id === id);
      if (!backup) return { success: false, error: 'Etiqueta no encontrada' };

      // Optimistic update
      setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...payload } : t)));

      const result = await tagsApi.update(id, payload);

      if (result.ok) {
        // Replace with real data
        setTags((prev) => prev.map((t) => (t.id === id ? result.data.tag : t)));
        toast.success('Etiqueta actualizada exitosamente');
        return { success: true, data: result.data.tag };
      } else {
        // Rollback
        setTags((prev) => prev.map((t) => (t.id === id ? backup : t)));
        toast.error('Error al actualizar etiqueta', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [tags],
  );

  const deleteTag = useCallback(
    async (id: string) => {
      // NO optimistic delete — wait for confirmation
      const result = await tagsApi.delete(id);

      if (result.ok) {
        setTags((prev) => prev.filter((t) => t.id !== id));
        toast.success('Etiqueta eliminada exitosamente');

        // Refresh current page to get accurate data
        setTimeout(() => {
          fetchTags(cursorHistory[cursorHistory.length - 1]);
        }, 500);

        return { success: true };
      } else {
        toast.error('Error al eliminar etiqueta', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [cursorHistory, fetchTags],
  );

  return {
    // Data
    tags,
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
    colorFilter,
    setColorFilter,

    // Actions
    refresh: firstPage,
    nextPage,
    previousPage,
    firstPage,
    createTag,
    updateTag,
    deleteTag,
  };
}
