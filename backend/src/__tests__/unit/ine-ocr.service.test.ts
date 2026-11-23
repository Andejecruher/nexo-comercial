import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { env } from '../../config/env.config';
import { GoogleConfigurationError } from '../../services/ine/google-auth';
import { IneOcrService } from '../../services/ine/ine-ocr.service';
import { decrypt, encrypt } from '../../utils/crypto';
import { frontFixture } from './ine-fixtures';

const now = new Date('2026-08-12T00:00:00.000Z');

type AsyncMock<Args extends unknown[] = [], Result = unknown> = (...args: Args) => Promise<Result>;
type JobUpdateInput = {
  where: { id: string };
  data: {
    status: string;
    maxAttempts?: number;
    nextAttemptAt?: null;
    lockedAt?: null;
    lockedBy?: null;
  };
};
type PromovidoCreateInput = { data: Record<string, unknown> };
type CitizenUpdateInput = { where: { id: string }; data: Record<string, unknown> };
type ConfirmationTransaction = {
  $executeRaw: jest.MockedFunction<AsyncMock<[unknown], unknown>>;
  citizen: {
    findUnique: jest.MockedFunction<
      AsyncMock<[{ where: { id: string }; select: { id: true } }], { id: string } | null>
    >;
    update: jest.MockedFunction<AsyncMock<[CitizenUpdateInput], { id: string }>>;
  };
  promovido: {
    findUnique: jest.MockedFunction<AsyncMock<[unknown], { id: string; citizenId: string } | null>>;
    findFirst: jest.MockedFunction<AsyncMock<[unknown], { id: string } | null>>;
    create: jest.MockedFunction<AsyncMock<[PromovidoCreateInput], { id: string }>>;
  };
  uploadRecord: { update: jest.MockedFunction<AsyncMock<[unknown], Record<string, never>>> };
};

function serviceWith(
  prisma: unknown,
  storage: unknown = {},
  ocr: unknown = {},
  taskDispatcher?: unknown,
): IneOcrService {
  return new IneOcrService(
    prisma as never,
    storage as never,
    ocr as never,
    taskDispatcher as never,
  );
}

function reviewedUpload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'upload-1',
    status: 'review_ready',
    files: [],
    ...overrides,
  };
}

/**
 * Build an upload with a single file whose OCR extraction yields the supplied
 * flat fields. The extraction is encrypted the same way the real service does.
 * `extractions` is `IneNormalizedFields` (only flat string fields are exposed).
 */
function reviewedUploadWithOcr(ocrFields: Record<string, string> = {}) {
  return {
    id: 'upload-1',
    status: 'review_ready',
    files: [
      {
        jobs: [{ id: 'job-1', status: 'completed', attempt: 1, lastErrorCode: null }],
        extractions: [
          {
            normalizedResultEncrypted: encrypt(JSON.stringify({ fields: ocrFields })),
          },
        ],
      },
    ],
  };
}

function catalogSection(sectionCode = '0042') {
  return {
    id: 'section-1',
    stateId: 'state-1',
    sectionCode,
    state: { id: 'state-1', name: 'CHIAPAS' },
    district: { id: 'district-1', stateId: 'state-1', code: '01' },
    leaders: [{ id: 'leader-1', fullName: 'Synthetic Leader' }],
  };
}

describe('IneOcrService reviewed section resolution', () => {
  const originalEncryptionKey = env.ENCRYPTION_KEY;

  beforeAll(() => {
    Object.assign(env, { ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' });
  });

  afterAll(() => {
    Object.assign(env, { ENCRYPTION_KEY: originalEncryptionKey });
  });

  it('resolves a valid manual section when OCR omitted it', async () => {
    const prisma = {
      uploadRecord: {
        findUnique: jest
          .fn<AsyncMock<[], ReturnType<typeof reviewedUpload>>>()
          .mockResolvedValue(reviewedUpload()),
      },
      section: {
        findMany: jest
          .fn<AsyncMock<[], ReturnType<typeof catalogSection>[]>>()
          .mockResolvedValue([catalogSection()]),
      },
    };
    const service = serviceWith(prisma);

    const candidates = await service.resolveSectionCandidates('upload-1', {
      electoralSection: '0042',
      state: 'CHIAPAS',
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        id: 'section-1',
        sectionCode: '0042',
        leaders: [expect.any(Object)],
      }),
    ]);
  });

  it('rejects a manually supplied section that does not resolve to the active catalog', async () => {
    const prisma = {
      uploadRecord: {
        findUnique: jest
          .fn<AsyncMock<[], ReturnType<typeof reviewedUploadWithOcr>>>()
          .mockResolvedValue(reviewedUploadWithOcr({ electoralSection: '9999', state: 'CHIAPAS' })),
      },
      section: {
        findMany: jest
          .fn<AsyncMock<[], ReturnType<typeof catalogSection>[]>>()
          .mockResolvedValue([]),
      },
      leader: { findFirst: jest.fn<AsyncMock<[], null>>() },
    };
    const service = serviceWith(prisma);

    await expect(
      service.reviewUpload('upload-1', 'user-1', {
        sectionId: 'section-not-in-catalog',
        leaderId: 'leader-1',
        fields: { electoralSection: '9999', state: 'CHIAPAS' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    // OCR produced a section but the candidate set is empty → throw fires
    // before leader consistency is even checked.
    expect(prisma.leader.findFirst).not.toHaveBeenCalled();
  });

  it('accepts a manually supplied section when the OCR did not detect one (partial scan)', async () => {
    const sectionFindMany = jest
      .fn<AsyncMock<[], ReturnType<typeof catalogSection>[]>>()
      .mockResolvedValue([]);
    const leaderFindFirst = jest
      .fn<AsyncMock<[], { id: string } | null>>()
      .mockResolvedValue({ id: 'leader-1' });
    const prisma = {
      uploadRecord: {
        findUnique: jest
          .fn<AsyncMock<[], ReturnType<typeof reviewedUploadWithOcr>>>()
          // No `electoralSection` key here: simulates a partial/blurry OCR scan.
          .mockResolvedValue(reviewedUploadWithOcr({ firstName: 'JUAN' })),
        update: jest.fn<AsyncMock<[], Record<string, never>>>().mockResolvedValue({}),
      },
      section: { findMany: sectionFindMany },
      leader: { findFirst: leaderFindFirst },
      neighborhood: { findUnique: jest.fn<AsyncMock<[], null>>().mockResolvedValue(null) },
    };
    const service = serviceWith(prisma);

    await expect(
      service.reviewUpload('upload-1', 'user-1', {
        sectionId: 'section-1',
        leaderId: 'leader-1',
        fields: { firstName: 'JUAN' },
      }),
    ).resolves.toBeDefined();
    // When OCR produced no section, we MUST NOT query the section catalog for
    // candidate resolution (that path is what blocked the user before).
    expect(sectionFindMany).not.toHaveBeenCalled();
    // Leader↔section consistency is still enforced.
    expect(leaderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'leader-1', sectionId: 'section-1' }),
      }),
    );
    expect(prisma.uploadRecord.update).toHaveBeenCalled();
  });

  it('accepts a manually supplied section that overrides a mismatched OCR value', async () => {
    // OCR detected section 9999 (no catalog match) but the operator manually
    // corrected to 0042 via input.fields. The merge produces a resolvable
    // reviewedFields, and section-1 IS in the candidate set → succeeds.
    const sectionFindMany = jest
      .fn<AsyncMock<[], ReturnType<typeof catalogSection>[]>>()
      .mockResolvedValue([catalogSection('0042')]);
    const leaderFindFirst = jest
      .fn<AsyncMock<[], { id: string } | null>>()
      .mockResolvedValue({ id: 'leader-1' });
    const prisma = {
      uploadRecord: {
        findUnique: jest
          .fn<AsyncMock<[], ReturnType<typeof reviewedUploadWithOcr>>>()
          .mockResolvedValue(reviewedUploadWithOcr({ electoralSection: '9999', state: 'CHIAPAS' })),
        update: jest.fn<AsyncMock<[], Record<string, never>>>().mockResolvedValue({}),
      },
      section: { findMany: sectionFindMany },
      leader: { findFirst: leaderFindFirst },
      neighborhood: { findUnique: jest.fn<AsyncMock<[], null>>().mockResolvedValue(null) },
    };
    const service = serviceWith(prisma);

    await expect(
      service.reviewUpload('upload-1', 'user-1', {
        sectionId: 'section-1',
        leaderId: 'leader-1',
        // Operator overrides the OCR section code.
        fields: { electoralSection: '0042', state: 'CHIAPAS' },
      }),
    ).resolves.toBeDefined();
    // OCR did detect a section → candidates path runs, and finds section-1.
    expect(sectionFindMany).toHaveBeenCalled();
  });

  it('still rejects a manually supplied section that contradicts the OCR when both are present', async () => {
    const prisma = {
      uploadRecord: {
        findUnique: jest
          .fn<AsyncMock<[], ReturnType<typeof reviewedUploadWithOcr>>>()
          .mockResolvedValue(reviewedUploadWithOcr({ electoralSection: '0042', state: 'CHIAPAS' })),
        update: jest.fn<AsyncMock<[], Record<string, never>>>().mockResolvedValue({}),
      },
      section: {
        findMany: jest
          .fn<AsyncMock<[], ReturnType<typeof catalogSection>[]>>()
          .mockResolvedValue([catalogSection('0042')]),
      },
      leader: {
        findFirst: jest
          .fn<AsyncMock<[], { id: string } | null>>()
          .mockResolvedValue({ id: 'leader-1' }),
      },
      neighborhood: { findUnique: jest.fn<AsyncMock<[], null>>().mockResolvedValue(null) },
    };
    const service = serviceWith(prisma);

    // OCR says 0042 (CHIAPAS) → only section-1 resolves. Operator tries to
    // assign to section-tampered which is NOT in the candidate set → reject.
    await expect(
      service.reviewUpload('upload-1', 'user-1', {
        sectionId: 'section-tampered',
        leaderId: 'leader-1',
        fields: { electoralSection: '0042', state: 'CHIAPAS' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects a reviewed neighborhood that belongs to another section', async () => {
    const prisma = {
      uploadRecord: {
        findUnique: jest
          .fn<AsyncMock<[], ReturnType<typeof reviewedUpload>>>()
          .mockResolvedValue(reviewedUpload()),
      },
      section: {
        findMany: jest
          .fn<AsyncMock<[], ReturnType<typeof catalogSection>[]>>()
          .mockResolvedValue([catalogSection()]),
      },
      leader: {
        findFirst: jest
          .fn<AsyncMock<[], { id: string } | null>>()
          .mockResolvedValue({ id: 'leader-1' }),
      },
      neighborhood: {
        findUnique: jest
          .fn<AsyncMock<[], { sectionId: string } | null>>()
          .mockResolvedValue({ sectionId: 'other-section' }),
      },
    };
    const service = serviceWith(prisma);

    await expect(
      service.reviewUpload('upload-1', 'user-1', {
        sectionId: 'section-1',
        leaderId: 'leader-1',
        neighborhoodId: 'neighborhood-1',
        fields: { electoralSection: '0042', state: 'CHIAPAS' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('IneOcrService section candidate resolution', () => {
  function uploadRecord(status = 'review_ready') {
    return {
      id: 'upload-1',
      status,
      files: [],
    };
  }

  function catalogSection(overrides: Record<string, unknown> = {}) {
    return {
      id: 'section-1',
      stateId: 'state-1',
      sectionCode: '0042',
      state: { id: 'state-1', name: 'CHIAPAS' },
      district: { id: 'district-1', stateId: 'state-1', code: '01' },
      leaders: [{ id: 'leader-1', fullName: 'Synthetic Leader' }],
      ...overrides,
    };
  }

  it('resolves a section when OCR strips leading zeros', async () => {
    const prisma = {
      uploadRecord: {
        findUnique: jest
          .fn<AsyncMock<[], Record<string, unknown>>>()
          .mockResolvedValue(uploadRecord()),
      },
      section: {
        findMany: jest
          .fn<AsyncMock<[], ReturnType<typeof catalogSection>[]>>()
          .mockResolvedValue([catalogSection({ sectionCode: '0001' })]),
      },
    };
    const service = serviceWith(prisma);

    const candidates = await service.resolveSectionCandidates('upload-1', {
      electoralSection: '1',
      state: 'CHIAPAS',
    });

    expect(candidates).toEqual([expect.objectContaining({ id: 'section-1', sectionCode: '0001' })]);
  });

  it('resolves a section when OCR state is a short abbreviation', async () => {
    const prisma = {
      uploadRecord: {
        findUnique: jest
          .fn<AsyncMock<[], Record<string, unknown>>>()
          .mockResolvedValue(uploadRecord()),
      },
      section: {
        findMany: jest
          .fn<AsyncMock<[], ReturnType<typeof catalogSection>[]>>()
          .mockResolvedValue([catalogSection()]),
      },
    };
    const service = serviceWith(prisma);

    const candidates = await service.resolveSectionCandidates('upload-1', {
      electoralSection: '0042',
      state: 'CHIS.',
    });

    expect(candidates).toEqual([expect.objectContaining({ id: 'section-1', sectionCode: '0042' })]);
  });

  it('filters out sections from other states when OCR provides a full name', async () => {
    const prisma = {
      uploadRecord: {
        findUnique: jest
          .fn<AsyncMock<[], Record<string, unknown>>>()
          .mockResolvedValue(uploadRecord()),
      },
      section: {
        findMany: jest.fn<AsyncMock<[], ReturnType<typeof catalogSection>[]>>().mockResolvedValue([
          catalogSection(),
          catalogSection({
            id: 'section-2',
            stateId: 'state-2',
            state: { id: 'state-2', name: 'OAXACA' },
          }),
        ]),
      },
    };
    const service = serviceWith(prisma);

    const candidates = await service.resolveSectionCandidates('upload-1', {
      electoralSection: '0042',
      state: 'CHIAPAS',
    });

    expect(candidates.map((c) => c.id)).toEqual(['section-1']);
  });
});

describe('IneOcrService manual retry budget', () => {
  it('preserves the terminal attempt and grants a fresh configured retry budget', async () => {
    const jobUpdate = jest
      .fn<AsyncMock<[JobUpdateInput], { id: string }>>()
      .mockResolvedValue({ id: 'job-1' });
    const prisma = {
      uploadRecord: {
        findUnique: jest
          .fn<AsyncMock<[], Record<string, unknown>>>()
          .mockResolvedValueOnce({
            id: 'upload-1',
            status: 'failed',
            files: [{ jobs: [{ id: 'job-1', status: 'failed', attempt: 3, maxAttempts: 3 }] }],
          })
          .mockResolvedValueOnce({
            id: 'upload-1',
            status: 'queued',
            createdAt: now,
            files: [],
            section: null,
            leader: null,
            promovido: null,
            reviewedDataEncrypted: null,
          }),
        update: jest
          .fn<AsyncMock<[unknown], { id: string }>>()
          .mockResolvedValue({ id: 'upload-1' }),
      },
      ineOcrJob: { update: jobUpdate },
      section: {
        findMany: jest
          .fn<AsyncMock<[], ReturnType<typeof catalogSection>[]>>()
          .mockResolvedValue([]),
      },
      $transaction: jest
        .fn<AsyncMock<[Promise<unknown>[]], unknown[]>>()
        .mockImplementation(async (operations) => Promise.all(operations)),
    };
    const dispatchOcrJob = jest.fn<AsyncMock<[string], void>>().mockResolvedValue(undefined);
    const service = serviceWith(prisma, {}, {}, { dispatchOcrJob });

    await service.retry('upload-1');

    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'queued',
          maxAttempts: 3 + env.INE_OCR_JOB_MAX_ATTEMPTS,
        }),
      }),
    );
    expect(jobUpdate.mock.calls[0]?.[0].data).not.toHaveProperty('attempt');
    expect(jobUpdate.mock.calls[0]?.[0].data).not.toHaveProperty('lastError');
    expect(dispatchOcrJob).toHaveBeenCalledWith('job-1');
  });

  it('allows a review-ready upload to be re-scanned without clearing review data', async () => {
    const uploadUpdate = jest
      .fn<AsyncMock<[unknown], { id: string }>>()
      .mockResolvedValue({ id: 'upload-1' });
    const jobUpdate = jest
      .fn<AsyncMock<[JobUpdateInput], { id: string }>>()
      .mockResolvedValue({ id: 'job-1' });
    const prisma = {
      uploadRecord: {
        findUnique: jest
          .fn<AsyncMock<[], Record<string, unknown>>>()
          .mockResolvedValueOnce({
            id: 'upload-1',
            status: 'review_ready',
            reviewedDataEncrypted: 'reviewed-data',
            files: [{ jobs: [{ id: 'job-1', status: 'completed', attempt: 1, maxAttempts: 3 }] }],
          })
          .mockResolvedValueOnce({
            id: 'upload-1',
            status: 'queued',
            createdAt: now,
            reviewedAt: null,
            reviewedDataEncrypted: null,
            files: [],
            section: null,
            leader: null,
            promovido: null,
          }),
        update: uploadUpdate,
      },
      ineOcrJob: { update: jobUpdate },
      section: { findMany: jest.fn<AsyncMock<[], []>>().mockResolvedValue([]) },
      citizen: {
        findUnique: jest.fn<AsyncMock<[], null>>().mockResolvedValue(null),
      },
      $transaction: jest
        .fn<AsyncMock<[Promise<unknown>[]], unknown[]>>()
        .mockImplementation(async (operations) => Promise.all(operations)),
    };
    const service = serviceWith(prisma);

    await service.retry('upload-1');

    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'queued' }) }),
    );
    expect(uploadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'queued' } }),
    );
    expect(uploadUpdate.mock.calls[0]?.[0]).not.toEqual(
      expect.objectContaining({ data: expect.objectContaining({ reviewedDataEncrypted: null }) }),
    );
  });
});

describe('IneOcrService confirmation links', () => {
  const originalEncryptionKey = env.ENCRYPTION_KEY;

  beforeAll(() => {
    Object.assign(env, { ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' });
  });

  afterAll(() => {
    Object.assign(env, { ENCRYPTION_KEY: originalEncryptionKey });
  });

  function reviewedPayload() {
    return encrypt(
      JSON.stringify({
        firstName: 'ANTONIO',
        paternalLastName: 'CRUZ',
        maternalLastName: 'HERNANDEZ',
        voterKey: 'CUHA950613HCSRRN06',
        curp: 'CUHA950613HCSRRN06',
      }),
    );
  }

  function confirmationService(
    createPromovido: jest.MockedFunction<AsyncMock<[PromovidoCreateInput], { id: string }>> = jest
      .fn<AsyncMock<[PromovidoCreateInput], { id: string }>>()
      .mockResolvedValue({ id: 'promovido-1' }),
  ) {
    const citizenFind = jest
      .fn<AsyncMock<[{ where: { id: string }; select: { id: true } }], { id: string } | null>>()
      .mockResolvedValue({ id: 'citizen-1' });
    const citizenUpdate = jest
      .fn<AsyncMock<[CitizenUpdateInput], { id: string }>>()
      .mockResolvedValue({ id: 'citizen-1' });
    const transaction: ConfirmationTransaction = {
      $executeRaw: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue(undefined),
      citizen: { findUnique: citizenFind, update: citizenUpdate },
      promovido: {
        findUnique: jest
          .fn<AsyncMock<[unknown], { id: string; citizenId: string } | null>>()
          .mockResolvedValue(null),
        findFirst: jest.fn<AsyncMock<[unknown], { id: string } | null>>().mockResolvedValue(null),
        create: createPromovido,
      },
      uploadRecord: {
        update: jest.fn<AsyncMock<[unknown], Record<string, never>>>().mockResolvedValue({}),
      },
    };
    const prisma = {
      uploadRecord: {
        findUnique: jest.fn<AsyncMock<[], Record<string, unknown>>>().mockResolvedValue({
          id: 'upload-1',
          sectionId: 'section-1',
          leaderId: 'leader-1',
          reviewedDataEncrypted: reviewedPayload(),
          section: { state: { name: 'CHIAPAS' }, district: { code: '01' }, sectionCode: '0042' },
          leader: { fullName: 'Synthetic Leader' },
        }),
      },
      promovido: {
        findFirst: jest.fn<AsyncMock<[unknown], null>>().mockResolvedValue(null),
      },
      $transaction: jest
        .fn<AsyncMock<[(tx: ConfirmationTransaction) => Promise<{ id: string }>], { id: string }>>()
        .mockImplementation((callback) => callback(transaction)),
    };
    return {
      service: serviceWith(prisma),
      citizenFind,
      citizenUpdate,
      createPromovido,
      prisma,
      transaction,
    };
  }

  it('confirms with an atomically created CRM Citizen when none is selected', async () => {
    const { service, citizenFind, citizenUpdate, createPromovido } = confirmationService();

    await service.confirm('upload-1', 'user-1');

    expect(citizenFind).toHaveBeenCalled();
    expect(citizenUpdate).toHaveBeenCalled();
    expect(createPromovido).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ citizenId: 'citizen-1' }) }),
    );
  });

  it('persists the canonical promovido shape instead of the raw reviewed OCR blob', async () => {
    const { service, createPromovido, prisma } = confirmationService();
    prisma.uploadRecord.findUnique.mockResolvedValue({
      id: 'upload-1',
      sectionId: 'section-1',
      leaderId: 'leader-1',
      reviewedDataEncrypted: encrypt(
        JSON.stringify({
          firstName: 'ANTONIO',
          paternalLastName: 'CRUZ',
          voterKey: 'CUHA950613HCSRRN06',
          curp: 'CUHA950613HCSRRN06',
          electoralSection: '0042',
          manualPhone: '9611234567',
        }),
      ),
      section: { state: { name: 'CHIAPAS' }, district: { code: '01' }, sectionCode: '0042' },
      leader: { fullName: 'Synthetic Leader' },
    });

    await service.confirm('upload-1', 'user-1');

    const persisted = createPromovido.mock.calls[0]?.[0] as { data: { dataEncrypted: string } };
    const stored = JSON.parse(decrypt(persisted.data.dataEncrypted)) as Record<string, unknown>;
    expect(stored).toMatchObject({
      sectionId: 'section-1',
      leaderId: 'leader-1',
      phone: '529611234567',
      isActive: true,
    });
    expect(stored).not.toHaveProperty('electoralSection');
    expect(stored).not.toHaveProperty('manualPhone');
  });

  it('returns the same promoted record when confirmation is retried for an upload', async () => {
    const { service, createPromovido, transaction } = confirmationService();
    transaction.promovido.findUnique.mockResolvedValue({
      id: 'existing-promovido',
      citizenId: 'citizen-1',
    });
    await expect(service.confirm('upload-1', 'user-1')).resolves.toEqual({
      id: 'existing-promovido',
    });
    expect(createPromovido).not.toHaveBeenCalled();
  });
});

describe('IneOcrService OCR privacy boundary', () => {
  it('validates OCR configuration before downloading the file from storage', async () => {
    const jobUpdate = jest
      .fn<AsyncMock<[unknown], { id: string }>>()
      .mockResolvedValue({ id: 'job-1' });
    const prisma = {
      ineOcrJob: {
        findUnique: jest.fn<AsyncMock<[], Record<string, unknown>>>().mockResolvedValue({
          id: 'job-1',
          storedFileId: 'file-1',
          attempt: 1,
          maxAttempts: 3,
          storedFile: {
            uploadRecordId: 'upload-1',
            storageProvider: 'google_cloud_storage',
            storageObjectId: 'object-1',
            mimeType: 'image/png',
          },
        }),
        update: jobUpdate,
        findMany: jest
          .fn<AsyncMock<[], Array<{ status: string }>>>()
          .mockResolvedValue([{ status: 'failed' }]),
      },
      uploadRecord: {
        update: jest
          .fn<AsyncMock<[unknown], { id: string }>>()
          .mockResolvedValue({ id: 'upload-1' }),
      },
    };
    const storage = {
      get: jest.fn<AsyncMock<[string], Buffer>>().mockResolvedValue(Buffer.from('synthetic')),
    };
    const ocr = {
      assertReady: jest.fn(() => {
        throw new GoogleConfigurationError('DOCUMENT_AI_CONFIGURATION_MISSING');
      }),
      process: jest.fn<AsyncMock<[unknown], unknown>>(),
    };
    const service = serviceWith(prisma, storage, ocr);

    await (service as unknown as { processJob(id: string): Promise<void> }).processJob('job-1');

    expect(ocr.assertReady).toHaveBeenCalledTimes(1);
    expect(storage.get).not.toHaveBeenCalled();
    expect(ocr.process).not.toHaveBeenCalled();
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          lastErrorCode: 'DOCUMENT_AI_CONFIGURATION_MISSING',
        }),
      }),
    );
  });

  it('persists OCR only through encrypted fields and uses no local artifact dependency', async () => {
    const originalEncryptionKey = env.ENCRYPTION_KEY;
    Object.assign(env, { ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const extractionCreate = jest
      .fn<AsyncMock<[unknown], { id: string }>>()
      .mockResolvedValue({ id: 'extraction-1' });
    const prisma = {
      ineOcrJob: {
        findUnique: jest.fn<AsyncMock<[], Record<string, unknown>>>().mockResolvedValue({
          id: 'job-1',
          storedFileId: 'file-1',
          attempt: 1,
          maxAttempts: 3,
          storedFile: {
            uploadRecordId: 'upload-1',
            storageProvider: 'google_cloud_storage',
            storageObjectId: 'object-1',
            mimeType: 'image/png',
          },
        }),
        update: jest.fn<AsyncMock<[unknown], { id: string }>>().mockResolvedValue({ id: 'job-1' }),
        findMany: jest
          .fn<AsyncMock<[], Array<{ status: string }>>>()
          .mockResolvedValue([{ status: 'completed' }]),
      },
      uploadRecord: {
        update: jest
          .fn<AsyncMock<[unknown], { id: string }>>()
          .mockResolvedValue({ id: 'upload-1' }),
      },
      ocrExtraction: { create: extractionCreate },
      $transaction: jest
        .fn<AsyncMock<[Promise<unknown>[]], unknown[]>>()
        .mockImplementation((operations) => Promise.all(operations)),
    };
    const storage = {
      get: jest.fn<AsyncMock<[string], Buffer>>().mockResolvedValue(Buffer.from('synthetic')),
    };
    const ocr = {
      process: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue({
        document: frontFixture(),
        rawResult: { document: { text: 'synthetic' } },
        evidence: { confidenceCount: 0, pageCount: 1 },
      }),
    };
    const service = serviceWith(prisma, storage, ocr);

    try {
      await (service as unknown as { processJob(id: string): Promise<void> }).processJob('job-1');

      expect(storage.get).toHaveBeenCalledWith('object-1');
      expect(ocr.process).toHaveBeenCalledWith({
        mimeType: 'image/png',
        contents: Buffer.from('synthetic'),
      });
      expect(extractionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rawResultEncrypted: expect.any(String),
            normalizedResultEncrypted: expect.any(String),
          }),
        }),
      );
      const serializedLogs = logSpy.mock.calls.map(([entry]) => String(entry)).join('\n');
      expect(serializedLogs).toContain('ine_ocr.job_completed');
      expect(serializedLogs).not.toContain('synthetic');
    } finally {
      logSpy.mockRestore();
      Object.assign(env, { ENCRYPTION_KEY: originalEncryptionKey });
    }
  });
});
