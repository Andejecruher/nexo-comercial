import type { OrganizationalStructure, Prisma } from '@prisma/client';
import type { PrismaService } from '../services/prisma.service';

export class StructureRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<OrganizationalStructure | null> {
    return this.prisma.organizationalStructure.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<OrganizationalStructure | null> {
    return this.prisma.organizationalStructure.findUnique({ where: { slug } });
  }

  async list(params: { includeInactive?: boolean } = {}): Promise<OrganizationalStructure[]> {
    return this.prisma.organizationalStructure.findMany({
      where: params.includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(
    data: Prisma.OrganizationalStructureUncheckedCreateInput,
  ): Promise<OrganizationalStructure> {
    return this.prisma.organizationalStructure.create({ data });
  }

  async update(
    id: string,
    data: Prisma.OrganizationalStructureUncheckedUpdateInput,
  ): Promise<OrganizationalStructure> {
    return this.prisma.organizationalStructure.update({ where: { id }, data });
  }

  async countActiveCoordinators(structureId: string): Promise<number> {
    return this.prisma.coordinator.count({
      where: { structureId, isActive: true },
    });
  }
}
