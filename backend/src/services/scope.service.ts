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
        coordinator: { select: { id: true, sectionId: true } },
        leader: { select: { id: true, sectionId: true, coordinatorId: true } },
      },
    });

    if (!user) return { kind: 'none' };

    const roleNames = user.userRoles.map((userRole) => userRole.role.name);
    if (roleNames.includes('SUPER_ADMIN') || roleNames.includes('CAPTURISTA')) {
      return { kind: 'admin' };
    }

    if (user.coordinator) {
      return {
        kind: 'coordinator',
        sectionId: user.coordinator.sectionId,
        coordinatorId: user.coordinator.id,
      };
    }

    if (user.leader) {
      return {
        kind: 'leader',
        sectionId: user.leader.sectionId,
        leaderId: user.leader.id,
        coordinatorId: user.leader.coordinatorId,
      };
    }

    return { kind: 'none' };
  }
}
