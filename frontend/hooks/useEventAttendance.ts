'use client';

import {
  type CheckInEventPayload,
  type EventRegistrationRecord,
  type InviteEventPayload,
  type RegisterEventPayload,
  eventsApi,
} from '@/lib/events-api';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export interface EventOperationalStats {
  capacity?: number;
  /** invited + registered + confirmed + waitlist (active pipeline) */
  invited: number;
  registered: number;
  confirmed: number;
  waitlist: number;
  cancelled: number;
  /** attendanceStatus === attended */
  attended: number;
  /** attendanceStatus === no_show */
  noShow: number;
  /** attendanceStatus === pending among registered/confirmed/waitlist */
  pendingAttendance: number;
}

function countByRegistrationStatus(rows: EventRegistrationRecord[]) {
  let invited = 0;
  let registered = 0;
  let confirmed = 0;
  let waitlist = 0;
  let cancelled = 0;
  for (const r of rows) {
    switch (r.registrationStatus) {
      case 'invited':
        invited++;
        break;
      case 'registered':
        registered++;
        break;
      case 'confirmed':
        confirmed++;
        break;
      case 'waitlist':
        waitlist++;
        break;
      case 'cancelled':
        cancelled++;
        break;
      default:
        break;
    }
  }
  return { invited, registered, confirmed, waitlist, cancelled };
}

function countAttendance(rows: EventRegistrationRecord[]) {
  let attended = 0;
  let noShow = 0;
  let pendingAttendance = 0;
  for (const r of rows) {
    if (r.attendanceStatus === 'attended') attended++;
    else if (r.attendanceStatus === 'no_show') noShow++;
    else if (
      r.attendanceStatus === 'pending' &&
      ['registered', 'confirmed', 'waitlist'].includes(r.registrationStatus)
    ) {
      pendingAttendance++;
    }
  }
  return { attended, noShow, pendingAttendance };
}

export function useEventAttendance(eventId: string) {
  const [actionLoading, setActionLoading] = useState(false);

  const invite = useCallback(
    async (payload: InviteEventPayload) => {
      setActionLoading(true);
      const result = await eventsApi.invite(eventId, payload);
      setActionLoading(false);
      if (result.ok) {
        toast.success('Invitaciones encoladas', {
          description: `${result.data.result.queued} enviadas · ${result.data.result.alreadyInvited} ya estaban activos`,
        });
        return { ok: true as const, result: result.data.result };
      }
      toast.error('No se pudo enviar invitaciones', { description: result.message });
      return { ok: false as const, message: result.message };
    },
    [eventId],
  );

  const registerCitizen = useCallback(
    async (payload: RegisterEventPayload) => {
      setActionLoading(true);
      const result = await eventsApi.register(eventId, payload);
      setActionLoading(false);
      if (result.ok) {
        toast.success('Ciudadano registrado');
        return { ok: true as const, registration: result.data.registration };
      }
      toast.error('No se pudo registrar', { description: result.message });
      return { ok: false as const, message: result.message };
    },
    [eventId],
  );

  const confirmRegistration = useCallback(
    async (registrationId: string) => {
      setActionLoading(true);
      const result = await eventsApi.confirm(eventId, registrationId);
      setActionLoading(false);
      if (result.ok) {
        toast.success('Confirmación registrada');
        return { ok: true as const, registration: result.data.registration };
      }
      toast.error('No se pudo confirmar', { description: result.message });
      return { ok: false as const, message: result.message };
    },
    [eventId],
  );

  const checkIn = useCallback(
    async (registrationId: string, body?: CheckInEventPayload) => {
      setActionLoading(true);
      const result = await eventsApi.checkIn(eventId, registrationId, body);
      setActionLoading(false);
      if (result.ok) {
        toast.success('Check-in registrado');
        return { ok: true as const, registration: result.data.registration };
      }
      toast.error('No se pudo hacer check-in', { description: result.message });
      return { ok: false as const, message: result.message };
    },
    [eventId],
  );

  const computeStatsFromRows = useCallback(
    (allRegistrations: EventRegistrationRecord[], capacity?: number): EventOperationalStats => {
      const regCounts = countByRegistrationStatus(allRegistrations);
      const att = countAttendance(allRegistrations);
      return {
        capacity,
        invited: regCounts.invited,
        registered: regCounts.registered,
        confirmed: regCounts.confirmed,
        waitlist: regCounts.waitlist,
        cancelled: regCounts.cancelled,
        attended: att.attended,
        noShow: att.noShow,
        pendingAttendance: att.pendingAttendance,
      };
    },
    [],
  );

  return {
    actionLoading,
    invite,
    registerCitizen,
    confirmRegistration,
    checkIn,
    computeStatsFromRows,
  };
}

/** Fetch all registration pages for stats (operational summary). */
export async function fetchAllRegistrationsForEvent(
  eventId: string,
): Promise<EventRegistrationRecord[]> {
  const all: EventRegistrationRecord[] = [];
  let cursor: string | undefined;
  let hasNext = true;

  while (hasNext) {
    const result = await eventsApi.listRegistrations(eventId, {
      limit: 100,
      cursor,
    });
    if (!result.ok) break;
    all.push(...result.data.registrations);
    hasNext = result.data.meta.hasNextPage;
    cursor = result.data.meta.nextCursor;
    if (!hasNext || !cursor) break;
  }

  return all;
}

export function useOperationalStats(
  allRegistrations: EventRegistrationRecord[],
  capacity?: number,
): EventOperationalStats {
  return useMemo(() => {
    const regCounts = countByRegistrationStatus(allRegistrations);
    const att = countAttendance(allRegistrations);
    return {
      capacity,
      invited: regCounts.invited,
      registered: regCounts.registered,
      confirmed: regCounts.confirmed,
      waitlist: regCounts.waitlist,
      cancelled: regCounts.cancelled,
      attended: att.attended,
      noShow: att.noShow,
      pendingAttendance: att.pendingAttendance,
    };
  }, [allRegistrations, capacity]);
}
