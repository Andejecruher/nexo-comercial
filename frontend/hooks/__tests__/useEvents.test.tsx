import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEvents } from '@/hooks/useEvents';
import { eventsApi } from '@/lib/events-api';

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn() },
  pathname: '/admin/eventos',
  search: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.search,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/events-api', () => ({
  eventsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getById: vi.fn(),
  },
}));

function setRoute(query = '') {
  mocks.router.replace.mockReset();
  mocks.search = new URLSearchParams(query);
}

describe('useEvents visibility filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eventsApi.list).mockResolvedValue({
      ok: true,
      data: { events: [], meta: { hasNextPage: false, count: 0 } },
    } as never);
  });

  it('lists public and private events together by default', async () => {
    setRoute();

    const { result } = renderHook(() => useEvents());

    await act(async () => {
      await Promise.resolve();
    });

    expect(eventsApi.list).toHaveBeenCalledWith(
      expect.not.objectContaining({ visibility: expect.anything() }),
    );
    expect(result.current.filters.visibility).toBeUndefined();
  });

  it('passes the visibility filter from the URL to the API', async () => {
    setRoute('visibility=private');

    renderHook(() => useEvents());

    await act(async () => {
      await Promise.resolve();
    });

    expect(eventsApi.list).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private' }));
  });

  it('updates the URL when the visibility filter changes', async () => {
    setRoute();

    const { result } = renderHook(() => useEvents());

    await act(async () => {
      result.current.setVisibilityFilter('private');
    });

    expect(mocks.router.replace).toHaveBeenCalledWith('/admin/eventos?visibility=private');
  });

  it('clears the visibility filter together with the rest', async () => {
    setRoute('visibility=private&status=draft');

    const { result } = renderHook(() => useEvents());

    await act(async () => {
      result.current.clearFilters();
    });

    expect(mocks.router.replace).toHaveBeenCalledWith('/admin/eventos');
  });
});
