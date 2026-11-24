'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Plus, Phone, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/table-states';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/shared/usePermissions';
import { useTemplateUpdates } from '@/hooks/plantillas/useTemplateUpdates';
import {
  templatesApi,
  type MessageTemplate,
  type TemplateLine,
  type TemplateStatusUpdate,
} from '@/lib/shared/templates-api';
import { TemplateTable, type TemplateAction } from '@/components/plantillas/TemplateTable';
import { TemplateForm } from '@/components/plantillas/TemplateForm';

export function applyTemplateStatus(
  rows: MessageTemplate[],
  event: TemplateStatusUpdate,
): MessageTemplate[] {
  const index = rows.findIndex((row) => row.id === event.message_template_id);
  if (index < 0 || rows[index].status === event.event) return rows;
  const next = rows.slice();
  next[index] = { ...rows[index], status: event.event };
  return next;
}
type Snapshot = { lineId: string; wabaId: string; cursor: string; rows: MessageTemplate[] };
export function TemplatesPage() {
  const { can } = usePermissions();
  const [lines, setLines] = useState<TemplateLine[]>([]);
  const [lineId, setLineId] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<{ template?: MessageTemplate; readOnly?: boolean }>();
  const [deleting, setDeleting] = useState<MessageTemplate>();
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<{
    name: string;
    loading: boolean;
    error?: string;
    points?: { start: number; sent?: number; delivered?: number; read?: number }[];
  }>();
  const times = useRef(new Map<string, number>());
  const statsRequest = useRef(0);
  useEffect(() => {
    let cancelled = false;
    templatesApi
      .lines()
      .then((data) => {
        if (!cancelled) {
          setLines(data);
          setLineId(data[0]?.id ?? '');
          if (!data.length) setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e.message));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!lineId) return;
    const abort = new AbortController();
    setLoading(true);
    setError('');
    setSnapshot(undefined);
    times.current.clear();
    void (async () => {
      try {
        let after: string | undefined;
        let cursor: string | undefined;
        const rows: MessageTemplate[] = [];
        do {
          const page = await templatesApi.list(lineId, after, abort.signal);
          if (abort.signal.aborted) return;
          cursor ??= page.cursor;
          rows.push(...page.data);
          after = page.nextCursor;
        } while (after);
        setSnapshot({
          lineId,
          wabaId: lines.find((l) => l.id === lineId)!.wabaId,
          cursor: cursor ?? '0',
          rows: [...new Map(rows.map((row) => [row.id, row])).values()],
        });
      } catch (e) {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : 'No se pudo cargar la lista');
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, [lineId, lines, revision]);
  const onUpdate = useCallback((event: TemplateStatusUpdate) => {
    setSnapshot((previous) => {
      if (!previous || previous.wabaId !== event.waba_id) return previous;
      const key = `${event.waba_id}:${event.message_template_id}`;
      const time = Date.parse(event.occurred_at);
      if (time < (times.current.get(key) ?? 0)) return previous;
      times.current.set(key, time);
      const rows = applyTemplateStatus(previous.rows, event);
      return rows === previous.rows ? previous : { ...previous, rows };
    });
  }, []);
  const connection = useTemplateUpdates(
    snapshot?.lineId === lineId ? lineId : undefined,
    snapshot?.cursor,
    onUpdate,
  );
  const onAction = useCallback(
    (action: TemplateAction, template: MessageTemplate) => {
      if (action === 'view' || action === 'edit') {
        setEditor({ template, readOnly: action === 'view' });
        return;
      }
      if (action === 'delete') {
        setDeleting(template);
        return;
      }
      const request = ++statsRequest.current;
      setStats({ name: template.name, loading: true });
      templatesApi
        .analytics(lineId, template.id)
        .then((result) => {
          if (request === statsRequest.current)
            setStats({
              name: template.name,
              loading: false,
              points: result.data?.flatMap((d) => d.data_points ?? []) ?? [],
            });
        })
        .catch((e) => {
          if (request === statsRequest.current)
            setStats({ name: template.name, loading: false, error: e.message });
        });
    },
    [lineId],
  );
  const save = (selectedLine: string) => {
    setEditor(undefined);
    setLineId(selectedLine);
    setRevision((r) => r + 1);
    setNotice('Plantilla enviada a Meta. Su estado se actualizará automáticamente.');
  };
  if (editor)
    return (
      <TemplateForm
        key={editor.template?.id ?? 'new'}
        lines={lines}
        initialLineId={lineId}
        template={editor.template}
        readOnly={editor.readOnly}
        onBack={() => setEditor(undefined)}
        onSaved={save}
      />
    );
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plantillas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administra los mensajes de WhatsApp de Nexo Comercial.
          </p>
        </div>
        {/* Filtros y acciones: en móvil se apilan al 100%; en escritorio van en una fila. */}
        <div className="flex flex-col gap-3 border-b pb-5 md:flex-row md:flex-wrap md:items-center md:gap-4">
          <label className="flex w-full items-center gap-3 rounded-md border bg-background px-3 py-2 md:w-auto md:min-w-64">
            <span className="shrink-0 rounded-full bg-primary/10 p-2 text-primary">
              <Phone className="size-4" />
            </span>
            <span className="sr-only">Línea de WhatsApp</span>
            <select
              aria-label="Línea de WhatsApp"
              className="min-w-0 flex-1 bg-background text-sm"
              value={lineId}
              disabled={loading || busy || !lines.length}
              onChange={(e) => {
                setLineId(e.target.value);
                setSearch('');
                setNotice('');
              }}
            >
              {!lines.length && <option value="">Sin líneas configuradas</option>}
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name} · {line.phone || line.wabaId}
                </option>
              ))}
            </select>
          </label>
          <div className="relative w-full md:min-w-52 md:flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              aria-label="Buscar por nombre"
              placeholder="Buscar por nombre…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 md:w-auto">
            <Button
              variant="outline"
              className="shrink-0"
              aria-label="Actualizar lista"
              disabled={loading || !lineId}
              onClick={() => setRevision((r) => r + 1)}
            >
              <RefreshCw className="size-4" />
            </Button>
            {can('plantillas.create') && (
              <Button
                className="flex-1 md:flex-none"
                disabled={!lineId || loading}
                onClick={() => setEditor({})}
              >
                <Plus className="size-4" />
                Crear plantilla
              </Button>
            )}
          </div>
        </div>
        {notice && (
          <p
            role="status"
            className="rounded-md bg-accent-teal/15 p-3 text-sm text-accent-teal-dark"
          >
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <TableSkeleton
            headers={[
              'Nombre',
              'Idioma',
              'Categoría',
              'Estado',
              'Calidad',
              'Fecha de creación',
              'Última actualización',
              'Acciones',
            ]}
          />
        ) : !lines.length ? (
          <p className="rounded-md border p-8 text-center text-muted-foreground">
            Configura una línea activa con WABA ID en Canales e IA para administrar sus plantillas.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>{snapshot?.rows.length ?? 0} plantillas</span>
              <span role="status">
                {connection === 'live'
                  ? '● Estados en tiempo real'
                  : connection === 'unauthorized'
                    ? 'Sin acceso al flujo de estados'
                    : 'Reconectando estados…'}
              </span>
            </div>
            <TemplateTable
              templates={(snapshot?.lineId === lineId ? snapshot.rows : []).filter((t) =>
                t.name.toLowerCase().includes(search.toLowerCase()),
              )}
              onAction={onAction}
              canUpdate={can('plantillas.update')}
              canDelete={can('plantillas.delete')}
            />
            <p className="text-xs text-muted-foreground">
              Las plantillas pertenecen a la cuenta WABA; las líneas de una misma cuenta comparten
              la lista. Las fechas corresponden a operaciones registradas en Nexo Comercial; —
              indica que no hay fecha disponible.
            </p>
          </>
        )}
      </div>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar plantilla</DialogTitle>
            <DialogDescription>
              Se eliminará «{deleting?.name}» de Meta en todos sus idiomas y en todas las líneas de
              esta cuenta WABA.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setDeleting(undefined)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!deleting) return;
                setBusy(true);
                setError('');
                try {
                  await templatesApi.remove(lineId, deleting.name);
                  setSnapshot((previous) =>
                    previous
                      ? { ...previous, rows: previous.rows.filter((t) => t.name !== deleting.name) }
                      : previous,
                  );
                  setDeleting(undefined);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'No fue posible eliminar');
                  setDeleting(undefined);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!stats}
        onOpenChange={(open) => {
          if (!open) {
            statsRequest.current++;
            setStats(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estadísticas · últimos 7 días completos</DialogTitle>
            <DialogDescription>{stats?.name}</DialogDescription>
          </DialogHeader>
          {stats?.loading ? (
            <p role="status">Consultando Meta…</p>
          ) : stats?.error ? (
            <p role="alert">{stats.error}</p>
          ) : stats?.points?.length ? (
            <div className="grid grid-cols-3 gap-4">
              {(['sent', 'delivered', 'read'] as const).map((key, i) => (
                <div key={key} className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">
                    {['Enviados', 'Entregados', 'Leídos'][i]}
                  </p>
                  <strong className="text-xl">
                    {stats.points!.reduce((sum, point) => sum + (point[key] ?? 0), 0)}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <p>No hay métricas disponibles para este período.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
