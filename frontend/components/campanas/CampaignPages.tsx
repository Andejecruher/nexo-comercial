'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, Megaphone, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableAction } from '@/components/ui/table-action';
import { TableEmptyState, TableSkeleton } from '@/components/ui/table-states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PaginationControls } from '@/components/shared/catalogs/PaginationControls';
import { usePermissions } from '@/hooks/shared/usePermissions';
import { cn } from '@/lib/shared/utils';
import {
  campaignsApi,
  campaignStatus,
  type Campaign,
  type CampaignDetail,
} from '@/lib/shared/campaigns-api';
const label = (status: string) => campaignStatus[status] ?? status;
const successfulStatuses = new Set([
  'completed',
  'sent',
  'delivered',
  'read',
  'accepted',
  'finished',
]);
const failedStatuses = new Set(['failed']);
const warningStatuses = new Set(['needs_review', 'uncertain']);

function CampaignStatusBadge({ status }: { status: string }) {
  const successful = successfulStatuses.has(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
        successful && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        failedStatuses.has(status) && 'border-red-200 bg-red-50 text-red-700',
        warningStatuses.has(status) && 'border-amber-200 bg-amber-50 text-amber-700',
        !successful &&
          !failedStatuses.has(status) &&
          !warningStatuses.has(status) &&
          'border-slate-200 bg-slate-100 text-slate-600',
      )}
    >
      {successful && <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />}
      {label(status)}
    </span>
  );
}
export function CampaignList() {
  const { can } = usePermissions();
  const [data, setData] = useState<{ rows: Campaign[]; total: number; pageSize: number }>();
  const [page, setPage] = useState(1),
    [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const load = async () => {
      try {
        const result = await campaignsApi.list(page);
        if (active) {
          setData(result);
          setError('');
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [page, refresh]);
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Campañas</h1>
          <p className="text-muted-foreground">Historial y seguimiento de mensajes de WhatsApp</p>
        </div>
        <RefreshResults loading={loading} onClick={() => setRefresh((n) => n + 1)} />
        {can('campanas_whatsapp.create') && can('plantillas.view') && (
          <Button asChild>
            <Link href="/admin/campanas/nueva">Nueva campaña</Link>
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}

      {!data && !error && (
        <TableSkeleton headers={['Nombre', 'Estado', 'Mensajes', 'Creación', 'Resultados']} />
      )}
      {data?.rows.length === 0 ? (
        <TableEmptyState
          icon={Megaphone}
          title="Aún no hay campañas"
          description="Crea la primera para comenzar."
        />
      ) : data ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                {['Nombre', 'Estado', 'Mensajes', 'Creación', 'Resultados'].map((h) => (
                  <TableHead key={h} className={h === 'Resultados' ? 'text-right' : undefined}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <CampaignStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell>{c.total}</TableCell>
                  <TableCell>{new Date(c.createdAt).toLocaleString('es-MX')}</TableCell>
                  <TableCell className="text-right">
                    <TableAction asChild label={`Ver resultados de ${c.name}`}>
                      <Link href={`/admin/campanas/${c.id}`}>
                        <Eye className="size-4" />
                      </Link>
                    </TableAction>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <PaginationControls
        currentPage={page}
        hasPreviousPage={page > 1}
        hasNextPage={Boolean(data && page * data.pageSize < data.total)}
        totalCount={data?.total ?? 0}
        loading={loading}
        onFirst={() => setPage(1)}
        onPrevious={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
        totalPages={data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1}
      />
    </div>
  );
}
export function CampaignAnalytics({ id }: { id: string }) {
  const [data, setData] = useState<CampaignDetail>(),
    [error, setError] = useState(''),
    [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const load = async () => {
      try {
        const result = await campaignsApi.detail(id, page);
        if (active) {
          setData(result);
          setError('');
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [id, page, refresh]);
  return (
    <div className="space-y-6 p-6">
      <Link className="text-sm underline" href="/admin/campanas">
        Volver a campañas
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{data?.name ?? 'Resultados de la campaña'}</h1>
        <RefreshResults loading={loading} onClick={() => setRefresh((n) => n + 1)} />
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {!data && !error && (
        <TableSkeleton headers={['Teléfono', 'Estado del mensaje', 'Procesamiento', 'Error']} />
      )}

      {data && (
        <>
          <p>{label(data.status)} · Actualización manual</p>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Total', data.total],
              ['Pendientes', data.counts.pending],
              ['Enviados', data.sentTotal],
              ['Entregados', data.deliveredTotal],
              ['Leídos', data.counts.read],
              ['Fallidos', data.counts.failed],
            ].map(([title, count]) => (
              <div className="rounded-xl border bg-card p-4" key={title}>
                <p className="text-sm text-muted-foreground">{title}</p>
                <p className="mt-2 text-3xl font-semibold">{count}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Entregados incluye leídos; enviados incluye entregados y leídos. Un mensaje aceptado por
            Meta permanece pendiente hasta recibir una confirmación.
          </p>
          {data.uncertain > 0 && (
            <p role="status" className="rounded-md border p-4">
              {data.uncertain} envíos requieren revisión porque su resultado es incierto. Se
              actualizarán si llega la confirmación de Meta.
            </p>
          )}
          {data.recipients.length === 0 ? (
            <TableEmptyState icon={Users} title="No hay destinatarios para mostrar" />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    {['Teléfono', 'Estado del mensaje', 'Procesamiento', 'Error'].map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recipients.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>+{r.phone}</TableCell>
                      <TableCell>
                        <CampaignStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>
                        <CampaignStatusBadge status={r.dispatchState} />
                      </TableCell>
                      <TableCell>{r.errorCode ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <PaginationControls
            currentPage={page}
            hasPreviousPage={page > 1}
            hasNextPage={page * data.pageSize < data.total}
            totalCount={data.total}
            loading={loading}
            onFirst={() => setPage(1)}
            onPrevious={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
            totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))}
          />
        </>
      )}
    </div>
  );
}

function RefreshResults({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" disabled={loading} onClick={onClick} aria-busy={loading}>
      <RefreshCw aria-hidden="true" className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`} />
      Actualizar Resultados
    </Button>
  );
}
