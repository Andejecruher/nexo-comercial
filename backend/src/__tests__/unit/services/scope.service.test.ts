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
      id: 'user-1',
      userRoles: [{ role: { name: 'SUPER_ADMIN' } }],
      coordinator: null,
      leader: null,
    });
    const service = new ScopeService(prisma as never);

    const scope = await service.resolveScope('user-1');

    expect(scope).toEqual({ kind: 'admin' });
  });

  it('returns admin scope for CAPTURISTA', async () => {
    const prisma = createPrismaMock({
      id: 'user-1',
      userRoles: [{ role: { name: 'CAPTURISTA' } }],
      coordinator: null,
      leader: null,
    });
    const service = new ScopeService(prisma as never);

    const scope = await service.resolveScope('user-1');

    expect(scope).toEqual({ kind: 'admin' });
  });

  it('returns coordinator scope when user owns a coordinator', async () => {
    const prisma = createPrismaMock({
      id: 'user-1',
      userRoles: [{ role: { name: 'COORDINADOR' } }],
      coordinator: { id: 'coord-1', sectionId: 'section-1' },
      leader: null,
    });
    const service = new ScopeService(prisma as never);

    const scope = await service.resolveScope('user-1');

    expect(scope).toEqual({
      kind: 'coordinator',
      sectionId: 'section-1',
      coordinatorId: 'coord-1',
    });
  });

  it('returns leader scope when user owns a leader', async () => {
    const prisma = createPrismaMock({
      id: 'user-1',
      userRoles: [{ role: { name: 'LIDER' } }],
      coordinator: null,
      leader: { id: 'leader-1', sectionId: 'section-1', coordinatorId: 'coord-1' },
    });
    const service = new ScopeService(prisma as never);

    const scope = await service.resolveScope('user-1');

    expect(scope).toEqual({
      kind: 'leader',
      sectionId: 'section-1',
      leaderId: 'leader-1',
      coordinatorId: 'coord-1',
    });
  });

  it('returns none scope for OPERADOR_CHAT without entity links', async () => {
    const prisma = createPrismaMock({
      id: 'user-1',
      userRoles: [{ role: { name: 'OPERADOR_CHAT' } }],
      coordinator: null,
      leader: null,
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

  it('prefers admin scope even when entity links exist', async () => {
    const prisma = createPrismaMock({
      id: 'user-1',
      userRoles: [{ role: { name: 'SUPER_ADMIN' } }, { role: { name: 'LIDER' } }],
      coordinator: { id: 'coord-1', sectionId: 'section-1' },
      leader: { id: 'leader-1', sectionId: 'section-1', coordinatorId: 'coord-1' },
    });
    const service = new ScopeService(prisma as never);

    const scope = await service.resolveScope('user-1');

    expect(scope).toEqual({ kind: 'admin' });
  });
});
