'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { EventRecord, EventStatus, EventType, EventVisibility } from '@/lib/events-api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, ExternalLink, MapPin } from 'lucide-react';
import Link from 'next/link';

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const VISIBILITY_LABEL: Record<EventVisibility, string> = {
  public: 'Público',
  private: 'Privado',
};

const TYPE_LABEL: Record<EventType, string> = {
  townhall: 'Asamblea',
  community: 'Comunitario',
  volunteer: 'Voluntariado',
  campaign: 'Campaña',
  rally: 'Mitin',
};

function statusVariant(status: EventStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'published':
      return 'default';
    case 'draft':
      return 'secondary';
    case 'completed':
      return 'outline';
    case 'cancelled':
      return 'destructive';
    default:
      return 'secondary';
  }
}

interface EventsTableProps {
  events: EventRecord[];
  loading: boolean;
}

export function EventsTable({ events, loading }: EventsTableProps) {
  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                Evento
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">Fecha</th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">Tipo</th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                Estado
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                Visibilidad
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">Cupo</th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                Ubicación
              </th>
              <th className="px-4 py-3 text-right text-xs uppercase text-muted-foreground">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {!loading && events.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  No hay eventos con los filtros seleccionados.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  Cargando eventos...
                </td>
              </tr>
            )}
            {!loading &&
              events.map((ev) => {
                const start = new Date(ev.startsAt);
                return (
                  <tr key={ev.id} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{ev.title}</div>
                      <div className="text-xs text-muted-foreground font-mono">{ev.slug}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="size-3.5 shrink-0" />
                        {format(start, 'd MMM yyyy · HH:mm', { locale: es })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{TYPE_LABEL[ev.eventType]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(ev.status)}>{STATUS_LABEL[ev.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ev.visibility === 'private' ? 'secondary' : 'outline'}>
                        {VISIBILITY_LABEL[ev.visibility ?? 'public']}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ev.capacity !== undefined ? ev.capacity : '—'}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="flex items-start gap-1 text-muted-foreground">
                        <MapPin className="size-3.5 mt-0.5 shrink-0" />
                        <span className="truncate">{ev.locationName ?? ev.address ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/eventos/${ev.id}`}>
                          Gestionar
                          <ExternalLink className="size-3.5 ml-1" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
