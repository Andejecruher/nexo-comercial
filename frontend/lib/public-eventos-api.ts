import { apiClient } from '@/lib/api-client';

export type PublicEventoItem = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  locationName: string | null;
  address: string | null;
  capacity: number | null;
};

export type PublicEventosSemanaResponse = {
  weekStartsOn: string;
  weekEndsOn: string;
  timezone: string;
  events: PublicEventoItem[];
};

export type PublicEventoAsistenciaPayload = {
  fullName: string;
  phone: string;
  email?: string;
  consentGiven?: boolean;
};

export type PublicEventoAsistenciaResponse = {
  registration: {
    id: string;
    eventId: string;
    citizenId: string;
    registrationStatus: string;
    attendanceStatus: string;
    createdAt: string;
  };
  citizen: {
    id: string;
    phone: string;
    created: boolean;
    profileComplete: boolean;
  };
};

function buildSemanaQuery(referenceDate?: string): string {
  if (!referenceDate?.trim()) return '';
  const sp = new URLSearchParams();
  sp.set('referenceDate', referenceDate.trim());
  return `?${sp.toString()}`;
}

export const publicEventosApi = {
  async listSemana(referenceDate?: string) {
    return apiClient.get<PublicEventosSemanaResponse>(
      `/public/eventos/semana${buildSemanaQuery(referenceDate)}`,
      { skipAuth: true },
    );
  },

  async registrarAsistencia(eventId: string, body: PublicEventoAsistenciaPayload) {
    return apiClient.post<PublicEventoAsistenciaResponse>(
      `/public/eventos/${eventId}/asistencia`,
      body,
      { skipAuth: true },
    );
  },
};
