import { Prisma, SourceChannel } from '@prisma/client';
import { AppError } from '../utils/app-error';
import { fingerprint, nameSearchTokens } from '../utils/hmac-index';
import { normalizePhoneForStorage } from '../utils/phone-normalizer';
import { advisoryLockIdFromFingerprint } from '../utils/postgres-advisory-lock';
import {
  normalizeCurp,
  normalizeVoterKey,
  sexBlindIndex,
  validateCurp,
  validateVoterKey,
} from './ine/promovido-validations';
import type { ScopeContext } from '../types/auth.types';
import { scopeWhere } from '../middlewares/scope.middleware';
import type { PromovidoData } from './promovido.service';
import type { PrismaService } from './prisma.service';

export type CreatePromovidoWithCitizenInput = {
  data: PromovidoData;
  dataEncrypted: string;
  createdByUserId: string;
  leaderId: string;
  sectionId: string;
  stateNameSnapshot: string;
  districtCodeSnapshot: string;
  sectionCodeSnapshot: string;
  leaderNameSnapshot: string;
  uploadRecordId?: string;
  requestedCitizenId?: string;
  neighborhoodId?: string;
};

type Identity = {
  voterKeyFingerprint?: string;
  curpFingerprint?: string;
};

function identityFrom(data: PromovidoData): Identity {
  const voterKey = normalizeVoterKey(data.voterKey);
  const curp = normalizeCurp(data.curp);
  const voterKeyResult = validateVoterKey(voterKey);
  const curpResult = validateCurp(curp);
  const voterKeyFingerprint = voterKeyResult.valid
    ? (fingerprint(voterKey) ?? undefined)
    : undefined;
  const curpFingerprint = curpResult.valid ? (fingerprint(curp) ?? undefined) : undefined;

  if (!voterKeyFingerprint && !curpFingerprint) {
    // Diagnóstico preciso para que el operador sepa cuál de los dos campos
    // falta o es inválido (no sólo "verificá"). El path manual exige voterKey,
    // pero el path OCR es simétrico: cualquier fingerprint sirve.
    const issues: string[] = [];
    if (!voterKeyResult.valid) {
      issues.push(
        voterKeyResult.code === 'VOTER_KEY_REQUIRED'
          ? 'falta la clave de elector'
          : `clave de elector inválida (${voterKeyResult.message})`,
      );
    }
    if (!curpResult.valid) {
      issues.push(
        curpResult.code === 'CURP_REQUIRED'
          ? 'falta la CURP'
          : `CURP inválida (${curpResult.message})`,
      );
    }
    throw AppError.badRequest(
      `No se encontró una identidad confiable: ${issues.join(' y ')}. Ingresá al menos una de las dos antes de confirmar.`,
    );
  }

  return { voterKeyFingerprint, curpFingerprint };
}

function isUniqueOrSerializationRace(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code;
  return code === 'P2002' || code === 'P2034';
}

export class PromovidoCitizenSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(data: Pick<PromovidoData, 'voterKey' | 'curp'>): Promise<{
    status: 'new' | 'existing' | 'conflict' | 'invalid';
    citizen?: { id: string; name: string | null; lastName: string | null };
  }> {
    let identity: Identity;
    try {
      identity = identityFrom(data as PromovidoData);
    } catch (error) {
      if (error instanceof AppError) return { status: 'invalid' };
      throw error;
    }
    const [voterCitizen, curpCitizen] = await Promise.all([
      identity.voterKeyFingerprint
        ? this.prisma.citizen.findUnique({
            where: { voterKeyFingerprint: identity.voterKeyFingerprint },
          })
        : null,
      identity.curpFingerprint
        ? this.prisma.citizen.findUnique({ where: { curpFingerprint: identity.curpFingerprint } })
        : null,
    ]);
    if (voterCitizen && curpCitizen && voterCitizen.id !== curpCitizen.id)
      return { status: 'conflict' };
    const citizen = voterCitizen ?? curpCitizen;
    return citizen
      ? {
          status: 'existing',
          citizen: { id: citizen.id, name: citizen.name, lastName: citizen.lastName },
        }
      : { status: 'new' };
  }

  async create(
    input: CreatePromovidoWithCitizenInput,
    scope?: ScopeContext,
  ): Promise<{ id: string; citizenId: string }> {
    const identity = identityFrom(input.data);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            if (input.uploadRecordId) {
              const confirmed = await tx.promovido.findUnique({
                where: { uploadRecordId: input.uploadRecordId },
                select: { id: true, citizenId: true },
              });
              if (confirmed?.citizenId) return { id: confirmed.id, citizenId: confirmed.citizenId };
            }

            const lockIds = [...new Set([identity.voterKeyFingerprint, identity.curpFingerprint])]
              .filter((value): value is string => Boolean(value))
              .map(advisoryLockIdFromFingerprint)
              .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
            for (const lockId of lockIds) {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
            }

            const [voterCitizen, curpCitizen, requestedCitizen] = await Promise.all([
              identity.voterKeyFingerprint
                ? tx.citizen.findUnique({
                    where: { voterKeyFingerprint: identity.voterKeyFingerprint },
                  })
                : null,
              identity.curpFingerprint
                ? tx.citizen.findUnique({ where: { curpFingerprint: identity.curpFingerprint } })
                : null,
              input.requestedCitizenId
                ? tx.citizen.findUnique({ where: { id: input.requestedCitizenId } })
                : null,
            ]);

            if (input.requestedCitizenId && !requestedCitizen) {
              throw AppError.notFound('El ciudadano seleccionado no existe.');
            }

            const resolvedIds = new Set(
              [voterCitizen?.id, curpCitizen?.id, requestedCitizen?.id].filter((id): id is string =>
                Boolean(id),
              ),
            );
            if (resolvedIds.size > 1) {
              throw AppError.conflict(
                'La clave de elector y la CURP resuelven ciudadanos distintos. Requiere revisión manual; no se fusionaron registros.',
              );
            }

            const existingCitizen = voterCitizen ?? curpCitizen ?? requestedCitizen;
            const canonicalPhone = normalizePhoneForStorage(input.data.phone ?? '');
            const phone = /^\d{10,15}$/.test(canonicalPhone) ? canonicalPhone : null;
            const name = input.data.firstName;
            const lastName = [input.data.paternalLastName, input.data.maternalLastName]
              .filter(Boolean)
              .join(' ');
            const citizen = existingCitizen
              ? await tx.citizen.update({
                  where: { id: existingCitizen.id },
                  data: {
                    voterKeyFingerprint:
                      existingCitizen.voterKeyFingerprint ?? identity.voterKeyFingerprint,
                    curpFingerprint: existingCitizen.curpFingerprint ?? identity.curpFingerprint,
                    phone: existingCitizen.phone ?? phone ?? undefined,
                    name: existingCitizen.name ?? name,
                    lastName: existingCitizen.lastName ?? lastName,
                    neighborhoodId: existingCitizen.neighborhoodId ?? input.neighborhoodId,
                    neighborhood: existingCitizen.neighborhood ?? input.data.neighborhood,
                  },
                })
              : await tx.citizen.create({
                  data: {
                    phone: phone ?? null,
                    name,
                    lastName,
                    neighborhoodId: input.neighborhoodId,
                    neighborhood: input.data.neighborhood,
                    voterKeyFingerprint: identity.voterKeyFingerprint,
                    curpFingerprint: identity.curpFingerprint,
                    sourceChannel: SourceChannel.other,
                  },
                });

            const duplicateWhere: Prisma.PromovidoWhereInput = {
              voterKeyFingerprint: identity.voterKeyFingerprint,
            };
            const scopeFilter = scopeWhere(scope, { leaderPath: 'leader' });
            if (scopeFilter) {
              Object.assign(duplicateWhere, scopeFilter);
            }

            const duplicate = await tx.promovido.findFirst({
              where: duplicateWhere,
              select: { id: true },
            });
            if (duplicate) {
              throw AppError.conflict('Esta clave de elector ya está registrada con otro líder.');
            }

            const promovido = await tx.promovido.create({
              data: {
                uploadRecordId: input.uploadRecordId,
                leaderId: input.leaderId,
                sectionId: input.sectionId,
                citizenId: citizen.id,
                createdByUserId: input.createdByUserId,
                dataEncrypted: input.dataEncrypted,
                stateNameSnapshot: input.stateNameSnapshot,
                districtCodeSnapshot: input.districtCodeSnapshot,
                sectionCodeSnapshot: input.sectionCodeSnapshot,
                leaderNameSnapshot: input.leaderNameSnapshot,
                isActive: input.data.isActive,
                voterKeyFingerprint: identity.voterKeyFingerprint,
                curpFingerprint: identity.curpFingerprint ?? null,
                phoneFingerprint: phone ? fingerprint(phone) : null,
                sexBlindIndex: sexBlindIndex(input.data.sex),
                nameSearchTokens: nameSearchTokens(
                  [input.data.firstName, input.data.paternalLastName, input.data.maternalLastName]
                    .filter(Boolean)
                    .join(' '),
                ),
              },
            });

            if (input.uploadRecordId) {
              await tx.uploadRecord.update({
                where: { id: input.uploadRecordId },
                data: { status: 'confirmed' },
              });
            }
            return { id: promovido.id, citizenId: citizen.id };
          },
          { isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel },
        );
      } catch (error) {
        const code = (error as { code?: string } | undefined)?.code;
        if (code === 'P2034' && attempt === 0) continue;
        if (isUniqueOrSerializationRace(error)) {
          throw AppError.conflict(
            'Otro registro concurrente usó esta identidad. Revisá el ciudadano y volvé a intentar.',
          );
        }
        throw error;
      }
    }
    throw AppError.conflict('No se pudo sincronizar la identidad por concurrencia.');
  }
}
