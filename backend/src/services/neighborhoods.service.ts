import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { NeighborhoodRecord, NeighborhoodRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { neighborhoodMatchKey, normalizeNeighborhoodName } from '../utils/neighborhood-match-key';

export const CreateNeighborhoodSchema = z.object({
  name: z.string().trim().min(2).max(255),
  sectionId: z.string().uuid().optional(),
  postalCode: z.string().trim().max(10).optional(),
  municipality: z.string().trim().max(100).optional(),
});

export const UpdateNeighborhoodSchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    sectionId: z.string().uuid().nullable().optional(),
    postalCode: z.string().trim().max(10).optional(),
    municipality: z.string().trim().max(100).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.sectionId !== undefined ||
      data.postalCode !== undefined ||
      data.municipality !== undefined,
    {
      message: 'Al menos un campo debe ser enviado',
    },
  );

export const NeighborhoodIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const NeighborhoodListFiltersSchema = z.object({
  search: z.string().trim().min(1).max(255).optional(),
  zone: z.string().trim().min(1).max(100).optional(),
  sectionId: z.string().uuid().optional(),
  municipality: z.string().trim().min(1).max(100).optional(),
  postalCode: z.string().trim().min(1).max(10).optional(),
});

type CreateNeighborhoodInput = z.infer<typeof CreateNeighborhoodSchema>;
type UpdateNeighborhoodInput = z.infer<typeof UpdateNeighborhoodSchema>;
type NeighborhoodListFilters = z.infer<typeof NeighborhoodListFiltersSchema>;

export type NeighborhoodResponse = {
  id: string;
  name: string;
  sectionId: string | undefined;
  zone: string | undefined;
  postalCode: string | undefined;
  municipality: string | undefined;
  state: string;
  stateCode: string;
  createdAt: Date;
  updatedAt: Date;
};

export type NeighborhoodListResult = {
  items: NeighborhoodResponse[];
  meta: {
    nextCursor: string | undefined;
    hasNextPage: boolean;
    count: number;
  };
};

export class NeighborhoodsService {
  constructor(private readonly neighborhoods: NeighborhoodRepository) {}

  /** Listado mínimo para formularios públicos (sin autenticación). */
  async listPublicBarrios(): Promise<Array<{ id: string; name: string }>> {
    return this.neighborhoods.listPublicBarrios();
  }

  async list(params: {
    cursor: string | undefined;
    limit: number;
    filters: NeighborhoodListFilters;
  }): Promise<NeighborhoodListResult> {
    const where: Prisma.NeighborhoodWhereInput = {};

    if (params.filters.search !== undefined) {
      const search = normalizeNeighborhoodName(params.filters.search);
      const matchKey = neighborhoodMatchKey(params.filters.search);
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { matchKey: { contains: matchKey } },
      ];
    }
    if (params.filters.sectionId !== undefined) {
      where.AND = [{ OR: [{ sectionId: params.filters.sectionId }, { sectionId: null }] }];
    }
    if (params.filters.municipality !== undefined) {
      where.municipality = params.filters.municipality;
    }
    if (params.filters.postalCode !== undefined) {
      where.postalCode = params.filters.postalCode;
    }

    const rows = await this.neighborhoods.list({
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

  async create(input: CreateNeighborhoodInput): Promise<NeighborhoodResponse> {
    const name = normalizeNeighborhoodName(input.name);
    const matchKey = neighborhoodMatchKey(input.name);

    const existing = await this.neighborhoods.findBySectionAndMatchKey(input.sectionId, matchKey);

    if (existing) {
      throw AppError.conflict('Ya existe un barrio con ese nombre');
    }

    const created = await this.neighborhoods.create({
      name,
      matchKey,
      sectionId: input.sectionId,
      ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
      ...(input.municipality !== undefined ? { municipality: input.municipality } : {}),
    });

    return this.toResponse(created);
  }

  async update(id: string, input: UpdateNeighborhoodInput): Promise<NeighborhoodResponse> {
    const existing = await this.neighborhoods.findByIdMinimal(id);

    if (!existing) {
      throw AppError.notFound('Barrio no encontrado');
    }

    const nextMatchKey = input.name !== undefined ? neighborhoodMatchKey(input.name) : undefined;
    const nextSectionId = input.sectionId === undefined ? existing.sectionId : input.sectionId;

    if (
      nextMatchKey !== undefined &&
      (nextMatchKey !== existing.matchKey || nextSectionId !== existing.sectionId)
    ) {
      const duplicate = await this.neighborhoods.findBySectionAndMatchKey(
        nextSectionId ?? undefined,
        nextMatchKey,
        id,
      );

      if (duplicate) {
        throw AppError.conflict('Ya existe un barrio con ese nombre');
      }
    }

    const updated = await this.neighborhoods.update(id, {
      name: input.name !== undefined ? normalizeNeighborhoodName(input.name) : undefined,
      matchKey: nextMatchKey,
      sectionId: input.sectionId,
      ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
      ...(input.municipality !== undefined ? { municipality: input.municipality } : {}),
    });

    return this.toResponse(updated);
  }

  async deleteNeighborhood(id: string): Promise<NeighborhoodResponse> {
    const existing = await this.neighborhoods.findById(id);

    if (!existing) {
      throw AppError.notFound('Barrio no encontrado');
    }

    const citizensCount = await this.neighborhoods.countCitizensUsing(id);

    if (citizensCount > 0) {
      throw AppError.conflict('No se puede eliminar un barrio que está en uso por ciudadanos');
    }

    await this.neighborhoods.delete(id);
    return this.toResponse(existing);
  }

  private toResponse(item: NeighborhoodRecord): NeighborhoodResponse {
    return {
      id: item.id,
      name: item.name,
      sectionId: item.sectionId ?? undefined,
      zone: item.zone ?? undefined,
      postalCode: item.postalCode ?? undefined,
      municipality: item.municipality ?? undefined,
      state: item.state,
      stateCode: item.stateCode,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
