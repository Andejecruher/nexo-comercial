import { describe, expect, it, jest } from '@jest/globals';
import { ScopeService } from '../../../services/scope.service';

type AsyncMock<Args extends unknown[] = [], Result = unknown> = (...args: Args) => Promise<Result>;

function createPrismaMock(user: unknown = null) {
  return {
    user: {
      findUnique: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue(user),
    },
  };
}

describe('ScopeService.resolveScope', () => {
  it('returns admin scope for SUPER_ADMIN', async () => {
    const prisma = createPrismaMock({
      userRoles: [{ role: { name: 'SUPER_ADMIN' } }],
    });
    const service = new ScopeService(prisma as never);

    const scope = await service.resolveScope('user-1');

    expect(scope).toEqual({ kind: 'admin' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
  });

  it('returns admin scope for CAPTURISTA', async () => {
    const prisma = createPrismaMock({
      userRoles: [{ role: { name: 'CAPTURISTA' } }],
    });
    const service = new ScopeService(prisma as never);

    const scope = await service.resolveScope('user-1');

    expect(scope).toEqual({ kind: 'admin' });
  });

  it('returns none scope for COORDINADOR', async () => {
    const prisma = createPrismaMock({
      userRoles: [{ role: { name: 'COORDINADOR' } }],
    });
    const service = new ScopeService(prisma as never);

    const scope = await service.resolveScope('user-1');

    expect(scope).toEqual({ kind: 'none' });
  });

  it('returns none scope for LIDER', async () => {
    const prisma = createPrismaMock({
      userRoles: [{ role: { name: 'LIDER' } }],
    });
    const service = new ScopeService(prisma as never);

    const scope = await service.resolveScope('user-1');

    expect(scope).toEqual({ kind: 'none' });
  });

  it('returns none scope for OPERADOR_CHAT without entity links', async () => {
    const prisma = createPrismaMock({
      userRoles: [{ role: { name: 'OPERADOR_CHAT' } }],
    });
    const service = new ScopeService(prisma as never);

    const scope = await service.resolveScope('user-1');

    expect(scope).toEqual({ kind: 'none' });
  });

  it('returns none scope when user is not found', async () => {
    const prisma = createPrismaMock(null);
    const service = new ScopeService(prisma as never);

    const scope = await service.resolveScope('missing');

    expect(scope).toEqual({ kind: 'none' });
  });

  it('prefers admin scope when a user also has LIDER', async () => {
    const prisma = createPrismaMock({
      userRoles: [{ role: { name: 'SUPER_ADMIN' } }, { role: { name: 'LIDER' } }],
    });
    const service = new ScopeService(prisma as never);

    const scope = await service.resolveScope('user-1');

    expect(scope).toEqual({ kind: 'admin' });
  });
});
