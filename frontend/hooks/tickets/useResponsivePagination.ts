'use client';

/**
 * useResponsivePagination — paginación offset adaptativa para el listado de tickets.
 *
 * Una sola estrategia de datos para ambos viewports:
 *  - Desktop (>= lg): pide exactamente la página N con `limit` configurable.
 *  - Mobile (< lg):   pide `page=1&limit=MOBILE_LIMIT*N`, de modo que
 *                     "Cargar más" no acumula ni deduplica en memoria: el
 *                     servidor devuelve la ventana completa en una request.
 *
 * La URL es la ÚNICA fuente de verdad de `page`, `limit` y filtros, lo que
 * permite compartir y recargar la vista con el estado exacto.
 *
 * El breakpoint está alineado con `TicketTable` (lg = 1024px). Si se cambia
 * uno, hay que cambiar el otro: una tabla que cambia de layout en un punto
 * distinto al que cambia de controles produce combinaciones incoherentes.
 */

import {
  ticketFromApi,
  ticketsApi,
  type PaginationMeta,
  type TicketDto,
  type TicketFilters,
  type TicketPriorityFilter,
  type TicketStatusFilter,
} from '@/lib/tickets-api';
import { useRealtimeManager } from '@/components/providers/realtime-provider';
import { isDurableEventPayload } from '@/lib/realtime/types';
import { useConnectionStore } from '@/stores/use-connection-store';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  useSyncExternalStore,
} from 'react';
import { toast } from 'sonner';

// ── Constantes de paginación ──────────────────────────────────────────────────

/** Debe coincidir con el breakpoint en que `TicketTable` pasa de tabla a cards. */
export const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

export const DESKTOP_DEFAULT_LIMIT = 25;
export const MOBILE_LIMIT = 15;
/** Techo de acumulación mobile: 3 × 15 = 45 filas, bajo el máximo del backend. */
export const MAX_MOBILE_PAGES = 3;
export const MAX_PAGE_SIZE = 50;
export const MAX_PAGE = 500;
export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

/** Polling de respaldo cuando el socket no está disponible. */
const POLL_MS = 15_000;
/** Polling lento cuando el socket está conectado (el realtime ya empuja). */
const POLL_MS_CONNECTED = 60_000;

const EMPTY_META: PaginationMeta = {
  totalItems: 0,
  totalPages: 1,
  currentPage: 1,
  itemsPerPage: DESKTOP_DEFAULT_LIMIT,
  hasNextPage: false,
  hasPrevPage: false,
};

// ── Breakpoint (SSR-safe) ─────────────────────────────────────────────────────

function subscribeDesktop(onChange: () => void): () => void {
  const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getDesktopSnapshot(): boolean {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

/**
 * `undefined` antes de hidratar. La vista debe renderizar skeleton mientras
 * tanto: así no hay flash de controles equivocados ni mismatch de hidratación.
 */
function getServerSnapshot(): boolean | undefined {
  return undefined;
}

export function useIsDesktopViewport(): boolean | undefined {
  return useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getServerSnapshot);
}

// ── Parseo de URL ─────────────────────────────────────────────────────────────

function parsePositiveInt(raw: string | null, fallback: number, max: number): number {
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseFilters(searchParams: URLSearchParams): TicketFilters {
  return {
    status: (searchParams.get('status') as TicketStatusFilter) || 'all',
    priority: (searchParams.get('priority') as TicketPriorityFilter) || 'all',
    departmentSlug: searchParams.get('dept') ?? undefined,
    assignedUserId: searchParams.get('agent') ?? undefined,
    search: searchParams.get('q') ?? '',
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useResponsivePagination() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktopViewport();
  const [isPending, startTransition] = useTransition();

  const isMobile = isDesktop === false;

  const page = useMemo(() => {
    const max = isMobile ? MAX_MOBILE_PAGES : MAX_PAGE;
    return parsePositiveInt(searchParams.get('page'), 1, max);
  }, [searchParams, isMobile]);

  const limit = useMemo(() => {
    if (isMobile) return MOBILE_LIMIT;
    return parsePositiveInt(searchParams.get('limit'), DESKTOP_DEFAULT_LIMIT, MAX_PAGE_SIZE);
  }, [searchParams, isMobile]);

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  // Ventana real solicitada al backend.
  const requestPage = isMobile ? 1 : page;
  const requestLimit = isMobile ? MOBILE_LIMIT * page : limit;

  const [items, setItems] = useState<TicketDto[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  /** Descarta respuestas fuera de orden (peticiones concurrentes). */
  const requestId = useRef(0);
  /** Últimos parches realtime por ticket, para re-aplicarlos tras un fetch. */
  const patchesRef = useRef(new Map<string, Partial<TicketDto>>());

  const filterKey = useMemo(
    () =>
      [
        filters.status,
        filters.priority,
        filters.departmentSlug ?? '',
        filters.assignedUserId ?? '',
        filters.search.trim(),
      ].join('|'),
    [filters],
  );

  // ── Escritura de URL ────────────────────────────────────────────────────────

  const writeUrl = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const queryString = next.toString();

      startTransition(() => {
        // `scroll: false` evita el salto al top en cada cambio de página.
        router.replace(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      const max = isMobile ? MAX_MOBILE_PAGES : MAX_PAGE;
      const clamped = Math.min(Math.max(Math.trunc(nextPage), 1), max);
      writeUrl((next) => {
        if (clamped > 1) next.set('page', String(clamped));
        else next.delete('page');
      });
    },
    [isMobile, writeUrl],
  );

  const setLimit = useCallback(
    (nextLimit: number) => {
      const clamped = Math.min(Math.max(Math.trunc(nextLimit), 1), MAX_PAGE_SIZE);
      writeUrl((next) => {
        next.set('limit', String(clamped));
        // Cambiar la densidad invalida la posición actual.
        next.delete('page');
      });
    },
    [writeUrl],
  );

  const setFilters = useCallback(
    (partial: Partial<TicketFilters>) => {
      const merged: TicketFilters = { ...filters, ...partial };

      writeUrl((next) => {
        if (merged.status !== 'all') next.set('status', merged.status);
        else next.delete('status');

        if (merged.priority !== 'all') next.set('priority', merged.priority);
        else next.delete('priority');

        if (merged.departmentSlug) next.set('dept', merged.departmentSlug);
        else next.delete('dept');

        if (merged.assignedUserId) next.set('agent', merged.assignedUserId);
        else next.delete('agent');

        if (merged.search.trim()) next.set('q', merged.search.trim());
        else next.delete('q');

        // Todo cambio de filtro vuelve a la página 1: dejar `page=7` sin el
        // filtro original suele producir una página vacía.
        next.delete('page');
      });
    },
    [filters, writeUrl],
  );

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchRange = useCallback(
    async (targetPage: number, targetLimit: number) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(undefined);

      const result = await ticketsApi.list({
        page: targetPage,
        limit: targetLimit,
        status: filters.status === 'all' ? undefined : filters.status,
        priority: filters.priority === 'all' ? undefined : filters.priority,
        departmentSlug: filters.departmentSlug,
        assignedUserId: filters.assignedUserId,
        search: filters.search.trim() || undefined,
      });

      if (id !== requestId.current) return; // respuesta obsoleta

      if (result.ok) {
        // Un parche realtime puede haber llegado mientras la request viajaba:
        // re-aplicarlo es idempotente y evita un "parpadeo" al estado viejo.
        const rows = result.data.data.map((dto) => {
          const ticket = ticketFromApi(dto);
          const patch = patchesRef.current.get(ticket.id);
          return patch ? { ...ticket, ...patch } : ticket;
        });

        setItems(rows);
        setPagination(result.data.pagination);
      } else {
        setError(result.message);
        toast.error('No se pudieron cargar los tickets', { description: result.message });
      }

      setLoading(false);
    },
    [filters],
  );

  useEffect(() => {
    // Esperar a que el breakpoint esté resuelto evita pedir una ventana con el
    // `limit` equivocado y volver a pedirla al hidratar.
    if (isDesktop === undefined) return;
    void fetchRange(requestPage, requestLimit);
  }, [fetchRange, requestPage, requestLimit, filterKey, isDesktop]);

  /** Refresca la ventana actual. NO resetea a la página 1. */
  const refresh = useCallback(
    () => fetchRange(requestPage, requestLimit),
    [fetchRange, requestPage, requestLimit],
  );

  /** Ref estable para handlers de realtime que no deben re-suscribirse por página. */
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  //
  // Los parches se aplican por id sobre la ventana actual. Un refresco completo
  // se hace con debounce, pero SIEMPRE sobre la página en curso: perder la
  // página 7 cada 50 ms por un evento remoto es inaceptable en operación.

  const manager = useRealtimeManager();

  useEffect(() => {
    if (!manager) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    manager.router.register({
      id: 'crm-ticket-list',
      events: ['conversation.updated', 'conversation.handover'],
      handler: (_event, payload) => {
        if (isDurableEventPayload(payload) && payload.ticketPatch) {
          const patch = payload.ticketPatch as Partial<TicketDto> & { id: string };

          patchesRef.current.set(patch.id, patch);
          if (patchesRef.current.size > 1000) {
            const oldest = patchesRef.current.keys().next().value;
            if (oldest !== undefined) patchesRef.current.delete(oldest);
          }

          setItems((current) =>
            current.map((ticket) => (ticket.id === patch.id ? { ...ticket, ...patch } : ticket)),
          );
        }

        if (timer) return;
        timer = setTimeout(() => {
          timer = undefined;
          void refreshRef.current();
        }, 300);
      },
    });

    return () => {
      if (timer) clearTimeout(timer);
      manager.router.unregister('crm-ticket-list');
    };
  }, [manager]);

  // ── Polling ─────────────────────────────────────────────────────────────────
  //
  // Refresca la ventana visible. Antes se pedía siempre la página 1, lo que
  // devolvía al operador al inicio del listado cada 15 s.

  const socketConnected = useConnectionStore((state) => state.status === 'connected');

  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refreshRef.current();
    };

    const pollMs = socketConnected ? POLL_MS_CONNECTED : POLL_MS;
    const id = window.setInterval(tick, pollMs);
    return () => window.clearInterval(id);
  }, [socketConnected]);

  // Al reconectar el socket, re-sincronizar por REST (replay).
  const prevSocketConnected = useRef(socketConnected);
  useEffect(() => {
    if (!prevSocketConnected.current && socketConnected) {
      void refreshRef.current();
    }
    prevSocketConnected.current = socketConnected;
  }, [socketConnected]);

  const loadMore = useCallback(() => {
    if (!pagination.hasNextPage || page >= MAX_MOBILE_PAGES) return;
    setPage(page + 1);
  }, [pagination.hasNextPage, page, setPage]);

  const clearFilters = useCallback(() => {
    startTransition(() => router.replace(pathname, { scroll: false }));
  }, [pathname, router]);

  // Setters estables: `TicketFilters` está memoizado y la búsqueda se debounce;
  // una identidad nueva por render reiniciaría el timer en cada render.
  const setStatusFilter = useCallback(
    (status: TicketStatusFilter) => setFilters({ status }),
    [setFilters],
  );
  const setPriorityFilter = useCallback(
    (priority: TicketPriorityFilter) => setFilters({ priority }),
    [setFilters],
  );
  const setDepartmentFilter = useCallback(
    (departmentSlug: string | undefined) => setFilters({ departmentSlug }),
    [setFilters],
  );
  const setAgentFilter = useCallback(
    (assignedUserId: string | undefined) => setFilters({ assignedUserId }),
    [setFilters],
  );
  const setSearch = useCallback((search: string) => setFilters({ search }), [setFilters]);

  return {
    items,
    pagination,
    loading,
    /** Mobile reemplaza la ventana; no hay append incremental. */
    loadingMore: false,
    error,
    filters,
    isDesktop: isDesktop ?? false,
    viewportReady: isDesktop !== undefined,
    isPending,

    setPage,
    setLimit,
    loadMore,
    refresh,
    refreshRef,
    clearFilters,

    setStatusFilter,
    setPriorityFilter,
    setDepartmentFilter,
    setAgentFilter,
    setSearch,
  };
}
