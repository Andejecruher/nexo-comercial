import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { TagRecord, TagRepository } from '../repositories';
import { AppError } from '../utils/app-error';

export const CreateTagSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(1).max(4000).optional(),
  color: z.string().trim().min(1).max(20).optional(),
});

export const UpdateTagSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().min(1).max(4000).optional(),
    color: z.string().trim().min(1).max(20).optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.description !== undefined || data.color !== undefined,
    { message: 'Al menos un campo debe ser enviado' },
  );

export const TagIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const TagListFiltersSchema = z.object({
  search: z.string().trim().min(1).max(255).optional(),
  color: z.string().trim().min(1).max(20).optional(),
});

type CreateTagInput = z.infer<typeof CreateTagSchema>;
type UpdateTagInput = z.infer<typeof UpdateTagSchema>;
type TagListFilters = z.infer<typeof TagListFiltersSchema>;

export type TagResponse = {
  id: string;
  name: string;
  description: string | undefined;
  color: string | undefined;
  createdAt: Date;
};

export type TagListResult = {
  items: TagResponse[];
  meta: {
    nextCursor: string | undefined;
    hasNextPage: boolean;
    count: number;
  };
};

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export class TagsService {
  constructor(private readonly tags: TagRepository) {}

  async list(params: {
    cursor: string | undefined;
    limit: number;
    filters: TagListFilters;
  }): Promise<TagListResult> {
    const where: Prisma.TagWhereInput = {};

    if (params.filters.color !== undefined) {
      where.color = { contains: params.filters.color, mode: 'insensitive' };
    }

    if (params.filters.search !== undefined) {
      const search = params.filters.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const rows = await this.tags.list({
      where,
      cursor: params.cursor,
      limit: params.limit,
    });

    const hasNextPage = rows.length > params.limit;
    const items = hasNextPage ? rows.slice(0, params.limit) : rows;

    return {
      items: items.map((item) => this.toResponse(item)),
      meta: {
        nextCursor: hasNextPage ? items[items.length - 1]?.id : undefined,
        hasNextPage,
        count: items.length,
      },
    };
  }

  async create(input: CreateTagInput): Promise<TagResponse> {
    const normalizedName = normalizeName(input.name);

    const existing = await this.tags.findByNameInsensitive(normalizedName);

    if (existing) {
      throw AppError.conflict('Ya existe una etiqueta con ese nombre');
    }

    const created = await this.tags.create({
      name: normalizedName,
      description: input.description,
      color: input.color,
    });

    return this.toResponse(created);
  }

  async update(id: string, input: UpdateTagInput): Promise<TagResponse> {
    const existing = await this.tags.findByIdMinimal(id);

    if (!existing) {
      throw AppError.notFound('Etiqueta no encontrada');
    }

    if (input.name !== undefined) {
      const normalizedName = normalizeName(input.name);
      const duplicate = await this.tags.findByNameInsensitiveExcludingId(normalizedName, id);

      if (duplicate) {
        throw AppError.conflict('Ya existe una etiqueta con ese nombre');
      }
    }

    const updated = await this.tags.update(id, {
      name: input.name !== undefined ? normalizeName(input.name) : undefined,
      description: input.description,
      color: input.color,
    });

    return this.toResponse(updated);
  }

  async deleteTag(id: string): Promise<TagResponse> {
    const existing = await this.tags.findById(id);

    if (!existing) {
      throw AppError.notFound('Etiqueta no encontrada');
    }

    const usageCount = await this.tags.countCitizenTagUsage(id);
    if (usageCount > 0) {
      throw AppError.conflict('No se puede eliminar una etiqueta que está asignada a ciudadanos');
    }

    await this.tags.delete(id);
    return this.toResponse(existing);
  }

  private toResponse(item: TagRecord): TagResponse {
    return {
      id: item.id,
      name: item.name,
      description: item.description ?? undefined,
      color: item.color ?? undefined,
      createdAt: item.createdAt,
    };
  }
}
