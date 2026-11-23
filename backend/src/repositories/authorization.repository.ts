import { Permission, Prisma, Role, RolePermission } from '@prisma/client';
import type { PrismaService } from '../services/prisma.service';

type RoleWithPermissions = Role & {
  rolePermissions: (RolePermission & { permission: Permission })[];
};

export type PermissionModuleFacet = { module: string; _count: { _all: number } };

export type PermissionWithRoleCount = Prisma.PermissionGetPayload<{
  include: { _count: { select: { rolePermissions: true } } };
}>;

export type PermissionWithRolesPreview = Prisma.PermissionGetPayload<{
  include: {
    _count: { select: { rolePermissions: true } };
    rolePermissions: {
      select: { role: { select: { id: true; name: true; slug: true } } };
    };
  };
}>;

export type PermissionRoleSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export class AuthorizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  listAssignablePermissions(): Prisma.PrismaPromise<Permission[]> {
    return this.prisma.permission.findMany({
      where: { isActive: true },
      orderBy: [{ module: 'asc' }, { slug: 'asc' }],
    });
  }

  findPermissions(args: {
    where: Prisma.PermissionWhereInput;
    /** Same filters as `where` minus the module, so tab counts stay complete. */
    facetWhere: Prisma.PermissionWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.PermissionOrderByWithRelationInput;
    rolesPreviewLimit: number;
  }): Promise<[PermissionWithRolesPreview[], number, PermissionModuleFacet[]]> {
    const { facetWhere, rolesPreviewLimit, ...page } = args;
    return this.prisma.$transaction([
      this.prisma.permission.findMany({
        ...page,
        include: {
          _count: { select: { rolePermissions: true } },
          rolePermissions: {
            take: rolesPreviewLimit,
            orderBy: { role: { name: 'asc' } },
            select: { role: { select: { id: true, name: true, slug: true } } },
          },
        },
      }),
      this.prisma.permission.count({ where: args.where }),
      // groupBy infers a union of every selectable count field; narrow it to the one we ask for.
      this.prisma.permission.groupBy({
        by: ['module'],
        where: facetWhere,
        _count: { _all: true },
        orderBy: { module: 'asc' },
      }) as unknown as Prisma.PrismaPromise<PermissionModuleFacet[]>,
    ]);
  }

  getPermission(id: string): Prisma.PrismaPromise<PermissionWithRoleCount | null> {
    return this.prisma.permission.findUnique({
      where: { id },
      include: { _count: { select: { rolePermissions: true } } },
    });
  }

  createPermission(data: Prisma.PermissionCreateInput): Prisma.PrismaPromise<Permission> {
    return this.prisma.permission.create({ data });
  }

  updatePermission(id: string, data: Prisma.PermissionUpdateInput): Prisma.PrismaPromise<Permission> {
    return this.prisma.permission.update({ where: { id }, data });
  }

  listPermissionRoles(id: string): Prisma.PrismaPromise<PermissionRoleSummary[]> {
    return this.prisma.role.findMany({
      where: { rolePermissions: { some: { permissionId: id } } },
      select: { id: true, name: true, slug: true, description: true },
      orderBy: { name: 'asc' },
    });
  }

  listRoles(): Prisma.PrismaPromise<RoleWithPermissions[]> {
    return this.prisma.role.findMany({
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }

  getRole(id: string): Prisma.PrismaPromise<RoleWithPermissions | null> {
    return this.prisma.role.findUnique({
      where: { id },
      include: { rolePermissions: { include: { permission: true } } },
    });
  }

  getRoleByName(name: string): Prisma.PrismaPromise<{ id: string } | null> {
    return this.prisma.role.findUnique({ where: { name }, select: { id: true } });
  }

  createRole(data: {
    name: string;
    slug: string;
    description?: string | null;
  }): Prisma.PrismaPromise<Role> {
    return this.prisma.role.create({ data });
  }

  updateRole(
    id: string,
    data: { name?: string; slug?: string; description?: string | null },
  ): Prisma.PrismaPromise<Role> {
    return this.prisma.role.update({ where: { id }, data });
  }

  deleteRole(id: string): Prisma.PrismaPromise<Role> {
    return this.prisma.role.delete({ where: { id } });
  }

  countPermissionsByIds(permissionIds: string[]): Prisma.PrismaPromise<number> {
    return this.prisma.permission.count({ where: { id: { in: permissionIds }, isActive: true } });
  }

  countPermissionsAssignableToRole(
    roleId: string,
    permissionIds: string[],
  ): Prisma.PrismaPromise<number> {
    return this.prisma.permission.count({
      where: {
        id: { in: permissionIds },
        OR: [{ isActive: true }, { rolePermissions: { some: { roleId } } }],
      },
    });
  }

  replaceRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
          skipDuplicates: true,
        });
      }
    });
  }

  addRolePermission(roleId: string, permissionId: string): Prisma.PrismaPromise<RolePermission> {
    return this.prisma.rolePermission.create({ data: { roleId, permissionId } });
  }

  removeRolePermission(roleId: string, permissionId: string): Prisma.PrismaPromise<RolePermission> {
    return this.prisma.rolePermission.delete({
      where: { roleId_permissionId: { roleId, permissionId } },
    });
  }

  isUniqueError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
