import { describe, expect, it, jest } from '@jest/globals';
import { CoordinatorRepository } from '../../../repositories/coordinator.repository';

type AsyncMock<Args extends unknown[] = [], Result = unknown> = (...args: Args) => Promise<Result>;

function createPrismaMock() {
  return {
    coordinator: {
      findUnique: jest.fn<AsyncMock<[unknown], unknown>>(),
      findFirst: jest.fn<AsyncMock<[unknown], unknown>>(),
      findMany: jest.fn<AsyncMock<[unknown], unknown[]>>(),
      create: jest.fn<AsyncMock<[unknown], unknown>>(),
      update: jest.fn<AsyncMock<[unknown], unknown>>(),
      count: jest.fn<AsyncMock<[unknown], number>>(),
    },
  };
}

describe('CoordinatorRepository', () => {
  it('finds a coordinator by id with section relation', async () => {
    const prisma = createPrismaMock();
    prisma.coordinator.findUnique.mockResolvedValue({ id: 'coord-1', fullName: 'María' });

    const repo = new CoordinatorRepository(prisma as never);
    const result = await repo.findById('coord-1');

    expect(result).toMatchObject({ id: 'coord-1' });
    expect(prisma.coordinator.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'coord-1' },
        include: {
          section: { select: { id: true, sectionCode: true } },
          structure: { select: { id: true, name: true, slug: true, color: true } },
          user: { select: { id: true, email: true, isActive: true } },
        },
      }),
    );
  });

  it('finds a coordinator by email', async () => {
    const prisma = createPrismaMock();
    prisma.coordinator.findFirst.mockResolvedValue({ id: 'coord-1', email: 'maria@ejemplo.test' });

    const repo = new CoordinatorRepository(prisma as never);
    const result = await repo.findByEmail('maria@ejemplo.test');

    expect(result).toMatchObject({ id: 'coord-1' });
    expect(prisma.coordinator.findFirst).toHaveBeenCalledWith({ where: { email: 'maria@ejemplo.test' } });
  });

  it('lists active coordinators filtered by section', async () => {
    const prisma = createPrismaMock();
    prisma.coordinator.findMany.mockResolvedValue([{ id: 'coord-1' }]);

    const repo = new CoordinatorRepository(prisma as never);
    const result = await repo.list({ sectionId: 'section-1' });

    expect(result).toHaveLength(1);
    expect(prisma.coordinator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, sectionId: 'section-1' },
        orderBy: { fullName: 'asc' },
      }),
    );
  });

  it('lists active coordinators filtered by structure', async () => {
    const prisma = createPrismaMock();
    prisma.coordinator.findMany.mockResolvedValue([{ id: 'coord-1' }]);

    const repo = new CoordinatorRepository(prisma as never);
    await repo.list({ structureId: 'struct-1' });

    expect(prisma.coordinator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, structureId: 'struct-1' },
      }),
    );
  });

  it('creates a coordinator', async () => {
    const prisma = createPrismaMock();
    prisma.coordinator.create.mockResolvedValue({ id: 'coord-1' });

    const repo = new CoordinatorRepository(prisma as never);
    const result = await repo.create({
      sectionId: 'section-1',
      fullName: 'María',
      email: 'maria@ejemplo.test',
    });

    expect(result).toMatchObject({ id: 'coord-1' });
    expect(prisma.coordinator.create).toHaveBeenCalledWith({
      data: { sectionId: 'section-1', fullName: 'María', email: 'maria@ejemplo.test' },
    });
  });

  it('updates a coordinator', async () => {
    const prisma = createPrismaMock();
    prisma.coordinator.update.mockResolvedValue({ id: 'coord-1', fullName: 'María Updated' });

    const repo = new CoordinatorRepository(prisma as never);
    const result = await repo.update('coord-1', { fullName: 'María Updated' });

    expect(result).toMatchObject({ fullName: 'María Updated' });
    expect(prisma.coordinator.update).toHaveBeenCalledWith({
      where: { id: 'coord-1' },
      data: { fullName: 'María Updated' },
    });
  });

  it('soft deletes a coordinator by setting isActive to false', async () => {
    const prisma = createPrismaMock();
    prisma.coordinator.update.mockResolvedValue({ id: 'coord-1', isActive: false });

    const repo = new CoordinatorRepository(prisma as never);
    const result = await repo.softDelete('coord-1');

    expect(result).toMatchObject({ isActive: false });
    expect(prisma.coordinator.update).toHaveBeenCalledWith({
      where: { id: 'coord-1' },
      data: { isActive: false },
    });
  });
});
