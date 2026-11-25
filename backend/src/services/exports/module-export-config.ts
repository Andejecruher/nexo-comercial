import type { ExportModule, Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../../config/env.config';
import type { ScopeContext } from '../../types/auth.types';
import type { PrismaService } from '../prisma.service';
import { CitizenListFiltersSchema } from '../citizens.service';

const CitizenExportFiltersSchema = z.object(CitizenListFiltersSchema.shape).strict();

const forbiddenPaginationFields = new Set([
  'take',
  'skip',
  'limit',
  'cursor',
  'page',
  'pageSize',
  'offset',
]);

export type ExportRow = Record<string, unknown>;
export type ExportColumn = { header: string; key: string; numFmt?: string; width?: number };

export type ModuleExportConfig = {
  module: ExportModule;
  subfolder: string;
  filterSchema: z.ZodType<Record<string, unknown>>;
  columns: ExportColumn[];
  fetchPage: (
    prisma: PrismaService,
    scope: ScopeContext | undefined,
    filters: Record<string, unknown>,
    cursor?: string,
  ) => Promise<ExportRow[]>;
};

function pageArgs(cursor?: string) {
  return {
    take: env.EXPORT_BATCH_SIZE,
    orderBy: { id: 'asc' as const },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

function assertNoPagination(input: unknown): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  const field = Object.keys(input).find((key) => forbiddenPaginationFields.has(key));
  if (field) throw new Error(`Pagination field '${field}' is not supported for exports`);
}

function validatedSchema<T extends z.ZodType<Record<string, unknown>>>(schema: T): T {
  return schema.superRefine((value, ctx) => {
    try {
      assertNoPagination(value);
    } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
    }
  }) as T;
}

const citizensConfig: ModuleExportConfig = {
    module: 'citizens',
    subfolder: 'citizens',
    filterSchema: validatedSchema(CitizenExportFiltersSchema),
    columns: [
      { header: 'ID', key: 'id', numFmt: '@' },
      { header: 'Nombre', key: 'name', numFmt: '@' },
      { header: 'Teléfono', key: 'phone', numFmt: '@' },
      { header: 'Correo', key: 'email', numFmt: '@' },
      { header: 'Estatus del cliente potencial', key: 'leadStatus', numFmt: '@' },
      { header: 'Colonia', key: 'neighborhood', numFmt: '@' },
      { header: 'Fecha de registro', key: 'createdAt', numFmt: 'dd/mm/yyyy' },
    ],
    async fetchPage(prisma, _scope, filters, cursor) {
      const where: Prisma.CitizenWhereInput = {};
      if (filters.leadStatus) where.leadStatus = filters.leadStatus as never;
      if (filters.sourceChannel) where.sourceChannel = filters.sourceChannel as never;
      if (filters.neighborhoodId) where.neighborhoodId = filters.neighborhoodId as string;
      if (filters.phone) where.phone = { contains: filters.phone as string };
      if (filters.search)
        where.OR = [
          { name: { contains: filters.search as string, mode: 'insensitive' } },
          { lastName: { contains: filters.search as string, mode: 'insensitive' } },
          { email: { contains: filters.search as string, mode: 'insensitive' } },
        ];
      if (filters.tagIds)
        where.citizenTags = { some: { tagId: { in: filters.tagIds as string[] } } };
      const rows = await prisma.citizen.findMany({ where, ...pageArgs(cursor) });
      return rows.map((row) => ({
        id: row.id,
        name: [row.name, row.lastName].filter(Boolean).join(' '),
        phone: row.phone,
        email: row.email,
        leadStatus: row.leadStatus,
        neighborhood: row.neighborhood,
        createdAt: row.createdAt,
      }));
    },
};

export function resolveExportModule(value: string): ModuleExportConfig {
  if (value !== 'citizens') {
    throw new Error('Unsupported export module');
  }
  return citizensConfig;
}
