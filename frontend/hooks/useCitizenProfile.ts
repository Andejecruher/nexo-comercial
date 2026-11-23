'use client';

import {
  citizensApi,
  type CitizenProfileResponse,
  type CitizenRecentTicket,
} from '@/lib/citizens-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export function useCitizenProfile(citizenId: string | undefined) {
  const [profile, setProfile] = useState<CitizenProfileResponse | undefined>(undefined);
  const [tickets, setTickets] = useState<CitizenRecentTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [ticketsError, setTicketsError] = useState<string | undefined>(undefined);
  const [updatingInterests, setUpdatingInterests] = useState(false);
  const requestId = useRef(0);

  const fetchProfile = useCallback(async () => {
    if (!citizenId) return;

    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(undefined);
    setTicketsError(undefined);

    const [profileResult, ticketsResult] = await Promise.all([
      citizensApi.getProfile(citizenId),
      citizensApi.getRecentTickets(citizenId),
    ]);
    if (currentRequest !== requestId.current) return;

    if (profileResult.ok) {
      setProfile(profileResult.data);
    } else {
      setError(profileResult.message);
      toast.error('No se pudo cargar el perfil del ciudadano', {
        description: profileResult.message,
      });
    }

    if (ticketsResult.ok) {
      setTickets(ticketsResult.data.tickets);
    } else {
      setTickets([]);
      setTicketsError(ticketsResult.message);
    }

    setLoading(false);
  }, [citizenId]);

  useEffect(() => {
    setProfile(undefined);
    setTickets([]);
    if (!citizenId) {
      setLoading(false);
      return;
    }
    void fetchProfile();
    return () => {
      requestId.current += 1;
    };
  }, [citizenId, fetchProfile]);

  const updateInterests = useCallback(
    async (interests: string[]) => {
      if (!citizenId || updatingInterests) return false;

      const normalized = Array.from(
        new Map(
          interests
            .map((interest) => interest.trim())
            .filter(Boolean)
            .map((interest) => [interest.toLocaleLowerCase('es-MX'), interest]),
        ).values(),
      );

      setUpdatingInterests(true);
      const result = await citizensApi.update(citizenId, { interests: normalized });
      setUpdatingInterests(false);

      if (!result.ok) {
        toast.error('No se pudieron actualizar los temas de interés', {
          description: result.message,
        });
        return false;
      }

      setProfile((current) => (current ? { ...current, citizen: result.data.citizen } : current));
      toast.success('Temas de interés actualizados');
      return true;
    },
    [citizenId, updatingInterests],
  );

  return {
    profile,
    tickets,
    loading,
    error,
    ticketsError,
    updatingInterests,
    updateInterests,
    refresh: fetchProfile,
  };
}
