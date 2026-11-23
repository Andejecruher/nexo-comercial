import { AppError } from '../utils/app-error';
import type { PrismaService } from './prisma.service';

export type AuthenticatedUserProfile = {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  roles: Array<{ id: string; name: string; slug: string }>;
  permissions: string[];
  permissionsByModule: Record<string, string[]>;
};

export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getAuthenticatedUserProfile(userId: string): Promise<AuthenticatedUserProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        userRoles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                slug: true,
                rolePermissions: {
                  where: { permission: { isActive: true } },
                  select: { permission: { select: { slug: true, module: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) return null;

    const roles = user.userRoles.map(({ role }) => ({
      id: role.id,
      name: role.name,
      slug: role.slug,
    }));
    const permissionEntries = user.userRoles.flatMap(({ role }) =>
      role.rolePermissions.map(({ permission }) => permission),
    );
    const permissions = Array.from(
      new Set(permissionEntries.map((permission) => permission.slug)),
    ).sort();
    const permissionsByModule: Record<string, string[]> = {};

    for (const permission of permissions) {
      const [module, action] = permission.split('.');
      if (!module || !action) continue;
      permissionsByModule[module] = permissionsByModule[module] ?? [];
      if (!permissionsByModule[module].includes(action)) permissionsByModule[module].push(action);
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      roles,
      permissions,
      permissionsByModule,
    };
  }

  async getUserPermissionSlugs(userId: string): Promise<string[]> {
    const profile = await this.getAuthenticatedUserProfile(userId);
    return profile?.permissions ?? [];
  }

  /**
   * RN4: el email es obligatorio para la creación de entidades con acceso al panel.
   */
  assertRequiredEmail(email: string | undefined | null, entity: 'coordinator' | 'leader'): void {
    const label = entity === 'coordinator' ? 'coordinador' : 'líder';
    if (!email || !email.trim()) {
      throw AppError.badRequest(`El email es obligatorio para el ${label}`);
    }
  }

  /**
   * RN7: un usuario no puede ser dueño de una coordinación y un liderazgo simultáneamente.
   */
  async assertUserEntityOwnership(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        coordinator: { select: { id: true } },
        leader: { select: { id: true } },
      },
    });

    if (user?.coordinator || user?.leader) {
      throw AppError.conflict('El email ya está vinculado a otra entidad');
    }
  }
}
