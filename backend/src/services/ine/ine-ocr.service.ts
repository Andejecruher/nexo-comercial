import type {
  ElectoralDistrict,
  ElectoralState,
  IneAssetSide,
  IneOcrJobStatus,
  IneUploadStatus,
  Leader,
  Prisma,
  Section,
} from '@prisma/client';
import crypto from 'crypto';
import { env } from '../../config/env.config';
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '../../database/transaction-options';
import type { UserRepository } from '../../repositories/user.repository';
import type { ScopeContext } from '../../types/auth.types';
import { AppError } from '../../utils/app-error';
import { decrypt, encrypt } from '../../utils/crypto';
import { normalizePhone } from '../../utils/hmac-index';
import { createStructuredLogger } from '../../utils/structured-logger';
import { AuthorizationService } from '../authorization.service';
import type { EmailService } from '../email/email.service';
import { formatExpiration } from '../email/format';
import {
  buildActivationUrlFromToken,
  persistPendingUserWithInvitation,
  preparePendingUserInvitation,
} from '../entity-provisioning.service';
import {
  buildActivationUrl,
  generateInvitationToken,
  hashInvitationToken,
} from '../invitations/invitation-token';
import { NeighborhoodMatchService } from '../neighborhood-match.service';
import type { PrismaService } from '../prisma.service';
import { PromovidoCitizenSyncService } from '../promovido-citizen-sync.service';
import type { PromovidoData } from '../promovido.service';
import type {
  BackgroundTaskDispatcher,
  BackgroundTaskResult,
} from '../tasks/cloud-tasks-dispatcher.service';
import {
  assertSupportedFileStorageProvider,
  UnsupportedFileStorageProviderError,
  type FileStorageProvider,
} from './file-storage.provider';
import { GoogleConfigurationError, GoogleProviderError } from './google-auth';
import { GoogleDocumentAiOcrProvider } from './google-document-ai-ocr.provider';
import { GCSFileStorageProvider } from './gcs-file-storage.provider';
import {
  flattenIneFields,
  parseIneDocument,
  type IneNormalizedFields,
  type IneParsedFields,
} from './ine-parser';
import type { OcrProvider } from './ocr.provider';

const log = createStructuredLogger('IneOcrService');

export type IneUploadAsset = {
  side: 'front' | 'back';
  filename: string;
  mimeType: string;
  contents: Buffer;
};

type ReviewedData = IneNormalizedFields & { manualPhone?: string; neighborhoodId?: string };

export type IneUploadView = {
  id: string;
  status: IneUploadStatus;
  createdAt: Date;
  files: Array<{
    id: string;
    side: IneAssetSide;
    mimeType: string;
    originalFilename: string | null;
    job?: {
      status: IneOcrJobStatus;
      attempt: number;
      lastErrorCode: string | null;
    };
  }>;
  fields: ReviewedData;
  rescanFields?: IneNormalizedFields;
  validation: Prisma.JsonValue[];
  sectionCandidates: Array<{
    id: string;
    state: string;
    district: string;
    sectionCode: string;
    leaders: Array<{ id: string; fullName: string }>;
  }>;
  rescanSectionCandidates?: Array<{
    id: string;
    state: string;
    district: string;
    sectionCode: string;
    leaders: Array<{ id: string; fullName: string }>;
  }>;
  reviewedSection?: {
    id: string;
    state: string;
    district: string;
    sectionCode: string;
  };
  leader?: { id: string; fullName: string };
  promovidoId?: string;
  crmPreview?: {
    status: 'new' | 'existing' | 'conflict' | 'invalid';
    citizen?: { id: string; name: string | null; lastName: string | null };
  };
};

type IneSectionCandidate = IneUploadView['sectionCandidates'][number];

type DistrictWithState = Prisma.ElectoralDistrictGetPayload<{
  include: { state: { select: { id: true; name: true } } };
}>;

type SectionWithCatalog = Prisma.SectionGetPayload<{
  include: {
    state: { select: { id: true; name: true } };
    district: { select: { id: true; code: true } };
    leaders: true;
  };
}>;

const leaderInclude = {
  section: {
    select: {
      id: true,
      sectionCode: true,
      state: { select: { id: true, name: true } },
      district: { select: { id: true, code: true } },
    },
  },
  neighborhood: { select: { id: true, name: true } },
  coordinator: { select: { id: true, fullName: true } },
  user: { select: { id: true, email: true, isActive: true } },
};

type LeaderWithSection = Prisma.LeaderGetPayload<{ include: typeof leaderInclude }>;

type LeaderInvitationDto = { id: string; status: string; expiresAt: Date };

export type CreateLeaderResult = {
  leader: LeaderWithSection;
  invitation?: LeaderInvitationDto;
  warning?: { code: string; message: string };
};

export type LeaderRole = 'PROMOTOR_BARRIO' | 'ENLACE_TERRITORIAL';

export type LeaderProfileInput = {
  coordinatorId?: string;
  neighborhoodId?: string | null;
  phone?: string | null;
  email?: string;
  promovidoQuota?: number | null;
  role?: LeaderRole;
};

type PromovidoView = Omit<
  Prisma.PromovidoGetPayload<{
    include: {
      leader: { select: { id: true; fullName: true } };
      citizen: { select: { id: true; name: true; lastName: true; phone: true } };
    };
  }>,
  'dataEncrypted'
> & {
  data: ReviewedData | undefined;
  dataEncrypted?: undefined;
};

type CitizenCandidate = Prisma.CitizenGetPayload<{
  select: { id: true; name: true; lastName: true; phone: true; email: true };
}>;

const allowedMimeTypes = new Set(
  env.INE_UPLOAD_ALLOWED_MIME_TYPES.split(',').map((value) => value.trim()),
);

function protect(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

function reveal<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  return JSON.parse(decrypt(value)) as T;
}

function safeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-200) || 'document';
}

function normalize(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .toUpperCase()
    .trim();
}

export class IneOcrService {
  private readonly sync: PromovidoCitizenSyncService;
  private readonly neighborhoodMatches: NeighborhoodMatchService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageProvider,
    private readonly ocr: OcrProvider,
    private readonly taskDispatcher?: BackgroundTaskDispatcher,
    private readonly userRepository?: UserRepository,
    private readonly emailService?: EmailService,
  ) {
    this.sync = new PromovidoCitizenSyncService(prisma);
    this.neighborhoodMatches = new NeighborhoodMatchService(prisma);
  }

  static createDefault(
    prisma: PrismaService,
    taskDispatcher?: BackgroundTaskDispatcher,
    userRepository?: UserRepository,
    emailService?: EmailService,
  ): IneOcrService {
    return new IneOcrService(
      prisma,
      new GCSFileStorageProvider(),
      new GoogleDocumentAiOcrProvider(),
      taskDispatcher,
      userRepository,
      emailService,
    );
  }

  async createUpload(createdByUserId: string, assets: IneUploadAsset[]): Promise<IneUploadView> {
    if (
      !assets.length ||
      assets.length > 2 ||
      new Set(assets.map((asset) => asset.side)).size !== assets.length
    ) {
      throw AppError.badRequest('Provide one front file, one back file, or both');
    }
    for (const asset of assets) {
      if (
        !allowedMimeTypes.has(asset.mimeType) ||
        asset.contents.byteLength > env.INE_UPLOAD_MAX_BYTES
      ) {
        throw AppError.badRequest('Unsupported file type or file exceeds the configured limit');
      }
    }

    const uploadId = crypto.randomUUID();
    const jobIds: string[] = [];
    const uploaded = [] as Array<
      IneUploadAsset & {
        storageProvider: string;
        storageObjectId: string;
        storageFolderId: string;
        storagePath: string;
        storageDriveId: string | null;
        checksumSha256: string;
      }
    >;
    try {
      for (const asset of assets) {
        const filename = safeFilename(asset.filename);
        // GCS object names use this prefix; no folder creation is needed.
        const folderPath = ['INE', uploadId];
        const storagePath = `${folderPath.join('/')}/${asset.side}-${filename}`;
        const stored = await this.storage.put({
          ...asset,
          filename,
          path: storagePath,
          folderPath,
        });
        uploaded.push({
          ...asset,
          storageProvider: stored.provider,
          storageObjectId: stored.objectId,
          storageFolderId: stored.folderId,
          storagePath: stored.path,
          storageDriveId: stored.driveId ?? null,
          checksumSha256: crypto.createHash('sha256').update(asset.contents).digest('hex'),
        });
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.uploadRecord.create({ data: { id: uploadId, status: 'queued', createdByUserId } });
        for (const asset of uploaded) {
          const file = await tx.storedFile.create({
            data: {
              uploadRecordId: uploadId,
              side: asset.side,
              storageProvider: asset.storageProvider,
              storageObjectId: asset.storageObjectId,
              storageFolderId: asset.storageFolderId,
              storagePath: asset.storagePath,
              storageDriveId: asset.storageDriveId ?? '',
              mimeType: asset.mimeType,
              fileSizeBytes: BigInt(asset.contents.byteLength),
              originalFilename: safeFilename(asset.filename),
              checksumSha256: asset.checksumSha256,
            },
          });
          const job = await tx.ineOcrJob.create({
            data: { storedFileId: file.id, maxAttempts: env.INE_OCR_JOB_MAX_ATTEMPTS },
          });
          jobIds.push(job.id);
        }
      });
    } catch (error) {
      await this.compensateUploadedObjects(uploaded.map((asset) => asset.storageObjectId));
      throw error;
    }
    await this.dispatchOcrJobs(jobIds);
    return this.getUpload(uploadId);
  }

  async getUpload(id: string): Promise<IneUploadView> {
    const upload = await this.prisma.uploadRecord.findUnique({
      where: { id },
      include: {
        files: {
          include: {
            jobs: { orderBy: { createdAt: 'desc' }, take: 1 },
            extractions: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
        section: { include: { state: true, district: true } },
        leader: true,
        promovido: { select: { id: true } },
      },
    });
    if (!upload) throw AppError.notFound('INE upload not found');
    const extracted = upload.files.reduce<IneNormalizedFields>((fields, file) => {
      const result = reveal<{ fields: IneNormalizedFields }>(
        file.extractions[0]?.normalizedResultEncrypted,
      );
      return { ...fields, ...result?.fields };
    }, {});
    const reviewed = reveal<ReviewedData>(upload.reviewedDataEncrypted);
    const candidates = await this.sectionCandidates(reviewed ?? extracted);
    const hasPendingRescan = Boolean(
      reviewed &&
      upload.reviewedAt &&
      upload.files.some(
        (file) =>
          file.extractions[0]?.createdAt && file.extractions[0].createdAt > upload.reviewedAt!,
      ),
    );
    const rescanFields = hasPendingRescan ? extracted : undefined;
    const previewData = reviewed ?? extracted;
    const crmPreview = await this.sync.preview({
      voterKey: previewData.voterKey ?? '',
      curp: previewData.curp ?? '',
    });
    return {
      id: upload.id,
      status: upload.status,
      createdAt: upload.createdAt,
      files: upload.files.map((file) => ({
        id: file.id,
        side: file.side,
        mimeType: file.mimeType,
        originalFilename: file.originalFilename,
        job: file.jobs[0]
          ? {
              status: file.jobs[0].status,
              attempt: file.jobs[0].attempt,
              lastErrorCode: file.jobs[0].lastErrorCode,
            }
          : undefined,
      })),
      fields: reviewed ?? extracted,
      rescanFields,
      validation: upload.files
        .map((file) => file.extractions[0]?.validationSummary)
        .filter(Boolean),
      sectionCandidates: candidates,
      rescanSectionCandidates: rescanFields
        ? await this.sectionCandidates(rescanFields)
        : undefined,
      reviewedSection: upload.section
        ? {
            id: upload.section.id,
            state: upload.section.state.name,
            district: upload.section.district.code,
            sectionCode: upload.section.sectionCode,
          }
        : undefined,
      leader: upload.leader
        ? { id: upload.leader.id, fullName: upload.leader.fullName }
        : undefined,
      promovidoId: upload.promovido?.id,
      crmPreview,
    };
  }

  async reviewUpload(
    id: string,
    userId: string,
    input: {
      sectionId: string;
      leaderId: string;
      manualPhone?: string;
      neighborhoodId?: string;
      fields: IneNormalizedFields;
    },
  ): Promise<IneUploadView> {
    const upload = await this.prisma.uploadRecord.findUnique({
      where: { id },
      include: { files: { include: { extractions: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
    });
    if (!upload) throw AppError.notFound('INE upload not found');
    if (upload.status !== 'review_ready') throw AppError.conflict('Upload is not ready for review');
    const extracted = upload.files.reduce<IneNormalizedFields>(
      (fields, file) => ({
        ...fields,
        ...reveal<{ fields: IneNormalizedFields }>(file.extractions[0]?.normalizedResultEncrypted)
          ?.fields,
      }),
      {},
    );
    const reviewedFields = { ...extracted, ...input.fields };

    // Fallback manual-override rule:
    //   - If the OCR detected a section, the manual selection must still match one of
    //     the resolved candidates (protects against picking a section unrelated to the
    //     scanned document).
    //   - If the OCR did NOT detect a section (partial scan, blurry image, manual
    //     correction), the manually chosen `sectionId` is authoritative. We still
    //     validate leader↔section consistency below and rely on the FK on
    //     `uploadRecord.sectionId` to reject non-existent ids.
    const hasOcrSection =
      typeof extracted.electoralSection === 'string' &&
      extracted.electoralSection.trim().length > 0;

    if (hasOcrSection) {
      const candidateIds = new Set(
        (await this.sectionCandidates(reviewedFields)).map((candidate) => candidate.id),
      );
      if (!candidateIds.has(input.sectionId))
        throw AppError.badRequest(
          'Selected section is not resolved by this OCR result. ' +
            'Si el escaneo fue parcial, reescaná la credencial o elegí una sección manualmente.',
        );
    }
    const leader = await this.prisma.leader.findFirst({
      where: { id: input.leaderId, sectionId: input.sectionId, isActive: true },
    });
    if (!leader)
      throw AppError.badRequest('Selected leader is not active for the resolved section');
    const selectedNeighborhood = await this.assertNeighborhoodRelation(
      input.sectionId,
      input.neighborhoodId,
    );
    if (selectedNeighborhood) reviewedFields.neighborhood = selectedNeighborhood.name;
    await this.prisma.uploadRecord.update({
      where: { id },
      data: {
        sectionId: input.sectionId,
        leaderId: input.leaderId,
        manualPhoneEncrypted: input.manualPhone ? protect(input.manualPhone) : null,
        reviewedDataEncrypted: protect({
          ...reviewedFields,
          ...(input.manualPhone ? { manualPhone: input.manualPhone } : {}),
          ...(input.neighborhoodId ? { neighborhoodId: input.neighborhoodId } : {}),
        }),
        reviewedAt: new Date(),
        reviewedByUserId: userId,
      },
    });
    return this.getUpload(id);
  }

  async resolveSectionCandidates(
    uploadId: string,
    fields: IneNormalizedFields,
  ): Promise<IneSectionCandidate[]> {
    const upload = await this.prisma.uploadRecord.findUnique({
      where: { id: uploadId },
      include: { files: { include: { extractions: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
    });
    if (!upload) throw AppError.notFound('INE upload not found');
    if (upload.status !== 'review_ready') throw AppError.conflict('Upload is not ready for review');
    const extracted = upload.files.reduce<IneNormalizedFields>(
      (current, file) => ({
        ...current,
        ...reveal<{ fields: IneNormalizedFields }>(file.extractions[0]?.normalizedResultEncrypted)
          ?.fields,
      }),
      {},
    );
    return this.sectionCandidates({ ...extracted, ...fields });
  }

  async matchNeighborhood(input: {
    rawValue: string;
    sectionId?: string;
    municipality?: string;
    postalCode?: string;
  }): Promise<Awaited<ReturnType<NeighborhoodMatchService['match']>>> {
    return this.neighborhoodMatches.match(input);
  }

  async confirm(id: string, createdByUserId: string, citizenId?: string): Promise<{ id: string }> {
    const upload = await this.prisma.uploadRecord.findUnique({
      where: { id },
      include: { section: { include: { state: true, district: true } }, leader: true },
    });
    if (!upload) throw AppError.notFound('INE upload not found');
    const { section, leader, sectionId, leaderId, reviewedDataEncrypted } = upload;
    if (!section || !leader || !sectionId || !leaderId || !reviewedDataEncrypted)
      throw AppError.badRequest('Upload must be reviewed before confirmation');

    const reviewed = reveal<ReviewedData>(reviewedDataEncrypted);
    if (!reviewed) throw AppError.badRequest('No hay datos revisados para confirmar.');
    if (!reviewed.firstName?.trim() || !reviewed.paternalLastName?.trim())
      throw AppError.badRequest(
        'Falta el nombre o el apellido paterno. Completalos antes de confirmar.',
      );
    const data: PromovidoData = {
      firstName: reviewed.firstName ?? '',
      paternalLastName: reviewed.paternalLastName ?? '',
      maternalLastName: reviewed.maternalLastName,
      birthDate: reviewed.birthDate,
      sex: reviewed.sex === 'H' || reviewed.sex === 'M' ? reviewed.sex : undefined,
      curp: reviewed.curp ?? '',
      voterKey: reviewed.voterKey ?? '',
      address: reviewed.address,
      neighborhood: reviewed.neighborhood,
      neighborhoodId: reviewed.neighborhoodId,
      locality: reviewed.locality,
      municipality: reviewed.municipality,
      state: reviewed.state,
      sectionId,
      leaderId,
      phone: normalizePhone(reviewed.manualPhone) ?? undefined,
      isActive: true,
    };
    const promovido = await this.sync.create({
      data,
      dataEncrypted: protect(data),
      createdByUserId,
      leaderId,
      sectionId,
      stateNameSnapshot: section.state.name,
      districtCodeSnapshot: section.district.code,
      sectionCodeSnapshot: section.sectionCode,
      leaderNameSnapshot: leader.fullName,
      uploadRecordId: id,
      requestedCitizenId: citizenId,
      neighborhoodId: reviewed.neighborhoodId,
    });
    return { id: promovido.id };
  }

  async getPromovido(id: string): Promise<PromovidoView> {
    const promovido = await this.prisma.promovido.findUnique({
      where: { id },
      include: {
        leader: { select: { id: true, fullName: true } },
        citizen: { select: { id: true, name: true, lastName: true, phone: true } },
      },
    });
    if (!promovido) throw AppError.notFound('Promovido not found');
    return {
      ...promovido,
      data: reveal<ReviewedData>(promovido.dataEncrypted),
      dataEncrypted: undefined,
    };
  }

  async searchCandidates(uploadId: string): Promise<CitizenCandidate[]> {
    const upload = await this.prisma.uploadRecord.findUnique({ where: { id: uploadId } });
    if (!upload) throw AppError.notFound('INE upload not found');
    const data = reveal<ReviewedData>(upload.reviewedDataEncrypted);
    if (!data) throw AppError.badRequest('Upload must be reviewed before searching candidates');
    const terms = [
      data.firstName,
      data.paternalLastName,
      data.maternalLastName,
      data.manualPhone,
    ].filter(Boolean) as string[];
    if (!terms.length) return [];
    return this.prisma.citizen.findMany({
      where: {
        OR: terms.flatMap((term) => {
          const phone = term.replace(/\D/g, '');
          return [
            ...(phone ? [{ phone: { contains: phone } }] : []),
            { name: { contains: term, mode: 'insensitive' as const } },
            { lastName: { contains: term, mode: 'insensitive' as const } },
          ];
        }),
      },
      select: { id: true, name: true, lastName: true, phone: true, email: true },
      take: 20,
    });
  }

  async retry(id: string): Promise<IneUploadView> {
    const upload = await this.prisma.uploadRecord.findUnique({
      where: { id },
      include: { files: { include: { jobs: true } } },
    });
    if (!upload) throw AppError.notFound('INE upload not found');
    if (!['failed', 'review_ready'].includes(upload.status)) {
      throw AppError.conflict('Only failed or review-ready uploads can be retried');
    }
    const retryableJobs = upload.files.flatMap((file) =>
      file.jobs.filter((job) =>
        upload.status === 'failed' ? job.status === 'failed' : job.status === 'completed',
      ),
    );
    if (!retryableJobs.length) throw AppError.conflict('No OCR jobs are available for retry');
    await this.prisma.$transaction([
      this.prisma.uploadRecord.update({ where: { id }, data: { status: 'queued' } }),
      ...retryableJobs.map((job) =>
        this.prisma.ineOcrJob.update({
          where: { id: job.id },
          data: {
            status: 'queued',
            maxAttempts: job.attempt + env.INE_OCR_JOB_MAX_ATTEMPTS,
            nextAttemptAt: null,
            lockedAt: null,
            lockedBy: null,
          },
        }),
      ),
    ]);
    await this.dispatchOcrJobs(retryableJobs.map((job) => job.id));
    return this.getUpload(id);
  }

  async listStates(includeInactive = false): Promise<ElectoralState[]> {
    return this.prisma.electoralState.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createState(input: { code: string; name: string }): Promise<ElectoralState> {
    return this.createCatalogRecord(
      () => this.prisma.electoralState.create({ data: { code: input.code, name: input.name } }),
      'An electoral state with that code already exists',
    );
  }

  async updateState(
    id: string,
    input: Partial<Pick<ElectoralState, 'code' | 'name' | 'isActive'>>,
  ): Promise<ElectoralState> {
    return this.updateCatalogRecord(
      () => this.prisma.electoralState.update({ where: { id }, data: input }),
      'An electoral state with that code already exists',
      'Electoral state not found',
    );
  }

  async deactivateState(id: string): Promise<ElectoralState> {
    const state = await this.prisma.electoralState.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!state) throw AppError.notFound('Electoral state not found');

    const [activeDistricts, activeSections] = await Promise.all([
      this.prisma.electoralDistrict.count({ where: { stateId: id, isActive: true } }),
      this.prisma.section.count({ where: { stateId: id, isActive: true } }),
    ]);
    if (activeDistricts || activeSections) {
      throw AppError.conflict(
        'The electoral state cannot be deactivated while it has active districts or sections',
      );
    }
    return this.updateState(id, { isActive: false });
  }

  async listDistricts(stateId?: string, includeInactive = false): Promise<DistrictWithState[]> {
    return this.prisma.electoralDistrict.findMany({
      where: {
        ...(stateId ? { stateId } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: { state: { select: { id: true, name: true } } },
      orderBy: [{ state: { name: 'asc' } }, { code: 'asc' }],
    });
  }

  async createDistrict(input: {
    stateId: string;
    code: string;
    name?: string;
  }): Promise<ElectoralDistrict> {
    return this.createCatalogRecord(
      () => this.prisma.electoralDistrict.create({ data: input }),
      'An electoral district with that code already exists for the state',
    );
  }

  async updateDistrict(
    id: string,
    input: Partial<Pick<ElectoralDistrict, 'stateId' | 'code' | 'name' | 'isActive'>>,
  ): Promise<ElectoralDistrict> {
    const existing = await this.prisma.electoralDistrict.findUnique({
      where: { id },
      select: { stateId: true, isActive: true },
    });
    if (!existing) throw AppError.notFound('Electoral district not found');

    const targetStateId = input.stateId ?? existing.stateId;
    const targetState = await this.prisma.electoralState.findUnique({
      where: { id: targetStateId },
      select: { isActive: true },
    });
    if (!targetState) throw AppError.badRequest('The selected electoral state does not exist');
    if ((input.isActive ?? existing.isActive) && !targetState.isActive) {
      throw AppError.conflict('An electoral district cannot be active under an inactive state');
    }

    if (input.stateId && input.stateId !== existing.stateId) {
      const sectionCount = await this.prisma.section.count({ where: { districtId: id } });
      if (sectionCount) {
        throw AppError.conflict(
          'The electoral district cannot change state while it has registered sections',
        );
      }
    }

    return this.updateCatalogRecord(
      () => this.prisma.electoralDistrict.update({ where: { id }, data: input }),
      'An electoral district with that code already exists for the state',
      'Electoral district not found',
    );
  }

  async deactivateDistrict(id: string): Promise<ElectoralDistrict> {
    const district = await this.prisma.electoralDistrict.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!district) throw AppError.notFound('Electoral district not found');

    const activeSections = await this.prisma.section.count({
      where: { districtId: id, isActive: true },
    });
    if (activeSections) {
      throw AppError.conflict(
        'The electoral district cannot be deactivated while it has active sections',
      );
    }
    return this.updateDistrict(id, { isActive: false });
  }

  async listSections(params: {
    stateId?: string;
    districtId?: string;
    includeInactive?: boolean;
    limit?: number;
  }): Promise<SectionWithCatalog[]> {
    return this.prisma.section.findMany({
      where: {
        ...(params.stateId ? { stateId: params.stateId } : {}),
        ...(params.districtId ? { districtId: params.districtId } : {}),
        ...(params.includeInactive ? {} : { isActive: true }),
      },
      include: {
        state: { select: { id: true, name: true } },
        district: { select: { id: true, code: true } },
        leaders: { where: { isActive: true }, orderBy: { fullName: 'asc' } },
      },
      orderBy: { sectionCode: 'asc' },
      take: params.limit ?? 100,
    });
  }

  async createSection(input: {
    stateId: string;
    districtId: string;
    sectionCode: string;
    pollingStationCount?: number | null;
    votesPerStation?: number | null;
    nominalList?: number | null;
    votesRequired?: number | null;
  }): Promise<Section> {
    const district = await this.prisma.electoralDistrict.findFirst({
      where: { id: input.districtId, stateId: input.stateId },
      select: { id: true },
    });
    if (!district) throw AppError.badRequest('District does not belong to the selected state');
    return this.createCatalogRecord(
      () => this.prisma.section.create({ data: input }),
      'An electoral section with that identity already exists',
    );
  }

  async updateSection(
    id: string,
    input: Partial<
      Pick<
        Section,
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
  ): Promise<Section> {
    const existing = await this.prisma.section.findUnique({
      where: { id },
      select: { stateId: true, districtId: true, isActive: true },
    });
    if (!existing) throw AppError.notFound('Electoral section not found');

    const stateId = input.stateId ?? existing.stateId;
    const districtId = input.districtId ?? existing.districtId;
    const district = await this.prisma.electoralDistrict.findFirst({
      where: { id: districtId, stateId },
      select: { isActive: true, state: { select: { isActive: true } } },
    });
    if (!district) throw AppError.badRequest('District does not belong to the selected state');
    if ((input.isActive ?? existing.isActive) && (!district.isActive || !district.state.isActive)) {
      throw AppError.conflict(
        'An electoral section cannot be active under an inactive state or district',
      );
    }

    return this.updateCatalogRecord(
      () => this.prisma.section.update({ where: { id }, data: input }),
      'An electoral section with that identity already exists',
      'Electoral section not found',
    );
  }

  async deactivateSection(id: string): Promise<Section> {
    const section = await this.prisma.section.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!section) throw AppError.notFound('Electoral section not found');

    const activeLeaders = await this.prisma.leader.count({
      where: { sectionId: id, isActive: true },
    });
    if (activeLeaders) {
      throw AppError.conflict(
        'The electoral section cannot be deactivated while it has active leaders',
      );
    }
    return this.updateSection(id, { isActive: false });
  }

  async listLeaders(
    params: {
      sectionId?: string;
      coordinatorId?: string;
      q?: string;
      includeInactive?: boolean;
      page?: number;
      pageSize?: number;
    } = {},
    scope?: ScopeContext,
  ): Promise<{ leaders: LeaderWithSection[]; totalCount?: number; hasNextPage?: boolean }> {
    const { sectionId, coordinatorId, includeInactive = false, page, pageSize } = params;
    const q = params.q?.trim();
    const where: Prisma.LeaderWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(sectionId ? { sectionId } : {}),
      ...(coordinatorId ? { coordinatorId } : {}),
    };

    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { section: { sectionCode: { contains: q, mode: 'insensitive' } } },
        { coordinator: { fullName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (scope?.kind === 'leader') {
      where.id = scope.leaderId;
    } else if (scope?.kind === 'coordinator') {
      where.coordinatorId = scope.coordinatorId;
    }

    const orderBy = [{ section: { sectionCode: 'asc' as const } }, { fullName: 'asc' as const }];

    if (page === undefined) {
      return {
        leaders: await this.prisma.leader.findMany({
          where,
          include: leaderInclude,
          orderBy,
        }),
      };
    }

    const size = pageSize ?? 20;
    const [items, totalCount] = await Promise.all([
      this.prisma.leader.findMany({
        where,
        include: leaderInclude,
        orderBy,
        skip: (page - 1) * size,
        take: size + 1,
      }),
      this.prisma.leader.count({ where }),
    ]);
    const hasNextPage = items.length > size;
    return { leaders: items.slice(0, size), totalCount, hasNextPage };
  }

  async createLeader(
    input: { sectionId: string; fullName: string } & LeaderProfileInput,
    context?: { actorId?: string; actorName?: string },
  ): Promise<CreateLeaderResult> {
    const authService = new AuthorizationService(this.prisma);
    authService.assertRequiredEmail(input.email, 'leader');

    const profile = await this.leaderProfileData(input.sectionId, input);
    await authService.assertUserEntityOwnership(profile.email!);
    const leaderData: Prisma.LeaderUncheckedCreateInput = {
      sectionId: input.sectionId,
      fullName: input.fullName,
      coordinatorId: profile.coordinatorId!,
      neighborhoodId: profile.neighborhoodId ?? null,
      phone: profile.phone ?? null,
      email: profile.email!,
      promovidoQuota: profile.promovidoQuota ?? null,
      role: profile.role ?? 'PROMOTOR_BARRIO',
    };

    if (!this.userRepository) {
      throw new Error('UserRepository is required to provision leader users');
    }

    const prepared = await preparePendingUserInvitation(this.userRepository, {
      email: profile.email!,
      fullName: input.fullName,
      roleName: 'LIDER',
    });

    try {
      const { leader, invitation, rawToken, expiresAt } = await this.prisma.$transaction(
        async (
          tx,
        ): Promise<{
          leader: LeaderWithSection;
          invitation: LeaderInvitationDto;
          rawToken: string;
          expiresAt: Date;
        }> => {
          const provisioned = await persistPendingUserWithInvitation(tx, prepared, {
            actorId: context?.actorId,
          });

          const leader = await tx.leader.create({
            data: { ...leaderData, userId: provisioned.userId },
            include: leaderInclude,
          });

          return {
            leader,
            invitation: provisioned.invitation,
            rawToken: provisioned.rawToken,
            expiresAt: provisioned.expiresAt,
          };
        },
        PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
      );

      if (!this.emailService) {
        return { leader, invitation };
      }

      const delivery = await this.emailService.send({
        to: { email: profile.email!, name: input.fullName },
        template: 'user-invitation',
        props: {
          recipientName: input.fullName,
          platformName: env.MAIL_PLATFORM_NAME,
          activationUrl: buildActivationUrlFromToken(rawToken),
          ...formatExpiration(expiresAt),
          supportEmail: env.MAIL_SUPPORT_EMAIL,
          invitedByName: context?.actorName,
        },
      });
      const delivered = await this.userRepository.updateInvitationDelivery(invitation.id, {
        success: delivery.success,
        provider: delivery.provider,
        messageId: delivery.messageId,
        errorCode: delivery.errorCode,
      });

      return {
        leader,
        invitation: delivered,
        ...(delivery.success
          ? {}
          : {
              warning: {
                code: 'INVITATION_EMAIL_FAILED',
                message: 'El líder se creó, pero la invitación no se pudo enviar.',
              },
            }),
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw AppError.conflict('A leader with that identity already exists in the section');
      }
      throw error;
    }
  }

  async updateLeader(
    id: string,
    input: Partial<Pick<Leader, 'sectionId' | 'fullName' | 'isActive'>> & LeaderProfileInput,
  ): Promise<Leader> {
    const existing = await this.prisma.leader.findUnique({
      where: { id },
      select: { sectionId: true, isActive: true },
    });
    if (!existing) throw AppError.notFound('Electoral leader not found');

    if (input.sectionId || input.isActive === true || input.coordinatorId) {
      const section = await this.prisma.section.findUnique({
        where: { id: input.sectionId ?? existing.sectionId },
        select: {
          isActive: true,
          state: { select: { isActive: true } },
          district: { select: { isActive: true } },
        },
      });
      if (!section) throw AppError.badRequest('The selected electoral section does not exist');
      if (
        (input.isActive ?? existing.isActive) &&
        (!section.isActive || !section.state.isActive || !section.district.isActive)
      ) {
        throw AppError.conflict(
          'An electoral leader cannot be active under an inactive catalog hierarchy',
        );
      }
    }

    const { sectionId, fullName, isActive, ...profile } = input;
    const profileData = await this.leaderProfileData(
      sectionId ?? existing.sectionId,
      profile,
      // Al mover al líder de sección, el barrio anterior deja de pertenecerle.
      Boolean(sectionId && sectionId !== existing.sectionId),
      { requireCoordinator: Boolean(profile.coordinatorId) },
    );
    const data: Prisma.LeaderUncheckedUpdateInput = {
      ...(sectionId !== undefined ? { sectionId } : {}),
      ...(fullName !== undefined ? { fullName } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(profileData.coordinatorId !== undefined
        ? { coordinatorId: profileData.coordinatorId }
        : {}),
      ...(profileData.neighborhoodId !== undefined
        ? { neighborhoodId: profileData.neighborhoodId ?? null }
        : {}),
      ...(profileData.phone !== undefined ? { phone: profileData.phone ?? null } : {}),
      ...(profileData.email !== undefined ? { email: profileData.email } : {}),
      ...(profileData.promovidoQuota !== undefined
        ? { promovidoQuota: profileData.promovidoQuota ?? null }
        : {}),
      ...(profileData.role !== undefined ? { role: profileData.role } : {}),
    };
    return this.updateCatalogRecord(
      () => this.prisma.leader.update({ where: { id }, data }),
      'A leader with that identity already exists in the section',
      'Electoral leader not found',
    );
  }

  /**
   * Normaliza el perfil operativo del líder: cadenas vacías se guardan como
   * NULL, el teléfono se reduce a 10 dígitos y el barrio se valida contra la
   * sección destino.
   */
  private async leaderProfileData(
    sectionId: string,
    input: LeaderProfileInput,
    clearNeighborhood = false,
    options: { requireCoordinator?: boolean } = { requireCoordinator: true },
  ): Promise<LeaderProfileInput> {
    const data: LeaderProfileInput = {};

    if (
      options.requireCoordinator &&
      (input.coordinatorId === undefined || !input.coordinatorId.trim())
    ) {
      throw AppError.badRequest('El coordinador es obligatorio para el líder');
    }
    if (input.coordinatorId) {
      const coordinator = await this.prisma.coordinator.findUnique({
        where: { id: input.coordinatorId },
        select: { id: true, sectionId: true, isActive: true },
      });
      if (!coordinator) throw AppError.badRequest('El coordinador seleccionado no existe');
      if (!coordinator.isActive)
        throw AppError.badRequest('El coordinador seleccionado no está activo');
      if (coordinator.sectionId !== sectionId) {
        throw AppError.conflict('El coordinador no pertenece a la sección seleccionada');
      }
      data.coordinatorId = coordinator.id;
    }

    if (input.email === undefined || !input.email.trim()) {
      throw AppError.badRequest('El email es obligatorio para el líder');
    }
    data.email = input.email.trim();

    if (input.neighborhoodId !== undefined) {
      const neighborhoodId = input.neighborhoodId || null;
      if (neighborhoodId) await this.assertNeighborhoodRelation(sectionId, neighborhoodId);
      data.neighborhoodId = neighborhoodId;
    } else if (clearNeighborhood) {
      data.neighborhoodId = null;
    }

    if (input.phone !== undefined) {
      const phone = input.phone ? normalizePhone(input.phone) : null;
      if (input.phone && !phone) {
        throw AppError.badRequest(
          'El teléfono debe tener 10 dígitos (incluye LADA sin el 1 ni 52).',
        );
      }
      data.phone = phone;
    }

    if (input.promovidoQuota !== undefined) data.promovidoQuota = input.promovidoQuota ?? null;
    if (input.role !== undefined) data.role = input.role;

    return data;
  }

  async deactivateLeader(id: string): Promise<Leader> {
    return this.updateCatalogRecord(
      () => this.prisma.leader.update({ where: { id }, data: { isActive: false } }),
      'A leader with that identity already exists in the section',
      'Electoral leader not found',
    );
  }

  async reinviteLeader(
    id: string,
    context?: { actorId?: string; actorName?: string },
  ): Promise<{ invitation: LeaderInvitationDto; warning?: { code: string; message: string } }> {
    if (!this.userRepository) {
      throw new Error('UserRepository is required to reinvite leader users');
    }

    const leader = await this.prisma.leader.findUnique({
      where: { id },
      select: { id: true, userId: true, fullName: true },
    });
    if (!leader) throw AppError.notFound('Electoral leader not found');
    if (!leader.userId) {
      throw AppError.badRequest('El líder no tiene un usuario vinculado');
    }

    const user = await this.userRepository.findByIdWithRoles(leader.userId);
    if (!user) throw AppError.notFound('Usuario no encontrado');
    if (user.isActive) throw AppError.badRequest('El usuario ya está activo');

    const latest = await this.userRepository.findLatestInvitation(user.id);
    if (latest?.createdAt) {
      const ageSeconds = Math.floor((Date.now() - latest.createdAt.getTime()) / 1000);
      if (ageSeconds < env.INVITATION_RESEND_COOLDOWN_SECONDS) {
        throw AppError.tooManyRequests('Debés esperar antes de reenviar la invitación', {
          retryAfter: env.INVITATION_RESEND_COOLDOWN_SECONDS - ageSeconds,
        });
      }
    }

    const rawToken = generateInvitationToken();
    const expiresAt = new Date(Date.now() + env.INVITATION_EXPIRATION_MINUTES * 60_000);
    const invitation = await this.userRepository.createInvitationForExistingUser({
      userId: user.id,
      tokenHash: hashInvitationToken(rawToken),
      expiresAt,
      createdById: context?.actorId,
    });

    if (!this.emailService) {
      return { invitation };
    }

    const delivery = await this.emailService.send({
      to: { email: user.email, name: user.fullName ?? leader.fullName },
      template: 'user-invitation',
      props: {
        recipientName: user.fullName ?? leader.fullName,
        platformName: env.MAIL_PLATFORM_NAME,
        activationUrl: buildActivationUrl(env.FRONTEND_URL, rawToken),
        ...formatExpiration(expiresAt),
        supportEmail: env.MAIL_SUPPORT_EMAIL,
        invitedByName: context?.actorName,
        isResend: true,
      },
      category: 'user-invitation-resend',
    });

    const updated = await this.userRepository.updateInvitationDelivery(invitation.id, {
      success: delivery.success,
      provider: delivery.provider,
      messageId: delivery.messageId,
      errorCode: delivery.errorCode,
    });

    return {
      invitation: updated,
      ...(delivery.success
        ? {}
        : {
            warning: {
              code: 'INVITATION_EMAIL_FAILED',
              message: 'La invitación se generó, pero el correo no se pudo enviar.',
            },
          }),
    };
  }

  startWorker(): () => void {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await this.processBatch();
      } catch (error) {
        const failure = this.classifyFailure(error);
        log('error', 'ine_ocr.poll_failed', undefined, { errorCode: failure.code });
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => {
      void tick();
    }, env.INE_OCR_JOB_POLL_INTERVAL_MS);
    void tick();
    return () => clearInterval(timer);
  }

  async processBatch(): Promise<void> {
    for (let index = 0; index < env.INE_OCR_JOB_BATCH_SIZE; index += 1) {
      const job = await this.claimNextJob();
      if (!job) return;
      await this.processJob(job.id);
    }
  }

  async processJobById(id: string): Promise<BackgroundTaskResult> {
    const job = await this.prisma.ineOcrJob.findUnique({
      where: { id },
      select: { status: true, lockedAt: true },
    });
    if (!job) return 'not_found';
    if (!['queued', 'retryable', 'processing'].includes(job.status)) return 'noop';
    if (
      job.status === 'processing' &&
      job.lockedAt &&
      job.lockedAt.getTime() > Date.now() - 5 * 60_000
    ) {
      throw new Error('OCR job is still being processed');
    }

    const claimed = await this.claimJobById(id);
    if (!claimed) {
      if (job.status === 'retryable') throw new Error('OCR job retry is not due yet');
      return 'noop';
    }

    await this.processJob(id, true);
    return 'processed';
  }

  private async claimNextJob(): Promise<{ id: string } | null> {
    const staleBefore = new Date(Date.now() - 5 * 60_000);
    const candidate = await this.prisma.ineOcrJob.findFirst({
      where: {
        OR: [
          { status: 'queued' },
          { status: 'retryable', nextAttemptAt: { lte: new Date() } },
          {
            status: 'processing',
            OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!candidate) return null;
    return this.claimJobById(candidate.id);
  }

  private async claimJobById(id: string): Promise<{ id: string } | null> {
    const staleBefore = new Date(Date.now() - 5 * 60_000);
    const claimed = await this.prisma.ineOcrJob.updateMany({
      where: {
        id,
        OR: [
          { status: 'queued' },
          { status: 'retryable', nextAttemptAt: { lte: new Date() } },
          {
            status: 'processing',
            OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
          },
        ],
      },
      data: {
        status: 'processing',
        lockedAt: new Date(),
        lockedBy: `worker-${process.pid}`,
        attempt: { increment: 1 },
        lastError: null,
        lastErrorCode: null,
      },
    });
    return claimed.count ? { id } : null;
  }

  private async processJob(id: string, propagateRetryableFailure = false): Promise<void> {
    const startedAt = Date.now();
    const job = await this.prisma.ineOcrJob.findUnique({
      where: { id },
      include: { storedFile: true },
    });
    if (!job) return;
    await this.prisma.uploadRecord.update({
      where: { id: job.storedFile.uploadRecordId },
      data: { status: 'processing' },
    });
    try {
      assertSupportedFileStorageProvider(job.storedFile.storageProvider);
      await this.ocr.assertReady?.();
      const contents = await this.storage.get(job.storedFile.storageObjectId);
      const result = await this.ocr.process({ mimeType: job.storedFile.mimeType, contents });
      const parsed = parseIneDocument(result.document);
      // Persist BOTH the rich parsed fields (with raw/normalized/confidence per
      // field, for auditing and future use) and the flat string projection that
      // the review UI and `sectionCandidates` consume today.
      const flatFields = flattenIneFields(parsed.fields);
      await this.prisma.$transaction([
        this.prisma.ocrExtraction.create({
          data: {
            storedFileId: job.storedFileId,
            attempt: job.attempt,
            provider: 'google_document_ai',
            processorVersion: result.processorVersion,
            rawResultEncrypted: protect(result.rawResult),
            normalizedResultEncrypted: protect({
              fields: flatFields,
              parsed: parsed.fields as IneParsedFields,
            }),
            source: {
              provider: 'google_document_ai',
              pages: result.evidence.pageCount,
              confidenceCount: result.evidence.confidenceCount,
              ...(result.evidence.confidence !== undefined
                ? { confidence: result.evidence.confidence }
                : {}),
            },
            validationSummary: parsed.validationSummary,
          },
        }),
        this.prisma.ineOcrJob.update({
          where: { id },
          data: { status: 'completed', completedAt: new Date(), lockedAt: null, lockedBy: null },
        }),
      ]);
      await this.refreshUploadStatus(job.storedFile.uploadRecordId);
      log('info', 'ine_ocr.job_completed', undefined, {
        jobId: job.id,
        uploadId: job.storedFile.uploadRecordId,
        attempt: job.attempt,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const failure = this.classifyFailure(error);
      const retryable = failure.retryable && job.attempt < job.maxAttempts;
      await this.prisma.ineOcrJob.update({
        where: { id },
        data: {
          status: retryable ? 'retryable' : 'failed',
          nextAttemptAt: retryable ? new Date(Date.now() + job.attempt * 30_000) : null,
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: failure.code,
          lastError: 'OCR processing could not be completed',
        },
      });
      await this.refreshUploadStatus(job.storedFile.uploadRecordId);
      log('error', 'ine_ocr.job_failed', undefined, {
        jobId: job.id,
        uploadId: job.storedFile.uploadRecordId,
        attempt: job.attempt,
        errorCode: failure.code,
        retryable,
        durationMs: Date.now() - startedAt,
      });
      if (retryable && propagateRetryableFailure) throw error;
    }
  }

  private async dispatchOcrJobs(jobIds: string[]): Promise<void> {
    if (!this.taskDispatcher || !jobIds.length) return;
    const results = await Promise.allSettled(
      jobIds.map((jobId) => this.taskDispatcher!.dispatchOcrJob(jobId)),
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed) {
      // Persistence has committed. Startup reconciliation schedules work missed
      // at this non-atomic database/Cloud Tasks boundary.
      log('warn', 'ine_ocr.task_dispatch_incomplete', undefined, {
        attempted: jobIds.length,
        failed,
      });
    }
  }

  private classifyFailure(error: unknown): { code: string; retryable: boolean } {
    if (error instanceof GoogleConfigurationError) return { code: error.code, retryable: false };
    if (error instanceof GoogleProviderError)
      return { code: error.code, retryable: error.retryable };
    if (error instanceof UnsupportedFileStorageProviderError)
      return { code: error.code, retryable: false };
    return { code: 'OCR_INTERNAL_ERROR', retryable: true };
  }

  private async createCatalogRecord<T>(
    operation: () => Promise<T>,
    conflictMessage: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw AppError.conflict(conflictMessage);
      throw error;
    }
  }

  private async updateCatalogRecord<T>(
    operation: () => Promise<T>,
    conflictMessage: string,
    notFoundMessage: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') throw AppError.conflict(conflictMessage);
      if (code === 'P2025') throw AppError.notFound(notFoundMessage);
      throw error;
    }
  }

  private async compensateUploadedObjects(objectIds: string[]): Promise<void> {
    if (!objectIds.length) return;
    const results = await Promise.allSettled(
      objectIds.map((objectId) => this.storage.delete(objectId)),
    );
    const failedDeletes = results.filter((result) => result.status === 'rejected').length;
    if (failedDeletes) {
      log('warn', 'ine_ocr.upload_compensation_failed', undefined, {
        uploadedObjectCount: objectIds.length,
        failedDeleteCount: failedDeletes,
      });
    }
  }

  private async refreshUploadStatus(uploadRecordId: string): Promise<void> {
    const jobs = await this.prisma.ineOcrJob.findMany({
      where: { storedFile: { uploadRecordId } },
      select: { status: true },
    });
    if (jobs.every((job) => job.status === 'completed')) {
      await this.prisma.uploadRecord.update({
        where: { id: uploadRecordId },
        data: { status: 'review_ready' },
      });
    } else if (
      jobs.some((job) => job.status === 'failed') &&
      jobs.every((job) => ['completed', 'failed'].includes(job.status))
    ) {
      await this.prisma.uploadRecord.update({
        where: { id: uploadRecordId },
        data: { status: 'failed' },
      });
    }
  }

  private async sectionCandidates(fields: IneNormalizedFields): Promise<IneSectionCandidate[]> {
    if (!fields.electoralSection) return [];
    const numericSection = fields.electoralSection.replace(/^0+/, '') || '0';
    const maxLength = 20;
    const sectionVariants = Array.from({ length: maxLength - numericSection.length + 1 }, (_, i) =>
      numericSection.padStart(numericSection.length + i, '0'),
    );
    const candidates = await this.prisma.section.findMany({
      where: {
        sectionCode: { in: sectionVariants },
        isActive: true,
        state: { is: { isActive: true } },
        district: { is: { isActive: true } },
      },
      include: {
        state: true,
        district: true,
        leaders: { where: { isActive: true }, orderBy: { fullName: 'asc' } },
      },
      take: 100,
    });
    const expectedState = normalize(fields.state);
    return candidates
      .filter((candidate) => {
        if (candidate.district.stateId !== candidate.stateId) return false;
        if (!expectedState) return true;
        const candidateState = normalize(candidate.state.name);
        if (candidateState.includes(expectedState) || expectedState.includes(candidateState))
          return true;
        // Short OCR tokens are likely abbreviations; avoid false negatives.
        return expectedState.length <= 4;
      })
      .map((candidate) => ({
        id: candidate.id,
        state: candidate.state.name,
        district: candidate.district.code,
        sectionCode: candidate.sectionCode,
        leaders: candidate.leaders.map((leader) => ({ id: leader.id, fullName: leader.fullName })),
      }));
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
    if (!neighborhood) throw AppError.badRequest('Selected neighborhood does not exist');
    if (neighborhood.sectionId !== null && neighborhood.sectionId !== sectionId) {
      throw AppError.badRequest('Selected neighborhood does not belong to the reviewed section');
    }
    return neighborhood;
  }
}
