import type { Prisma, Promovido } from '@prisma/client';
import type { ScopeContext } from '../types/auth.types';
import { AppError } from '../utils/app-error';
import { decrypt, encrypt } from '../utils/crypto';
import { fingerprint, nameSearchTokens, normalizePhone } from '../utils/hmac-index';
import { advisoryLockIdFromFingerprint } from '../utils/postgres-advisory-lock';
import {
  normalizeCurp,
  normalizeName,
  normalizeSex,
  normalizeVoterKey,
  sexBlindIndex,
  validateCurpAgainstSexAndBirthDate,
  validateName,
  validatePhone,
  validateVoterKey,
  type ValidationResult,
} from './ine/promovido-validations';
import type { PrismaService } from './prisma.service';
import { PromovidoCitizenSyncService } from './promovido-citizen-sync.service';
import { scopeWhere } from '../middlewares/scope.middleware';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type PromovidoIdentity = {
  firstName: string;
  paternalLastName: string;
  maternalLastName?: string;
  birthDate?: string;
  sex?: 'H' | 'M';
  curp: string;
  voterKey: string;
};

export type PromovidoAddress = {
  address?: string;
  neighborhood?: string;
  locality?: string;
  municipality?: string;
  state?: string;
  neighborhoodId?: string;
};

export type PromovidoManagement = {
  sectionId: string;
  leaderId: string;
  phone?: string;
  isActive: boolean;
  observations?: string;
};

export type PromovidoData = PromovidoIdentity & PromovidoAddress & PromovidoManagement;

export type PromovidoListFilters = {
  q?: string;
  leaderId?: string;
  sex?: 'H' | 'M';
  sectionId?: string;
  isActive?: boolean;
};

export type PromovidoListResult = {
  items: PromovidoView[];
  totalCount: number;
  hasNextPage: boolean;
};

export type PromovidoView = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
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
  data: PromovidoData;
};

/**
 * Datos de la credencial que el OCR extrae pero que no forman parte de
 * `PromovidoData`: viven en el blob revisado del `UploadRecord`.
 */
export type PromovidoCredential = {
  validUntil?: string;
  registrationYear?: string;
  postalCode?: string;
  electoralSection?: string;
};

export type PromovidoDetailView = Omit<PromovidoView, 'leader' | 'section' | 'citizen'> & {
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

export type VoterKeyConflict = {
  promovidoId: string;
  leaderName: string;
  sectionCode: string;
  isActive: boolean;
};

export type CreatePromovidoInput = PromovidoIdentity &
  PromovidoAddress &
  Omit<PromovidoManagement, 'isActive'> & {
    citizenId?: string;
    isActive?: boolean;
  };

export type UpdatePromovidoInput = Partial<PromovidoIdentity> &
  Partial<PromovidoAddress> &
  Partial<PromovidoManagement> & {
    citizenId?: string | null;
  };

// ── Helpers ───────────────────────────────────────────────────────────────────

function protect(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

function reveal<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  return JSON.parse(decrypt(value)) as T;
}

function toView(
  row: Promovido & {
    leader: { id: string; fullName: string };
    section: { id: string; sectionCode: string };
    citizen: {
      id: string;
      name: string | null;
      lastName: string | null;
      phone: string | null;
    } | null;
  },
): PromovidoView {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isActive: row.isActive,
    leader: row.leader,
    section: row.section,
    citizen: row.citizen,
    uploadRecordId: row.uploadRecordId,
    data: reveal<PromovidoData>(row.dataEncrypted) ?? ({} as PromovidoData),
  };
}

function validateInput(data: Partial<PromovidoData>): ValidationResult {
  const nameResult = validateName(data.firstName, data.paternalLastName);
  if (!nameResult.valid) return nameResult;

  const voterResult = validateVoterKey(data.voterKey);
  if (!voterResult.valid) return voterResult;

  const curpResult = validateCurpAgainstSexAndBirthDate(data.curp, data.sex, data.birthDate);
  if (!curpResult.valid) return curpResult;

  if (data.phone) {
    const phoneResult = validatePhone(data.phone);
    if (!phoneResult.valid) return phoneResult;
  }

  return { valid: true };
}

function normalizeData(data: Partial<PromovidoData>): Partial<PromovidoData> {
  return {
    ...data,
    firstName: normalizeName(data.firstName),
    paternalLastName: normalizeName(data.paternalLastName),
    maternalLastName: data.maternalLastName ? normalizeName(data.maternalLastName) : undefined,
    curp: normalizeCurp(data.curp),
    voterKey: normalizeVoterKey(data.voterKey),
    phone: data.phone ? (normalizePhone(data.phone) ?? data.phone) : undefined,
    sex: normalizeSex(data.sex) ?? undefined,
  };
}

function storageData(data: Partial<PromovidoData>): Partial<PromovidoData> {
  return {
    ...data,
    phone: data.phone ? (normalizePhone(data.phone) ?? undefined) : undefined,
  };
}

// ── Servicio ──────────────────────────────────────────────────────────────────

export class PromovidoService {
  private readonly sync: PromovidoCitizenSyncService;

  constructor(private readonly prisma: PrismaService) {
    this.sync = new PromovidoCitizenSyncService(prisma);
  }

  async list(
    params: PromovidoListFilters & { page: number; pageSize: number },
    scope?: ScopeContext,
  ): Promise<PromovidoListResult> {
    const { page, pageSize } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.PromovidoWhereInput = {};

    if (params.leaderId) where.leaderId = params.leaderId;
    if (params.sectionId) where.sectionId = params.sectionId;
    if (params.isActive !== undefined) where.isActive = params.isActive;
    if (params.sex) {
      const sexHash = sexBlindIndex(params.sex);
      if (sexHash) where.sexBlindIndex = sexHash;
    }

    if (params.q) {
      const q = normalizeName(params.q);
      const phoneNormalized = normalizePhone(params.q);
      const voterNormalized = normalizeVoterKey(params.q);
      const curpNormalized = normalizeCurp(params.q);

      const orConditions: Prisma.PromovidoWhereInput[] = [];

      if (phoneNormalized) {
        orConditions.push({ phoneFingerprint: fingerprint(phoneNormalized) });
      }
      if (voterNormalized) {
        orConditions.push({ voterKeyFingerprint: fingerprint(voterNormalized) });
      }
      if (curpNormalized) {
        orConditions.push({ curpFingerprint: fingerprint(curpNormalized) });
      }

      const nameTokens = nameSearchTokens(q);
      if (nameTokens.length) {
        orConditions.push({ nameSearchTokens: { hasSome: nameTokens } });
      }

      if (orConditions.length) where.OR = orConditions;
    }

    const scopeFilter = scopeWhere(scope);
    if (scopeFilter) {
      Object.assign(where, scopeFilter);
    }

    const [items, totalCount] = await Promise.all([
      this.prisma.promovido.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize + 1,
        include: {
          leader: { select: { id: true, fullName: true } },
          section: { select: { id: true, sectionCode: true } },
          citizen: { select: { id: true, name: true, lastName: true, phone: true } },
        },
      }),
      this.prisma.promovido.count({ where }),
    ]);

    const hasNextPage = items.length > pageSize;
    const visibleItems = items.slice(0, pageSize);

    return { items: visibleItems.map(toView), totalCount, hasNextPage };
  }

  async getById(id: string, scope?: ScopeContext): Promise<PromovidoView> {
    const include = {
      leader: { select: { id: true, fullName: true } },
      section: { select: { id: true, sectionCode: true } },
      citizen: { select: { id: true, name: true, lastName: true, phone: true } },
    };
    const scopeFilter = scopeWhere(scope);
    const row = scopeFilter
      ? await this.prisma.promovido.findFirst({
          where: { id, ...scopeFilter },
          include,
        })
      : await this.prisma.promovido.findUnique({
          where: { id },
          include,
        });
    if (!row) throw AppError.notFound('Promovido not found');
    return toView(row);
  }

  /**
   * Vista de expediente: agrega estado/distrito, el contacto del líder, el
   * correo del ciudadano y los campos de credencial que solo existen en el blob
   * revisado del OCR.
   */
  async getDetailById(id: string, scope?: ScopeContext): Promise<PromovidoDetailView> {
    const include = {
      leader: { select: { id: true, fullName: true, phone: true, email: true } },
      section: {
        select: {
          id: true,
          sectionCode: true,
          state: { select: { id: true, name: true } },
          district: { select: { id: true, code: true, name: true } },
        },
      },
      citizen: {
        select: { id: true, name: true, lastName: true, phone: true, email: true },
      },
      uploadRecord: { select: { reviewedDataEncrypted: true } },
    };
    const scopeFilter = scopeWhere(scope);
    const row = scopeFilter
      ? await this.prisma.promovido.findFirst({
          where: { id, ...scopeFilter },
          include,
        })
      : await this.prisma.promovido.findUnique({
          where: { id },
          include,
        });
    if (!row) throw AppError.notFound('Promovido not found');

    const data = reveal<PromovidoData>(row.dataEncrypted) ?? ({} as PromovidoData);
    // Los promovidos confirmados antes de la unificación de shapes guardan el
    // blob OCR en `dataEncrypted`, así que también sirve como origen.
    const reviewed = reveal<Record<string, unknown>>(row.uploadRecord?.reviewedDataEncrypted) ?? {};
    const legacy = data as unknown as Record<string, unknown>;
    const pick = (key: keyof PromovidoCredential): string | undefined => {
      const value = reviewed[key] ?? legacy[key];
      return typeof value === 'string' && value.trim() ? value : undefined;
    };

    return {
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isActive: row.isActive,
      leader: row.leader,
      section: row.section,
      citizen: row.citizen,
      uploadRecordId: row.uploadRecordId,
      data,
      origin: row.uploadRecordId ? 'ocr' : 'manual',
      credential: {
        validUntil: pick('validUntil'),
        registrationYear: pick('registrationYear'),
        postalCode: pick('postalCode'),
        electoralSection: pick('electoralSection') ?? row.section.sectionCode,
      },
    };
  }

  async checkVoterKeyConflict(
    voterKey: string,
    excludeId?: string,
  ): Promise<VoterKeyConflict | null> {
    const normalized = normalizeVoterKey(voterKey);
    const fingerprintValue = fingerprint(normalized);
    if (!fingerprintValue) return null;

    const row = await this.prisma.promovido.findFirst({
      where: {
        voterKeyFingerprint: fingerprintValue,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      include: {
        leader: { select: { fullName: true } },
        section: { select: { sectionCode: true } },
      },
    });

    if (!row) return null;
    return {
      promovidoId: row.id,
      leaderName: row.leader.fullName,
      sectionCode: row.section.sectionCode,
      isActive: row.isActive,
    };
  }

  async create(
    input: CreatePromovidoInput,
    createdByUserId: string,
    scope?: ScopeContext,
  ): Promise<PromovidoView> {
    const normalized = normalizeData(input) as PromovidoData;
    normalized.isActive = input.isActive ?? true;

    if (!normalized.phone) {
      throw AppError.badRequest('El teléfono es obligatorio en la captura manual.');
    }

    const validation = validateInput(normalized);
    if (!validation.valid) throw AppError.badRequest(validation.message);

    await this.assertLeaderInScope(scope, normalized.leaderId);
    await this.assertCatalogRelations(normalized.sectionId, normalized.leaderId);
    const selectedNeighborhood = await this.assertNeighborhoodRelation(
      normalized.sectionId,
      input.neighborhoodId,
    );
    if (selectedNeighborhood) normalized.neighborhood = selectedNeighborhood.name;

    // Asimetría intencional vs. el path OCR (confirm() -> sync.create()):
    // la captura manual SIEMPRE exige voterKey, mientras que el path OCR acepta
    // voterKey XOR curp. En OCR el operador no tipea todo de cero, por eso se tolera
    // más flexibilidad; en manual la clave de elector es la identidad canónica.
    const voterKeyFingerprint = fingerprint(normalized.voterKey);
    if (!voterKeyFingerprint) throw AppError.badRequest('La clave de elector no es válida.');

    const conflict = await this.checkVoterKeyConflict(normalized.voterKey);
    if (conflict)
      throw AppError.conflict('Esta clave de elector ya está registrada con otro líder.');

    const data: PromovidoData = {
      ...storageData(normalized),
      sectionId: normalized.sectionId,
      leaderId: normalized.leaderId,
    } as PromovidoData;
    const created = await this.sync.create(
      {
        data,
        dataEncrypted: protect(data),
        createdByUserId,
        leaderId: normalized.leaderId,
        sectionId: normalized.sectionId,
        stateNameSnapshot: await this.resolveStateName(normalized.sectionId),
        districtCodeSnapshot: await this.resolveDistrictCode(normalized.sectionId),
        sectionCodeSnapshot: await this.resolveSectionCode(normalized.sectionId),
        leaderNameSnapshot: await this.resolveLeaderName(normalized.leaderId),
        requestedCitizenId: input.citizenId,
        neighborhoodId: input.neighborhoodId,
      },
      scope,
    );
    return this.getById(created.id, scope);
  }

  async update(id: string, input: UpdatePromovidoInput, scope?: ScopeContext): Promise<PromovidoView> {
    if (input.citizenId === null) {
      throw AppError.badRequest('Un promovido no puede quedar sin vínculo con un ciudadano.');
    }
    const existing = scopeWhere(scope)
      ? await this.prisma.promovido.findFirst({
          where: { id, ...scopeWhere(scope) },
          include: {
            leader: { select: { id: true, fullName: true } },
            section: { select: { id: true, sectionCode: true } },
          },
        })
      : await this.prisma.promovido.findUnique({
          where: { id },
          include: {
            leader: { select: { id: true, fullName: true } },
            section: { select: { id: true, sectionCode: true } },
          },
        });
    if (!existing) throw AppError.notFound('Promovido not found');

    const currentData = reveal<PromovidoData>(existing.dataEncrypted) ?? ({} as PromovidoData);
    const merged = normalizeData({ ...currentData, ...input }) as PromovidoData;

    const validation = validateInput(merged);
    if (!validation.valid) throw AppError.badRequest(validation.message);

    const sectionId = input.sectionId ?? existing.sectionId;
    const leaderId = input.leaderId ?? existing.leaderId;
    await this.assertLeaderInScope(scope, leaderId);
    await this.assertCatalogRelations(sectionId, leaderId);
    const selectedNeighborhood = await this.assertNeighborhoodRelation(
      sectionId,
      input.neighborhoodId ?? currentData.neighborhoodId,
    );
    if (input.neighborhoodId && selectedNeighborhood)
      merged.neighborhood = selectedNeighborhood.name;

    const voterKeyFingerprint = fingerprint(merged.voterKey);
    if (!voterKeyFingerprint) throw AppError.badRequest('La clave de elector no es válida.');

    const conflict = await this.checkVoterKeyConflict(merged.voterKey, id);
    if (conflict)
      throw AppError.conflict('Esta clave de elector ya está registrada con otro líder.');

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryLockIdFromFingerprint(voterKeyFingerprint)})`;

        const duplicate = await tx.promovido.findFirst({
          where: { voterKeyFingerprint, id: { not: id } },
          select: { id: true },
        });
        if (duplicate) throw AppError.conflict('Esta clave de elector ya está registrada.');

        const data: PromovidoData = {
          ...storageData(merged),
          sectionId,
          leaderId,
        } as PromovidoData;

        const row = await tx.promovido.update({
          where: { id },
          data: {
            leaderId,
            sectionId,
            citizenId: input.citizenId ?? existing.citizenId,
            dataEncrypted: protect(data),
            stateNameSnapshot: input.sectionId
              ? await this.resolveStateName(sectionId)
              : existing.stateNameSnapshot,
            districtCodeSnapshot: input.sectionId
              ? await this.resolveDistrictCode(sectionId)
              : existing.districtCodeSnapshot,
            sectionCodeSnapshot: input.sectionId
              ? await this.resolveSectionCode(sectionId)
              : existing.sectionCodeSnapshot,
            leaderNameSnapshot: input.leaderId
              ? await this.resolveLeaderName(leaderId)
              : existing.leaderNameSnapshot,
            isActive: input.isActive ?? existing.isActive,
            voterKeyFingerprint,
            curpFingerprint: fingerprint(merged.curp) ?? null,
            phoneFingerprint: merged.phone ? (fingerprint(merged.phone) ?? null) : null,
            sexBlindIndex: sexBlindIndex(merged.sex),
            nameSearchTokens: nameSearchTokens(
              [merged.firstName, merged.paternalLastName, merged.maternalLastName]
                .filter(Boolean)
                .join(' '),
            ),
          },
          include: {
            leader: { select: { id: true, fullName: true } },
            section: { select: { id: true, sectionCode: true } },
            citizen: { select: { id: true, name: true, lastName: true, phone: true } },
          },
        });
        if (input.neighborhoodId !== undefined) {
          const citizenId = input.citizenId ?? existing.citizenId;
          if (citizenId) {
            await tx.citizen.update({
              where: { id: citizenId },
              data: { neighborhoodId: input.neighborhoodId, neighborhood: data.neighborhood },
            });
          }
        }
        return row;
      });

      return toView(row);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') throw AppError.conflict('Esta clave de elector ya está registrada.');
      throw error;
    }
  }

  // ── Catalog helpers ─────────────────────────────────────────────────────────

  private async assertCatalogRelations(sectionId: string, leaderId: string): Promise<void> {
    const [section, leader] = await Promise.all([
      this.prisma.section.findUnique({
        where: { id: sectionId },
        include: { state: true, district: true },
      }),
      this.prisma.leader.findUnique({ where: { id: leaderId } }),
    ]);

    if (!section) throw AppError.badRequest('La sección seleccionada no existe.');
    if (!section.isActive || !section.state.isActive || !section.district.isActive) {
      throw AppError.badRequest('La sección seleccionada no está activa.');
    }

    if (!leader) throw AppError.badRequest('El líder seleccionado no existe.');
    if (!leader.isActive) throw AppError.badRequest('El líder seleccionado no está activo.');
    if (leader.sectionId !== sectionId) {
      throw AppError.badRequest('El líder no pertenece a la sección seleccionada.');
    }
  }

  private async assertNeighborhoodRelation(
    sectionId: string,
    neighborhoodId?: string,
  ): Promise<{ name: string } | undefined> {
    if (!neighborhoodId) return undefined;
    const neighborhood = await this.prisma.neighborhood.findUnique({
      where: { id: neighborhoodId },
      select: { name: true, sectionId: true },
    });
    if (!neighborhood) throw AppError.badRequest('La colonia seleccionada no existe.');
    if (neighborhood.sectionId !== null && neighborhood.sectionId !== sectionId) {
      throw AppError.badRequest('La colonia seleccionada no pertenece a la sección seleccionada.');
    }
    return neighborhood;
  }

  private async resolveStateName(sectionId: string): Promise<string> {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { state: true },
    });
    return section?.state.name ?? '';
  }

  private async resolveDistrictCode(sectionId: string): Promise<string> {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { district: true },
    });
    return section?.district.code ?? '';
  }

  private async resolveSectionCode(sectionId: string): Promise<string> {
    const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
    return section?.sectionCode ?? '';
  }

  private async resolveLeaderName(leaderId: string): Promise<string> {
    const leader = await this.prisma.leader.findUnique({ where: { id: leaderId } });
    return leader?.fullName ?? '';
  }

  private async assertLeaderInScope(scope: ScopeContext | undefined, leaderId: string): Promise<void> {
    if (!scope || scope.kind === 'admin') return;
    if (scope.kind === 'leader' && scope.leaderId !== leaderId) {
      throw AppError.notFound('Promovido not found');
    }
    if (scope.kind === 'coordinator') {
      const leader = await this.prisma.leader.findUnique({
        where: { id: leaderId },
        select: { coordinatorId: true },
      });
      if (!leader || leader.coordinatorId !== scope.coordinatorId) {
        throw AppError.notFound('Promovido not found');
      }
    }
  }
}
