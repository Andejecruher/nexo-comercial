import { apiClient } from '@/lib/api-client';

export type PublicBarrio = { id: string; name: string };

export type PublicBarriosResponse = { barrios: PublicBarrio[] };

export type PublicRegistroPayload = {
  fullName: string;
  phone: string;
  email?: string;
  neighborhoodId: string;
  interests?: string[];
  consentGiven: boolean;
};

export type PublicRegistroCitizen = {
  id: string;
  phone: string;
  name?: string;
  lastName?: string;
  email?: string;
  sourceChannel: string;
  leadStatus: string;
  interests: string[];
  neighborhood?: string;
  neighborhoodId?: string;
};

export type PublicRegistroResponse = { citizen: PublicRegistroCitizen };

export const publicRegistroApi = {
  async listBarrios() {
    return apiClient.get<PublicBarriosResponse>('/public/barrios', { skipAuth: true });
  },

  async registroCiudadano(payload: PublicRegistroPayload) {
    return apiClient.post<PublicRegistroResponse>('/public/registro-ciudadano', payload, {
      skipAuth: true,
    });
  },
};
