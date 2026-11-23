'use client';

import {
  EMPTY_PRECAMPANA_METRICS,
  precampanaApi,
  type PrecampanaDashboardFilter,
  type PrecampanaDashboardMetrics,
  type PrecampanaFilterOptions,
} from '@/lib/precampana-api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type PrecampanaFilterMode = 'all' | 'coordinator' | 'section' | 'leader';

const EMPTY_OPTIONS: PrecampanaFilterOptions = {
  sections: [],
  coordinators: [],
  leaders: [],
};

let cachedFilterOptions: PrecampanaFilterOptions | null = null;

/** Test-only: clears the session cache of filter options. */
export function resetPrecampanaFilterOptionsCache(): void {
  cachedFilterOptions = null;
}

function toStartOfDayIso(value: string): string | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day).toISOString();
}

function toNextDayIso(value: string): string | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day + 1).toISOString();
}

export function usePrecampanaDashboard() {
  const [metrics, setMetrics] = useState<PrecampanaDashboardMetrics>(EMPTY_PRECAMPANA_METRICS);
  const [loading, setLoading] = useState(true);
  const [filterOptions, setFilterOptions] = useState<PrecampanaFilterOptions>(
    cachedFilterOptions ?? EMPTY_OPTIONS,
  );
  const [filterMode, setFilterMode] = useState<PrecampanaFilterMode>('all');
  const [sectionId, setSectionId] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [coordinatorId, setCoordinatorId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const latestRequest = useRef(0);

  const filter: PrecampanaDashboardFilter | undefined = useMemo(() => {
    const next: PrecampanaDashboardFilter = {};
    if (filterMode === 'section' && sectionId) next.sectionId = sectionId;
    if (filterMode === 'leader' && leaderId) next.leaderId = leaderId;
    if (filterMode === 'coordinator' && coordinatorId) next.coordinatorId = coordinatorId;
    if (dateFrom) next.from = toStartOfDayIso(dateFrom);
    if (dateTo) next.to = toNextDayIso(dateTo);
    const hasFilter = Boolean(
      next.sectionId || next.leaderId || next.coordinatorId || next.from || next.to,
    );
    return hasFilter ? next : undefined;
  }, [filterMode, sectionId, leaderId, coordinatorId, dateFrom, dateTo]);

  const fetchDashboard = useCallback(async (currentFilter?: PrecampanaDashboardFilter) => {
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    setLoading(true);
    const result = await precampanaApi.dashboard(currentFilter);
    if (latestRequest.current !== requestId) return;
    if (result.ok) {
      setMetrics({
        ...EMPTY_PRECAMPANA_METRICS,
        ...result.data,
        bySection: result.data.bySection ?? [],
        byNeighborhood: result.data.byNeighborhood ?? [],
        byLeader: result.data.byLeader ?? [],
        byCoordinator: result.data.byCoordinator ?? [],
        weeklyGrowth: result.data.weeklyGrowth ?? [],
        sectionCoverage: result.data.sectionCoverage ?? [],
        weeklyLeaderActivity: result.data.weeklyLeaderActivity ?? [],
      });
    } else {
      setMetrics(EMPTY_PRECAMPANA_METRICS);
    }
    setLoading(false);
  }, []);

  const fetchFilterOptions = useCallback(async () => {
    if (cachedFilterOptions) {
      setFilterOptions(cachedFilterOptions);
      return;
    }
    const result = await precampanaApi.filterOptions();
    if (result.ok) {
      cachedFilterOptions = result.data;
      setFilterOptions(result.data);
    }
  }, []);

  useEffect(() => {
    void fetchFilterOptions();
  }, [fetchFilterOptions]);

  useEffect(() => {
    void fetchDashboard(filter);
  }, [fetchDashboard, filter]);

  const changeFilterMode = useCallback((mode: PrecampanaFilterMode) => {
    setFilterMode(mode);
    setSectionId('');
    setLeaderId('');
    setCoordinatorId('');
  }, []);

  const clearFilters = useCallback(() => {
    setFilterMode('all');
    setSectionId('');
    setLeaderId('');
    setCoordinatorId('');
    setDateFrom('');
    setDateTo('');
  }, []);

  return {
    metrics,
    loading,
    filter,
    filterOptions,
    filterMode,
    sectionId,
    leaderId,
    coordinatorId,
    dateFrom,
    dateTo,
    setFilterMode: changeFilterMode,
    setSectionId,
    setLeaderId,
    setCoordinatorId,
    setDateFrom,
    setDateTo,
    clearFilters,
    refresh: () => fetchDashboard(filter),
  };
}
