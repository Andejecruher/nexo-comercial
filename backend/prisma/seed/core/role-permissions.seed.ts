import { PrismaClient } from '@prisma/client';
import {
  PERMISSIONS,
  slugsForGroup,
  slugsForModule,
  slugsForModuleActions,
} from './permissions.seed';

/**
 * RBAC Role-Permission Matrix — Voz Ciudadana
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
  const campana = slugsForGroup('campana');

  // CAPTURISTA y LIDER solo ven/exportan indicadores de precampaña; los
  // permisos create/update de goals quedan reservados a COORDINADOR y SUPER_ADMIN.
  const precampanaReadOnly = slugsForModuleActions('indicadores_precampana', [
    'view',
    'export',
  ]);

  // Lectura scoped para roles operativos de territorio (RN5/RN6).
  const catalogoElectoralView = slugsForModuleActions('catalogo_electoral', ['view']);
  const promovidosView = slugsForModuleActions('promovidos', ['view']);
  const eventosView = slugsForModuleActions('eventos', ['view']);
  const lideresView = slugsForModuleActions('lideres', ['view']);

  // Módulo de administración de coordinadores: solo admins y capturistas globales.
  const coordinadoresModule = slugsForModule('coordinadores');
  const lideresModule = slugsForModule('lideres');

  const coordinadorConfig = [
    ...slugsForModule('departamentos'),
    ...slugsForModule('barrios'),
    ...slugsForModule('etiquetas'),
    ...catalogoElectoralView,
    ...slugsForModule('analytics'),
  ];

  return {
    'super-admin': PERMISSIONS.map((permission) => permission.slug),
    coordinador: [
      ...whatsapp,
      ...precampanaReadOnly,
      ...promovidosView,
      ...eventosView,
      ...lideresView,
      ...coordinadorConfig,
    ],
    capturista: [
      ...precampanaReadOnly,
      ...slugsForModule('promovidos'),
      ...slugsForModule('eventos'),
      ...coordinadoresModule,
      ...lideresModule,
      ...catalogoElectoralView,
    ],
    'operador-chat': [...whatsapp],
    lider: [
      ...precampanaReadOnly,
      ...promovidosView,
      ...eventosView,
      ...lideresView,
      ...catalogoElectoralView,
    ],
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
