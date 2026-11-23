import { Prisma } from '@prisma/client';
import { PrismaService } from '../services/prisma.service';

const tagSelect = {
  id: true,
  name: true,
  description: true,
  color: true,
  createdAt: true,
} as const;

export type TagRecord = Prisma.TagGetPayload<{ select: typeof tagSelect }>;

export class TagRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    where: Prisma.TagWhereInput;
    cursor?: string;
    limit: number;
  }): Promise<TagRecord[]> {
    return this.prisma.tag.findMany({
      where: params.where,
      orderBy: { id: 'asc' },
      take: params.limit + 1,
      ...(params.cursor !== undefined ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: tagSelect,
    });
  }

  async findById(id: string): Promise<TagRecord | null> {
    return this.prisma.tag.findUnique({
      where: { id },
      select: tagSelect,
    });
  }

  async findByIdMinimal(id: string): Promise<{ id: string } | null> {
    return this.prisma.tag.findUnique({ where: { id }, select: { id: true } });
  }

  async findByNameInsensitive(name: string): Promise<{ id: string } | null> {
    return this.prisma.tag.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  async findByNameInsensitiveExcludingId(
    name: string,
    excludedId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.tag.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        NOT: { id: excludedId },
      },
      select: { id: true },
    });
  }

  async create(data: { name: string; description?: string; color?: string }): Promise<TagRecord> {
    return this.prisma.tag.create({
      data,
      select: tagSelect,
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      color?: string;
    },
  ): Promise<TagRecord> {
    return this.prisma.tag.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
      },
      select: tagSelect,
    });
  }

  async countCitizenTagUsage(tagId: string): Promise<number> {
    return this.prisma.citizenTag.count({ where: { tagId } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.tag.delete({ where: { id } });
  }
}
