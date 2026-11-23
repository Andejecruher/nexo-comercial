'use client';

/**
 * useCitizenTickets — Tickets de un único ciudadano.
 *
 * Variante acotada de useResponsivePagination: el backend filtra por citizenId
 * (`GET /tickets?citizenId=`), por lo que no hay filtros client-side ni
 * sincronización con la URL.
 *
 * Pagina por offset con acumulación acotada: el perfil de un ciudadano tiene
 * pocos tickets, así que "cargar más" agrega una página de 50 sin riesgo de
 * crecer sin control.
 */

import { ticketFromApi, ticketsApi, type TicketDto } from '@/lib/tickets-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const PAGE_LIMIT = 50;

export function useCitizenTickets(citizenId: string | undefined) {
  const [items, setItems] = useState<TicketDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

  /** Descarta respuestas fuera de orden al cambiar de ciudadano o de página. */
  const requestId = useRef(0);

  const fetchPage = useCallback(
    async (targetPage: number, append: boolean) => {
      if (!citizenId) return;

      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(undefined);

      const result = await ticketsApi.list({
        page: targetPage,
        limit: PAGE_LIMIT,
        citizenId,
      });

      if (id !== requestId.current) return;

      if (result.ok) {
        const tickets = result.data.data.map(ticketFromApi);
        setItems((prev) => {
          if (!append) return tickets;
          const seen = new Set(prev.map((ticket) => ticket.id));
          return [...prev, ...tickets.filter((ticket) => !seen.has(ticket.id))];
        });
        setHasNextPage(result.data.pagination.hasNextPage);
        setPage(targetPage);
      } else {
        setError(result.message);
        toast.error('No se pudieron cargar los tickets del ciudadano', {
          description: result.message,
        });
      }

      if (append) setLoadingMore(false);
      else setLoading(false);
    },
    [citizenId],
  );

  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasNextPage(false);
    void fetchPage(1, false);
  }, [fetchPage]);

  const refresh = useCallback(() => fetchPage(1, false), [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasNextPage || loadingMore) return;
    void fetchPage(page + 1, true);
  }, [hasNextPage, loadingMore, page, fetchPage]);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasNextPage,
    refresh,
    loadMore,
  };
}
