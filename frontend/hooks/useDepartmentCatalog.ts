'use client';

import { type Department, departmentsApi } from '@/lib/catalog-api';
import { useCallback, useEffect, useMemo, useState } from 'react';

const CATALOG_PAGE_SIZE = 100;

export interface UseDepartmentCatalogResult {
  departments: Department[];
  loading: boolean;
  error: string | null;
  slugToId: (slug: string) => string | undefined;
  idToSlug: (id: string) => string | undefined;
  refresh: () => Promise<void>;
}

/**
 * Carga TODO el catálogo de departamentos activos (paginado) y expone mapas
 * slug <-> id. Es idóneo para traducir payloads realtime a identificadores
 * estables de preferencias.
 */
export function useDepartmentCatalog(): UseDepartmentCatalogResult {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: Department[] = [];
      let cursor: string | undefined;
      do {
        const result = await departmentsApi.list({
          limit: CATALOG_PAGE_SIZE,
          cursor,
          isActive: true,
        });
        if (!result.ok) {
          setError(result.message);
          break;
        }
        all.push(...result.data.departments);
        cursor = result.data.meta.nextCursor;
      } while (cursor);
      setDepartments(all);
    } catch {
      setError('Error cargando catálogo de departamentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const slugToId = useCallback(
    (slug: string) => departments.find((d) => d.slug === slug)?.id,
    [departments],
  );

  const idToSlug = useCallback(
    (id: string) => departments.find((d) => d.id === id)?.slug,
    [departments],
  );

  return useMemo(
    () => ({ departments, loading, error, slugToId, idToSlug, refresh: fetchAll }),
    [departments, loading, error, slugToId, idToSlug, fetchAll],
  );
}
