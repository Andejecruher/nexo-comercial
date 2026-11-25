'use client';

/**
 * TicketsListView — Vista completa del listado de tickets.
 *
 * Orquesta useResponsivePagination + TicketFilters + TicketTable.
 * La paginación se presenta distinto según el viewport, pero ambos casos
 * consumen la misma estrategia de datos (offset server-side):
 *   - Desktop (>= lg): `TicketPaginationBar` (numerada + selector de filas).
 *   - Mobile  (< lg):  `TicketLoadMoreBar` (carga explícita y acotada).
 *
 * Carga agentes solo si el usuario es supervisor.
 */

import { TicketFilters } from '@/components/tickets/TicketFilters';
import { TicketLoadMoreBar } from '@/components/tickets/TicketLoadMoreBar';
import { TicketPaginationBar } from '@/components/tickets/TicketPaginationBar';
import { TicketTable } from '@/components/shared/tickets/TicketTable';
import { Button } from '@/components/ui/button';
import { MAX_MOBILE_PAGES, useResponsivePagination } from '@/hooks/tickets/useResponsivePagination';
import { usePermissions } from '@/hooks/shared/usePermissions';
import { adminUsersApi, type PanelUserDto } from '@/lib/shared/admin-users-api';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function TicketsListView() {
  const { roles } = usePermissions();
  const isSupervisor = useMemo(
    () => roles.some((r) => r === 'COORDINADOR' || r === 'SUPER_ADMIN'),
    [roles],
  );

  const {
    items,
    pagination,
    loading,
    error,
    filters,
    isDesktop,
    viewportReady,
    setPage,
    setLimit,
    loadMore,
    refresh,
    clearFilters,
    setStatusFilter,
    setPriorityFilter,
    setSearch,
  } = useResponsivePagination();

  const [panelUsers, setPanelUsers] = useState<PanelUserDto[]>([]);

  useEffect(() => {
    if (!isSupervisor) return;
    void (async () => {
      const res = await adminUsersApi.list();
      if (res.ok) setPanelUsers(res.data.users);
    })();
  }, [isSupervisor]);

  const agentsMap = useMemo(() => {
    const m = new Map<string, PanelUserDto>();
    panelUsers.forEach((u) => m.set(u.id, u));
    return m;
  }, [panelUsers]);

  // Ancla para devolver el foco/scroll al inicio del listado al cambiar página.
  const listTopRef = useRef<HTMLDivElement>(null);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      setPage(nextPage);
      listTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    [setPage],
  );

  const footer = useMemo(() => {
    if (!viewportReady) return null;

    if (isDesktop) {
      return (
        <TicketPaginationBar
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          itemsPerPage={pagination.itemsPerPage}
          disabled={loading}
          onPageChange={handlePageChange}
          onPageSizeChange={setLimit}
        />
      );
    }

    return (
      <TicketLoadMoreBar
        loaded={items.length}
        totalItems={pagination.totalItems}
        hasNextPage={pagination.hasNextPage}
        loading={loading}
        maxReached={pagination.currentPage >= MAX_MOBILE_PAGES}
        onLoadMore={loadMore}
      />
    );
  }, [
    viewportReady,
    isDesktop,
    pagination,
    items.length,
    loading,
    handlePageChange,
    setLimit,
    loadMore,
  ]);

  return (
    <div className="h-full min-w-0 overflow-y-auto">
      <div className="min-w-0 p-3 sm:p-4 md:p-6 space-y-4">
        {/* Header */}
        <div ref={listTopRef} className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-black text-foreground">Casos ciudadanos</h1>
            <p className="text-xs text-muted-foreground">
              Gestión de reportes y seguimiento ·{' '}
              {loading && pagination.totalItems === 0
                ? '…'
                : `${pagination.totalItems} resultado${pagination.totalItems !== 1 ? 's' : ''}`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            className="min-h-11 cursor-pointer gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </Button>
        </div>

        {/* Filters */}
        <TicketFilters
          filters={filters}
          onStatusChange={setStatusFilter}
          onPriorityChange={setPriorityFilter}
          onSearchChange={setSearch}
          onClear={clearFilters}
        />

        {/* Table */}
        <TicketTable
          tickets={items}
          loading={loading || !viewportReady}
          error={error}
          agentsMap={agentsMap}
          onRetry={() => void refresh()}
          footer={footer}
        />
      </div>
    </div>
  );
}
