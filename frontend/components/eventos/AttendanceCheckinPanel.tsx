'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EventRegistrationRecord } from '@/lib/eventos/events-api';
import { Search, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

interface AttendanceCheckinPanelProps {
  registrations: EventRegistrationRecord[];
  onCheckIn: (registrationId: string) => void;
  actionLoading?: boolean;
  canWrite?: boolean;
}

export function AttendanceCheckinPanel({
  registrations,
  onCheckIn,
  actionLoading,
  canWrite = true,
}: AttendanceCheckinPanelProps) {
  const [query, setQuery] = useState('');

  const checkinable = useMemo(
    () =>
      registrations.filter(
        (r) =>
          (r.registrationStatus === 'registered' || r.registrationStatus === 'confirmed') &&
          r.attendanceStatus === 'pending',
      ),
    [registrations],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return checkinable.slice(0, 12);
    return checkinable.filter((r) => {
      const name = (r.citizen.name ?? '').toLowerCase();
      const phone = (r.citizen.phone ?? '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [checkinable, query]);

  return (
    <div className="flex h-full flex-col space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <UserCheck className="size-4 text-primary" />
        Check-in manual
      </div>
      <p className="text-xs text-muted-foreground">
        Solo registros en estado <strong>registrado</strong> o <strong>confirmado</strong>. El
        check-in marca asistencia y hora.
      </p>
      <div className="space-y-2">
        <Label htmlFor="checkin-search" className="sr-only">
          Buscar para check-in
        </Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="checkin-search"
            className="pl-9"
            placeholder="Buscar por nombre o teléfono..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <ul className="max-h-56 space-y-2 overflow-y-auto">
        {filtered.length === 0 && (
          <li className="py-4 text-center text-sm text-muted-foreground">
            No hay personas pendientes de check-in que coincidan.
          </li>
        )}
        {filtered.map((r) => {
          const name = [r.citizen.name].filter(Boolean).join(' ') || 'Sin nombre';
          return (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.citizen.phone ?? 'Sin teléfono'}
                </div>
              </div>
              {canWrite && (
                <Button
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => onCheckIn(r.id)}
                  className="w-full shrink-0 sm:w-auto"
                >
                  Check-in
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
