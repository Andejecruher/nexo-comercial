import type { ScopeContext } from '../types/auth.types';
import type { PrismaService } from './prisma.service';

export type { ScopeContext } from '../types/auth.types';

export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveScope(userId: string): Promise<ScopeContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });

    if (!user) return { kind: 'none' };

    const roleNames = user.userRoles.map((userRole) => userRole.role.name);
    if (roleNames.includes('SUPER_ADMIN') || roleNames.includes('CAPTURISTA')) {
      return { kind: 'admin' };
    }

    return { kind: 'none' };
  }
}
