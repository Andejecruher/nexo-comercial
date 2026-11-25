'use client';

import { PaginationControls } from '@/components/shared/catalogs/PaginationControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { EventRegistrationRecord, RegistrationStatus } from '@/lib/eventos/events-api';
import { paginateItems } from '@/lib/eventos/query-filters';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const REG_LABEL: Record<RegistrationStatus, string> = {
  invited: 'Invitado',
  registered: 'Registrado',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  waitlist: 'Lista espera',
};

const ATT_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  attended: 'Asistió',
  no_show: 'No asistió',
};

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50];

interface EventRegistrationsTableProps {
  registrations: EventRegistrationRecord[];
  loading: boolean;
  onConfirm?: (registrationId: string) => void;
  onCheckIn?: (registrationId: string) => void;
  actionLoading?: boolean;
  canWrite?: boolean;
}

function checkedInLabel(checkedInAt: string | null | undefined) {
  return checkedInAt ? format(new Date(checkedInAt), 'd MMM yyyy HH:mm', { locale: es }) : '—';
}

export function EventRegistrationsTable({
  registrations,
  loading,
  onConfirm,
  onCheckIn,
  actionLoading,
  canWrite = true,
}: EventRegistrationsTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const paged = useMemo(() => {
    const first = paginateItems(registrations, { page, pageSize });
    const safePage = Math.min(page, Math.max(1, first.totalPages));
    if (safePage === page) return first;
    return paginateItems(registrations, { page: safePage, pageSize });
  }, [registrations, page, pageSize]);
  const pageCount = Math.max(1, paged.totalPages);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const canConfirm = (r: EventRegistrationRecord) =>
    canWrite &&
    Boolean(onConfirm) &&
    (r.registrationStatus === 'invited' || r.registrationStatus === 'registered');

  const canCheckInRow = (r: EventRegistrationRecord) =>
    canWrite &&
    Boolean(onCheckIn) &&
    (r.registrationStatus === 'registered' || r.registrationStatus === 'confirmed') &&
    r.attendanceStatus === 'pending';

  const empty = !loading && registrations.length === 0;
  const visibleRows = loading ? [] : paged.items;

  const pager = (
    <PaginationControls
      currentPage={paged.page}
      hasNextPage={paged.hasNextPage}
      hasPreviousPage={paged.hasPreviousPage}
      totalCount={paged.total}
      totalPages={pageCount}
      loading={loading}
      pageSize={pageSize}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(1);
      }}
      onNext={() => setPage((current) => current + 1)}
      onPrevious={() => setPage((current) => Math.max(1, current - 1))}
      onFirst={() => setPage(1)}
    />
  );

  return (
    <div className="flex flex-col">
      <div className="space-y-3 md:hidden">
        {loading && (
          <p className="rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            Cargando registros...
          </p>
        )}
        {empty && (
          <p className="rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            No hay registros.
          </p>
        )}
        {!loading &&
          visibleRows.map((r) => {
            const name = [r.citizen.name].filter(Boolean).join(' ') || 'Sin nombre';
            return (
              <article key={r.id} className="space-y-3 rounded-2xl border bg-card p-4">
                <div className="min-w-0">
                  <p className="wrap-break-word font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.citizen.phone ?? 'Sin teléfono'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{REG_LABEL[r.registrationStatus]}</Badge>
                  <Badge variant="outline">
                    {ATT_LABEL[r.attendanceStatus] ?? r.attendanceStatus}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{r.sourceChannel}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Check-in: {checkedInLabel(r.checkedInAt)}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild variant="ghost" size="sm" className="w-full sm:w-auto">
                    <Link href={`/admin/ciudadanos/${r.citizenId}`}>Perfil</Link>
                  </Button>
                  {canConfirm(r) && onConfirm && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => onConfirm(r.id)}
                      className="w-full sm:w-auto"
                    >
                      Confirmar
                    </Button>
                  )}
                  {canCheckInRow(r) && onCheckIn && (
                    <Button
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => onCheckIn(r.id)}
                      className="w-full sm:w-auto"
                    >
                      Check-in
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border bg-card md:mt-0">
        <div className="hidden max-h-96 overflow-y-auto md:block">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                  Ciudadano
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                  Registro
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                  Asistencia
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                  Check-in
                </th>
                <th className="px-4 py-3 text-right text-xs uppercase text-muted-foreground">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {empty && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No hay registros.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando registros...
                  </td>
                </tr>
              )}
              {!loading &&
                visibleRows.map((r) => {
                  const name = [r.citizen.name].filter(Boolean).join(' ') || 'Sin nombre';
                  return (
                    <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium">{name}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.citizen.phone ?? 'Sin teléfono'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{REG_LABEL[r.registrationStatus]}</Badge>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {r.sourceChannel}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">
                          {ATT_LABEL[r.attendanceStatus] ?? r.attendanceStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {checkedInLabel(r.checkedInAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/admin/ciudadanos/${r.citizenId}`}>Perfil</Link>
                          </Button>
                          {canConfirm(r) && onConfirm && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionLoading}
                              onClick={() => onConfirm(r.id)}
                            >
                              Confirmar
                            </Button>
                          )}
                          {canCheckInRow(r) && onCheckIn && (
                            <Button
                              size="sm"
                              disabled={actionLoading}
                              onClick={() => onCheckIn(r.id)}
                            >
                              Check-in
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {pager}
      </div>
    </div>
  );
}
