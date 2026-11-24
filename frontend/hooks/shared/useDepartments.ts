/**
 * useDepartments Hook — Departments catalog management
 *
 * Fetching con paginación backend, CRUD operations con optimistic updates, soft delete/activación.
 */

'use client';

import {
  type CreateDepartmentPayload,
  type Department,
  departmentsApi,
  type UpdateDepartmentPayload,
} from '@/lib/shared/catalog-api';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface UseDepartmentsOptions {
  autoFetch?: boolean;
  pageSize?: number;
}

export function useDepartments(options: UseDepartmentsOptions = {}) {
  const { autoFetch = true, pageSize = 50 } = options;

  // ─── State ─────────────────────────────────────────────────────────────────
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Pagination
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchDepartments = useCallback(
    async (targetCursor?: string) => {
      setLoading(true);
      setError(undefined);

      // Ensure limit <= 100
      const limit = Math.min(pageSize, 100);

      // Map activeFilter to backend isActive param
      const isActiveParam =
        activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined;

      const result = await departmentsApi.list({
        limit,
        cursor: targetCursor,
        search: search.trim() || undefined,
        isActive: isActiveParam,
      });

      if (result.ok) {
        setDepartments(result.data.departments);
        setCursor(result.data.meta.nextCursor);
        setHasNextPage(result.data.meta.hasNextPage);
        setTotalCount(result.data.meta.count);
      } else {
        setError(result.message);
        toast.error('Error al cargar departamentos', { description: result.message });
      }

      setLoading(false);
    },
    [pageSize, search, activeFilter],
  );

  useEffect(() => {
    if (autoFetch) {
      // Reset to first page when filters change
      setCursorHistory([]);
      fetchDepartments(undefined);
    }
  }, [autoFetch, search, activeFilter, fetchDepartments]);

  // ─── Pagination Navigation ─────────────────────────────────────────────────

  const nextPage = useCallback(() => {
    if (!hasNextPage || !cursor) return;

    // Save current state to history
    setCursorHistory((prev) => [...prev, cursorHistory[cursorHistory.length - 1] || undefined]);

    // Fetch next page
    fetchDepartments(cursor);
  }, [hasNextPage, cursor, cursorHistory, fetchDepartments]);

  const previousPage = useCallback(() => {
    if (cursorHistory.length === 0) return;

    // Get previous cursor
    const newHistory = [...cursorHistory];
    const previousCursor = newHistory.pop();
    setCursorHistory(newHistory);

    // Fetch previous page
    fetchDepartments(previousCursor);
  }, [cursorHistory, fetchDepartments]);

  const firstPage = useCallback(() => {
    setCursorHistory([]);
    fetchDepartments(undefined);
  }, [fetchDepartments]);

  // ─── CRUD Operations ───────────────────────────────────────────────────────

  const createDepartment = useCallback(
    async (payload: CreateDepartmentPayload) => {
      // Optimistic update
      const tempId = `temp-${Date.now()}`;
      const optimisticDepartment: Department = {
        id: tempId,
        slug: payload.slug,
        name: payload.name,
        description: payload.description,
        isActive: payload.isActive ?? true,
        keywords: payload.keywords ?? [],
        schedule: payload.schedule ?? [],
        scheduleExceptions: payload.scheduleExceptions ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setDepartments((prev) => [optimisticDepartment, ...prev]);

      const result = await departmentsApi.create(payload);

      if (result.ok) {
        // Replace optimistic with real, then refresh to get accurate pagination
        setDepartments((prev) => prev.map((d) => (d.id === tempId ? result.data.department : d)));
        toast.success('Departamento creado exitosamente');

        // Refresh first page to show new item
        setTimeout(() => firstPage(), 500);

        return { success: true, data: result.data.department };
      } else {
        // Rollback
        setDepartments((prev) => prev.filter((d) => d.id !== tempId));
        toast.error('Error al crear departamento', { description: result.message });
        return { success: false, error: result.message };
      }
    },
    [firstPage],
  );

  const updateDepartment = useCallback(
    async (id: string, payload: UpdateDepartmentPayload) => {
      // Backup for rollback
      const backup = departments.find((d) => d.id === id);
      if (!backup) return { success: false, error: 'Departamento no encontrado' };

      // El slug es inmutable tras el alta (validado en backend). Aquí no se
      // envía slug en el payload, así que no se requiere una validación extra.

      // Optimistic update
      setDepartments((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, ...payload, updatedAt: new Date().toISOString() } : d,
        ),
      );

      const result = await departmentsApi.update(id, payload);

      if (result.ok) {
        // Replace with real data
        setDepartments((prev) => prev.map((d) => (d.id === id ? result.data.department : d)));
        toast.success('Departamento actualizado exitosamente');
        return { success: true, data: result.data.department };
      } else {
        // Rollback
        setDepartments((prev) => prev.map((d) => (d.id === id ? backup : d)));
        toast.error('Error al actualizar departamento', {
          description: result.message,
        });
        return { success: false, error: result.message };
      }
    },
    [departments],
  );

  const toggleDepartment = useCallback(
    async (id: string) => {
      // Backup for rollback
      const backup = departments.find((d) => d.id === id);
      if (!backup) return { success: false, error: 'Departamento no encontrado' };

      // Validación: departamento "general" no se puede desactivar
      if (backup.slug === 'general' && backup.isActive) {
        toast.error('El departamento "general" no puede ser desactivado');
        return { success: false, error: 'El departamento "general" está protegido' };
      }

      const newState = !backup.isActive;

      // Optimistic update
      setDepartments((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, isActive: newState, updatedAt: new Date().toISOString() } : d,
        ),
      );

      // Si desactiva, usa DELETE. Si activa, usa PATCH
      const result = newState
        ? await departmentsApi.update(id, { isActive: true })
        : await departmentsApi.delete(id);

      if (result.ok) {
        // Success - optimistic update ya está aplicado
        toast.success(newState ? 'Departamento activado' : 'Departamento desactivado');

        // Refresh current page to get accurate data
        setTimeout(() => {
          fetchDepartments(cursorHistory[cursorHistory.length - 1]);
        }, 500);

        return { success: true };
      } else {
        // Rollback
        setDepartments((prev) => prev.map((d) => (d.id === id ? backup : d)));
        toast.error(
          newState ? 'Error al activar departamento' : 'Error al desactivar departamento',
          { description: result.message },
        );
        return { success: false, error: result.message };
      }
    },
    [departments, cursorHistory, fetchDepartments],
  );

  return {
    // Data
    departments,
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
    activeFilter,
    setActiveFilter,

    // Actions
    refresh: firstPage,
    nextPage,
    previousPage,
    firstPage,
    createDepartment,
    updateDepartment,
    toggleDepartment,
  };
}
