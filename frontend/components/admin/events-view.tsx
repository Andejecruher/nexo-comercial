'use client';

import { CreateEventModal } from '@/components/admin/create-event-modal';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PaginationControls } from '@/components/domain/catalogs/PaginationControls';
import {
  EventsCalendarSection,
  EventsCalendarToolbar,
  type CalendarViewMode,
} from '@/components/domain/events/EventsCalendarSection';
import { EventsTable } from '@/components/domain/events/EventsTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEvents } from '@/hooks/useEvents';
import { usePermissions } from '@/hooks/usePermissions';
import {
  eventsApi,
  type EventRecord,
  type EventStatus,
  type EventType,
  type EventVisibility,
} from '@/lib/events-api';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const CALENDAR_FETCH_LIMIT = 100;

const STATUS_OPTIONS: { value: EventStatus; label: string }[] = [
  { value: 'draft', label: 'Borrador' },
  { value: 'published', label: 'Publicado' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
];

const TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'townhall', label: 'Asamblea' },
  { value: 'community', label: 'Comunitario' },
  { value: 'volunteer', label: 'Voluntariado' },
  { value: 'campaign', label: 'Brigada social' },
  { value: 'rally', label: 'Encuentro comunitario' },
];

const VISIBILITY_OPTIONS: { value: EventVisibility; label: string }[] = [
  { value: 'public', label: 'Públicos' },
  { value: 'private', label: 'Privados' },
];

export function EventsView() {
  const ev = useEvents();
  const { can } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [calViewMode, setCalViewMode] = useState<CalendarViewMode>('calendar');
  const [listMode, setListMode] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitialDate, setCreateInitialDate] = useState<Date | undefined>();
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);

  const [calendarEvents, setCalendarEvents] = useState<EventRecord[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);

  const refetchCalendar = useCallback(async () => {
    setCalendarLoading(true);
    const result = await eventsApi.list({
      limit: CALENDAR_FETCH_LIMIT,
      search: ev.filters.search.trim() || undefined,
      status: ev.filters.status,
      eventType: ev.filters.eventType,
      visibility: ev.filters.visibility,
    });
    if (result.ok) {
      setCalendarEvents(result.data.events);
    }
    setCalendarLoading(false);
  }, [ev.filters.search, ev.filters.status, ev.filters.eventType, ev.filters.visibility]);

  useEffect(() => {
    void refetchCalendar();
  }, [refetchCalendar]);

  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    setEditingEvent(null);
    setCreateInitialDate(undefined);
    setCreateOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete('create');
    router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ''}`);
  }, [pathname, router, searchParams]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([ev.refresh(), refetchCalendar()]);
  }, [ev, refetchCalendar]);

  const openCreate = useCallback((day?: Date) => {
    setEditingEvent(null);
    setCreateInitialDate(day);
    setCreateOpen(true);
  }, []);

  const openEdit = useCallback((event: EventRecord) => {
    setCreateInitialDate(undefined);
    setEditingEvent(event);
    setCreateOpen(true);
  }, []);

  const handleModalOpenChange = useCallback((open: boolean) => {
    setCreateOpen(open);
    if (!open) setEditingEvent(null);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 p-6 pb-0 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-foreground">Jornadas de atención</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Calendario territorial y gestión de brigadas de servicio social.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={ev.loading || calendarLoading}
            >
              <RefreshCw
                className={`size-4 ${ev.loading || calendarLoading ? 'animate-spin' : ''}`}
              />
            </Button>
            <PermissionGate permission="eventos.create">
              <Button onClick={() => openCreate()}>
                <Plus className="size-4 mr-2" />
                Nueva jornada
              </Button>
            </PermissionGate>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-5">
          <div className="lg:col-span-2 relative">
            <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Buscar por título, slug o lugar..."
              value={ev.filters.search}
              onChange={(e) => ev.setSearch(e.target.value)}
            />
          </div>
          <Select
            value={ev.filters.status ?? 'all'}
            onValueChange={(v) => ev.setStatusFilter(v === 'all' ? undefined : (v as EventStatus))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={ev.filters.eventType ?? 'all'}
            onValueChange={(v) => ev.setEventTypeFilter(v === 'all' ? undefined : (v as EventType))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={ev.filters.visibility ?? 'all'}
            onValueChange={(v) =>
              ev.setVisibilityFilter(v === 'all' ? undefined : (v as EventVisibility))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Visibilidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos (públicos y privados)</SelectItem>
              {VISIBILITY_OPTIONS.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <EventsCalendarToolbar
        currentMonth={currentMonth}
        onMonthChange={setCurrentMonth}
        viewMode={calViewMode}
        onViewModeChange={setCalViewMode}
        listMode={listMode}
        onListModeChange={setListMode}
      />

      {!listMode ? (
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <EventsCalendarSection
            events={calendarEvents}
            loading={calendarLoading}
            mode={calViewMode}
            currentMonth={currentMonth}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            onCreateDay={openCreate}
            onEditEvent={can('eventos.update') ? openEdit : undefined}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 pt-4">
            <EventsTable events={ev.events} loading={ev.loading} />
          </div>
          <PaginationControls
            currentPage={ev.currentPage}
            hasNextPage={ev.hasNextPage}
            hasPreviousPage={ev.hasPreviousPage}
            totalCount={ev.totalCount}
            loading={ev.loading}
            onNext={ev.nextPage}
            onPrevious={ev.previousPage}
            onFirst={ev.firstPage}
          />
        </div>
      )}

      <CreateEventModal
        open={createOpen}
        onOpenChange={handleModalOpenChange}
        initialDate={editingEvent ? undefined : createInitialDate}
        eventData={editingEvent ?? undefined}
        onSubmit={async (payload) => {
          if (editingEvent) {
            const result = await ev.updateEvent(editingEvent.id, payload);
            if (result.ok) {
              await handleRefresh();
              setSelectedEvent(result.event);
              return { ok: true };
            }
            return { ok: false };
          }
          const result = await ev.createEvent(payload);
          if (result.ok) {
            await handleRefresh();
            return { ok: true };
          }
          return { ok: false };
        }}
      />
    </div>
  );
}
