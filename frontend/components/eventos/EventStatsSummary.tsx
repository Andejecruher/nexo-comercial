'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EventOperationalStats } from '@/hooks/eventos/useEventAttendance';
import { Clock, Ticket, UserCheck, Users, UserX } from 'lucide-react';

interface EventStatsSummaryProps {
  stats: EventOperationalStats;
  loading?: boolean;
}

export function EventStatsSummary({ stats, loading }: EventStatsSummaryProps) {
  const cap = stats.capacity;
  const occupied = stats.registered + stats.confirmed;
  const cupoLabel =
    cap !== undefined
      ? `${occupied} plazas usadas (reg.+conf.) de ${cap}`
      : 'Sin límite de cupo en el evento';

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="border-border/80 bg-card/80">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Capacidad</CardTitle>
          <Ticket className="size-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-black tabular-nums">
            {loading ? '…' : cap !== undefined ? cap : '—'}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{cupoLabel}</p>
        </CardContent>
      </Card>
      <Card className="border-border/80 bg-card/80">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Invitados</CardTitle>
          <Users className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-black tabular-nums">{loading ? '…' : stats.invited}</div>
          <p className="mt-1 text-xs text-muted-foreground">Invitados por WhatsApp</p>
        </CardContent>
      </Card>
      <Card className="border-border/80 bg-card/80">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Registrados</CardTitle>
          <Users className="size-4 text-blue-500/80" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-black tabular-nums">{loading ? '…' : stats.registered}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Confirmados: {loading ? '…' : stats.confirmed} · Lista espera:{' '}
            {loading ? '…' : stats.waitlist}
          </p>
        </CardContent>
      </Card>
      <Card className="border-border/80 bg-card/80">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Asistencia</CardTitle>
          <UserCheck className="size-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-black tabular-nums">{loading ? '…' : stats.attended}</div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <UserX className="size-3" /> No show: {loading ? '…' : stats.noShow}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" /> Pendiente: {loading ? '…' : stats.pendingAttendance}
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
