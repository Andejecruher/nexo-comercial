'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCitizenProfile } from '@/hooks/shared/useCitizenProfile';
import type { Citizen, CitizenRecentTicketStatus } from '@/lib/shared/citizens-api';
import { formatPhoneDisplay } from '@/lib/shared/phone-utils';
import { motion } from 'framer-motion';
import { ArrowUpRight, Loader2, Mail, MapPin, Phone, Plus, Tag, Ticket, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

interface CitizenProfileProps {
  citizenId?: string | null;
  onClose?: () => void;
}

function leadStatusLabel(status: string) {
  switch (status) {
    case 'new':
      return 'Nuevo';
    case 'contacted':
      return 'Contactado';
    case 'engaged':
      return 'En seguimiento';
    case 'converted':
      return 'Convertido';
    case 'unsubscribed':
      return 'Sin seguimiento';
    default:
      return status;
  }
}

function fullName(citizen: Citizen) {
  const name = [citizen.name, citizen.lastName].filter(Boolean).join(' ').trim();
  return name || 'Sin nombre';
}

function formatTicketDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
  });
}

const TICKET_STATUS: Record<CitizenRecentTicketStatus, { label: string; className: string }> = {
  OPEN: { label: 'Nuevo', className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  IN_PROGRESS: {
    label: 'En gestión',
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  RESOLVED: {
    label: 'Canalizado',
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  CLOSED: { label: 'Cerrado', className: 'bg-muted text-muted-foreground' },
};

export function CitizenProfile({ citizenId, onClose }: CitizenProfileProps) {
  const {
    profile,
    tickets,
    loading,
    error,
    ticketsError,
    updatingInterests,
    updateInterests,
    refresh,
  } = useCitizenProfile(citizenId ?? undefined);
  const [draftInterests, setDraftInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');

  useEffect(() => {
    setDraftInterests(profile?.citizen.interests ?? []);
    setInterestInput('');
  }, [profile?.citizen.id, profile?.citizen.interests]);

  const interestsChanged = useMemo(() => {
    const persisted = profile?.citizen.interests ?? [];
    return JSON.stringify(draftInterests) !== JSON.stringify(persisted);
  }, [draftInterests, profile?.citizen.interests]);

  const addInterest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidates = interestInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (candidates.length === 0) return;

    setDraftInterests((current) => {
      const byKey = new Map(
        current.map((interest) => [interest.toLocaleLowerCase('es-MX'), interest]),
      );
      candidates.slice(0, 20).forEach((interest) => {
        if (interest.length <= 100 && byKey.size < 20) {
          byKey.set(interest.toLocaleLowerCase('es-MX'), interest);
        }
      });
      return Array.from(byKey.values());
    });
    setInterestInput('');
  };

  const removeInterest = (interest: string) => {
    setDraftInterests((current) => current.filter((item) => item !== interest));
  };

  if (!citizenId) {
    return (
      <div className="w-full min-w-0 shrink-0 h-full border-l border-border bg-card flex items-center justify-center text-muted-foreground text-sm p-6 text-center">
        Selecciona una conversación para ver el perfil ciudadano.
      </div>
    );
  }

  if (loading && !profile) {
    return (
      <div className="w-full min-w-0 shrink-0 h-full min-h-0 border-l border-border bg-card p-5 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mx-auto size-16 rounded-2xl" />
        <Skeleton className="h-5 w-40 mx-auto" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="w-full min-w-0 shrink-0 h-full border-l border-border bg-card flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="w-full min-w-0 shrink-0 h-full border-l border-border bg-card flex items-center justify-center text-muted-foreground text-sm p-6 text-center">
        No se encontró el ciudadano solicitado.
      </div>
    );
  }

  const citizen = profile.citizen;
  const displayName = fullName(citizen);

  return (
    <motion.div
      key={citizen.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="w-full min-w-0 shrink-0 h-full min-h-0 border-l border-border bg-card flex flex-col"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <span className="text-sm font-semibold text-foreground">Perfil Ciudadano</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar perfil ciudadano"
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-wrap:anywhere]">
        <div className="flex flex-col items-center py-6 px-5 border-b border-border">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold mb-3">
            {displayName.charAt(0)}
          </div>
          <h3 className="font-bold text-foreground text-center">{displayName}</h3>
          <span className="text-xs text-muted-foreground font-medium mt-1">
            {citizen.neighborhood?.trim() || 'Sin colonia registrada'}
          </span>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full mt-1.5 bg-muted text-muted-foreground">
            {leadStatusLabel(citizen.leadStatus)}
          </span>
        </div>

        <div className="px-5 py-5 space-y-3 border-b border-border">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Datos de contacto
          </h4>
          {[
            {
              icon: Phone,
              value: citizen.phone
                ? formatPhoneDisplay(citizen.phone) || citizen.phone
                : 'Sin teléfono',
              key: 'phone',
            },
            { icon: Mail, value: citizen.email || 'Sin correo', key: 'email' },
            { icon: MapPin, value: citizen.neighborhood || 'Sin dirección', key: 'neighborhood' },
          ].map(({ icon: Icon, value, key }) => (
            <div key={key} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm text-foreground">{value}</span>
            </div>
          ))}
        </div>

        <div className="px-5 py-5 border-b border-border space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Tag className="w-3.5 h-3.5" />
            Temas de interés
          </h4>
          <div className="flex flex-wrap gap-2">
            {draftInterests.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin temas registrados</p>
            )}
            {draftInterests.map((interest) => (
              <span
                key={interest}
                className="inline-flex items-center gap-1 text-xs bg-primary/5 text-foreground pl-2.5 pr-1 py-1 rounded-full border border-border"
              >
                {interest}
                <button
                  type="button"
                  aria-label={`Eliminar tema ${interest}`}
                  onClick={() => removeInterest(interest)}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>

          <form onSubmit={addInterest} className="flex items-center gap-2">
            <Input
              value={interestInput}
              onChange={(event) => setInterestInput(event.target.value)}
              placeholder="Agregar tema"
              aria-label="Nuevo tema de interés"
              maxLength={100}
              className="h-8 text-xs"
            />
            <Button
              type="submit"
              variant="outline"
              size="icon"
              className="size-8 shrink-0"
              disabled={!interestInput.trim() || draftInterests.length >= 20}
              aria-label="Agregar tema de interés"
            >
              <Plus className="size-3.5" />
            </Button>
          </form>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] leading-tight text-muted-foreground">
              Hasta 20 temas. Separa varios con comas.
            </p>
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0"
              disabled={!interestsChanged || updatingInterests}
              onClick={() => void updateInterests(draftInterests)}
            >
              {updatingInterests && <Loader2 className="size-3.5 animate-spin" />}
              Guardar
            </Button>
          </div>
        </div>

        <div className="px-5 py-5 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Ticket className="size-3.5" />
            Últimos tickets
          </h4>

          {loading && tickets.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Cargando historial…
            </div>
          )}

          {!loading && ticketsError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5">
              <p className="text-xs text-destructive">No se pudo cargar el historial.</p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="mt-1 text-xs font-medium text-primary hover:underline"
              >
                Reintentar
              </button>
            </div>
          )}

          {!loading && !ticketsError && tickets.length === 0 && (
            <p className="text-xs text-muted-foreground">Este ciudadano aún no tiene tickets.</p>
          )}

          <div className="space-y-2">
            {tickets.slice(0, 5).map((ticket) => {
              const status = TICKET_STATUS[ticket.status];
              return (
                <Link
                  key={ticket.id}
                  href={`/admin/tickets/${ticket.conversationId}?ticketId=${ticket.id}`}
                  className="group block rounded-xl border border-border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-primary/3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {ticket.title?.trim() || `Ticket #${ticket.id.slice(0, 8)}`}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {ticket.departmentSlug || 'Sin departamento'} ·{' '}
                        {formatTicketDate(ticket.updatedAt)}
                      </p>
                    </div>
                    <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                  <span
                    className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
