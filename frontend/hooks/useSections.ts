'use client';

import { ineOcrApi, type ElectoralSection } from '@/lib/ine-ocr-api';
import { useCallback, useEffect, useState } from 'react';

/**
 * Carga las secciones electorales activas del catálogo (jerarquía Estado ·
 * Distrito · Sección), usadas por el alta de coordinadores y por los
 * selectores filtrados por sección (F4.2 / F4.3).
 */
export function useSections() {
  const [sections, setSections] = useState<ElectoralSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);

  const refreshSections = useCallback(async () => {
    setSectionsLoading(true);
    const result = await ineOcrApi.catalog.listSections({ limit: 500 });
    setSectionsLoading(false);
    if (result.ok) setSections(result.data.sections ?? []);
  }, []);

  useEffect(() => {
    void refreshSections();
  }, [refreshSections]);

  const activeSections = sections.filter((section) => section.isActive);

  return { sections, activeSections, sectionsLoading, refreshSections };
}
