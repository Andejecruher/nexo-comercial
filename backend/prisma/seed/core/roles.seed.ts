import { PrismaClient } from '@prisma/client';

/**
 * RBAC Role Seed — Nexo Comercial
 *
 * Define los roles del sistema. Se persisten con `upsert` usando `slug`
 * como clave única.
 */
export interface RoleDef {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
}

export const PANEL_ROLES: readonly RoleDef[] = [
  {
    name: 'SUPER_ADMIN',
    slug: 'super-admin',
    description: 'Acceso total al sistema. Gestión de usuarios, roles y configuración.',
  },
  {
    name: 'COORDINADOR',
    slug: 'coordinador',
    description:
      'Coordina operadores y gestiona WhatsApp, eventos y configuración operativa.',
  },
  {
    name: 'CAPTURISTA',
    slug: 'capturista',
    description: 'Captura y gestiona jornadas y eventos.',
  },
  {
    name: 'OPERADOR_CHAT',
    slug: 'operador-chat',
    description: 'Atiende conversaciones de ciudadanos y gestiona WhatsApp.',
  },
  {
    name: 'LIDER',
    slug: 'lider',
    description: 'Consulta jornadas y eventos.',
  },
];

/**
 * Persiste los roles del sistema.
 * Usa `upsert` por `slug` dentro de una transacción para atomicidad.
 */
export async function seedRoles(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(
    PANEL_ROLES.map((role) =>
      prisma.role.upsert({
        where: { slug: role.slug },
        update: { name: role.name, description: role.description },
        create: { name: role.name, slug: role.slug, description: role.description },
      }),
    ),
  );

  console.log(
    `✅ ${PANEL_ROLES.length} roles seeded: ${PANEL_ROLES.map((r) => r.name).join(', ')}`,
  );
}
