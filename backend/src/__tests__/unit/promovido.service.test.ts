import { describe, expect, it, jest } from '@jest/globals';
import { env } from '../../config/env.config';
import { sexBlindIndex } from '../../services/ine/promovido-validations';
import { PromovidoService } from '../../services/promovido.service';
import { encrypt } from '../../utils/crypto';

const originalEncryptionKey = env.ENCRYPTION_KEY;

beforeAll(() => {
  Object.assign(env, { ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' });
});

afterAll(() => {
  Object.assign(env, { ENCRYPTION_KEY: originalEncryptionKey });
});

type AsyncMock<Args extends unknown[] = [], Result = unknown> = (...args: Args) => Promise<Result>;

type PrismaLike = {
  section: {
    findUnique: jest.MockedFunction<AsyncMock<[{ id: string }], unknown>>;
  };
  leader: {
    findUnique: jest.MockedFunction<AsyncMock<[{ id: string }], unknown>>;
  };
  promovido: {
    findFirst: jest.MockedFunction<AsyncMock<[unknown], unknown>>;
    findMany: jest.MockedFunction<AsyncMock<[{ where: Record<string, unknown> }], unknown[]>>;
    count: jest.MockedFunction<AsyncMock<[{ where: Record<string, unknown> }], number>>;
    create: jest.MockedFunction<AsyncMock<[{ data: Record<string, unknown> }], unknown>>;
    findUnique: jest.MockedFunction<AsyncMock<[{ id: string }], unknown>>;
    update: jest.MockedFunction<
      AsyncMock<[{ where: { id: string }; data: Record<string, unknown> }], unknown>
    >;
  };
  citizen: {
    findUnique: jest.MockedFunction<AsyncMock<[unknown], unknown>>;
    create: jest.MockedFunction<AsyncMock<[unknown], unknown>>;
    update: jest.MockedFunction<AsyncMock<[unknown], unknown>>;
  };
  neighborhood: {
    findUnique: jest.MockedFunction<AsyncMock<[unknown], unknown>>;
  };
  $transaction: jest.MockedFunction<AsyncMock<[(tx: unknown) => Promise<unknown>], unknown>>;
  $executeRaw: jest.MockedFunction<AsyncMock<[unknown], unknown>>;
};

function validPayload() {
  return {
    firstName: 'ANTONIO',
    paternalLastName: 'CRUZ',
    maternalLastName: 'HERNANDEZ',
    birthDate: '1995-06-13',
    sex: 'H' as const,
    curp: 'CUHA950613HCSRRN06',
    voterKey: 'CUHA950613HCSRRN06',
    address: 'Calle 1',
    neighborhood: 'Centro',
    locality: 'Cintalapa',
    municipality: 'Cintalapa',
    state: 'CHIAPAS',
    sectionId: 'section-1',
    leaderId: 'leader-1',
    phone: '9611234567',
    isActive: true,
  };
}

function basePrisma(): PrismaLike {
  const prisma = {
    section: {
      findUnique: jest.fn<AsyncMock<[{ id: string }], unknown>>().mockResolvedValue({
        id: 'section-1',
        sectionCode: '0042',
        isActive: true,
        state: { isActive: true, name: 'CHIAPAS' },
        district: { isActive: true, code: '01' },
      }),
    },
    leader: {
      findUnique: jest.fn<AsyncMock<[{ id: string }], unknown>>().mockResolvedValue({
        id: 'leader-1',
        fullName: 'Juan Pérez',
        isActive: true,
        sectionId: 'section-1',
      }),
    },
    promovido: {
      findFirst: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue(null),
      findMany: jest
        .fn<AsyncMock<[{ where: Record<string, unknown> }], unknown[]>>()
        .mockResolvedValue([]),
      count: jest
        .fn<AsyncMock<[{ where: Record<string, unknown> }], number>>()
        .mockResolvedValue(0),
      create: jest
        .fn<AsyncMock<[{ data: Record<string, unknown> }], unknown>>()
        .mockResolvedValue({ id: 'promovido-1' }),
      findUnique: jest.fn<AsyncMock<[{ id: string }], unknown>>().mockResolvedValue(null),
      update: jest
        .fn<AsyncMock<[{ where: { id: string }; data: Record<string, unknown> }], unknown>>()
        .mockResolvedValue({ id: 'promovido-1' }),
    },
    citizen: {
      findUnique: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue(null),
      create: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue({ id: 'citizen-1' }),
      update: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue({ id: 'citizen-1' }),
    },
    neighborhood: {
      findUnique: jest
        .fn<AsyncMock<[unknown], unknown>>()
        .mockResolvedValue({ sectionId: 'section-1' }),
    },
    $transaction: jest.fn<AsyncMock<[(tx: unknown) => Promise<unknown>], unknown>>(),
    $executeRaw: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue(undefined),
  };

  prisma.promovido.findUnique.mockResolvedValue({
    id: 'promovido-1',
    sectionId: 'section-1',
    leaderId: 'leader-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    uploadRecordId: null,
    citizenId: 'citizen-1',
    dataEncrypted: encrypt(JSON.stringify(validPayload())),
    leader: { id: 'leader-1', fullName: 'Juan Pérez' },
    section: { id: 'section-1', sectionCode: '0042' },
    citizen: { id: 'citizen-1', name: 'ANTONIO', lastName: 'CRUZ', phone: '9611234567' },
  });

  // Wire the transaction mock so the callback receives the same observable
  // Prisma instance, allowing assertions on $executeRaw calls.
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma as unknown));

  return prisma;
}

describe('PromovidoService validations', () => {
  it('blocks creation with invalid voter key', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);
    const payload = { ...validPayload(), voterKey: 'abc' };

    await expect(service.create(payload, 'user-1')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('blocks creation with invalid CURP', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);
    const payload = { ...validPayload(), curp: 'INVALID' };

    await expect(service.create(payload, 'user-1')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('blocks creation when CURP does not match birth date', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);
    const payload = { ...validPayload(), birthDate: '1990-01-01' };

    await expect(service.create(payload, 'user-1')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('blocks creation with invalid phone', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);
    const payload = { ...validPayload(), phone: '123' };

    await expect(service.create(payload, 'user-1')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('blocks creation when leader does not belong to section', async () => {
    const prisma: PrismaLike = {
      ...basePrisma(),
      leader: {
        findUnique: jest.fn<AsyncMock<[{ id: string }], unknown>>().mockResolvedValue({
          id: 'leader-1',
          fullName: 'Juan Pérez',
          isActive: true,
          sectionId: 'other-section',
        }),
      },
    };
    const service = new PromovidoService(prisma as never);

    await expect(service.create(validPayload(), 'user-1')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('rejects a section-bound neighborhood from another section', async () => {
    const prisma = basePrisma();
    prisma.neighborhood.findUnique.mockResolvedValue({ sectionId: 'other-section' });
    const service = new PromovidoService(prisma as never);

    await expect(
      service.create({ ...validPayload(), neighborhoodId: 'neighborhood-1' }, 'user-1'),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('PromovidoService detail view', () => {
  function detailPrisma(overrides: Record<string, unknown> = {}) {
    const prisma = basePrisma();
    prisma.promovido.findUnique.mockResolvedValue({
      id: 'promovido-1',
      createdAt: new Date('2026-08-18T20:30:00.000Z'),
      updatedAt: new Date('2026-08-18T20:30:00.000Z'),
      isActive: true,
      uploadRecordId: 'upload-1',
      dataEncrypted: encrypt(JSON.stringify(validPayload())),
      leader: {
        id: 'leader-1',
        fullName: 'Juan Pérez',
        phone: '9619876543',
        email: 'juan.perez@example.mx',
      },
      section: {
        id: 'section-1',
        sectionCode: '0042',
        state: { id: 'state-1', name: 'CHIAPAS' },
        district: { id: 'district-1', code: '14', name: 'Cintalapa' },
      },
      citizen: {
        id: 'citizen-1',
        name: 'ANTONIO',
        lastName: 'CRUZ',
        phone: '9611234567',
        email: 'antonio@example.mx',
      },
      uploadRecord: {
        reviewedDataEncrypted: encrypt(
          JSON.stringify({ validUntil: '2033', registrationYear: '2015', postalCode: '30400' }),
        ),
      },
      ...overrides,
    });
    return prisma;
  }

  it('exposes state, district, citizen email and OCR credential fields', async () => {
    const service = new PromovidoService(detailPrisma() as never);

    const detail = await service.getDetailById('promovido-1');

    expect(detail.section.state?.name).toBe('CHIAPAS');
    expect(detail.section.district?.code).toBe('14');
    expect(detail.citizen?.email).toBe('antonio@example.mx');
    expect(detail.origin).toBe('ocr');
    expect(detail.credential).toEqual({
      validUntil: '2033',
      registrationYear: '2015',
      postalCode: '30400',
      electoralSection: '0042',
    });
  });

  it('exposes the assigned leader contact', async () => {
    const service = new PromovidoService(detailPrisma() as never);

    const detail = await service.getDetailById('promovido-1');

    expect(detail.leader).toEqual({
      id: 'leader-1',
      fullName: 'Juan Pérez',
      phone: '9619876543',
      email: 'juan.perez@example.mx',
    });
  });

  it('marks records without an upload as manual and falls back to the section code', async () => {
    const service = new PromovidoService(
      detailPrisma({ uploadRecordId: null, uploadRecord: null }) as never,
    );

    const detail = await service.getDetailById('promovido-1');

    expect(detail.origin).toBe('manual');
    expect(detail.credential.validUntil).toBeUndefined();
    expect(detail.credential.electoralSection).toBe('0042');
  });

  it('reads credential fields from the legacy OCR blob stored on the promovido', async () => {
    const service = new PromovidoService(
      detailPrisma({
        uploadRecord: null,
        dataEncrypted: encrypt(
          JSON.stringify({ ...validPayload(), validUntil: '2030', electoralSection: '0199' }),
        ),
      }) as never,
    );

    const detail = await service.getDetailById('promovido-1');

    expect(detail.credential.validUntil).toBe('2030');
    expect(detail.credential.electoralSection).toBe('0199');
  });

  it('throws when the promovido does not exist', async () => {
    const prisma = basePrisma();
    prisma.promovido.findUnique.mockResolvedValue(null);
    const service = new PromovidoService(prisma as never);

    await expect(service.getDetailById('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('PromovidoService duplicate voter key', () => {
  it('blocks creation when voter key is already registered to another promovido', async () => {
    const prisma: PrismaLike = {
      ...basePrisma(),
      promovido: {
        ...basePrisma().promovido,
        findFirst: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue({
          id: 'existing-1',
          leader: { fullName: 'Juan Pérez' },
          section: { sectionCode: '0042' },
        }),
      },
    };
    const service = new PromovidoService(prisma as never);

    await expect(service.create(validPayload(), 'user-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('allows editing the same promovido keeping the same voter key', async () => {
    const existingData = encrypt(JSON.stringify(validPayload()));
    const base = basePrisma();
    const prisma: PrismaLike = {
      ...base,
      promovido: {
        ...base.promovido,
        findUnique: jest.fn<AsyncMock<[{ id: string }], unknown>>().mockResolvedValue({
          id: 'promovido-1',
          dataEncrypted: existingData,
          sectionId: 'section-1',
          leaderId: 'leader-1',
          isActive: true,
          leader: { fullName: 'Juan Pérez' },
          section: { sectionCode: '0042' },
          citizen: null,
          uploadRecordId: null,
        }),
      },
    };
    const service = new PromovidoService(prisma as never);

    const result = (await service.update('promovido-1', { firstName: 'ANTONIO DE JESUS' })) as {
      id: string;
    };

    expect(result.id).toBe('promovido-1');
  });

  it('synchronizes an explicitly changed territory to the linked Citizen in the transaction', async () => {
    const prisma = basePrisma();
    prisma.neighborhood.findUnique.mockResolvedValue({ sectionId: 'section-1', name: 'Norte' });
    const service = new PromovidoService(prisma as never);

    await service.update('promovido-1', {
      neighborhoodId: 'neighborhood-2',
      neighborhood: 'Norte',
    });

    expect(prisma.citizen.update).toHaveBeenCalledWith({
      where: { id: 'citizen-1' },
      data: { neighborhoodId: 'neighborhood-2', neighborhood: 'Norte' },
    });
  });

  it('does not overwrite the linked Citizen when the request omits neighborhoodId', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);

    await service.update('promovido-1', { firstName: 'ANTONIO DE JESUS' });

    expect(prisma.citizen.update).not.toHaveBeenCalled();
  });
});

describe('PromovidoService advisory lock', () => {
  it('executes pg_advisory_xact_lock with a signed bigint from the fingerprint', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);

    await service.create(validPayload(), 'user-1');

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const rawCall = prisma.$executeRaw.mock.calls[0] as unknown[];
    expect(rawCall).toBeDefined();
    expect(rawCall[0]).toBeInstanceOf(Array); // TemplateStringsArray
    const template = rawCall[0] as TemplateStringsArray;
    expect(template.join('?')).toContain('pg_advisory_xact_lock');
    expect(rawCall.length).toBeGreaterThan(1);
    const lockKey = rawCall[1];
    expect(typeof lockKey).toBe('bigint');
    // Must fit in a signed 64-bit integer (PostgreSQL int8).
    expect(lockKey).toBeGreaterThanOrEqual(-(2n ** 63n));
    expect(lockKey).toBeLessThanOrEqual(2n ** 63n - 1n);
  });

  it('blocks creation when the same voter key appears inside the transaction', async () => {
    const prisma = basePrisma();
    // First findFirst is the pre-transaction conflict check; the second is inside the transaction.
    prisma.promovido.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'existing-in-tx',
      leader: { fullName: 'Juan Pérez' },
      section: { sectionCode: '0042' },
    });
    const service = new PromovidoService(prisma as never);

    await expect(service.create(validPayload(), 'user-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    expect(prisma.promovido.create).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('maps Prisma P2002 error to conflict inside the transaction', async () => {
    const prisma = basePrisma();
    const prismaError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    prisma.promovido.create.mockRejectedValueOnce(prismaError);
    const service = new PromovidoService(prisma as never);

    await expect(service.create(validPayload(), 'user-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('propagates non-P2002 errors so the transaction rolls back', async () => {
    const prisma = basePrisma();
    const otherError = Object.assign(new Error('Database is down'), { code: 'P1017' });
    prisma.promovido.create.mockRejectedValueOnce(otherError);
    const service = new PromovidoService(prisma as never);

    await expect(service.create(validPayload(), 'user-1')).rejects.toBe(otherError);
  });

  it('acquires the advisory lock in the update path too', async () => {
    const existingData = encrypt(JSON.stringify(validPayload()));
    const base = basePrisma();
    const prisma: PrismaLike = {
      ...base,
      promovido: {
        ...base.promovido,
        findUnique: jest.fn<AsyncMock<[{ id: string }], unknown>>().mockResolvedValue({
          id: 'promovido-1',
          dataEncrypted: existingData,
          sectionId: 'section-1',
          leaderId: 'leader-1',
          isActive: true,
          leader: { fullName: 'Juan Pérez' },
          section: { sectionCode: '0042' },
          citizen: null,
          uploadRecordId: null,
        }),
      },
    };
    const service = new PromovidoService(prisma as never);

    await service.update('promovido-1', { firstName: 'ANTONIO DE JESUS' });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe('PromovidoService sex blind index', () => {
  it('filters by the hashed sex in SQL instead of decrypting every row', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);

    await service.list({ page: 1, pageSize: 20, sex: 'M' });

    const [findManyArgs] = prisma.promovido.findMany.mock.calls[0] ?? [];
    expect(findManyArgs?.where).toMatchObject({ sexBlindIndex: sexBlindIndex('M') });
    const [countArgs] = prisma.promovido.count.mock.calls[0] ?? [];
    expect(countArgs?.where).toMatchObject({ sexBlindIndex: sexBlindIndex('M') });
  });

  it('does not constrain the query when no sex filter is requested', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);

    await service.list({ page: 1, pageSize: 20 });

    const [findManyArgs] = prisma.promovido.findMany.mock.calls[0] ?? [];
    expect(findManyArgs?.where).not.toHaveProperty('sexBlindIndex');
  });

  it('stores the hashed sex on creation', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);

    await service.create(validPayload(), 'user-1');

    const [createArgs] = prisma.promovido.create.mock.calls[0] ?? [];
    expect(createArgs?.data).toMatchObject({ sexBlindIndex: sexBlindIndex('H') });
  });

  it('recalculates the hashed sex when the record is updated', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);

    await service.update('promovido-1', {
      sex: 'M',
      curp: 'CUHA950613MCSRRN06',
    });

    const [updateArgs] = prisma.promovido.update.mock.calls[0] ?? [];
    expect(updateArgs?.data).toMatchObject({ sexBlindIndex: sexBlindIndex('M') });
  });
});

describe('PromovidoService scope enforcement', () => {
  it('list filters by leader scope', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);

    await service.list({ page: 1, pageSize: 20 }, { kind: 'leader', leaderId: 'leader-1' });

    const [listArgs] = prisma.promovido.findMany.mock.calls[0] ?? [];
    expect(listArgs?.where).toMatchObject({ leader: { id: 'leader-1' } });
  });

  it('list filters by coordinator scope', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);

    await service.list(
      { page: 1, pageSize: 20 },
      { kind: 'coordinator', coordinatorId: 'coordinator-1' },
    );

    const [listArgs] = prisma.promovido.findMany.mock.calls[0] ?? [];
    expect(listArgs?.where).toMatchObject({ leader: { coordinatorId: 'coordinator-1' } });
  });

  it('getById returns not found when promovido is outside leader scope', async () => {
    const prisma = basePrisma();
    prisma.promovido.findFirst.mockResolvedValue(null);
    const service = new PromovidoService(prisma as never);

    await expect(
      service.getById('promovido-1', { kind: 'leader', leaderId: 'leader-2' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('getDetailById returns not found when promovido is outside coordinator scope', async () => {
    const prisma = basePrisma();
    prisma.promovido.findFirst.mockResolvedValue(null);
    const service = new PromovidoService(prisma as never);

    await expect(
      service.getDetailById('promovido-1', {
        kind: 'coordinator',
        coordinatorId: 'coordinator-2',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('create rejects a leader outside leader scope', async () => {
    const prisma = basePrisma();
    const service = new PromovidoService(prisma as never);

    await expect(
      service.create(validPayload(), 'user-1', { kind: 'leader', leaderId: 'leader-2' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('create accepts a leader inside coordinator scope', async () => {
    const prisma = basePrisma();
    prisma.leader.findUnique.mockResolvedValue({
      id: 'leader-1',
      fullName: 'Juan Pérez',
      isActive: true,
      sectionId: 'section-1',
      coordinatorId: 'coordinator-1',
    });
    const service = new PromovidoService(prisma as never);

    prisma.promovido.findFirst.mockImplementation((args) => {
      const where = (args as { where?: { id?: string } }).where ?? {};
      if (where.id) {
        return Promise.resolve({
          id: where.id,
          sectionId: 'section-1',
          leaderId: 'leader-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true,
          uploadRecordId: null,
          citizenId: 'citizen-1',
          dataEncrypted: encrypt(JSON.stringify(validPayload())),
          leader: { id: 'leader-1', fullName: 'Juan Pérez' },
          section: { id: 'section-1', sectionCode: '0042' },
          citizen: { id: 'citizen-1', name: 'ANTONIO', lastName: 'CRUZ', phone: '9611234567' },
        });
      }
      return Promise.resolve(null);
    });

    await service.create(validPayload(), 'user-1', {
      kind: 'coordinator',
      coordinatorId: 'coordinator-1',
    });

    expect(prisma.promovido.create).toHaveBeenCalled();
  });

  it('update rejects moving a promovido to a leader outside scope', async () => {
    const prisma = basePrisma();
    prisma.leader.findUnique.mockResolvedValue({
      id: 'leader-2',
      coordinatorId: 'coordinator-2',
    });
    const service = new PromovidoService(prisma as never);

    await expect(
      service.update(
        'promovido-1',
        { leaderId: 'leader-2' },
        { kind: 'coordinator', coordinatorId: 'coordinator-1' },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
