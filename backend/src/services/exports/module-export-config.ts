import type { ExportModule, Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../../config/env.config';
import { scopeWhere } from '../../middlewares/scope.middleware';
import type { ScopeContext } from '../../types/auth.types';
import { nameSearchTokens } from '../../utils/hmac-index';
import { sexBlindIndex } from '../ine/promovido-validations';
import { reveal } from '../../utils/crypto';
import type { PromovidoData } from '../promovido.service';
import type { PrismaService } from '../prisma.service';
import { CitizenListFiltersSchema } from '../citizens.service';

export const PromovidoListFiltersSchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    leaderId: z.string().uuid().optional(),
    sex: z.enum(['H', 'M']).optional(),
    sectionId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const LeaderListFiltersSchema = z
  .object({
    sectionId: z.string().uuid().optional(),
    coordinatorId: z.string().uuid().optional(),
    q: z.string().trim().min(1).max(100).optional(),
    includeInactive: z.boolean().optional(),
  })
  .strict();

const CoordinatorListFiltersSchema = z
  .object({
    sectionId: z.string().uuid().optional(),
    structureId: z.string().uuid().optional(),
  })
  .strict();

const LeaderExportFiltersSchema = z.object(LeaderListFiltersSchema.shape).strict();
const CoordinatorExportFiltersSchema = z.object(CoordinatorListFiltersSchema.shape).strict();
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

const configs: Record<ExportModule, ModuleExportConfig> = {
  promoted: {
    module: 'promoted',
    subfolder: 'promoted',
    filterSchema: validatedSchema(PromovidoListFiltersSchema),
    columns: [
      { header: 'ID', key: 'id', numFmt: '@' },
      { header: 'Nombre completo', key: 'fullName', numFmt: '@' },
      { header: 'CURP', key: 'curp', numFmt: '@' },
      { header: 'Clave de elector', key: 'voterKey', numFmt: '@' },
      { header: 'Dirección', key: 'address', numFmt: '@' },
      { header: 'Teléfono', key: 'phone', numFmt: '@' },
      { header: 'Líder', key: 'leaderName', numFmt: '@' },
      { header: 'Sección electoral', key: 'sectionCode', numFmt: '@' },
      { header: 'Activo', key: 'isActive', numFmt: '@' },
      { header: 'Fecha de registro', key: 'createdAt', numFmt: 'dd/mm/yyyy' },
    ],
    async fetchPage(prisma, scope, filters, cursor) {
      const where: Prisma.PromovidoWhereInput = { ...(scopeWhere(scope) ?? {}) };
      if (filters.leaderId) where.leaderId = filters.leaderId as string;
      if (filters.sectionId) where.sectionId = filters.sectionId as string;
      if (filters.isActive !== undefined) where.isActive = filters.isActive as boolean;
      if (filters.sex) where.sexBlindIndex = sexBlindIndex(filters.sex as 'H' | 'M');
      if (filters.q) where.nameSearchTokens = { hasEvery: nameSearchTokens(filters.q as string) };
      const rows = await prisma.promovido.findMany({
        where,
        include: {
          leader: { select: { fullName: true } },
          section: { select: { sectionCode: true } },
        },
        ...pageArgs(cursor),
      });
      return rows.map((row) => {
        const data = reveal<PromovidoData>(row.dataEncrypted) ?? ({} as PromovidoData);
        return {
          id: row.id,
          fullName: [data.firstName, data.paternalLastName, data.maternalLastName]
            .filter(Boolean)
            .join(' '),
          curp: data.curp,
          voterKey: data.voterKey,
          address: data.address,
          phone: data.phone,
          leaderName: row.leader.fullName,
          sectionCode: row.section.sectionCode,
          isActive: row.isActive ? 'Yes' : 'No',
          createdAt: row.createdAt,
        };
      });
    },
  },
  leaders: {
    module: 'leaders',
    subfolder: 'leaders',
    filterSchema: validatedSchema(LeaderExportFiltersSchema),
    columns: [
      { header: 'ID', key: 'id', numFmt: '@' },
      { header: 'Nombre completo', key: 'fullName', numFmt: '@' },
      { header: 'Correo', key: 'email', numFmt: '@' },
      { header: 'Teléfono', key: 'phone', numFmt: '@' },
      { header: 'Coordinador', key: 'coordinator', numFmt: '@' },
      { header: 'Sección electoral', key: 'section', numFmt: '@' },
      { header: 'Activo', key: 'isActive', numFmt: '@' },
      { header: 'Fecha de registro', key: 'createdAt', numFmt: 'dd/mm/yyyy' },
    ],
    async fetchPage(prisma, scope, filters, cursor) {
      const where: Prisma.LeaderWhereInput = {};
      if (scope?.kind === 'leader') where.id = scope.leaderId;
      if (scope?.kind === 'coordinator') where.coordinatorId = scope.coordinatorId;
      if (filters.sectionId) where.sectionId = filters.sectionId as string;
      if (filters.coordinatorId) where.coordinatorId = filters.coordinatorId as string;
      if (!filters.includeInactive) where.isActive = true;
      if (filters.q)
        where.OR = ['fullName', 'email'].map((field) => ({
          [field]: { contains: filters.q, mode: 'insensitive' },
        }));
      const rows = await prisma.leader.findMany({
        where,
        include: { coordinator: true, section: true },
        ...pageArgs(cursor),
      });
      return rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        coordinator: row.coordinator.fullName,
        section: row.section.sectionCode,
        isActive: row.isActive ? 'Yes' : 'No',
        createdAt: row.createdAt,
      }));
    },
  },
  coordinators: {
    module: 'coordinators',
    subfolder: 'coordinators',
    filterSchema: validatedSchema(CoordinatorExportFiltersSchema),
    columns: [
      { header: 'ID', key: 'id', numFmt: '@' },
      { header: 'Nombre completo', key: 'fullName', numFmt: '@' },
      { header: 'Correo', key: 'email', numFmt: '@' },
      { header: 'Teléfono', key: 'phone', numFmt: '@' },
      { header: 'Sección electoral', key: 'section', numFmt: '@' },
      { header: 'Estructura', key: 'structure', numFmt: '@' },
      { header: 'Activo', key: 'isActive', numFmt: '@' },
    ],
    async fetchPage(prisma, scope, filters, cursor) {
      const where: Prisma.CoordinatorWhereInput = {};
      if (scope?.kind === 'coordinator') where.id = scope.coordinatorId;
      if (scope?.kind === 'leader') where.leaders = { some: { id: scope.leaderId } };
      if (filters.sectionId) where.sectionId = filters.sectionId as string;
      if (filters.structureId) where.structureId = filters.structureId as string;
      const rows = await prisma.coordinator.findMany({
        where,
        include: { section: true, structure: { select: { name: true } } },
        ...pageArgs(cursor),
      });
      return rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        section: row.section.sectionCode,
        structure: row.structure?.name ?? '',
        isActive: row.isActive ? 'Yes' : 'No',
      }));
    },
  },
  citizens: {
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
    async fetchPage(prisma, scope, filters, cursor) {
      const where: Prisma.CitizenWhereInput = {
        ...(scopeWhere(scope, { leaderPath: 'promovido' }) ?? {}),
      };
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
  },
};

export function resolveExportModule(value: string): ModuleExportConfig {
  const module = value === 'simpatizantes' ? 'promoted' : value;
  if (!['promoted', 'leaders', 'coordinators', 'citizens'].includes(module)) {
    throw new Error('Unsupported export module');
  }
  return configs[module as ExportModule];
}
