import type { Coordinator, Prisma } from '@prisma/client';
import type { PrismaService } from '../services/prisma.service';

const coordinatorWithRelationsInclude = {
  section: { select: { id: true, sectionCode: true } },
  structure: { select: { id: true, name: true, slug: true, color: true } },
  user: { select: { id: true, email: true, isActive: true } },
} as const;

export type CoordinatorWithRelations = Prisma.CoordinatorGetPayload<{
  include: typeof coordinatorWithRelationsInclude;
}>;

export class CoordinatorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CoordinatorWithRelations | null> {
    return this.prisma.coordinator.findUnique({
      where: { id },
      include: coordinatorWithRelationsInclude,
    });
  }

  async findByEmail(email: string): Promise<Coordinator | null> {
    return this.prisma.coordinator.findFirst({ where: { email } });
  }

  async findByUserId(userId: string): Promise<Coordinator | null> {
    return this.prisma.coordinator.findUnique({ where: { userId } });
  }

  async list(
    params: { sectionId?: string; structureId?: string; includeInactive?: boolean } = {},
  ): Promise<CoordinatorWithRelations[]> {
    return this.prisma.coordinator.findMany({
      where: {
        ...(params.includeInactive ? {} : { isActive: true }),
        ...(params.sectionId ? { sectionId: params.sectionId } : {}),
        ...(params.structureId ? { structureId: params.structureId } : {}),
      },
      include: coordinatorWithRelationsInclude,
      orderBy: { fullName: 'asc' },
    });
  }

  async create(data: Prisma.CoordinatorUncheckedCreateInput): Promise<Coordinator> {
    return this.prisma.coordinator.create({ data });
  }

  async update(id: string, data: Prisma.CoordinatorUncheckedUpdateInput): Promise<Coordinator> {
    return this.prisma.coordinator.update({ where: { id }, data });
  }

  async softDelete(id: string): Promise<Coordinator> {
    return this.prisma.coordinator.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
