import { PrismaClient } from '@prisma/client';

/**
 * RBAC Permission Seed — Nexo Comercial
 *
 * Estructura extensible basada en los módulos del sidebar (NAV_ITEMS).
 * Cada módulo declara sus acciones; el `slug` sigue la convención
 * `{modulo}.{accion}` (ej. `tickets.view`, `tickets.create`).
 *
 * El campo `group` solo organiza los módulos para construir la matriz
 * de roles; NO se persiste (el modelo `Permission` solo guarda `module`).
 */

export type PermissionGroup = 'whatsapp' | 'campana' | 'configuracion';
export type PermissionAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'manage'
  | 'assign'
  | 'deactivate'
  | 'test';

export interface PermissionDef {
  /** Nombre legible del permiso. */
  readonly name: string;
  /** Clave única `{modulo}.{accion}`. */
  readonly slug: string;
  /** Módulo al que pertenece (coincide con el prefijo del slug). */
  readonly module: string;
  /** Descripción funcional del permiso. */
  readonly description: string;
}

export interface PermissionModule {
  /** Grupo funcional para la matriz de roles. */
  readonly group: PermissionGroup;
  /** Módulo (prefijo del slug). */
  readonly module: string;
  /** Etiqueta legible para generar nombres y descripciones. */
  readonly label: string;
  /** Acciones habilitadas para el módulo. */
  readonly actions: readonly PermissionAction[];
  /** Permisos generados para el módulo. */
  readonly permissions: readonly PermissionDef[];
}

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'Ver',
  create: 'Crear',
  update: 'Actualizar',
  delete: 'Eliminar',
  export: 'Exportar',
  manage: 'Administrar',
  assign: 'Asignar',
  deactivate: 'Activar o desactivar',
  test: 'Testear',
};

const ACTION_DESCRIPTIONS: Record<PermissionAction, string> = {
  view: 'Listar y consultar',
  create: 'Crear',
  update: 'Editar',
  delete: 'Eliminar o desactivar',
  export: 'Exportar',
  manage: 'Administrar asignaciones de',
  assign: 'Asignar o remover',
  deactivate: 'Activar o desactivar',
  test: 'Testear',
};

/**
 * Construye un módulo de permisos a partir de sus acciones.
 * Genera `slug`, `name`, `module` y `description` de forma determinista.
 */
function defineModule(
  group: PermissionGroup,
  module: string,
  label: string,
  actions: readonly PermissionAction[],
): PermissionModule {
  return {
    group,
    module,
    label,
    actions,
    permissions: actions.map((action) => ({
      slug: `${module}.${action}`,
      name: `${ACTION_LABELS[action]} ${label}`,
      module,
      description: `${ACTION_DESCRIPTIONS[action]} registros del módulo ${label}.`,
    })),
  };
}

export const MODULE_PERMISSIONS: readonly PermissionModule[] = [
  // ──────────────────────────────────────────────────────────────────────
  // GESTIÓN DE WHATSAPP
  // ──────────────────────────────────────────────────────────────────────
  defineModule('whatsapp', 'indicadores_atencion', 'indicadores de atención', ['view', 'export']),
  defineModule('whatsapp', 'conversaciones', 'conversaciones', [
    'view',
    'create',
    'update',
    'delete',
  ]),
  defineModule('whatsapp', 'tickets', 'tickets', ['view', 'create', 'update', 'delete']),
  defineModule('whatsapp', 'ciudadanos', 'ciudadanos', ['view', 'create', 'update', 'delete']),
  defineModule('whatsapp', 'campanas_whatsapp', 'campañas de WhatsApp', [
    'view',
    'create',
    'update',
    'delete',
  ]),
  defineModule('whatsapp', 'mensajes_masivos', 'mensajes masivos', [
    'view',
    'create',
    'update',
    'delete',
  ]),
  defineModule('whatsapp', 'plantillas', 'plantillas', ['view', 'create', 'update', 'delete']),

  // ──────────────────────────────────────────────────────────────────────
  // GESTIÓN DE CAMPAÑA
  // ──────────────────────────────────────────────────────────────────────
  defineModule('campana', 'indicadores_precampana', 'indicadores de precampaña', [
    'view',
    'export',
    'create',
    'update',
  ]),
  defineModule('campana', 'promovidos', 'promovidos', ['view', 'create', 'update', 'delete']),
  defineModule('campana', 'lideres', 'líderes', ['view', 'create', 'update', 'delete']),
  defineModule('campana', 'eventos', 'eventos', ['view', 'create', 'update', 'delete']),

  // ──────────────────────────────────────────────────────────────────────
  // CONFIGURACIÓN DE PLATAFORMA
  // ──────────────────────────────────────────────────────────────────────
  defineModule('configuracion', 'configuracion', 'configuración', ['view', 'update']),
  defineModule('configuracion', 'users', 'usuarios', [
    'view',
    'create',
    'update',
    'delete',
    'deactivate',
  ]),
  defineModule('configuracion', 'departamentos', 'departamentos', [
    'view',
    'create',
    'update',
    'delete',
  ]),
  defineModule('configuracion', 'barrios', 'barrios', ['view', 'create', 'update', 'delete']),
  defineModule('configuracion', 'etiquetas', 'etiquetas', ['view', 'create', 'update', 'delete']),
  defineModule('configuracion', 'coordinadores', 'coordinadores', [
    'view',
    'create',
    'update',
    'delete',
  ]),
  defineModule('configuracion', 'catalogo_electoral', 'catálogo electoral', [
    'view',
    'create',
    'update',
    'delete',
  ]),
  defineModule('configuracion', 'ai', 'canales e IA', ['view', 'create', 'update', 'delete']),
  defineModule('configuracion', 'analytics', 'analítica transversal', ['view']),
  defineModule('configuracion', 'roles', 'roles', ['view', 'create', 'update', 'delete', 'assign']),
  defineModule('configuracion', 'permissions', 'permisos', [
    'view',
    'create',
    'update',
    'delete',
    'manage',
    'deactivate',
  ]),
  defineModule('configuracion', 'email-diagnostics', 'email diagnostics', [
    'view',
    'create',
    'update',
    'delete',
    'test',
  ]),
];

/** Lista plana de permisos lista para sembrar. */
export const PERMISSIONS: readonly PermissionDef[] = MODULE_PERMISSIONS.flatMap(
  (entry) => entry.permissions,
);

/**
 * Devuelve los slugs de todos los permisos de un grupo funcional.
 */
export function slugsForGroup(group: PermissionGroup): readonly string[] {
  return MODULE_PERMISSIONS.filter((entry) => entry.group === group).flatMap((entry) =>
    entry.permissions.map((permission) => permission.slug),
  );
}

/**
 * Devuelve los slugs de todos los permisos de un módulo concreto.
 */
export function slugsForModule(module: string): readonly string[] {
  return MODULE_PERMISSIONS.filter((entry) => entry.module === module).flatMap((entry) =>
    entry.permissions.map((permission) => permission.slug),
  );
}

/**
 * Devuelve los slugs de un módulo filtrando por acciones concretas.
 * Útil para asignar a un rol solo un subconjunto de acciones de un módulo
 * (p. ej. LIDER/CAPTURISTA solo lectura de indicadores_precampana).
 */
export function slugsForModuleActions(
  module: string,
  actions: readonly PermissionAction[],
): readonly string[] {
  const wanted = new Set<string>(actions.map((a) => `${module}.${a}`));
  return MODULE_PERMISSIONS.filter((entry) => entry.module === module).flatMap((entry) =>
    entry.permissions.filter((permission) => wanted.has(permission.slug)).map((p) => p.slug),
  );
}

/**
 * Persiste el catálogo de permisos del sistema.
 * Usa `upsert` por `slug` dentro de una transacción para atomicidad.
 */
export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(
    PERMISSIONS.map((permission) =>
      prisma.permission.upsert({
        where: { slug: permission.slug },
        update: {
          name: permission.name,
          module: permission.module,
          description: permission.description,
          isActive: true,
          isSystem: true,
        },
        create: {
          name: permission.name,
          slug: permission.slug,
          module: permission.module,
          description: permission.description,
          isActive: true,
          isSystem: true,
        },
      }),
    ),
  );

  console.log(`✅ ${PERMISSIONS.length} permissions seeded`);
}
