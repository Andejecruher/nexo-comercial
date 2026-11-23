import { describe, expect, it, jest } from '@jest/globals';
import { CitizenRepository } from '../../repositories';
import { CitizenListFiltersSchema, CitizensService } from '../../services/citizens.service';

function makePrismaMock() {
  const asyncMock = <T = unknown>() => jest.fn<(...args: unknown[]) => Promise<T>>();
  const store: Record<string, any> = {};

  return {
    citizen: {
      findUnique: jest.fn(async ({ where }: { where: any }) => {
        // lookup by phone or id
        if (where.phone) return store[where.phone] ?? null;
        if (where.id) return Object.values(store).find((c: any) => c.id === where.id) ?? null;
        return null;
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const id = `cit-${Date.now()}`;
        const obj = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        store[data.phone] = obj;
        return obj;
      }),
      findFirst: asyncMock(),
      findMany: asyncMock(),
    },
    tag: {
      findUnique: asyncMock(),
      findMany: asyncMock(),
    },
    citizenTag: {
      findFirst: asyncMock(),
      create: asyncMock(),
      delete: asyncMock(),
    },
    conversation: {
      count: asyncMock(),
      findFirst: asyncMock(),
    },
    eventRegistration: {
      findMany: asyncMock(),
    },
    _store: store,
  };
}

describe('CitizensService — unit', () => {
  it('crea un ciudadano normalizando el teléfono', async () => {
    const prisma = makePrismaMock();
    // @ts-ignore
    const svc = new CitizensService(new CitizenRepository(prisma));

    const created = await svc.create({ phone: '+521234567890', name: 'Juan' });

    expect(prisma.citizen.create).toHaveBeenCalledTimes(1);
    const call = (prisma.citizen.create as jest.Mock).mock.calls[0][0] as {
      data: { phone: string };
    };
    expect(call.data.phone).toBe('521234567890');
    expect(created.phone).toBe('521234567890');
  });

  it('list devuelve paginación cursor-based correctamente', async () => {
    const prisma = makePrismaMock();
    const rows = [
      {
        id: 'c1',
        phone: '521',
        name: 'A',
        lastName: 'X',
        email: null,
        sourceChannel: 'whatsapp',
        leadStatus: 'new',
        consentGiven: false,
        consentAt: null,
        neighborhood: null,
        neighborhoodId: null,
        interests: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'c2',
        phone: '522',
        name: 'B',
        lastName: 'Y',
        email: null,
        sourceChannel: 'whatsapp',
        leadStatus: 'new',
        consentGiven: false,
        consentAt: null,
        neighborhood: null,
        neighborhoodId: null,
        interests: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    prisma.citizen.findMany.mockResolvedValue(rows);

    // @ts-ignore
    const svc = new CitizensService(new CitizenRepository(prisma));
    const result = await svc.list({ cursor: undefined, limit: 1, filters: {} });

    expect(result.items.length).toBe(1);
    expect(result.meta.hasNextPage).toBe(true);
    expect(result.meta.nextCursor).toBe('c1');
  });

  it('list aplica elegibilidad para campañas en el mismo where compartido', async () => {
    const prisma = makePrismaMock();
    prisma.citizen.findMany.mockResolvedValue([]);

    // @ts-ignore
    const svc = new CitizensService(new CitizenRepository(prisma));
    await svc.list({
      cursor: undefined,
      limit: 50,
      filters: { consentGiven: true, hasPhone: true },
    });

    expect(prisma.citizen.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          consentGiven: true,
          phone: { not: null },
        },
        take: 51,
      }),
    );
  });

  it('list no agrega contains vacío de teléfono en búsquedas por nombre', async () => {
    const prisma = makePrismaMock();
    prisma.citizen.findMany.mockResolvedValue([]);

    // @ts-ignore
    const svc = new CitizensService(new CitizenRepository(prisma));
    await svc.list({ cursor: undefined, limit: 20, filters: { search: 'Ana' } });

    const call = (prisma.citizen.findMany as jest.Mock).mock.calls[0][0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    expect(call.where.OR).toEqual([
      { name: { contains: 'Ana', mode: 'insensitive' } },
      { lastName: { contains: 'Ana', mode: 'insensitive' } },
      { email: { contains: 'Ana', mode: 'insensitive' } },
    ]);
  });

  it('list normaliza el teléfono cuando search contiene dígitos', async () => {
    const prisma = makePrismaMock();
    prisma.citizen.findMany.mockResolvedValue([]);

    // @ts-ignore
    const svc = new CitizensService(new CitizenRepository(prisma));
    await svc.list({
      cursor: undefined,
      limit: 20,
      filters: { search: '+52 1 961 123 4567' },
    });

    const call = (prisma.citizen.findMany as jest.Mock).mock.calls[0][0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    expect(call.where.OR).toContainEqual({ phone: { contains: '529611234567' } });
  });

  it('parsea filtros booleanos desde query params HTTP', () => {
    expect(
      CitizenListFiltersSchema.parse({ consentGiven: 'true', hasPhone: 'true' }),
    ).toMatchObject({ consentGiven: true, hasPhone: true });
  });

  it('asigna una etiqueta a un ciudadano', async () => {
    const prisma = makePrismaMock();

    // preparar citizen y tag
    prisma.citizen.findUnique.mockResolvedValue({ id: 'cit-1' });
    prisma.tag.findUnique.mockResolvedValue({ id: 'tag-1', name: 'Etiqueta' });
    prisma.citizenTag.findFirst.mockResolvedValue(null);
    prisma.citizenTag.create.mockResolvedValue({
      id: 'ct-1',
      citizenId: 'cit-1',
      tagId: 'tag-1',
      assignedAt: new Date(),
    });

    // @ts-ignore
    const svc = new CitizensService(new CitizenRepository(prisma));
    const created = await svc.assignTag('cit-1', 'tag-1', 'user-1');

    expect(prisma.citizen.findUnique).toHaveBeenCalled();
    expect(prisma.tag.findUnique).toHaveBeenCalled();
    expect(prisma.citizenTag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { citizenId: 'cit-1', tagId: 'tag-1', assignedById: 'user-1' },
      }),
    );
    expect(created).toBeDefined();
  });

  it('list aplica filtros phone y tagIds al where', async () => {
    const prisma = makePrismaMock();
    prisma.citizen.findMany.mockResolvedValue([]);

    // @ts-ignore
    const svc = new CitizensService(new CitizenRepository(prisma));
    await svc.list({
      cursor: undefined,
      limit: 20,
      filters: {
        phone: '+52 966 123 4567',
        tagIds: ['tag-1'],
      },
    });

    expect(prisma.citizen.findMany).toHaveBeenCalledTimes(1);

    const call = (prisma.citizen.findMany as jest.Mock).mock.calls[0][0] as {
      where: {
        phone?: { contains: string };
        citizenTags?: { some: { tagId: { in: string[] } } };
      };
    };

    expect(call.where.phone).toEqual({ contains: '529661234567' });
    expect(call.where.citizenTags).toEqual({
      some: {
        tagId: { in: ['tag-1'] },
      },
    });
  });

  it('bulkTagAssignmentPartial procesa parcialmente y reporta errores por item', async () => {
    const prisma = makePrismaMock();

    prisma.citizen.findMany.mockResolvedValue([{ id: 'cit-1' }]);
    prisma.tag.findMany.mockResolvedValue([{ id: 'tag-1' }]);
    prisma.citizenTag.findFirst.mockResolvedValue(null);
    prisma.citizenTag.create.mockResolvedValue({ id: 'ct-1' });

    // @ts-ignore
    const svc = new CitizensService(new CitizenRepository(prisma));

    const result = await svc.bulkTagAssignmentPartial({
      citizenIds: ['cit-1', 'cit-2'],
      tagIds: ['tag-1', 'tag-2'],
      operation: 'assign',
    });

    expect(result.operation).toBe('assign');
    expect(result.processed).toBe(4);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(3);
    expect(result.errors).toEqual([
      {
        citizenId: 'cit-1',
        tagId: 'tag-2',
        code: 'TAG_NOT_FOUND',
        message: 'Etiqueta no encontrada',
      },
      {
        citizenId: 'cit-2',
        tagId: 'tag-1',
        code: 'CITIZEN_NOT_FOUND',
        message: 'Ciudadano no encontrado',
      },
      {
        citizenId: 'cit-2',
        tagId: 'tag-2',
        code: 'CITIZEN_NOT_FOUND',
        message: 'Ciudadano no encontrado',
      },
    ]);
    expect(prisma.citizenTag.create).toHaveBeenCalledTimes(1);
  });
});
