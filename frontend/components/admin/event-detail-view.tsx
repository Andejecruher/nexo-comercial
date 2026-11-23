'use client';

import { AttendanceCheckinPanel } from '@/components/domain/events/AttendanceCheckinPanel';
import { EventRegistrationsTable } from '@/components/domain/events/EventRegistrationsTable';
import { EventStatsSummary } from '@/components/domain/events/EventStatsSummary';
import { InviteAudienceBuilder } from '@/components/domain/events/InviteAudienceBuilder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  fetchAllRegistrationsForEvent,
  useEventAttendance,
  useOperationalStats,
} from '@/hooks/useEventAttendance';
import { useEvents } from '@/hooks/useEvents';
import { useNeighborhoods } from '@/hooks/useNeighborhoods';
import { usePermissions } from '@/hooks/usePermissions';
import { useTags } from '@/hooks/useTags';
import { citizensApi, type Citizen } from '@/lib/citizens-api';
import type { EventRecord, EventRegistrationRecord } from '@/lib/events-api';
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface EventDetailViewProps {
  eventId: string;
}

export function EventDetailView({ eventId }: EventDetailViewProps) {
  const { getEvent } = useEvents();
  const attendance = useEventAttendance(eventId);
  const tagsState = useTags({ pageSize: 100 });
  const neighborhoodsState = useNeighborhoods({ pageSize: 100 });
  const { can } = usePermissions();
  const canWrite = can('eventos.update');

  const [eventLoading, setEventLoading] = useState(true);
  const [event, setEvent] = useState<EventRecord | undefined>(undefined);

  const [allRegs, setAllRegs] = useState<EventRegistrationRecord[]>([]);
  const [regsLoading, setRegsLoading] = useState(true);

  const [inviteTags, setInviteTags] = useState<string[]>([]);
  const [inviteNeighborhoods, setInviteNeighborhoods] = useState<string[]>([]);
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteSending, setInviteSending] = useState(false);

  const [citizenSearch, setCitizenSearch] = useState('');
  const [citizenResults, setCitizenResults] = useState<Citizen[]>([]);
  const [citizenSearchLoading, setCitizenSearchLoading] = useState(false);
  const [registerNotes, setRegisterNotes] = useState('');

  const loadEvent = useCallback(async () => {
    setEventLoading(true);
    const res = await getEvent(eventId);
    if (res.ok) {
      setEvent(res.event);
    } else {
      toast.error('No se pudo cargar el evento');
      setEvent(undefined);
    }
    setEventLoading(false);
  }, [eventId, getEvent]);

  const loadRegistrations = useCallback(async () => {
    setRegsLoading(true);
    const rows = await fetchAllRegistrationsForEvent(eventId);
    setAllRegs(rows);
    setRegsLoading(false);
  }, [eventId]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

  const stats = useOperationalStats(allRegs, event?.capacity);

  const handleConfirm = async (registrationId: string) => {
    const res = await attendance.confirmRegistration(registrationId);
    if (res.ok) {
      setAllRegs((prev) => prev.map((r) => (r.id === res.registration.id ? res.registration : r)));
    }
  };

  const handleCheckIn = async (registrationId: string) => {
    const res = await attendance.checkIn(registrationId);
    if (res.ok) {
      setAllRegs((prev) => prev.map((r) => (r.id === res.registration.id ? res.registration : r)));
    }
  };

  const handleInvite = async () => {
    setInviteSending(true);
    const payload = {
      message: inviteMessage.trim(),
      ...(inviteTags.length > 0 ? { tagIds: inviteTags } : {}),
      ...(inviteNeighborhoods.length > 0 ? { neighborhoodIds: inviteNeighborhoods } : {}),
    };
    const res = await attendance.invite(payload);
    setInviteSending(false);
    if (res.ok) {
      void loadRegistrations();
    }
  };

  const handleRegisterCitizen = async (citizenId: string) => {
    const res = await attendance.registerCitizen({
      citizenId,
      ...(registerNotes.trim() ? { notes: registerNotes.trim() } : {}),
    });
    if (res.ok) {
      setAllRegs((prev) => {
        const exists = prev.some((r) => r.id === res.registration.id);
        if (exists) {
          return prev.map((r) => (r.id === res.registration.id ? res.registration : r));
        }
        return [res.registration, ...prev];
      });
      setRegisterNotes('');
    }
  };

  useEffect(() => {
    const q = citizenSearch.trim();
    if (q.length < 2) {
      setCitizenResults([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setCitizenSearchLoading(true);
      const result = await citizensApi.list({ search: q, limit: 15 });
      setCitizenSearchLoading(false);
      if (result.ok) {
        setCitizenResults(result.data.citizens);
      } else {
        setCitizenResults([]);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [citizenSearch]);

  if (eventLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Evento no encontrado.</p>
        <Button asChild variant="link" className="mt-2 px-0">
          <Link href="/admin/eventos">Volver al listado</Link>
        </Button>
      </div>
    );
  }

  const opsLocked = event.status === 'cancelled' || event.status === 'completed';

  return (
    <div className="flex min-h-full flex-col">
      <div className="space-y-4 p-4 pb-0 md:p-6 md:pb-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="ghost" size="icon" asChild className="shrink-0">
              <Link href="/admin/eventos" aria-label="Volver">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="wrap-break-word text-xl font-black text-foreground">
                  {event.title}
                </h1>
                {event.visibility === 'private' ? <Badge variant="secondary">Privado</Badge> : null}
              </div>
              <p className="font-mono text-sm text-muted-foreground break-all">{event.slug}</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => void loadRegistrations()}
            className="w-full sm:w-auto"
          >
            Actualizar datos
          </Button>
        </div>
      </div>

      <Tabs defaultValue="asistencia" className="flex flex-col gap-3 px-4 pt-4 md:px-6">
        <div className="w-full overflow-x-auto">
          <TabsList className="h-auto w-full min-w-0">
            <TabsTrigger value="asistencia">Asistencia</TabsTrigger>
            <TabsTrigger value="invitaciones">Invitaciones</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="asistencia" className="mt-0 flex flex-col gap-4 pb-4 md:pb-6">
          <div>
            <EventStatsSummary stats={stats} loading={regsLoading} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
            <section className="flex min-h-0 flex-col space-y-3 rounded-2xl border bg-card p-4">
              <h2 className="text-sm font-semibold">Registrar ciudadano</h2>
              <div className="space-y-3">
                <Label htmlFor="cit-search">Buscar ciudadano (nombre o teléfono)</Label>
                <Input
                  id="cit-search"
                  value={citizenSearch}
                  onChange={(e) => setCitizenSearch(e.target.value)}
                  placeholder="Escribí al menos 2 caracteres..."
                />
                {citizenSearchLoading && <p className="text-xs text-muted-foreground">Buscando…</p>}
                {citizenResults.length > 0 && (
                  <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">
                    {citizenResults.map((c) => {
                      const label = [c.name, c.lastName].filter(Boolean).join(' ') || c.phone;
                      return (
                        <li
                          key={c.id}
                          className="flex flex-col gap-2 p-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="wrap-break-word min-w-0">{label}</span>
                          {canWrite && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={attendance.actionLoading || opsLocked}
                              onClick={() => void handleRegisterCitizen(c.id)}
                              className="w-full shrink-0 sm:w-auto"
                            >
                              <UserPlus className="mr-1 size-3.5" />
                              Registrar
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="space-y-1">
                  <Label htmlFor="reg-notes">Notas (opcional)</Label>
                  <Input
                    id="reg-notes"
                    value={registerNotes}
                    onChange={(e) => setRegisterNotes(e.target.value)}
                    placeholder="Nota interna del operador"
                  />
                </div>
              </div>
            </section>

            <AttendanceCheckinPanel
              registrations={allRegs}
              onCheckIn={(id) => void handleCheckIn(id)}
              actionLoading={attendance.actionLoading || opsLocked}
              canWrite={canWrite}
            />
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-muted-foreground">
              Registros
            </h2>
            <EventRegistrationsTable
              registrations={allRegs}
              loading={regsLoading}
              onConfirm={canWrite ? (id) => void handleConfirm(id) : undefined}
              onCheckIn={canWrite ? (id) => void handleCheckIn(id) : undefined}
              actionLoading={attendance.actionLoading || opsLocked}
              canWrite={canWrite}
            />
          </section>
        </TabsContent>

        <TabsContent value="invitaciones" className="mt-0 pb-4 md:pb-6">
          <InviteAudienceBuilder
            tags={tagsState.tags}
            neighborhoods={neighborhoodsState.neighborhoods}
            selectedTagIds={inviteTags}
            selectedNeighborhoodIds={inviteNeighborhoods}
            message={inviteMessage}
            onTagsChange={setInviteTags}
            onNeighborhoodsChange={setInviteNeighborhoods}
            onMessageChange={setInviteMessage}
            onSend={() => void handleInvite()}
            loading={inviteSending}
            disabled={!canWrite || opsLocked}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
