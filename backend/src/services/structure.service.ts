import { z } from 'zod';
import type { OrganizationalStructure } from '@prisma/client';
import type { StructureRepository } from '../repositories/structure.repository';
import { AppError } from '../utils/app-error';

export function toStructureSlug(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return slug.length >= 2 ? slug : 'estructura';
}

export function emptyToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const SlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido');

const HexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'color HEX inválido')
  .transform((value) => value.toUpperCase());

const optionalManagerName = z.string().trim().max(120).nullable().optional();
const optionalManagerPhone = z.string().trim().max(30).nullable().optional();

export const CreateStructureSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    color: HexColorSchema,
    slug: SlugSchema.optional(),
    isActive: z.boolean().optional(),
    managerFirstName: optionalManagerName,
    managerLastName: optionalManagerName,
    managerPhone: optionalManagerPhone,
  })
  .strict();

export const UpdateStructureSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    color: HexColorSchema.optional(),
    isActive: z.boolean().optional(),
    managerFirstName: optionalManagerName,
    managerLastName: optionalManagerName,
    managerPhone: optionalManagerPhone,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Al menos un campo debe ser enviado',
  });

export const StructureIdParamSchema = z.object({ id: z.string().uuid() });

export const StructureListQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type CreateStructureInput = z.infer<typeof CreateStructureSchema>;
export type UpdateStructureInput = z.infer<typeof UpdateStructureSchema>;

export class StructureService {
  constructor(private readonly structures: StructureRepository) {}

  async list(params: { includeInactive?: boolean } = {}): Promise<OrganizationalStructure[]> {
    return this.structures.list(params);
  }

  async getById(id: string): Promise<OrganizationalStructure> {
    const structure = await this.structures.findById(id);
    if (!structure) throw AppError.notFound('Estructura no encontrada');
    return structure;
  }

  async create(input: CreateStructureInput): Promise<OrganizationalStructure> {
    const slug = await this.allocateUniqueSlug(input.slug ?? toStructureSlug(input.name));
    try {
      return await this.structures.create({
        name: input.name.trim(),
        slug,
        color: input.color.toUpperCase(),
        isActive: input.isActive ?? true,
        managerFirstName: emptyToNull(input.managerFirstName) ?? null,
        managerLastName: emptyToNull(input.managerLastName) ?? null,
        managerPhone: emptyToNull(input.managerPhone) ?? null,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw AppError.conflict('Ya existe una estructura con ese identificador');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateStructureInput): Promise<OrganizationalStructure> {
    await this.getById(id);
    if (input.isActive === false) {
      await this.assertNoActiveCoordinators(id);
    }
    try {
      return await this.structures.update(id, {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.color !== undefined ? { color: input.color.toUpperCase() } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.managerFirstName !== undefined
          ? { managerFirstName: emptyToNull(input.managerFirstName) ?? null }
          : {}),
        ...(input.managerLastName !== undefined
          ? { managerLastName: emptyToNull(input.managerLastName) ?? null }
          : {}),
        ...(input.managerPhone !== undefined
          ? { managerPhone: emptyToNull(input.managerPhone) ?? null }
          : {}),
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') {
        throw AppError.notFound('Estructura no encontrada');
      }
      throw error;
    }
  }

  async deactivate(id: string): Promise<OrganizationalStructure> {
    await this.getById(id);
    await this.assertNoActiveCoordinators(id);
    return this.structures.update(id, { isActive: false });
  }

  private async assertNoActiveCoordinators(id: string): Promise<void> {
    const activeCount = await this.structures.countActiveCoordinators(id);
    if (activeCount) {
      throw AppError.conflict(
        'No se puede desactivar la estructura mientras tenga coordinadores activos',
      );
    }
  }

  private async allocateUniqueSlug(base: string): Promise<string> {
    const root = toStructureSlug(base);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? root : `${root.slice(0, 76)}-${attempt + 1}`.slice(0, 80);
      const existing = await this.structures.findBySlug(candidate);
      if (!existing) return candidate;
    }
    throw AppError.conflict('No se pudo generar un identificador único para la estructura');
  }
}
