import { describe, expect, it, jest } from '@jest/globals';
import { sexBlindIndex } from '../../services/ine/promovido-validations';
import { PromovidoCitizenSyncService } from '../../services/promovido-citizen-sync.service';

type AsyncFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

type Citizen = {
  id: string;
  voterKeyFingerprint?: string | null;
  curpFingerprint?: string | null;
};

const input = {
  data: {
    firstName: 'ANTONIO',
    paternalLastName: 'CRUZ',
    curp: 'CUHA950613HCSRRN06',
    voterKey: 'CUHA950613HCSRRN06',
    sex: 'H' as const,
    sectionId: 'section-1',
    leaderId: 'leader-1',
    isActive: true,
  },
  dataEncrypted: 'encrypted',
  createdByUserId: 'user-1',
  leaderId: 'leader-1',
  sectionId: 'section-1',
  stateNameSnapshot: 'CHIAPAS',
  districtCodeSnapshot: '01',
  sectionCodeSnapshot: '0042',
  leaderNameSnapshot: 'Leader',
};

function prismaWith(citizens: Citizen[] = []) {
  const tx = {
    $executeRaw: jest.fn<AsyncFn<[], void>>().mockResolvedValue(undefined),
    citizen: {
      findUnique: jest
        .fn<AsyncFn<[{ where: Record<string, string> }], Citizen | null>>()
        .mockImplementation(
          async ({ where }: { where: Record<string, string> }) =>
            citizens.find((citizen) =>
              Object.entries(where).every(
                ([key, value]) => citizen[key as keyof typeof citizen] === value,
              ),
            ) ?? null,
        ),
      create: jest
        .fn<AsyncFn<[unknown], { id: string }>>()
        .mockResolvedValue({ id: 'citizen-new' }),
      update: jest
        .fn<AsyncFn<[unknown], { id: string }>>()
        .mockResolvedValue({ id: 'citizen-existing' }),
    },
    promovido: {
      findUnique: jest.fn<AsyncFn<[unknown], null>>().mockResolvedValue(null),
      findFirst: jest.fn<AsyncFn<[unknown], null>>().mockResolvedValue(null),
      create: jest
        .fn<AsyncFn<[unknown], { id: string }>>()
        .mockResolvedValue({ id: 'promovido-1' }),
    },
    uploadRecord: {
      update: jest.fn<AsyncFn<[unknown], Record<string, never>>>().mockResolvedValue({}),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: jest
        .fn<AsyncFn<[(client: typeof tx) => Promise<unknown>, options?: unknown], unknown>>()
        .mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  };
}

describe('PromovidoCitizenSyncService', () => {
  it('creates the citizen and promoted record in the same interactive transaction', async () => {
    const { prisma, tx } = prismaWith();
    const result = await new PromovidoCitizenSyncService(prisma as never).create(input);
    expect(result).toEqual({ id: 'promovido-1', citizenId: 'citizen-new' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.citizen.create).toHaveBeenCalledTimes(1);
    expect(tx.promovido.create).toHaveBeenCalledTimes(1);
    const [createArgs] = tx.promovido.create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(createArgs.data.sexBlindIndex).toBe(sexBlindIndex('H'));
  });

  it('rejects conflicting identity keys without mutating either record', async () => {
    const { prisma, tx } = prismaWith([
      { id: 'citizen-voter', voterKeyFingerprint: 'voter' },
      { id: 'citizen-curp', curpFingerprint: 'curp' },
    ]);
    tx.citizen.findUnique
      .mockResolvedValueOnce({ id: 'citizen-voter', voterKeyFingerprint: 'voter' })
      .mockResolvedValueOnce({ id: 'citizen-curp', curpFingerprint: 'curp' });
    await expect(
      new PromovidoCitizenSyncService(prisma as never).create(input),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tx.citizen.create).not.toHaveBeenCalled();
    expect(tx.promovido.create).not.toHaveBeenCalled();
  });

  it('accepts a promoted with only a valid CURP when OCR did not detect voterKey (partial OCR)', async () => {
    // Simula el caso "escaneo parcial donde el OCR solo extrajo la CURP".
    // El operador no tipea la clave de elector pero la CURP sí es válida.
    // La regla del sync exige al menos UNO, así que esto debe pasar.
    const partialInput = {
      ...input,
      data: {
        ...input.data,
        voterKey: '', // OCR no lo detectó y el operador lo dejó vacío
      },
    };
    const { prisma, tx } = prismaWith();
    const result = await new PromovidoCitizenSyncService(prisma as never).create(partialInput);
    expect(result.id).toBe('promovido-1');
    expect(tx.citizen.create).toHaveBeenCalledTimes(1);
    // El fingerprint de voterKey queda undefined en el promovido creado.
    const [createArgs] = tx.promovido.create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(createArgs.data.voterKeyFingerprint).toBeUndefined();
    expect(createArgs.data.curpFingerprint).toBeTruthy();
  });

  it('accepts a promoted with only a valid voterKey when OCR did not detect CURP (partial OCR)', async () => {
    // Caso inverso: OCR solo extrajo la clave de elector, no la CURP.
    const partialInput = {
      ...input,
      data: {
        ...input.data,
        curp: '',
      },
    };
    const { prisma, tx } = prismaWith();
    const result = await new PromovidoCitizenSyncService(prisma as never).create(partialInput);
    expect(result.id).toBe('promovido-1');
    expect(tx.citizen.create).toHaveBeenCalledTimes(1);
    const [createArgs] = tx.promovido.create.mock.calls[0] as [{ data: Record<string, unknown> }];
    // El service normaliza undefined -> null antes de pasar a Prisma.
    expect(createArgs.data.curpFingerprint).toBeNull();
    expect(createArgs.data.voterKeyFingerprint).toBeTruthy();
  });

  it('rejects promotion when both identity fields are missing, with a diagnostic message', async () => {
    const emptyInput = {
      ...input,
      data: {
        ...input.data,
        voterKey: '',
        curp: '',
      },
    };
    const { prisma } = prismaWith();
    await expect(
      new PromovidoCitizenSyncService(prisma as never).create(emptyInput),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/falta la clave de elector y falta la CURP/),
    });
  });

  it('almacena el teléfono en el formato canónico que busca el bot (52…, sin el 521 de Meta)', async () => {
    // Un número capturado en formato WhatsApp/Meta (13 dígitos, 521…) debe guardarse
    // como E.164 canónico (5296…) para que findByPhone del bot lo encuentre.
    const metaPhoneInput = {
      ...input,
      data: {
        ...input.data,
        phone: '5219612345678',
      },
    };
    const { prisma, tx } = prismaWith();
    await new PromovidoCitizenSyncService(prisma as never).create(metaPhoneInput);
    const [createArgs] = tx.citizen.create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(createArgs.data.phone).toBe('529612345678');
  });

  it('rejects promotion when both identity fields have invalid format, pinpointing which one', async () => {
    const invalidInput = {
      ...input,
      data: {
        ...input.data,
        // CURP con estructura válida pero dígito verificador inválido (último dígito forzado)
        curp: 'CUHA950613HCSRRN00',
        voterKey: 'short', // muy corta para pasar el regex de voterKey
      },
    };
    const { prisma } = prismaWith();
    await expect(
      new PromovidoCitizenSyncService(prisma as never).create(invalidInput),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/clave de elector inválida.*CURP inválida/),
    });
  });
});
