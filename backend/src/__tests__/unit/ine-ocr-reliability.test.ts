import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { env } from '../../config/env.config';
import type { UserRepository } from '../../repositories/user.repository';
import type { EmailService } from '../../services/email/email.service';
import { IneOcrService, type IneUploadAsset } from '../../services/ine/ine-ocr.service';

type AsyncMock<Args extends unknown[] = [], Result = unknown> = (...args: Args) => Promise<Result>;

const duplicate = () => Object.assign(new Error('duplicate'), { code: 'P2002' });
const missing = () => Object.assign(new Error('missing'), { code: 'P2025' });
const asset = (side: 'front' | 'back'): IneUploadAsset => ({
  side,
  filename: `${side}.png`,
  mimeType: 'image/png',
  contents: Buffer.from('synthetic'),
});
const stored = (objectId: string) => ({
  provider: 'google_cloud_storage',
  objectId,
  path: `INE/upload-1/${objectId}`,
  folderId: 'INE/upload-1',
});

function serviceWith(prisma: unknown, storage: unknown = {}, ocr: unknown = {}): IneOcrService {
  return new IneOcrService(prisma as never, storage as never, ocr as never);
}

function serviceWithProvisioning(
  prisma: unknown,
  storage: unknown = {},
  ocr: unknown = {},
  deps: { userRepository?: Partial<UserRepository>; emailService?: Partial<EmailService> } = {},
): IneOcrService {
  const userRepository = {
    findRolesByNames: jest
      .fn<AsyncMock<[string[]], Array<{ id: string; name: string }>>>()
      .mockResolvedValue([{ id: 'role-lider', name: 'LIDER' }]),
    updateInvitationDelivery: jest
      .fn<AsyncMock<[string, Record<string, unknown>], { id: string }>>()
      .mockResolvedValue({ id: 'invitation-1' }),
    ...deps.userRepository,
  } as UserRepository;
  const emailService = {
    send: jest
      .fn<
        AsyncMock<
          [
            {
              to: { email: string; name: string };
              template: string;
              props: Record<string, unknown>;
            },
          ],
          { success: boolean }
        >
      >()
      .mockResolvedValue({ success: true }),
    ...deps.emailService,
  } as EmailService;
  return new IneOcrService(
    prisma as never,
    storage as never,
    ocr as never,
    undefined,
    userRepository,
    emailService,
  );
}

function coordinatorBelongsToSection(sectionId: string) {
  return jest
    .fn<AsyncMock<[unknown], { id: string; sectionId: string; isActive: boolean } | null>>()
    .mockResolvedValue({ id: 'coordinator-1', sectionId, isActive: true });
}

function leaderProvisioningPrisma(overrides: Record<string, unknown> = {}) {
  const basePrisma: Record<string, unknown> = {
    user: {
      findUnique: jest
        .fn<AsyncMock<[], { id: string; coordinator: null; leader: null } | null>>()
        .mockResolvedValue(null),
      create: jest.fn<AsyncMock<[unknown], { id: string }>>().mockResolvedValue({ id: 'user-1' }),
    },
    userRole: {
      create: jest
        .fn<AsyncMock<[unknown], { id: string }>>()
        .mockResolvedValue({ id: 'user-role-1' }),
    },
    userInvitation: {
      create: jest
        .fn<AsyncMock<[unknown], { id: string; status: string; expiresAt: Date }>>()
        .mockResolvedValue({
          id: 'invitation-1',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
    },
    leader: {
      create: jest.fn<AsyncMock<[unknown], { id: string }>>().mockResolvedValue({ id: 'leader-1' }),
      update: jest.fn<AsyncMock<[unknown], { id: string }>>().mockResolvedValue({ id: 'leader-1' }),
    },
  };
  const prisma = { ...basePrisma, ...overrides };
  if (!('$transaction' in overrides)) {
    prisma.$transaction = jest
      .fn<AsyncMock<[(tx: unknown) => Promise<unknown>], unknown>>()
      .mockImplementation(async (callback) => callback(prisma));
  }
  return prisma;
}

describe('IneOcrService catalog conflicts', () => {
  it('translates state duplicate errors', async () => {
    const service = serviceWith({
      electoralState: { create: jest.fn<AsyncMock<[unknown]>>().mockRejectedValue(duplicate()) },
    });
    await expect(service.createState({ code: '07', name: 'Synthetic' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('translates district duplicate errors', async () => {
    const service = serviceWith({
      electoralDistrict: { create: jest.fn<AsyncMock<[unknown]>>().mockRejectedValue(duplicate()) },
    });
    await expect(service.createDistrict({ stateId: 'state-1', code: '01' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('translates section duplicate errors after validating the district', async () => {
    const service = serviceWith({
      electoralDistrict: {
        findFirst: jest
          .fn<AsyncMock<[unknown], { id: string } | null>>()
          .mockResolvedValue({ id: 'district-1' }),
      },
      section: { create: jest.fn<AsyncMock<[unknown]>>().mockRejectedValue(duplicate()) },
    });
    await expect(
      service.createSection({ stateId: 'state-1', districtId: 'district-1', sectionCode: '0042' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('persists operational metrics when creating a section', async () => {
    const create = jest
      .fn<AsyncMock<[unknown], { id: string }>>()
      .mockResolvedValue({ id: 'section-1' });
    const service = serviceWith({
      electoralDistrict: {
        findFirst: jest
          .fn<AsyncMock<[unknown], { id: string } | null>>()
          .mockResolvedValue({ id: 'district-1' }),
      },
      section: { create },
    });

    await service.createSection({
      stateId: 'state-1',
      districtId: 'district-1',
      sectionCode: '0042',
      pollingStationCount: 8,
      votesPerStation: 120,
      nominalList: 1450,
      votesRequired: 900,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        stateId: 'state-1',
        districtId: 'district-1',
        sectionCode: '0042',
        pollingStationCount: 8,
        votesPerStation: 120,
        nominalList: 1450,
        votesRequired: 900,
      },
    });
  });

  it('updates operational metrics on an existing section', async () => {
    const update = jest
      .fn<AsyncMock<[unknown], { id: string }>>()
      .mockResolvedValue({ id: 'section-1' });
    const service = serviceWith({
      section: {
        findUnique: jest
          .fn<
            AsyncMock<[unknown], { stateId: string; districtId: string; isActive: boolean } | null>
          >()
          .mockResolvedValue({
            stateId: 'state-1',
            districtId: 'district-1',
            isActive: true,
          }),
        update,
      },
      electoralDistrict: {
        findFirst: jest
          .fn<AsyncMock<[unknown], { isActive: boolean; state: { isActive: boolean } } | null>>()
          .mockResolvedValue({ isActive: true, state: { isActive: true } }),
      },
    });

    await service.updateSection('section-1', {
      pollingStationCount: 4,
      votesRequired: null,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: { pollingStationCount: 4, votesRequired: null },
    });
  });

  it('translates leader duplicate errors', async () => {
    const prisma = leaderProvisioningPrisma({
      $transaction: jest
        .fn<AsyncMock<[(tx: unknown) => Promise<unknown>], unknown>>()
        .mockRejectedValue(duplicate()),
      coordinator: { findUnique: coordinatorBelongsToSection('section-1') },
    });
    const service = serviceWithProvisioning(prisma);
    await expect(
      service.createLeader({
        sectionId: 'section-1',
        fullName: 'Synthetic Leader',
        coordinatorId: 'coordinator-1',
        email: 'lider@ejemplo.mx',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('stores the leader operational profile with a normalized phone', async () => {
    const create = jest.fn<AsyncMock<[{ data: unknown }]>>().mockResolvedValue({ id: 'leader-1' });
    const prisma = leaderProvisioningPrisma({
      leader: {
        create,
        update: jest
          .fn<AsyncMock<[unknown], { id: string }>>()
          .mockResolvedValue({ id: 'leader-1' }),
      },
      coordinator: { findUnique: coordinatorBelongsToSection('section-1') },
      neighborhood: {
        findUnique: jest
          .fn<AsyncMock<[unknown], { name: string; sectionId: string | null } | null>>()
          .mockResolvedValue({ name: 'Centro', sectionId: 'section-1' }),
      },
    });
    const service = serviceWithProvisioning(prisma);

    await service.createLeader({
      sectionId: 'section-1',
      fullName: 'Synthetic Leader',
      coordinatorId: 'coordinator-1',
      neighborhoodId: 'neighborhood-1',
      phone: '+52 961 123 4567',
      email: 'lider@ejemplo.mx',
      promovidoQuota: 50,
      role: 'PROMOTOR_BARRIO',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sectionId: 'section-1',
          fullName: 'Synthetic Leader',
          coordinatorId: 'coordinator-1',
          neighborhoodId: 'neighborhood-1',
          phone: '529611234567',
          email: 'lider@ejemplo.mx',
          promovidoQuota: 50,
          role: 'PROMOTOR_BARRIO',
          userId: 'user-1',
        }),
      }),
    );
  });

  it('rejects a neighborhood that belongs to another section', async () => {
    const create = jest.fn<AsyncMock<[unknown]>>();
    const service = serviceWith({
      leader: { create },
      coordinator: { findUnique: coordinatorBelongsToSection('section-1') },
      neighborhood: {
        findUnique: jest
          .fn<AsyncMock<[unknown], { name: string; sectionId: string | null } | null>>()
          .mockResolvedValue({ name: 'Centro', sectionId: 'section-2' }),
      },
    });

    await expect(
      service.createLeader({
        sectionId: 'section-1',
        fullName: 'Synthetic Leader',
        coordinatorId: 'coordinator-1',
        email: 'lider@ejemplo.mx',
        neighborhoodId: 'neighborhood-1',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a phone that is not ten digits', async () => {
    const create = jest.fn<AsyncMock<[unknown]>>();
    const service = serviceWith({
      leader: { create },
      coordinator: { findUnique: coordinatorBelongsToSection('section-1') },
    });

    await expect(
      service.createLeader({
        sectionId: 'section-1',
        fullName: 'Synthetic Leader',
        coordinatorId: 'coordinator-1',
        email: 'lider@ejemplo.mx',
        phone: '12345',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a leader without email (RN4)', async () => {
    const create = jest.fn<AsyncMock<[unknown]>>();
    const service = serviceWith({
      leader: { create },
      coordinator: { findUnique: coordinatorBelongsToSection('section-1') },
    });

    await expect(
      service.createLeader({
        sectionId: 'section-1',
        fullName: 'Synthetic Leader',
        coordinatorId: 'coordinator-1',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a leader without coordinatorId', async () => {
    const create = jest.fn<AsyncMock<[unknown]>>();
    const service = serviceWith({ leader: { create } });

    await expect(
      service.createLeader({
        sectionId: 'section-1',
        fullName: 'Synthetic Leader',
        email: 'lider@ejemplo.mx',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a cross-section coordinator assignment (409)', async () => {
    const create = jest.fn<AsyncMock<[unknown]>>();
    const service = serviceWith({
      leader: { create },
      coordinator: {
        findUnique: jest
          .fn<AsyncMock<[unknown], { id: string; sectionId: string; isActive: boolean } | null>>()
          .mockResolvedValue({ id: 'coordinator-1', sectionId: 'section-2', isActive: true }),
      },
    });

    await expect(
      service.createLeader({
        sectionId: 'section-1',
        fullName: 'Synthetic Leader',
        coordinatorId: 'coordinator-1',
        email: 'lider@ejemplo.mx',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(create).not.toHaveBeenCalled();
  });

  it('provisions user, role and invitation in the same transaction when creating a leader', async () => {
    const prisma = leaderProvisioningPrisma({
      coordinator: { findUnique: coordinatorBelongsToSection('section-1') },
    }) as Record<string, Record<string, jest.Mock>>;
    const service = serviceWithProvisioning(prisma);

    await service.createLeader({
      sectionId: 'section-1',
      fullName: 'Synthetic Leader',
      coordinatorId: 'coordinator-1',
      email: 'lider@ejemplo.mx',
    });

    expect(prisma.user.create.mock.calls.length).toBeGreaterThan(0);
    expect(prisma.userRole.create.mock.calls.length).toBeGreaterThan(0);
    expect(prisma.userInvitation.create.mock.calls.length).toBeGreaterThan(0);
    expect(prisma.leader.create.mock.calls.length).toBeGreaterThan(0);
  });

  it('links the new leader record to the provisioned user', async () => {
    const prisma = leaderProvisioningPrisma({
      coordinator: { findUnique: coordinatorBelongsToSection('section-1') },
      user: {
        findUnique: jest
          .fn<AsyncMock<[], { id: string; coordinator: null; leader: null } | null>>()
          .mockResolvedValue(null),
        create: jest
          .fn<AsyncMock<[unknown], { id: string }>>()
          .mockResolvedValue({ id: 'user-42' }),
      },
      leader: {
        create: jest
          .fn<AsyncMock<[unknown], { id: string }>>()
          .mockResolvedValue({ id: 'leader-1' }),
        update: jest
          .fn<AsyncMock<[unknown], { id: string }>>()
          .mockResolvedValue({ id: 'leader-1' }),
      },
    }) as Record<string, Record<string, jest.Mock>>;
    const service = serviceWithProvisioning(prisma);

    await service.createLeader({
      sectionId: 'section-1',
      fullName: 'Synthetic Leader',
      coordinatorId: 'coordinator-1',
      email: 'lider@ejemplo.mx',
    });

    expect(prisma.leader.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-42' }) }),
    );
  });

  it('rolls back the transaction when invitation creation fails', async () => {
    const create = jest
      .fn<AsyncMock<[unknown], { id: string }>>()
      .mockResolvedValue({ id: 'leader-1' });
    const prisma = leaderProvisioningPrisma({
      coordinator: { findUnique: coordinatorBelongsToSection('section-1') },
      leader: {
        create,
        update: jest
          .fn<AsyncMock<[unknown], { id: string }>>()
          .mockResolvedValue({ id: 'leader-1' }),
      },
      userInvitation: {
        create: jest.fn<AsyncMock<[unknown]>>().mockRejectedValue(new Error('invitation failed')),
      },
    });
    const service = serviceWithProvisioning(prisma);

    await expect(
      service.createLeader({
        sectionId: 'section-1',
        fullName: 'Synthetic Leader',
        coordinatorId: 'coordinator-1',
        email: 'lider@ejemplo.mx',
      }),
    ).rejects.toThrow('invitation failed');
    expect(create).not.toHaveBeenCalled();
  });

  it('sends the invitation email when emailService is provided', async () => {
    const send = jest.fn<EmailService['send']>().mockResolvedValue({
      success: true,
      provider: 'fake',
      messageId: 'msg-1',
      durationMs: 0,
    } as Awaited<ReturnType<EmailService['send']>>);
    const prisma = leaderProvisioningPrisma({
      coordinator: { findUnique: coordinatorBelongsToSection('section-1') },
    });
    const service = serviceWithProvisioning(
      prisma,
      {},
      {},
      { emailService: { send } as unknown as EmailService },
    );

    await service.createLeader(
      {
        sectionId: 'section-1',
        fullName: 'Synthetic Leader',
        coordinatorId: 'coordinator-1',
        email: 'lider@ejemplo.mx',
      },
      { actorId: 'admin-1', actorName: 'Admin' },
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { email: 'lider@ejemplo.mx', name: 'Synthetic Leader' },
        template: 'user-invitation',
      }),
    );
  });

  it('rejects leader creation when email is already linked to another entity', async () => {
    const create = jest.fn<AsyncMock<[unknown]>>();
    const service = serviceWith({
      leader: { create },
      user: {
        findUnique: jest
          .fn<
            AsyncMock<
              [],
              {
                id: string;
                coordinator: { id: string } | null;
                leader: { id: string } | null;
              } | null
            >
          >()
          .mockResolvedValue({
            id: 'user-1',
            coordinator: { id: 'coordinator-1' },
            leader: null,
          }),
      },
      coordinator: { findUnique: coordinatorBelongsToSection('section-1') },
    });

    await expect(
      service.createLeader({
        sectionId: 'section-1',
        fullName: 'Synthetic Leader',
        coordinatorId: 'coordinator-1',
        email: 'lider@ejemplo.mx',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(create).not.toHaveBeenCalled();
  });

  it('listLeaders filters by leader scope', async () => {
    const findMany = jest.fn<AsyncMock<[unknown], unknown[]>>().mockResolvedValue([]);
    const service = serviceWith({ leader: { findMany } });

    await service.listLeaders({ includeInactive: false }, { kind: 'leader', leaderId: 'leader-1' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'leader-1' }) }),
    );
  });

  it('listLeaders filters by coordinator scope', async () => {
    const findMany = jest.fn<AsyncMock<[unknown], unknown[]>>().mockResolvedValue([]);
    const service = serviceWith({ leader: { findMany } });

    await service.listLeaders(
      { includeInactive: false },
      {
        kind: 'coordinator',
        coordinatorId: 'coordinator-1',
      },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ coordinatorId: 'coordinator-1' }),
      }),
    );
  });

  it('listLeaders keeps admin scope unrestricted', async () => {
    const findMany = jest.fn<AsyncMock<[unknown], unknown[]>>().mockResolvedValue([]);
    const service = serviceWith({ leader: { findMany } });

    await service.listLeaders({ sectionId: 'section-1', includeInactive: true }, { kind: 'admin' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sectionId: 'section-1' },
      }),
    );
  });

  it('listLeaders applies search and coordinator filter together', async () => {
    const findMany = jest.fn<AsyncMock<[unknown], unknown[]>>().mockResolvedValue([]);
    const service = serviceWith({ leader: { findMany } });

    await service.listLeaders(
      {
        sectionId: 'section-1',
        coordinatorId: 'coordinator-2',
        q: 'ana',
        includeInactive: true,
      },
      { kind: 'admin' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sectionId: 'section-1',
          coordinatorId: 'coordinator-2',
          OR: expect.arrayContaining([
            { fullName: { contains: 'ana', mode: 'insensitive' } },
            { email: { contains: 'ana', mode: 'insensitive' } },
            { section: { sectionCode: { contains: 'ana', mode: 'insensitive' } } },
            { coordinator: { fullName: { contains: 'ana', mode: 'insensitive' } } },
          ]),
        }),
      }),
    );
  });

  it('listLeaders lets coordinator scope override a conflicting coordinatorId query', async () => {
    const findMany = jest.fn<AsyncMock<[unknown], unknown[]>>().mockResolvedValue([]);
    const service = serviceWith({ leader: { findMany } });

    await service.listLeaders(
      { coordinatorId: 'coordinator-other', includeInactive: false },
      { kind: 'coordinator', coordinatorId: 'coordinator-1' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ coordinatorId: 'coordinator-1', isActive: true }),
      }),
    );
  });

  it('listLeaders paginates with count when page is provided', async () => {
    const findMany = jest
      .fn<AsyncMock<[unknown], unknown[]>>()
      .mockResolvedValue([{ id: 'leader-1' }, { id: 'leader-2' }, { id: 'leader-3' }]);
    const count = jest.fn<AsyncMock<[unknown], number>>().mockResolvedValue(5);
    const service = serviceWith({ leader: { findMany, count } });

    const result = await service.listLeaders({ page: 2, pageSize: 2 }, { kind: 'admin' });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 2, take: 3 }));
    expect(count).toHaveBeenCalled();
    expect(result).toEqual({
      leaders: [{ id: 'leader-1' }, { id: 'leader-2' }],
      totalCount: 5,
      hasNextPage: true,
    });
  });

  it('listLeaders returns an empty page without failing', async () => {
    const findMany = jest.fn<AsyncMock<[unknown], unknown[]>>().mockResolvedValue([]);
    const count = jest.fn<AsyncMock<[unknown], number>>().mockResolvedValue(0);
    const service = serviceWith({ leader: { findMany, count } });

    await expect(
      service.listLeaders({ sectionId: 'section-1', coordinatorId: 'coordinator-2', page: 1 }),
    ).resolves.toEqual({ leaders: [], totalCount: 0, hasNextPage: false });
  });

  it('listLeaders skips pagination when page is omitted', async () => {
    const findMany = jest.fn<AsyncMock<[unknown], unknown[]>>().mockResolvedValue([{ id: 'l1' }]);
    const count = jest.fn<AsyncMock<[unknown], number>>();
    const service = serviceWith({ leader: { findMany, count } });

    const result = await service.listLeaders({ q: '  ' });

    expect(result).toEqual({ leaders: [{ id: 'l1' }] });
    expect(count).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
      }),
    );
    expect(findMany.mock.calls[0]?.[0]).not.toHaveProperty('skip');
  });
});

describe('IneOcrService.reinviteLeader', () => {
  it('resends invitation for an existing leader user', async () => {
    const send = jest.fn<EmailService['send']>().mockResolvedValue({
      success: true,
      provider: 'fake',
      messageId: 'msg-1',
      durationMs: 0,
    } as Awaited<ReturnType<EmailService['send']>>);
    const prisma = {
      leader: {
        findUnique: jest
          .fn<AsyncMock<[unknown], { id: string; userId: string; fullName: string } | null>>()
          .mockResolvedValue({ id: 'leader-1', userId: 'user-1', fullName: 'María' }),
      },
    };
    const service = serviceWithProvisioning(
      prisma,
      {},
      {},
      {
        emailService: { send } as unknown as EmailService,
        userRepository: {
          findByIdWithRoles: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue({
            id: 'user-1',
            email: 'maria@ejemplo.mx',
            fullName: 'María',
            isActive: false,
          }),
          findLatestInvitation: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue(null),
          createInvitationForExistingUser: jest
            .fn<AsyncMock<[unknown], unknown>>()
            .mockResolvedValue({
              id: 'inv-2',
              status: 'pending',
              expiresAt: new Date(),
            }),
          updateInvitationDelivery: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue({
            id: 'inv-2',
            status: 'sent',
            expiresAt: new Date(),
            lastErrorCode: null,
          }),
        } as never,
      },
    );

    const result = await service.reinviteLeader('leader-1');

    expect(result.invitation.status).toBe('sent');
    expect(send).toHaveBeenCalled();
  });

  it('throws 400 when the leader has no linked user', async () => {
    const service = serviceWithProvisioning({
      leader: {
        findUnique: jest
          .fn<AsyncMock<[unknown], { id: string; userId: null; fullName: string } | null>>()
          .mockResolvedValue({ id: 'leader-1', userId: null, fullName: 'María' }),
      },
    });

    await expect(service.reinviteLeader('leader-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
  });
});

describe('IneOcrService catalog updates and soft deletes', () => {
  it('translates duplicate update errors into conflicts', async () => {
    const service = serviceWith({
      electoralState: {
        update: jest.fn<AsyncMock<[unknown]>>().mockRejectedValue(duplicate()),
      },
    });

    await expect(service.updateState('state-1', { code: '07' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('translates missing update targets into not found errors', async () => {
    const service = serviceWith({
      electoralState: {
        update: jest.fn<AsyncMock<[unknown]>>().mockRejectedValue(missing()),
      },
    });

    await expect(service.updateState('state-1', { name: 'Synthetic' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('prevents deactivating a state with active descendants', async () => {
    const update = jest.fn<AsyncMock<[unknown]>>();
    const service = serviceWith({
      electoralState: {
        findUnique: jest
          .fn<AsyncMock<[unknown], { id: string } | null>>()
          .mockResolvedValue({ id: 'state-1' }),
        update,
      },
      electoralDistrict: {
        count: jest.fn<AsyncMock<[unknown], number>>().mockResolvedValue(1),
      },
      section: {
        count: jest.fn<AsyncMock<[unknown], number>>().mockResolvedValue(0),
      },
    });

    await expect(service.deactivateState('state-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('soft deletes a leader and returns the inactive record', async () => {
    const inactiveLeader = {
      id: 'leader-1',
      sectionId: 'section-1',
      fullName: 'Synthetic Leader',
      isActive: false,
    };
    const update = jest
      .fn<AsyncMock<[unknown], typeof inactiveLeader>>()
      .mockResolvedValue(inactiveLeader);
    const service = serviceWith({ leader: { update } });

    await expect(service.deactivateLeader('leader-1')).resolves.toEqual(inactiveLeader);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'leader-1' },
      data: { isActive: false },
    });
  });
});

describe('IneOcrService upload compensation', () => {
  it('deletes already uploaded objects when a later storage upload fails', async () => {
    const deleteObject = jest.fn<AsyncMock<[string], void>>().mockResolvedValue();
    const storage = {
      put: jest
        .fn<AsyncMock<[unknown], ReturnType<typeof stored>>>()
        .mockResolvedValueOnce(stored('object-front'))
        .mockRejectedValueOnce(new Error('storage failed')),
      delete: deleteObject,
    };
    const service = serviceWith({}, storage);

    await expect(service.createUpload('user-1', [asset('front'), asset('back')])).rejects.toThrow(
      'storage failed',
    );
    expect(deleteObject).toHaveBeenCalledWith('object-front');
  });

  it('deletes all uploaded objects when the persistence transaction fails', async () => {
    const deleteObject = jest.fn<AsyncMock<[string], void>>().mockResolvedValue();
    const storage = {
      put: jest
        .fn<AsyncMock<[unknown], ReturnType<typeof stored>>>()
        .mockResolvedValueOnce(stored('object-front'))
        .mockResolvedValueOnce(stored('object-back')),
      delete: deleteObject,
    };
    const service = serviceWith(
      {
        $transaction: jest
          .fn<AsyncMock<[unknown]>>()
          .mockRejectedValue(new Error('database failed')),
      },
      storage,
    );

    await expect(service.createUpload('user-1', [asset('front'), asset('back')])).rejects.toThrow(
      'database failed',
    );
    expect(deleteObject).toHaveBeenCalledWith('object-front');
    expect(deleteObject).toHaveBeenCalledWith('object-back');
  });

  it('persists GCS object names and prefixes on each stored file', async () => {
    const storedFileCreate = jest
      .fn<AsyncMock<[unknown], { id: string }>>()
      .mockResolvedValue({ id: 'file-1' });
    const storage = {
      put: jest
        .fn<AsyncMock<[unknown], ReturnType<typeof stored>>>()
        .mockResolvedValue(stored('object-front')),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          uploadRecord: {
            create: jest.fn<AsyncMock<[unknown], { id: string }>>().mockResolvedValue({
              id: 'upload-1',
            }),
          },
          storedFile: { create: storedFileCreate },
          ineOcrJob: {
            create: jest.fn<AsyncMock<[unknown], { id: string }>>().mockResolvedValue({
              id: 'job-1',
            }),
          },
        }),
      ),
      uploadRecord: {
        findUnique: jest.fn<AsyncMock<[], null>>().mockResolvedValue(null),
      },
    };
    const service = serviceWith(prisma, storage);

    await expect(service.createUpload('user-1', [asset('front')])).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(storedFileCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storageObjectId: 'object-front',
          storageFolderId: 'INE/upload-1',
          storagePath: 'INE/upload-1/object-front',
          storageDriveId: '',
        }),
      }),
    );
    expect(storage.put).toHaveBeenCalledWith(
      expect.objectContaining({
        folderPath: ['INE', expect.any(String)],
      }),
    );
  });
});

describe('IneOcrService worker polling', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('logs a sanitized poll failure and keeps the poll loop active', async () => {
    jest.useFakeTimers();
    const service = serviceWith({});
    const processBatch = jest
      .spyOn(service, 'processBatch')
      .mockRejectedValueOnce(new Error('synthetic failure'))
      .mockResolvedValueOnce(undefined);
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const stop = service.startWorker();
    await Promise.resolve();
    await Promise.resolve();

    expect(processBatch).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('ine_ocr.poll_failed'));
    jest.advanceTimersByTime(env.INE_OCR_JOB_POLL_INTERVAL_MS);
    await Promise.resolve();
    expect(processBatch).toHaveBeenCalledTimes(2);
    stop();
  });
});
