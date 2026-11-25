import { apiClient } from '@/lib/shared/api-client';

export interface UserProfile {
  id: string;
  nombre: string | null;
  correo: string;
  telefono: string | null;
  roles: Array<{ id: string; name: string; slug: string }>;
  fechaRegistro: string;
}

export interface ProfileFields {
  nombre: string;
  correo: string;
  telefono: string;
}

export const profileApi = {
  get: () => apiClient.get<{ user: UserProfile }>('/users/me'),
  update: (fields: ProfileFields) => apiClient.patch<{ user: UserProfile }>('/users/me', fields),
};
