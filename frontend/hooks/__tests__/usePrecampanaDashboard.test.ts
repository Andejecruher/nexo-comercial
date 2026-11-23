import { EMPTY_PRECAMPANA_METRICS } from '@/lib/precampana-api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDashboard = vi.fn();
const mockFilterOptions = vi.fn();

vi.mock('@/lib/precampana-api', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    precampanaApi: {
      ...(actual.precampanaApi as object),
      dashboard: (...args: unknown[]) => mockDashboard(...args),
      filterOptions: (...args: unknown[]) => mockFilterOptions(...args),
    },
  };
});

import {
  resetPrecampanaFilterOptionsCache,
  usePrecampanaDashboard,
} from '@/hooks/usePrecampanaDashboard';

const OPTIONS = {
  sections: [{ id: 'sec-1', sectionCode: '2401', votesRequired: 400, districtCode: null }],
  coordinators: [
    {
      id: 'coord-1',
      fullName: 'Ana Torres',
      sectionId: 'sec-1',
      sectionCode: '2401',
      structureId: null,
      structureName: null,
    },
  ],
  leaders: [],
};

describe('usePrecampanaDashboard', () => {
  beforeEach(() => {
    resetPrecampanaFilterOptionsCache();
    mockDashboard.mockReset();
    mockFilterOptions.mockReset();
    mockDashboard.mockResolvedValue({ ok: true, data: { ...EMPTY_PRECAMPANA_METRICS, total: 1 } });
    mockFilterOptions.mockResolvedValue({ ok: true, data: OPTIONS });
  });

  afterEach(() => {
    resetPrecampanaFilterOptionsCache();
  });

  it('caches filter-options for the rest of the session', async () => {
    const first = renderHook(() => usePrecampanaDashboard());
    await waitFor(() => {
      expect(first.result.current.filterOptions.coordinators).toHaveLength(1);
    });
    first.unmount();

    const second = renderHook(() => usePrecampanaDashboard());
    await waitFor(() => {
      expect(second.result.current.filterOptions.coordinators[0]?.fullName).toBe('Ana Torres');
    });
    expect(mockFilterOptions).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it('ignores stale dashboard responses when filters change quickly', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    mockDashboard
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ ok: true, data: { ...EMPTY_PRECAMPANA_METRICS, total: 99 } });

    const { result } = renderHook(() => usePrecampanaDashboard());

    await act(async () => {
      result.current.setDateFrom('2026-08-01');
    });

    await waitFor(() => {
      expect(result.current.metrics.total).toBe(99);
    });

    await act(async () => {
      resolveFirst?.({ ok: true, data: { ...EMPTY_PRECAMPANA_METRICS, total: 1 } });
    });

    expect(result.current.metrics.total).toBe(99);
  });

  it('sends coordinatorId internally when the coordinator filter is selected', async () => {
    const { result } = renderHook(() => usePrecampanaDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.setFilterMode('coordinator');
      result.current.setCoordinatorId('coord-1');
    });

    await waitFor(() => {
      expect(mockDashboard).toHaveBeenCalledWith({ coordinatorId: 'coord-1' });
    });
  });
});
