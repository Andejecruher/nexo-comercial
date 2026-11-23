import { apiClient } from '@/lib/api-client';

export type PromovidoSex = 'H' | 'M';

export type PromovidoIdentity = {
  firstName: string;
  paternalLastName: string;
  maternalLastName?: string;
  birthDate?: string;
  sex?: PromovidoSex;
  curp: string;
  voterKey: string;
  manualPhone?: string;
};

export type PromovidoAddress = {
  address?: string;
  neighborhood?: string;
  neighborhoodId?: string;
  locality?: string;
  municipality?: string;
  state?: string;
};

export type PromovidoManagement = {
  sectionId: string;
  leaderId: string;
  phone?: string;
  isActive?: boolean;
  observations?: string;
};

export type PromovidoPayload = PromovidoIdentity &
  PromovidoAddress &
  PromovidoManagement & {
    citizenId?: string;
  };

/**
 * Forma efectiva de `promovido.data`: la captura manual guarda el shape canónico
 * mientras que los registros confirmados por OCR conservan el blob revisado
 * (`electoralSection`, `manualPhone`) sin `sectionId`/`leaderId`/`phone`.
 */
export type PromovidoStoredData = Omit<Partial<PromovidoPayload>, 'sex'> & {
  sex?: string;
  electoralSection?: string;
  manualPhone?: string;
};

export type PromovidoListItem = {
  id: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  leader: { id: string; fullName: string };
  section: { id: string; sectionCode: string };
  citizen: {
    id: string;
    name: string | null;
    lastName: string | null;
    phone: string | null;
  } | null;
  uploadRecordId: string | null;
  data: PromovidoStoredData;
};

/** Campos de la credencial que solo existen en el blob revisado del OCR. */
export type PromovidoCredential = {
  validUntil?: string;
  registrationYear?: string;
  postalCode?: string;
  electoralSection?: string;
};

/** Vista de expediente devuelta por `GET /ine-ocr/promovidos/:id`. */
export type PromovidoDetail = Omit<PromovidoListItem, 'leader' | 'section' | 'citizen'> & {
  leader: { id: string; fullName: string; phone: string | null; email: string | null };
  section: {
    id: string;
    sectionCode: string;
    state: { id: string; name: string } | null;
    district: { id: string; code: string; name: string | null } | null;
  };
  citizen: {
    id: string;
    name: string | null;
    lastName: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  origin: 'ocr' | 'manual';
  credential: PromovidoCredential;
};

export type PromovidoListResult = {
  items: PromovidoListItem[];
  totalCount: number;
  hasNextPage: boolean;
};

export type PromovidoFilters = {
  q?: string;
  leaderId?: string;
  sex?: PromovidoSex;
  sectionId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
};

export type VoterKeyConflict = {
  promovidoId: string;
  leaderName: string;
  sectionCode: string;
  isActive: boolean;
};

export const promovidosApi = {
  list(filters: PromovidoFilters = {}) {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.leaderId) params.set('leaderId', filters.leaderId);
    if (filters.sex) params.set('sex', filters.sex);
    if (filters.sectionId) params.set('sectionId', filters.sectionId);
    if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
    if (filters.page) params.set('page', String(filters.page));
    if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
    const suffix = params.size ? `?${params.toString()}` : '';
    return apiClient.get<PromovidoListResult>(`/ine-ocr/promovidos${suffix}`);
  },
  get(id: string) {
    return apiClient.get<{ promovido: PromovidoDetail }>(`/ine-ocr/promovidos/${id}`);
  },
  checkVoterKey(voterKey: string, excludeId?: string) {
    const params = new URLSearchParams();
    params.set('voterKey', voterKey);
    if (excludeId) params.set('excludeId', excludeId);
    return apiClient.get<{ conflict: VoterKeyConflict | null }>(
      `/ine-ocr/promovidos/check-voter-key?${params.toString()}`,
    );
  },
  create(payload: PromovidoPayload) {
    return apiClient.post<{ promovido: PromovidoListItem }>('/ine-ocr/promovidos', payload);
  },
  update(id: string, payload: Partial<PromovidoPayload>) {
    return apiClient.patch<{ promovido: PromovidoListItem }>(`/ine-ocr/promovidos/${id}`, payload);
  },
};
