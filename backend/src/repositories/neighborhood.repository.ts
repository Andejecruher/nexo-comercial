import { Prisma } from '@prisma/client';
import { PrismaService } from '../services/prisma.service';
import { neighborhoodMatchKey } from '../utils/neighborhood-match-key';

const neighborhoodSelect = {
  id: true,
  name: true,
  sectionId: true,
  zone: true,
  postalCode: true,
  municipality: true,
  state: true,
  stateCode: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type NeighborhoodRecord = Prisma.NeighborhoodGetPayload<{
  select: typeof neighborhoodSelect;
}>;

export class NeighborhoodRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPublicBarrios(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.neighborhood.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async list(params: {
    where: Prisma.NeighborhoodWhereInput;
    cursor?: string;
    limit: number;
  }): Promise<NeighborhoodRecord[]> {
    return this.prisma.neighborhood.findMany({
      where: params.where,
      orderBy: { id: 'asc' },
      take: params.limit + 1,
      ...(params.cursor !== undefined ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: neighborhoodSelect,
    });
  }

  async findById(id: string): Promise<NeighborhoodRecord | null> {
    return this.prisma.neighborhood.findUnique({
      where: { id },
      select: neighborhoodSelect,
    });
  }

  async findByIdMinimal(
    id: string,
  ): Promise<{ id: string; matchKey: string; sectionId: string | null } | null> {
    return this.prisma.neighborhood.findUnique({
      where: { id },
      select: { id: true, matchKey: true, sectionId: true },
    });
  }

  async findBySectionAndMatchKey(
    sectionId: string | undefined,
    matchKey: string,
    excludedId?: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.neighborhood.findFirst({
      where: {
        sectionId: sectionId ?? null,
        matchKey,
        ...(excludedId ? { NOT: { id: excludedId } } : {}),
      },
      select: { id: true },
    });
  }

  async findByNameInsensitiveOrNameLower(params: {
    name: string;
    nameLower: string;
  }): Promise<{ id: string; name: string } | null> {
    return this.prisma.neighborhood.findFirst({
      where: {
        OR: [
          { name: { equals: params.name, mode: 'insensitive' } },
          { matchKey: neighborhoodMatchKey(params.nameLower) },
        ],
      },
      select: { id: true, name: true },
    });
  }

  async listSuggestions(params: {
    query: string;
    normalizedQuery: string;
    limit: number;
  }): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.neighborhood.findMany({
      where: {
        OR: [
          { name: { contains: params.query, mode: 'insensitive' } },
          { matchKey: { contains: neighborhoodMatchKey(params.normalizedQuery) } },
        ],
      },
      orderBy: { name: 'asc' },
      take: params.limit,
      select: { id: true, name: true },
    });
  }

  async create(data: {
    name: string;
    matchKey: string;
    sectionId?: string;
    postalCode?: string;
    municipality?: string;
  }): Promise<NeighborhoodRecord> {
    return this.prisma.neighborhood.create({
      data,
      select: neighborhoodSelect,
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      matchKey?: string;
      sectionId?: string | null;
      postalCode?: string;
      municipality?: string;
    },
  ): Promise<NeighborhoodRecord> {
    return this.prisma.neighborhood.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.matchKey !== undefined ? { matchKey: data.matchKey } : {}),
        ...(data.sectionId !== undefined ? { sectionId: data.sectionId } : {}),
        ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
        ...(data.municipality !== undefined ? { municipality: data.municipality } : {}),
      },
      select: neighborhoodSelect,
    });
  }

  async countCitizensUsing(neighborhoodId: string): Promise<number> {
    return this.prisma.citizen.count({ where: { neighborhoodId } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.neighborhood.delete({ where: { id } });
  }
}
