import type * as TicketsApiModule from '@/lib/shared/tickets-api';
import type { RealtimeManager } from '@/lib/shared/realtime/realtime-manager';
import { useConnectionStore } from '@/store/shared/use-connection-store';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResponsivePagination } from '@/hooks/tickets/useResponsivePagination';

const mocks = vi.hoisted(() => {
  const register = vi.fn();
  return {
    list: vi.fn(),
    register,
    manager: { router: { register, unregister: vi.fn() } },
    router: { replace: vi.fn() },
    search: new URLSearchParams('page=2'),
  };
});

vi.mock('@/components/shared/providers/realtime-provider', () => ({
  useRealtimeManager: () => mocks.manager as unknown as RealtimeManager,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  usePathname: () => '/admin/tickets',
  useSearchParams: () => mocks.search,
}));
vi.mock('@/lib/shared/tickets-api', async () => {
  const actual = await vi.importActual<typeof TicketsApiModule>('@/lib/shared/tickets-api');
  return {
    ...actual,
    ticketsApi: { ...actual.ticketsApi, list: (...args: unknown[]) => mocks.list(...args) },
  };
});

const id = (n: number) => `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;

function ticket(n: number) {
  return {
    id: id(n),
    conversationId: id(100),
    citizenId: id(200),
    folio: String(n),
    citizenName: 'Ana',
    citizenPhone: '123',
    status: 'OPEN',
    priority: 'MEDIUM',
    source: 'WHATSAPP',
    departmentSlug: null,
    assignedUserId: null,
    flowState: 'BOT_FLOW',
    conversationStatus: 'open',
    channel: 'whatsapp',
    closedAt: null,
    createdAt: '2026-10-13T10:00:00.000Z',
    updatedAt: '2026-10-13T10:00:00.000Z',
  };
}

function paginated(items: ReturnType<typeof ticket>[], overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: {
      data: items,
      pagination: {
        totalItems: 2,
        totalPages: 2,
        currentPage: 2,
        itemsPerPage: 1,
        hasNextPage: false,
        hasPrevPage: true,
        ...overrides,
      },
    },
  };
}

describe('useResponsivePagination — realtime y refresco de ventana', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: true, // desktop
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  afterAll(() => {
    // @ts-expect-error — limpieza del mock de jsdom
    delete window.matchMedia;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = new URLSearchParams('page=2');
    useConnectionStore.setState({ status: 'disconnected' });
  });

  it('refresca la página actual, no la primera', async () => {
    mocks.list.mockResolvedValue(paginated([ticket(2)], { currentPage: 2, hasPrevPage: true }));

    const { result } = renderHook(() => useResponsivePagination());

    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });

  it('conserva un parche realtime aunque una respuesta vieja llegue después', async () => {
    mocks.list.mockResolvedValueOnce(paginated([ticket(2)]));

    const { result } = renderHook(() => useResponsivePagination());
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    let resolveRefresh!: (value: ReturnType<typeof paginated>) => void;
    mocks.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });

    const handler = mocks.register.mock.calls.at(-1)?.[0]?.handler as (
      event: string,
      payload: unknown,
    ) => void;

    act(() =>
      handler('conversation.updated', {
        eventId: id(300),
        correlationId: 'close',
        schemaVersion: 1,
        eventType: 'ticket.closed',
        socketEventName: 'conversation.updated',
        occurredAt: '2026-10-13T10:01:00.000Z',
        source: 'test',
        conversationId: id(100),
        ticketPatch: { id: id(2), status: 'CLOSED' },
      }),
    );

    expect(result.current.items.find((row) => row.id === id(2))?.status).toBe('CLOSED');

    await act(async () => {
      resolveRefresh(paginated([ticket(2)]));
      await refreshPromise;
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items.find((row) => row.id === id(2))?.status).toBe('CLOSED');
  });
});
