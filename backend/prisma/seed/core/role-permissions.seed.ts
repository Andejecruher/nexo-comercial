import { PrismaClient } from '@prisma/client';
import {
  PERMISSIONS,
  slugsForGroup,
  slugsForModule,
  slugsForModuleActions,
} from './permissions.seed';

/**
 * RBAC Role-Permission Matrix — Nexo Comercial
 *
 * Asocia permisos a roles buscando los registros por `slug` e insertando
 * en la tabla pivote `RolePermission` con `skipDuplicates: true`.
 *
 * La matriz se construye a partir de los grupos y módulos declarados en
 * `MODULE_PERMISSIONS`, de forma que un cambio en el catálogo de permisos
 * se propaga automáticamente sin tocar este archivo.
 */

/** Slugs de los permisos asignables a cada rol (clave = role.slug). */
function buildMatrix(): Readonly<Record<string, readonly string[]>> {
  const whatsapp = slugsForGroup('whatsapp');
  const eventosView = slugsForModuleActions('eventos', ['view']);

  const coordinadorConfig = [
    ...slugsForModule('departamentos'),
    ...slugsForModule('barrios'),
    ...slugsForModule('etiquetas'),
    ...slugsForModule('analytics'),
  ];

  return {
    'super-admin': PERMISSIONS.map((permission) => permission.slug),
    coordinador: [
      ...whatsapp,
      ...eventosView,
      ...coordinadorConfig,
    ],
    capturista: [...slugsForModule('eventos')],
    'operador-chat': [...whatsapp],
    lider: [...eventosView],
  };
}

const MATRIX = buildMatrix();

export async function seedRolePermissions(prisma: PrismaClient): Promise<void> {
  const roles = await prisma.role.findMany({ select: { id: true, slug: true } });
  const permissions = await prisma.permission.findMany({ select: { id: true, slug: true } });

  const roleIdBySlug = new Map(roles.map((role) => [role.slug, role.id]));
  const permissionIdBySlug = new Map(
    permissions.map((permission) => [permission.slug, permission.id]),
  );

  const rows: { roleId: string; permissionId: string }[] = [];

  for (const [roleSlug, slugs] of Object.entries(MATRIX)) {
    const roleId = roleIdBySlug.get(roleSlug);
    if (!roleId) {
      console.warn(`⚠️  Role "${roleSlug}" not found, skipping its permissions`);
      continue;
    }

    for (const slug of slugs) {
      const permissionId = permissionIdBySlug.get(slug);
      if (!permissionId) {
        throw new Error(
          `Permission "${slug}" not found while seeding role "${roleSlug}". ` +
            'Run the permissions seed first.',
        );
      }
      rows.push({ roleId, permissionId });
    }
  }

  await prisma.$transaction([
    prisma.rolePermission.createMany({ data: rows, skipDuplicates: true }),
  ]);

  console.log(`✅ role_permissions seeded (${rows.length} assignments)`);
}
