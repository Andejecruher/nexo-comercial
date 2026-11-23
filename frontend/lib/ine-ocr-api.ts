import { apiClient } from '@/lib/api-client';

export type IneFields = Record<string, string | undefined>;
export type Leader = { id: string; fullName: string };
export type ElectoralState = { id: string; code: string; name: string; isActive: boolean };
export type ElectoralDistrict = {
  id: string;
  stateId: string;
  code: string;
  name?: string | null;
  isActive: boolean;
  state: Pick<ElectoralState, 'id' | 'name'>;
};
export type ElectoralSection = {
  id: string;
  stateId: string;
  districtId: string;
  sectionCode: string;
  pollingStationCount?: number | null;
  votesPerStation?: number | null;
  nominalList?: number | null;
  votesRequired?: number | null;
  isActive: boolean;
  state: Pick<ElectoralState, 'id' | 'name'>;
  district: Pick<ElectoralDistrict, 'id' | 'code'>;
  leaders: Leader[];
};
export type SectionOperationalFields = {
  pollingStationCount?: number | null;
  votesPerStation?: number | null;
  nominalList?: number | null;
  votesRequired?: number | null;
};
export const LEADER_ROLES = ['PROMOTOR_BARRIO', 'ENLACE_TERRITORIAL'] as const;
export type LeaderRole = (typeof LEADER_ROLES)[number];

export const LEADER_ROLE_LABELS: Record<LeaderRole, string> = {
  PROMOTOR_BARRIO: 'Promotor de Barrio',
  ENLACE_TERRITORIAL: 'Enlace Territorial',
};

export type ElectoralLeader = Leader & {
  sectionId: string;
  coordinatorId?: string | null;
  neighborhoodId?: string | null;
  phone?: string | null;
  email?: string | null;
  promovidoQuota?: number | null;
  role: LeaderRole;
  isActive: boolean;
  createdAt?: string;
  section: Pick<ElectoralSection, 'id' | 'sectionCode'> & {
    state: Pick<ElectoralState, 'id' | 'name'>;
    district: Pick<ElectoralDistrict, 'id' | 'code'>;
  };
  neighborhood?: { id: string; name: string } | null;
  coordinator?: { id: string; fullName: string } | null;
  user?: { id: string; email: string; isActive: boolean } | null;
};
export type LeaderProfilePayload = {
  coordinatorId?: string | null;
  neighborhoodId?: string | null;
  phone?: string | null;
  email?: string | null;
  promovidoQuota?: number | null;
  role?: LeaderRole;
};
type CreatedElectoralDistrict = Omit<ElectoralDistrict, 'state'>;
type CreatedElectoralSection = Omit<ElectoralSection, 'state' | 'district' | 'leaders'>;
type CreatedElectoralLeader = Omit<
  ElectoralLeader,
  'section' | 'neighborhood' | 'coordinator' | 'user'
>;
export type LeaderInvitationDto = {
  id: string;
  status: string;
  expiresAt: string;
};
export type LeaderCreateResponse = {
  leader: CreatedElectoralLeader;
  invitation?: LeaderInvitationDto;
  warning?: { code: string; message: string };
};
export type LeaderReinviteResponse = {
  invitation: LeaderInvitationDto;
  warning?: { code: string; message: string };
};
export type SectionCandidate = {
  id: string;
  state: string;
  district: string;
  sectionCode: string;
  leaders: Leader[];
};
export type IneUpload = {
  id: string;
  status: 'queued' | 'processing' | 'review_ready' | 'failed' | 'confirmed';
  fields: IneFields;
  rescanFields?: IneFields;
  validation: Array<{ missing: string[]; warnings: string[] }>;
  sectionCandidates: SectionCandidate[];
  rescanSectionCandidates?: SectionCandidate[];
  leader?: Leader;
  promovidoId?: string;
  crmPreview?: {
    status: 'new' | 'existing' | 'conflict' | 'invalid';
    citizen?: { id: string; name: string | null; lastName: string | null };
  };
};
export type NeighborhoodMatchCandidate = {
  id: string;
  name: string;
  matchKey: string;
  sectionId: string | null;
  /** Distingue colonias homónimas de distintos municipios del catálogo. */
  municipality?: string | null;
  score: number;
};

export type NeighborhoodMatch = {
  rawValue: string;
  normalizedValue: string;
  bestMatch?: NeighborhoodMatchCandidate;
  matchPrincipal?: NeighborhoodMatchCandidate;
  alternatives: NeighborhoodMatchCandidate[];
  confidence: number;
  requiresManualDecision: boolean;
};

export const ineOcrApi = {
  upload(front?: File, back?: File) {
    const form = new FormData();
    if (front) form.append('front', front);
    if (back) form.append('back', back);
    return apiClient.post<{ upload: IneUpload }>('/ine-ocr/uploads', form);
  },
  getUpload(id: string) {
    return apiClient.get<{ upload: IneUpload }>(`/ine-ocr/uploads/${id}`);
  },
  retry(id: string) {
    return apiClient.post<{ upload: IneUpload }>(`/ine-ocr/uploads/${id}/retry`);
  },
  review(
    id: string,
    payload: {
      sectionId: string;
      leaderId: string;
      manualPhone?: string;
      neighborhoodId?: string;
      fields: IneFields;
    },
  ) {
    return apiClient.patch<{ upload: IneUpload }>(`/ine-ocr/uploads/${id}/review`, payload);
  },
  sectionCandidates(id: string, fields: IneFields) {
    return apiClient.post<{ sectionCandidates: SectionCandidate[] }>(
      `/ine-ocr/uploads/${id}/section-candidates`,
      { fields },
    );
  },
  matchNeighborhood(payload: {
    rawValue: string;
    sectionId?: string;
    municipality?: string;
    postalCode?: string;
  }) {
    return apiClient.post<{ match: NeighborhoodMatch }>('/ine-ocr/neighborhood-match', payload);
  },
  candidates(id: string) {
    return apiClient.get<{
      citizens: Array<{
        id: string;
        name?: string;
        lastName?: string;
        phone?: string | null;
        email?: string;
      }>;
    }>(`/ine-ocr/uploads/${id}/candidates`);
  },
  confirm(id: string, citizenId?: string) {
    return apiClient.post<{ promovido: { id: string } }>(
      `/ine-ocr/uploads/${id}/confirm`,
      citizenId ? { citizenId } : {},
    );
  },
  catalog: {
    listStates(includeInactive = false) {
      const query = includeInactive ? '?includeInactive=true' : '';
      return apiClient.get<{ states: ElectoralState[] }>(`/ine-ocr/catalog/states${query}`);
    },
    createState(payload: Pick<ElectoralState, 'code' | 'name'>) {
      return apiClient.post<{ state: ElectoralState }>('/ine-ocr/catalog/states', payload);
    },
    updateState(id: string, payload: Partial<Pick<ElectoralState, 'code' | 'name' | 'isActive'>>) {
      return apiClient.patch<{ state: ElectoralState }>(`/ine-ocr/catalog/states/${id}`, payload);
    },
    deleteState(id: string) {
      return apiClient.delete<{ message: string; state: ElectoralState }>(
        `/ine-ocr/catalog/states/${id}`,
      );
    },
    listDistricts(stateId?: string, includeInactive = false) {
      const params = new URLSearchParams();
      if (stateId) params.set('stateId', stateId);
      if (includeInactive) params.set('includeInactive', 'true');
      const query = params.size ? `?${params.toString()}` : '';
      return apiClient.get<{ districts: ElectoralDistrict[] }>(
        `/ine-ocr/catalog/districts${query}`,
      );
    },
    createDistrict(payload: { stateId: string; code: string; name?: string }) {
      return apiClient.post<{ district: CreatedElectoralDistrict }>(
        '/ine-ocr/catalog/districts',
        payload,
      );
    },
    updateDistrict(
      id: string,
      payload: Partial<Pick<ElectoralDistrict, 'stateId' | 'code' | 'name' | 'isActive'>>,
    ) {
      return apiClient.patch<{ district: CreatedElectoralDistrict }>(
        `/ine-ocr/catalog/districts/${id}`,
        payload,
      );
    },
    deleteDistrict(id: string) {
      return apiClient.delete<{ message: string; district: CreatedElectoralDistrict }>(
        `/ine-ocr/catalog/districts/${id}`,
      );
    },
    listSections(
      params: {
        stateId?: string;
        districtId?: string;
        includeInactive?: boolean;
        limit?: number;
      } = {},
    ) {
      const query = new URLSearchParams();
      if (params.stateId) query.set('stateId', params.stateId);
      if (params.districtId) query.set('districtId', params.districtId);
      if (params.includeInactive) query.set('includeInactive', 'true');
      if (params.limit) query.set('limit', String(params.limit));
      const suffix = query.size ? `?${query.toString()}` : '';
      return apiClient.get<{ sections: ElectoralSection[] }>(`/ine-ocr/catalog/sections${suffix}`);
    },
    createSection(
      payload: {
        stateId: string;
        districtId: string;
        sectionCode: string;
      } & SectionOperationalFields,
    ) {
      return apiClient.post<{ section: CreatedElectoralSection }>(
        '/ine-ocr/catalog/sections',
        payload,
      );
    },
    updateSection(
      id: string,
      payload: Partial<
        Pick<
          ElectoralSection,
          | 'stateId'
          | 'districtId'
          | 'sectionCode'
          | 'isActive'
          | 'pollingStationCount'
          | 'votesPerStation'
          | 'nominalList'
          | 'votesRequired'
        >
      >,
    ) {
      return apiClient.patch<{ section: CreatedElectoralSection }>(
        `/ine-ocr/catalog/sections/${id}`,
        payload,
      );
    },
    deleteSection(id: string) {
      return apiClient.delete<{ message: string; section: CreatedElectoralSection }>(
        `/ine-ocr/catalog/sections/${id}`,
      );
    },
    listLeaders(
      params: {
        sectionId?: string;
        coordinatorId?: string;
        q?: string;
        includeInactive?: boolean;
        page?: number;
        pageSize?: number;
      } = {},
    ) {
      const query = new URLSearchParams();
      if (params.sectionId) query.set('sectionId', params.sectionId);
      if (params.coordinatorId) query.set('coordinatorId', params.coordinatorId);
      const q = params.q?.trim();
      if (q) query.set('q', q);
      if (params.includeInactive) query.set('includeInactive', 'true');
      if (params.page !== undefined) query.set('page', String(params.page));
      if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
      const suffix = query.size ? `?${query.toString()}` : '';
      return apiClient.get<{
        leaders: ElectoralLeader[];
        totalCount?: number;
        hasNextPage?: boolean;
      }>(`/ine-ocr/catalog/leaders${suffix}`);
    },
    createLeader(payload: { sectionId: string; fullName: string } & LeaderProfilePayload) {
      return apiClient.post<LeaderCreateResponse>('/ine-ocr/catalog/leaders', payload);
    },
    updateLeader(
      id: string,
      payload: Partial<Pick<ElectoralLeader, 'sectionId' | 'fullName' | 'isActive'>> &
        LeaderProfilePayload,
    ) {
      return apiClient.patch<{ leader: CreatedElectoralLeader }>(
        `/ine-ocr/catalog/leaders/${id}`,
        payload,
      );
    },
    deleteLeader(id: string) {
      return apiClient.delete<{ message: string; leader: CreatedElectoralLeader }>(
        `/ine-ocr/catalog/leaders/${id}`,
      );
    },
    reinviteLeader(id: string) {
      return apiClient.post<LeaderReinviteResponse>(`/ine-ocr/catalog/leaders/${id}/reinvite`);
    },
  },
};
