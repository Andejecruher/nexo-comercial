'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { EventRecord, EventStatus, EventType } from '@/lib/events-api';
import { cn } from '@/lib/utils';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  isToday,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Lock,
  MapPin,
  Megaphone,
  Pencil,
  ShieldCheck,
  TreePine,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

const TYPE_CONFIG: Record<
  EventType,
  { label: string; color: string; bg: string; dot: string; icon: React.ReactNode }
> = {
  townhall: {
    label: 'Asamblea',
    color: 'text-white',
    bg: 'bg-primary',
    dot: 'bg-primary',
    icon: <Megaphone className="w-3 h-3" />,
  },
  community: {
    label: 'Comunitario',
    color: 'text-foreground',
    bg: 'bg-[#6B7280]',
    dot: 'bg-[#6B7280]',
    icon: <Users className="w-3 h-3" />,
  },
  volunteer: {
    label: 'Voluntariado',
    color: 'text-white',
    bg: 'bg-[#166534]',
    dot: 'bg-[#166534]',
    icon: <TreePine className="w-3 h-3" />,
  },
  campaign: {
    label: 'Campaña',
    color: 'text-white',
    bg: 'bg-[#1E40AF]',
    dot: 'bg-[#1E40AF]',
    icon: <ShieldCheck className="w-3 h-3" />,
  },
  rally: {
    label: 'Mitin',
    color: 'text-white',
    bg: 'bg-primary',
    dot: 'bg-primary',
    icon: <Megaphone className="w-3 h-3" />,
  },
};

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

export type CalendarViewMode = 'calendar' | 'agenda';

interface EventsCalendarSectionProps {
  events: EventRecord[];
  loading: boolean;
  mode: CalendarViewMode;
  currentMonth: Date;
  selectedEvent: EventRecord | null;
  onSelectEvent: (event: EventRecord | null) => void;
  onCreateDay?: (day: Date) => void;
  onEditEvent?: (event: EventRecord) => void;
}

export function EventsCalendarSection({
  events,
  loading,
  mode,
  currentMonth,
  selectedEvent,
  onSelectEvent,
  onCreateDay,
  onEditEvent,
}: EventsCalendarSectionProps) {
  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const startPadding = (getDay(startOfMonth(currentMonth)) + 6) % 7;

  function eventsForDay(day: Date) {
    return events.filter((e) => isSameDay(new Date(e.startsAt), day));
  }

  const agendaEvents = useMemo(() => {
    return [...events]
      .filter((e) => {
        const d = new Date(e.startsAt);
        return (
          d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear()
        );
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [events, currentMonth]);

  const cfg = selectedEvent ? TYPE_CONFIG[selectedEvent.eventType] : null;

  return (
    <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
      <div className={cn('flex-1 overflow-y-auto min-h-0', selectedEvent ? 'lg:flex-[1_1_0]' : '')}>
        {mode === 'calendar' ? (
          <div className="p-4">
            <div className="grid grid-cols-7 mb-2">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
                <div
                  key={d}
                  className="text-center text-[11px] font-semibold text-muted-foreground uppercase py-2"
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: startPadding }).map((_, i) => (
                <div key={`pad-${i}`} className="min-h-25 rounded-xl" />
              ))}

              {daysInMonth.map((day) => {
                const dayEvents = eventsForDay(day);
                const today = isToday(day);
                const hasSelected =
                  selectedEvent && isSameDay(day, new Date(selectedEvent.startsAt));

                return (
                  <div
                    key={day.toISOString()}
                    role={onCreateDay ? 'button' : undefined}
                    tabIndex={onCreateDay ? 0 : undefined}
                    aria-label={
                      onCreateDay
                        ? `Programar jornada el ${format(day, "d 'de' MMMM", { locale: es })}`
                        : undefined
                    }
                    onClick={() => onCreateDay?.(day)}
                    onKeyDown={(event) => {
                      if (!onCreateDay) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onCreateDay(day);
                      }
                    }}
                    className={cn(
                      'min-h-25 rounded-xl border p-2 transition-colors',
                      today ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
                      hasSelected && 'ring-2 ring-primary ring-offset-1',
                      onCreateDay && 'cursor-pointer hover:border-primary/40',
                    )}
                  >
                    <div
                      className={cn(
                        'text-xs font-black mb-1.5 w-6 h-6 rounded-full flex items-center justify-center',
                        today ? 'bg-primary text-primary-foreground' : 'text-foreground',
                      )}
                    >
                      {format(day, 'd')}
                    </div>

                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const c = TYPE_CONFIG[ev.eventType];
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectEvent(selectedEvent?.id === ev.id ? null : ev);
                            }}
                            title={
                              ev.visibility === 'private'
                                ? `${ev.title} — Evento privado`
                                : ev.title
                            }
                            className={cn(
                              'w-full text-left text-[10px] font-semibold px-1.5 py-0.5 rounded-md truncate flex items-center gap-1 transition-opacity hover:opacity-80',
                              c.bg,
                              c.color,
                            )}
                          >
                            {c.icon}
                            <span className="truncate">{ev.title}</span>
                            {ev.visibility === 'private' ? (
                              <Lock className="size-2.5 shrink-0" aria-label="Evento privado" />
                            ) : null}
                          </button>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-muted-foreground font-semibold pl-1">
                          +{dayEvents.length - 3} más
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-3 max-w-3xl">
            {agendaEvents.length === 0 && !loading && (
              <div className="bg-card border border-border rounded-2xl p-12 text-center">
                <CalendarDays className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">
                  Sin eventos en {format(currentMonth, 'MMMM yyyy', { locale: es })}
                </p>
              </div>
            )}
            {loading && agendaEvents.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12">
                Cargando agenda…
              </div>
            )}
            {agendaEvents.map((evento, i) => {
              const c = TYPE_CONFIG[evento.eventType];
              const isSelected = selectedEvent?.id === evento.id;
              const dayDate = new Date(evento.startsAt);
              return (
                <motion.button
                  key={evento.id}
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => onSelectEvent(isSelected ? null : evento)}
                  className={cn(
                    'w-full text-left bg-card border rounded-2xl p-4 flex gap-4 transition-all hover:border-primary/30',
                    isSelected ? 'border-primary ring-1 ring-primary/20' : 'border-border',
                  )}
                >
                  <div className="shrink-0 w-12 text-center">
                    <div className={cn('rounded-xl py-2 px-1', c.bg)}>
                      <div
                        className={cn(
                          'text-[10px] font-bold uppercase leading-none',
                          c.color,
                          'opacity-80',
                        )}
                      >
                        {format(dayDate, 'MMM', { locale: es })}
                      </div>
                      <div className={cn('text-xl font-black leading-none mt-0.5', c.color)}>
                        {format(dayDate, 'd')}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full',
                          c.bg,
                          c.color,
                        )}
                      >
                        {c.label}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {STATUS_LABEL[evento.status]}
                      </Badge>
                      {evento.visibility === 'private' ? (
                        <Badge variant="secondary" className="text-[10px]">
                          <Lock className="size-2.5" />
                          Privado
                        </Badge>
                      ) : null}
                    </div>
                    <h3 className="font-black text-foreground text-sm mb-1">{evento.title}</h3>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(dayDate, 'HH:mm', { locale: es })}
                      </span>
                      <span className="inline-flex items-center gap-1 min-w-0">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {evento.locationName ?? evento.address ?? '—'}
                        </span>
                      </span>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedEvent && cfg && (
          <motion.aside
            key={selectedEvent.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.25 }}
            className="w-full lg:w-90 border-t lg:border-t-0 lg:border-l border-border bg-card overflow-y-auto shrink-0 max-h-[45vh] lg:max-h-none"
          >
            <div className={cn('px-5 py-4 flex items-start justify-between gap-3', cfg.bg)}>
              <div className="min-w-0">
                <div
                  className={cn(
                    'text-[10px] font-bold uppercase mb-1 flex items-center gap-1.5',
                    cfg.color,
                    'opacity-80',
                  )}
                >
                  {cfg.icon}
                  {cfg.label}
                  {selectedEvent.visibility === 'private' ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Lock className="size-2.5" />
                      Privado
                    </span>
                  ) : null}
                </div>
                <h2 className={cn('font-black text-sm leading-snug', cfg.color)}>
                  {selectedEvent.title}
                </h2>
                <p className={cn('text-[11px] mt-0.5', cfg.color, 'opacity-70')}>
                  {format(new Date(selectedEvent.startsAt), "EEEE d 'de' MMMM · HH:mm", {
                    locale: es,
                  })}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                {onEditEvent ? (
                  <button
                    type="button"
                    onClick={() => onEditEvent(selectedEvent)}
                    className={cn('p-1 rounded-lg hover:bg-black/10 transition-colors', cfg.color)}
                    aria-label="Editar evento"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelectEvent(null)}
                  className={cn('p-1 rounded-lg hover:bg-black/10 transition-colors', cfg.color)}
                  aria-label="Cerrar panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    {selectedEvent.locationName ?? selectedEvent.address ?? 'Sin ubicación'}
                  </div>
                  {selectedEvent.address && selectedEvent.locationName && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {selectedEvent.address}
                    </div>
                  )}
                  {selectedEvent.neighborhood ? (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {selectedEvent.neighborhood}
                    </div>
                  ) : null}
                </div>
              </div>

              {selectedEvent.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {selectedEvent.description}
                </p>
              )}

              <div className="pt-1 space-y-2">
                <Button asChild className="w-full gap-2">
                  <Link href={`/admin/eventos/${selectedEvent.id}`}>
                    Gestionar evento
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Registros, invitaciones y check-in
                </p>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

export function EventsCalendarToolbar({
  currentMonth,
  onMonthChange,
  viewMode,
  onViewModeChange,
  listMode,
  onListModeChange,
}: {
  currentMonth: Date;
  onMonthChange: (d: Date) => void;
  viewMode: CalendarViewMode;
  onViewModeChange: (m: CalendarViewMode) => void;
  listMode: boolean;
  onListModeChange: (list: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-border bg-card shrink-0">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onMonthChange(subMonths(currentMonth, 1))}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-black text-foreground capitalize min-w-40 text-center">
          {format(currentMonth, 'MMMM yyyy', { locale: es })}
        </span>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(currentMonth, 1))}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center border border-border rounded-lg p-0.5 bg-muted/40">
          <button
            type="button"
            onClick={() => {
              onListModeChange(false);
              onViewModeChange('calendar');
            }}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
              !listMode && viewMode === 'calendar'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Calendario
          </button>
          <button
            type="button"
            onClick={() => {
              onListModeChange(false);
              onViewModeChange('agenda');
            }}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
              !listMode && viewMode === 'agenda'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Agenda
          </button>
          <button
            type="button"
            onClick={() => onListModeChange(true)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
              listMode
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Tabla
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-3 ml-1 flex-wrap">
          {(['townhall', 'community', 'volunteer', 'campaign', 'rally'] as EventType[]).map(
            (key) => {
              const val = TYPE_CONFIG[key];
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', val.dot)} />
                  <span className="text-[11px] text-muted-foreground">{val.label}</span>
                </div>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}
