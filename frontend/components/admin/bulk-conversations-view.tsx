'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, CheckCheck, Loader2, MessageSquare, Search, Ticket } from 'lucide-react';
import { departmentsApi, type Department } from '@/lib/catalog-api';
import { apiClient } from '@/lib/api-client';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Conversation = {
  id: string;
  citizen: { name: string | null; phone: string };
  inboxStatus: 'active' | 'inactive';
  botEnabled: boolean;
  attendanceMode: 'bot' | 'human';
  activeTicketId: string | null;
  lastMessagePreview: string | null;
};
type Page = { items: Conversation[]; meta: { nextCursor?: string; hasNextPage: boolean } };
type Job = {
  job_id: string;
  done: boolean;
  items: { conversationId: string; status: string; error: string | null }[];
};
type Action = 'activate_bot' | 'deactivate_bot' | 'close_tickets' | 'send_message';

export function BulkConversationsView() {
  const { can } = usePermissions();
  const canView = can('mensajes_masivos.view') && can('conversaciones.view');
  const canAct = can('mensajes_masivos.create') && can('conversaciones.update');
  const [page, setPage] = useState<Page>({ items: [], meta: { hasNextPage: false } });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Record<string, Conversation>>({});
  const [message, setMessage] = useState('');
  const [department, setDepartment] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentError, setDepartmentError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [pollError, setPollError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const sending = useRef(false);
  const request = useRef<{ signature: string; key: string } | null>(null);
  const cursor = cursors[cursors.length - 1];
  const busy = submitting || Boolean(job && !job.done);
  const rows = Object.values(selected);
  const bots = rows.filter((row) => row.botEnabled && row.attendanceMode === 'bot').length;
  const tickets = rows.filter((row) => row.activeTicketId).length;
  const inactive = rows.filter((row) => row.inboxStatus === 'inactive').length;
  const all = page.items.length > 0 && page.items.every((row) => selected[row.id]);
  const some = page.items.some((row) => selected[row.id]);
  const disabled = busy || !canAct || !rows.length;

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    void (async () => {
      const options: Department[] = [];
      let next: string | undefined;
      do {
        const result = await departmentsApi.list({ isActive: true, limit: 100, cursor: next });
        if (cancelled) return;
        if (!result.ok) {
          setDepartmentError(
            'No se pudieron cargar los departamentos. Verifica tu permiso de lectura de departamentos.',
          );
          return;
        }
        options.push(...result.data.departments);
        next = result.data.meta.hasNextPage ? result.data.meta.nextCursor : undefined;
      } while (next);
      setDepartments(options);
    })();
    return () => {
      cancelled = true;
    };
  }, [canView]);

  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setCursors([undefined]);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      limit: '25',
      ...(query ? { search: query } : {}),
      ...(status ? { status } : {}),
      ...(cursor ? { cursor } : {}),
    });
    void apiClient.get<Page>(`/conversations?${params}`).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.message);
        setPage({ items: [], meta: { hasNextPage: false } });
        return;
      }
      setPage(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [canView, query, status, cursor, refresh]);

  const jobId = job?.job_id;
  const jobDone = job?.done;
  useEffect(() => {
    if (!jobId || jobDone) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const result = await apiClient.get<Job>(`/conversations/bulk-action/${jobId}`);
      if (cancelled) return;
      if (result.ok) {
        setJob(result.data);
        setPollError('');
        if (result.data.done) {
          setSelected({});
          setRefresh((value) => value + 1);
          return;
        }
      } else setPollError('No se pudo consultar el progreso. Se reintentará automáticamente.');
      timer = setTimeout(() => {
        void poll();
      }, 2000);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, jobDone]);

  function toggle(row: Conversation, checked: boolean) {
    setSelected((previous) => {
      const next = { ...previous };
      if (checked && Object.keys(next).length < 500) next[row.id] = row;
      else if (!checked) delete next[row.id];
      return next;
    });
  }

  async function submit(action: Action) {
    if (sending.current || disabled) return;
    const payload = {
      conversation_ids: rows.map((row) => row.id).sort(),
      action,
      ...(action === 'send_message' ? { message: message.trim() } : {}),
      ...(action === 'deactivate_bot'
        ? { target: { type: 'department', departmentSlug: department.trim() } }
        : {}),
    };
    const signature = JSON.stringify(payload);
    if (request.current?.signature !== signature)
      request.current = { signature, key: crypto.randomUUID() };
    sending.current = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await apiClient.post<{ job_id: string }>(
        '/conversations/bulk-action',
        payload,
        { headers: { 'Idempotency-Key': request.current.key } },
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setJob({ job_id: result.data.job_id, done: false, items: [] });
      request.current = null;
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  }

  if (!canView)
    return (
      <div className="p-8">Necesitas permisos de mensajes masivos y lectura de conversaciones.</div>
    );

  return (
    <div className="h-full overflow-auto bg-muted/20 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            Gestión Masiva de Conversaciones
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Selecciona conversaciones y administra bots, folios y mensajes desde un solo lugar.
          </p>
        </header>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm"
          >
            {error}
          </div>
        )}
        {job && (
          <div role="status" className="rounded-lg border bg-background p-4 text-sm space-y-2">
            <p className="font-medium">
              {job.done
                ? 'Procesamiento finalizado'
                : 'Solicitud aceptada · Procesando en segundo plano'}
            </p>
            <p>
              {job.items.filter((item) => item.status === 'succeeded').length} completadas ·{' '}
              {job.items.filter((item) => item.status === 'failed').length} fallidas ·{' '}
              {job.items.filter((item) => item.status === 'uncertain').length} por verificar
            </p>
            <p className="text-muted-foreground">
              Los mensajes completados se han entregado a la cola de envío; la entrega al
              destinatario se confirma en cada conversación.
            </p>
            {pollError && <p role="alert">{pollError}</p>}
            {job.items.some((item) => item.error) && (
              <details>
                <summary className="cursor-pointer">Ver incidencias</summary>
                <ul className="mt-2 space-y-1">
                  {job.items
                    .filter((item) => item.error)
                    .map((item) => (
                      <li key={item.conversationId}>
                        {item.conversationId}: {item.error}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </div>
        )}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
          <Card>
            <CardHeader className="space-y-4">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="size-5" /> Conversaciones
              </CardTitle>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                  <Input
                    aria-label="Buscar por teléfono o nombre"
                    className="pl-9"
                    placeholder="Buscar por teléfono o nombre"
                    maxLength={255}
                    value={search}
                    disabled={busy}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setSelected({});
                    }}
                  />
                </div>
                <select
                  aria-label="Estado de conversación"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={status}
                  disabled={busy}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setCursors([undefined]);
                    setSelected({});
                  }}
                >
                  <option value="">Todos los estados</option>
                  <option value="active">Activas</option>
                  <option value="inactive">Inactivas</option>
                </select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-3 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox
                    disabled={busy || loading || !page.items.length}
                    checked={all ? true : some ? 'indeterminate' : false}
                    onCheckedChange={(checked) => {
                      setSelected((previous) => {
                        const next = { ...previous };
                        for (const row of page.items) {
                          if (checked === true && Object.keys(next).length < 500)
                            next[row.id] = row;
                          else if (checked !== true) delete next[row.id];
                        }
                        return next;
                      });
                    }}
                  />
                  Seleccionar todo (esta página)
                </label>
                <span>{rows.length} / 500 seleccionadas</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div role="status" className="flex justify-center gap-2 py-12">
                  <Loader2 className="size-5 animate-spin" /> Cargando conversaciones…
                </div>
              ) : !page.items.length ? (
                <p className="py-12 text-center text-muted-foreground">
                  No se encontraron conversaciones.
                </p>
              ) : (
                <div className="divide-y">
                  {page.items.map((row) => (
                    <label key={row.id} className="flex cursor-pointer items-start gap-3 py-4">
                      <Checkbox
                        className="mt-1"
                        aria-label={`Seleccionar ${row.citizen.name || row.citizen.phone}`}
                        checked={Boolean(selected[row.id])}
                        disabled={busy || (!selected[row.id] && rows.length >= 500)}
                        onCheckedChange={(checked) => toggle(row, checked === true)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{row.citizen.name || 'Sin nombre'}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${row.inboxStatus === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}
                          >
                            {row.inboxStatus === 'active' ? 'Activa' : 'Inactiva'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{row.citizen.phone}</p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {row.lastMessagePreview || 'Sin mensajes'}
                        </p>
                        <p className="mt-2 text-xs">
                          Bot{' '}
                          {row.botEnabled && row.attendanceMode === 'bot' ? 'activo' : 'inactivo'} ·{' '}
                          {row.activeTicketId ? 'Folio abierto' : 'Sin folio abierto'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between border-t pt-4">
                <Button
                  variant="outline"
                  disabled={loading || busy || cursors.length === 1}
                  onClick={() => setCursors((previous) => previous.slice(0, -1))}
                >
                  Anterior
                </Button>
                <span className="text-sm">Página {cursors.length}</span>
                <Button
                  variant="outline"
                  disabled={loading || busy || !page.meta.hasNextPage}
                  onClick={() => setCursors((previous) => [...previous, page.meta.nextCursor])}
                >
                  Siguiente
                </Button>
              </div>
              {rows.length > 0 && (
                <Button variant="ghost" disabled={busy} onClick={() => setSelected({})}>
                  Limpiar selección de todas las páginas
                </Button>
              )}
            </CardContent>
          </Card>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Las acciones se aplicarán a {rows.length} conversaciones seleccionadas.
            </p>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="size-5" />
                  Gestión de Bot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <strong className="text-2xl">{bots}</strong>
                    <p className="text-sm text-muted-foreground">Bots activos</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <strong className="text-2xl">{rows.length - bots}</strong>
                    <p className="text-sm text-muted-foreground">Bots inactivos</p>
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={disabled || bots === rows.length}
                  onClick={() => void submit('activate_bot')}
                >
                  Activar bots
                </Button>
                <label className="block text-sm space-y-2">
                  <span>Departamento de destino al desactivar</span>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2"
                    value={department}
                    disabled={busy}
                    onChange={(event) => setDepartment(event.target.value)}
                  >
                    <option value="">Selecciona un departamento</option>
                    {departments.map((option) => (
                      <option key={option.id} value={option.slug}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  {departmentError && (
                    <span role="alert" className="text-destructive">
                      {departmentError}
                    </span>
                  )}
                </label>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={disabled || !bots || !department.trim()}
                  onClick={() => void submit('deactivate_bot')}
                >
                  Desactivar y transferir
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ticket className="size-5" />
                  Gestión de Folios
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  <strong className="text-2xl">{tickets}</strong>{' '}
                  <span className="text-sm text-muted-foreground">folios abiertos</span>
                </p>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={disabled || !tickets}
                  onClick={() => void submit('close_tickets')}
                >
                  <CheckCheck className="mr-2 size-4" />
                  Cerrar folios seleccionados
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="size-5" />
                  Mensaje Masivo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label htmlFor="bulk-message" className="text-sm">
                  Mensaje para las conversaciones seleccionadas
                </label>
                <Textarea
                  id="bulk-message"
                  placeholder="Escribe tu mensaje…"
                  rows={5}
                  maxLength={1000}
                  value={message}
                  disabled={disabled}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <p className="text-right text-xs text-muted-foreground">
                  {message.length} / 1000 caracteres
                </p>
                {inactive > 0 && (
                  <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                    Hay {inactive} conversaciones inactivas. Retíralas de la selección para enviar
                    el mensaje.
                  </p>
                )}
                <Button
                  className="w-full"
                  disabled={disabled || !message.trim() || inactive > 0}
                  onClick={() => void submit('send_message')}
                >
                  {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}Enviar mensaje a{' '}
                  {rows.length} conversaciones
                </Button>
              </CardContent>
            </Card>
            {!canAct && (
              <p className="text-sm text-muted-foreground">
                Necesitas permisos de creación de mensajes masivos y edición de conversaciones para
                ejecutar acciones.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
