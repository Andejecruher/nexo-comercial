'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Citizen } from '@/lib/shared/citizens-api';
import { formatDateTime } from '@/lib/ciudadanos/date-utils';
import { whatsappHref } from '@/lib/shared/phone-utils';
import { Mail, MapPin, Phone } from 'lucide-react';
import { WhatsAppIcon } from '@/components/ciudadanos/citizen-whatsapp-actions';

function leadStatusLabel(status: string) {
  switch (status) {
    case 'new':
      return 'Nuevo Reporte';
    case 'contacted':
      return 'En Gestión';
    case 'engaged':
      return 'Canalizado';
    case 'converted':
      return 'Caso Resuelto';
    case 'unsubscribed':
      return 'Sin seguimiento';
    default:
      return status;
  }
}

function sourceChannelLabel(channel: string) {
  switch (channel) {
    case 'whatsapp':
      return 'WhatsApp Directo';
    case 'web':
      return 'Sitio Web';
    case 'event':
      return 'Jornada o Evento';
    case 'referral':
      return 'Referido';
    case 'other':
      return 'Otro';
    default:
      return channel;
  }
}

function initials(name?: string, lastName?: string) {
  const letters = [name, lastName]
    .map((part) => part?.trim()?.[0])
    .filter(Boolean)
    .join('');
  return letters.toUpperCase() || '?';
}

interface CitizenProfileProps {
  citizen: Citizen;
}

export function CitizenProfile({ citizen }: CitizenProfileProps) {
  const fullName = [citizen.name, citizen.lastName].filter(Boolean).join(' ').trim();

  return (
    <Card>
      <CardContent className="p-5 md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Avatar className="size-20 shrink-0">
              <AvatarFallback className="bg-primary/10 text-xl font-black text-primary">
                {initials(citizen.name, citizen.lastName)}
              </AvatarFallback>
            </Avatar>

            <div className="space-y-2 text-center sm:text-left">
              <h1 className="text-xl font-black uppercase leading-tight text-foreground md:text-2xl">
                {fullName || 'Sin nombre'}
              </h1>

              <div className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                {citizen.phone ? (
                  <span className="inline-flex items-center justify-center gap-1.5 sm:justify-start">
                    <Phone className="size-3.5" />
                    {citizen.phone}
                  </span>
                ) : (
                  <></>
                )}
                {citizen.email ? (
                  <span className="inline-flex items-center justify-center gap-1.5 sm:justify-start">
                    <Mail className="size-3.5" />
                    {citizen.email}
                  </span>
                ) : (
                  <></>
                )}
                {citizen.neighborhood ? (
                  <span className="inline-flex items-center justify-center gap-1.5 sm:justify-start">
                    <MapPin className="size-3.5" />
                    {citizen.neighborhood}
                  </span>
                ) : (
                  <></>
                )}
              </div>

              <div className="flex flex-wrap justify-center gap-2 pt-1 sm:justify-start">
                <Badge variant={citizen.consentGiven ? 'default' : 'outline'}>
                  {citizen.consentGiven ? 'Consentimiento otorgado' : 'Sin consentimiento'}
                </Badge>
                <Badge variant="secondary">
                  Seguimiento: {leadStatusLabel(citizen.leadStatus)}
                </Badge>
                <Badge variant="outline">
                  Canal de registro: {sourceChannelLabel(citizen.sourceChannel)}
                </Badge>
              </div>
            </div>
          </div>

          {citizen.phone ? (
            <Button asChild className="w-full gap-2 md:w-auto">
              <a href={whatsappHref(citizen.phone)} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon className="size-4" />
                Enviar WhatsApp Directo
              </a>
            </Button>
          ) : (
            <></>
          )}
        </div>

        <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
          Registrado: {formatDateTime(citizen.createdAt)} · Actualizado:{' '}
          {formatDateTime(citizen.updatedAt)}
        </p>
      </CardContent>
    </Card>
  );
}
