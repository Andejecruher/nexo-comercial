'use client';

/**
 * TicketTable — Tabla CRM de tickets con columnas estándar.
 *
 * Columnas: id, ciudadano, estado, prioridad, departamento, asignado, fecha.
 * Filas clickeables navegan al detalle.
 */

import { TicketPriorityBadge } from '@/components/shared/tickets/TicketPriorityBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableAction } from '@/components/ui/table-action';
import { TableEmptyState, TableSkeleton } from '@/components/ui/table-states';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PanelUserDto } from '@/lib/shared/admin-users-api';
import type { TicketDto } from '@/lib/shared/tickets-api';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronRight, Ticket } from 'lucide-react';
import Link from 'next/link';
import { memo } from 'react';

interface TicketTableProps {
  tickets: TicketDto[];
  loading: boolean;
  error: string | undefined;
  /** Mapa de userId → usuario para mostrar nombre del agente */
  agentsMap?: Map<string, PanelUserDto>;
  /** Oculta la columna Ciudadano cuando la tabla ya está acotada a un ciudadano. */
  hideCitizenColumn?: boolean;
  /** Mensaje del empty state, para contextos sin filtros. */
  emptyMessage?: string;
  /**
   * Controles de paginación. Los renderiza el padre: la tabla lista datos, no
   * sabe paginar. Así desktop (paginación numerada) y mobile (cargar más)
   * comparten el mismo componente.
   */
  footer?: React.ReactNode;
  onRetry: () => void;
}

function AgentCell({
  userId,
  agentsMap,
}: {
  userId: string | undefined;
  agentsMap?: Map<string, PanelUserDto>;
}) {
  if (!userId) return <span className="text-muted-foreground text-xs">Sin asignar</span>;
  const agent = agentsMap?.get(userId);
  if (!agent)
    return <span className="text-xs font-mono text-muted-foreground">{userId.slice(0, 8)}…</span>;
  return <span className="text-xs">{agent.fullName ?? agent.email}</span>;
}

function TicketLifecycleBadge({ status }: { status: TicketDto['status'] }) {
  const open = status === 'OPEN' || status === 'IN_PROGRESS';
  return (
    <Badge
      variant="outline"
      className={
        open
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-slate-200 bg-slate-100 text-slate-600'
      }
    >
      {open ? 'Abierto' : 'Cerrado'}
    </Badge>
  );
}

export const TicketTable = memo(function TicketTable({
  tickets,
  loading,
  error,
  agentsMap,
  hideCitizenColumn = false,
  emptyMessage = 'No hay tickets que coincidan con los filtros.',
  footer,
  onRetry,
}: TicketTableProps) {
  const headers = [
    'Folio',
    ...(hideCitizenColumn ? [] : ['Ciudadano']),
    'Estado',
    'Prioridad',
    'Depto.',
    'Asignado',
    'Conversación',
    'Fecha',
  ];

  if (loading && tickets.length === 0) {
    return (
      <>
        <div role="status" aria-label="Cargando tickets" className="space-y-3 lg:hidden">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-3 rounded-xl border bg-card p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
        <div className="hidden lg:block">
          <TableSkeleton headers={[...headers, 'Acciones']} rows={8} />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center space-y-3">
        <p className="text-destructive text-sm">{error}</p>
        <Button variant="outline" size="sm" className="min-h-11 cursor-pointer" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!loading && tickets.length === 0) {
    return <TableEmptyState icon={Ticket} title={emptyMessage} />;
  }

  return (
    <div className="min-w-0 space-y-3 lg:space-y-0 lg:overflow-hidden lg:rounded-xl lg:border lg:border-slate-200 lg:bg-card lg:shadow-sm">
      <ul aria-label="Tickets" className="space-y-3 lg:hidden">
        {tickets.map((ticket) => (
          <li key={ticket.id} className="min-w-0">
            <Link
              href={`/admin/tickets/${ticket.id}`}
              className="block min-w-0 cursor-pointer space-y-3 rounded-xl border border-slate-200 bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring wrap-anywhere"
              aria-label={`Ver ticket ${ticket.folio}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 font-mono text-xs text-muted-foreground">
                  {ticket.folio}
                </span>
                <ChevronRight
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              {!hideCitizenColumn && (
                <div>
                  <p className="text-base font-semibold text-foreground">{ticket.citizenName}</p>
                  <p className="text-sm text-muted-foreground">{ticket.citizenPhone}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <TicketLifecycleBadge status={ticket.status} />
                <TicketPriorityBadge priority={ticket.priority} />
              </div>
              <dl className="grid min-w-0 grid-cols-1 gap-3 text-sm min-[360px]:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Departamento</dt>
                  <dd>{ticket.departmentSlug || 'Sin departamento'}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Agente asignado</dt>
                  <dd>
                    <AgentCell userId={ticket.assignedUserId} agentsMap={agentsMap} />
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Creado</dt>
                  <dd>
                    <time
                      dateTime={ticket.createdAt}
                      title={new Date(ticket.createdAt).toLocaleString('es-MX')}
                    >
                      {formatDistanceToNow(new Date(ticket.createdAt), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </time>
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-27.5">Folio</TableHead>
              {!hideCitizenColumn && <TableHead>Ciudadano</TableHead>}
              <TableHead className="w-30">Estado</TableHead>
              <TableHead className="w-27.5">Prioridad</TableHead>
              <TableHead className="w-35">Depto.</TableHead>
              <TableHead className="w-40">Asignado</TableHead>
              <TableHead className="w-32.5">Fecha</TableHead>
              <TableHead className="w-20 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow key={ticket.id} className="group cursor-pointer">
                <TableCell>
                  <Link
                    href={`/admin/tickets/${ticket.id}`}
                    className="block cursor-pointer font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors"
                    aria-label={`Ver ticket ${ticket.folio}`}
                  >
                    {ticket.folio}
                  </Link>
                </TableCell>
                {!hideCitizenColumn && (
                  <TableCell>
                    <Link href={`/admin/tickets/${ticket.id}`} className="block cursor-pointer">
                      <p className="text-sm font-medium text-foreground leading-tight">
                        {ticket.citizenName}
                      </p>
                      <p className="text-xs text-muted-foreground">{ticket.citizenPhone}</p>
                    </Link>
                  </TableCell>
                )}
                <TableCell>
                  <Link href={`/admin/tickets/${ticket.id}`} className="block cursor-pointer">
                    <TicketLifecycleBadge status={ticket.status} />
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/admin/tickets/${ticket.id}`} className="block cursor-pointer">
                    <TicketPriorityBadge priority={ticket.priority} />
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/admin/tickets/${ticket.id}`} className="block cursor-pointer">
                    {ticket.departmentSlug ? (
                      <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md">
                        {ticket.departmentSlug}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/admin/tickets/${ticket.id}`} className="block cursor-pointer">
                    <AgentCell userId={ticket.assignedUserId} agentsMap={agentsMap} />
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/admin/tickets/${ticket.id}`} className="block cursor-pointer">
                    <span
                      className="text-xs text-muted-foreground"
                      title={new Date(ticket.createdAt).toLocaleString()}
                    >
                      {formatDistanceToNow(new Date(ticket.createdAt), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-right">
                  <TableAction
                    asChild
                    touch
                    className="cursor-pointer"
                    label={`Ver ticket ${ticket.folio}`}
                  >
                    <Link href={`/admin/tickets/${ticket.id}`}>
                      <ChevronRight className="size-4" />
                    </Link>
                  </TableAction>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {footer}
    </div>
  );
});
