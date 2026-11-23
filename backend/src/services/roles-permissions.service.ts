import { Permission, Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AuthorizationRepository } from '../repositories/authorization.repository';
import { AppError } from '../utils/app-error';

type PermissionRow = {
  id: string;
  slug: string;
  name: string;
  module: string;
  description?: string | null;
  isActive?: boolean;
  isSystem?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  roleCount?: number;
};

type RoleRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  rolePermissions?: Array<{ permission: PermissionRow }>;
};

type RoleRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RoleResponse = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: PermissionRow[];
};

export type PermissionWithRoleCount = Permission & { roleCount: number };

export type PermissionListResponse = {
  permissions: Array<
    Permission & {
      roleCount: number;
      rolesPreview: Array<{ id: string; name: string; slug: string }>;
    }
  >;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  modules: Array<{ module: string; count: number }>;
};

export type PermissionRoleSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export const RoleIdParamSchema = z.object({ id: z.string() });
export const RolePermissionParamSchema = z.object({
  id: z.string(),
  permissionId: z.string(),
});
export const CreateRoleSchema = z.object({
  name: z.string().trim().min(2).max(50),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]+$/)
    .max(80),
  description: z.string().trim().max(255).nullable().optional(),
});
export const UpdateRoleSchema = CreateRoleSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Al menos un campo debe ser enviado' },
);
export const ReplacePermissionsSchema = z.object({ permissionIds: z.array(z.string().uuid()) });
const permissionKey = z.string().trim().min(3).max(120);
export const PermissionIdParamSchema = z.object({ id: z.string().uuid() });
export const PermissionQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  module: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  isSystem: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'slug', 'module', 'createdAt', 'updatedAt']).default('module'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export const CreatePermissionSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: permissionKey,
  module: z.string().trim().min(2).max(80),
  description: z.string().trim().max(255).nullable().optional(),
  isActive: z.boolean().default(true),
});
export const UpdatePermissionSchema = CreatePermissionSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Al menos un campo debe ser enviado' },
);
export const PermissionStatusSchema = z.object({ isActive: z.boolean() });

export function normalizePermissionKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');
}

const SYSTEM_ROLES = new Set(['SUPER_ADMIN']);

/** Roles shown as avatars per row before collapsing into a counter. */
const ROLES_PREVIEW_LIMIT = 3;

function toRoleResponse(role: RoleRow): RoleResponse {
  return {
    id: role.id,
    name: role.name,
    slug: role.slug,
    description: role.description,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    permissions: (role.rolePermissions ?? [])
      .map((rp) => rp.permission)
      .sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}

export class RolesPermissionsService {
  constructor(private readonly repository: AuthorizationRepository) {}

  async listAssignablePermissions(): Promise<PermissionRow[]> {
    return this.repository.listAssignablePermissions();
  }

  async listPermissions(
    input: z.infer<typeof PermissionQuerySchema>,
  ): Promise<PermissionListResponse> {
    const facetWhere: Prisma.PermissionWhereInput = {
      ...(input.search && {
        OR: ['name', 'slug', 'module', 'description'].map((field) => ({
          [field]: { contains: input.search, mode: 'insensitive' },
        })),
      }),
      ...(input.status && { isActive: input.status === 'active' }),
      ...(input.isSystem !== undefined && { isSystem: input.isSystem }),
    };
    const where: Prisma.PermissionWhereInput = {
      ...facetWhere,
      ...(input.module && { module: input.module }),
    };
    const [rows, total, facets] = await this.repository.findPermissions({
      where,
      facetWhere,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: { [input.sortBy]: input.sortOrder },
      rolesPreviewLimit: ROLES_PREVIEW_LIMIT,
    });
    return {
      permissions: rows.map(({ _count, rolePermissions, ...permission }) => ({
        ...permission,
        roleCount: _count.rolePermissions,
        rolesPreview: (rolePermissions ?? []).map(({ role }) => role),
      })),
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
      modules: (facets ?? []).map((facet) => ({
        module: facet.module,
        count: facet._count._all,
      })),
    };
  }

  async getPermission(id: string): Promise<PermissionWithRoleCount> {
    const permission = await this.repository.getPermission(id);
    if (!permission) throw AppError.notFound('Permiso no encontrado');
    const { _count, ...data } = permission;
    return { ...data, roleCount: _count.rolePermissions };
  }

  async createPermission(input: z.infer<typeof CreatePermissionSchema>): Promise<Permission> {
    const slug = this.validatePermissionKey(input.slug);
    try {
      return await this.repository.createPermission({
        ...input,
        slug,
        module: input.module.toLowerCase(),
      });
    } catch (error) {
      if (this.repository.isUniqueError(error))
        throw AppError.conflict('La clave del permiso ya existe');
      throw error;
    }
  }

  async updatePermission(
    id: string,
    input: z.infer<typeof UpdatePermissionSchema>,
  ): Promise<Permission> {
    const current = await this.getPermission(id);
    if (
      input.slug !== undefined &&
      current.isSystem &&
      normalizePermissionKey(input.slug) !== current.slug
    ) {
      throw AppError.badRequest('La clave de un permiso del sistema no puede modificarse');
    }
    const data = {
      ...input,
      ...(input.slug !== undefined && { slug: this.validatePermissionKey(input.slug) }),
      ...(input.module !== undefined && { module: input.module.toLowerCase() }),
    };
    try {
      return await this.repository.updatePermission(id, data);
    } catch (error) {
      if (this.repository.isUniqueError(error))
        throw AppError.conflict('La clave del permiso ya existe');
      throw error;
    }
  }

  async setPermissionStatus(
    id: string,
    isActive: boolean,
  ): Promise<Permission & { affectedRoles: number }> {
    const current = await this.getPermission(id);
    if (!isActive && current.isSystem) {
      throw AppError.badRequest('Los permisos críticos del sistema no pueden desactivarse');
    }
    const permission = await this.repository.updatePermission(id, { isActive });
    return { ...permission, affectedRoles: current.roleCount };
  }

  async listPermissionRoles(id: string): Promise<PermissionRoleSummary[]> {
    await this.getPermission(id);
    return this.repository.listPermissionRoles(id);
  }

  async listRoles(): Promise<RoleResponse[]> {
    const roles = await this.repository.listRoles();
    return roles.map(toRoleResponse);
  }

  async getRole(id: string): Promise<RoleResponse> {
    const role = await this.repository.getRole(id);
    if (!role) throw AppError.notFound('Rol no encontrado');
    return toRoleResponse(role);
  }

  async createRole(input: z.infer<typeof CreateRoleSchema>): Promise<RoleRecord> {
    try {
      const role = await this.repository.createRole(input);
      return role;
    } catch (error) {
      if (this.repository.isUniqueError(error))
        throw AppError.conflict('Nombre o slug de rol duplicado');
      throw error;
    }
  }

  async updateRole(id: string, input: z.infer<typeof UpdateRoleSchema>): Promise<RoleRecord> {
    const existing = await this.getRole(id);
    if (SYSTEM_ROLES.has(existing.name) && (input.name || input.slug)) {
      throw AppError.badRequest('No se puede renombrar un rol del sistema');
    }
    try {
      return await this.repository.updateRole(id, input);
    } catch (error) {
      if (this.repository.isUniqueError(error))
        throw AppError.conflict('Nombre o slug de rol duplicado');
      throw error;
    }
  }

  async deleteRole(id: string): Promise<void> {
    const existing = await this.getRole(id);
    if (SYSTEM_ROLES.has(existing.name))
      throw AppError.badRequest('No se puede eliminar un rol del sistema');
    await this.repository.deleteRole(id);
  }

  async replacePermissions(roleId: string, permissionIds: string[]): Promise<RoleResponse> {
    await this.ensureRoleExists(roleId);
    const uniqueIds = Array.from(new Set(permissionIds));
    const count = await this.repository.countPermissionsAssignableToRole(roleId, uniqueIds);
    if (count !== uniqueIds.length)
      throw AppError.badRequest('Uno o más permisos no existen o están inactivos');
    await this.repository.replaceRolePermissions(roleId, uniqueIds);
    return this.getRole(roleId);
  }

  async addPermission(roleId: string, permissionId: string): Promise<RoleResponse> {
    await this.ensureRoleExists(roleId);
    await this.ensurePermissionsExist([permissionId]);
    try {
      await this.repository.addRolePermission(roleId, permissionId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppError.conflict('El permiso ya está asignado al rol');
      }
      throw error;
    }
    return this.getRole(roleId);
  }

  async removePermission(roleId: string, permissionId: string): Promise<RoleResponse> {
    await this.ensureRoleExists(roleId);
    try {
      await this.repository.removeRolePermission(roleId, permissionId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw AppError.notFound('El permiso no está asignado al rol');
      }
      throw error;
    }
    return this.getRole(roleId);
  }

  private async ensureRoleExists(roleId: string): Promise<void> {
    await this.getRole(roleId);
  }

  private async ensurePermissionsExist(permissionIds: string[]): Promise<void> {
    const count = await this.repository.countPermissionsByIds(permissionIds);
    if (count !== new Set(permissionIds).size)
      throw AppError.badRequest('Uno o más permisos no existen');
  }

  private validatePermissionKey(value: string): string {
    const normalized = normalizePermissionKey(value);
    if (!/^[a-z0-9]+(?:\.[a-z0-9]+)+$/.test(normalized)) {
      throw AppError.badRequest('La clave debe usar el formato modulo.accion');
    }
    return normalized;
  }
}
