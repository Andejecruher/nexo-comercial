import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConversationStatus } from '@prisma/client';
import {
  buildConversationListWhere,
  ConversationRepository,
} from '../../repositories/conversation.repository';

function makePrismaMock() {
  const prisma = {
    conversation: {
      findFirst: jest.fn<() => Promise<unknown>>(),
      findUniqueOrThrow: jest.fn<() => Promise<unknown>>(),
      create: jest.fn<() => Promise<unknown>>(),
      findMany: jest.fn<() => Promise<unknown>>(),
      update: jest.fn<() => Promise<unknown>>(),
      updateMany: jest.fn<() => Promise<unknown>>(),
    },
    conversationMeta: {
      create: jest.fn<() => Promise<unknown>>(),
      updateMany: jest.fn<() => Promise<unknown>>(),
    },
    assignment: {
      updateMany: jest.fn<() => Promise<unknown>>(),
      create: jest.fn<() => Promise<unknown>>(),
    },
    ticket: {
      updateMany: jest.fn<() => Promise<unknown>>(),
    },
    department: {
      findMany: jest.fn<() => Promise<unknown>>(),
    },
    communicationLine: {
      findMany: jest.fn<() => Promise<unknown>>().mockResolvedValue([]),
    },
    conversationRead: {
      findMany: jest.fn<() => Promise<unknown>>(),
      upsert: jest.fn<() => Promise<unknown>>(),
    },
    message: {
      findMany: jest.fn<() => Promise<unknown>>(),
    },
    auditLog: {
      create: jest.fn<() => Promise<unknown>>(),
    },
    $queryRaw: jest.fn<() => Promise<unknown>>(),
    $transaction: jest.fn(async (fnOrOps: unknown) => {
      if (Array.isArray(fnOrOps)) return Promise.all(fnOrOps);
      return (fnOrOps as (tx: unknown) => Promise<unknown>)(prisma);
    }),
  };
  return prisma;
}

function mockReactivateCycle(
  prisma: ReturnType<typeof makePrismaMock>,
  conversationId: string,
  opts: {
    /** count del updateMany con guard status=closed (false = la fila ya estaba open) */
    statusUpdated?: boolean;
    metaUpdated?: boolean;
    freshStatus?: string;
  } = {},
) {
  const { statusUpdated = true, metaUpdated = true, freshStatus = 'open' } = opts;
  prisma.conversation.updateMany
    .mockResolvedValueOnce({ count: 1 } as never) // limpieza de asignación
    .mockResolvedValueOnce({ count: statusUpdated ? 1 : 0 } as never);
  prisma.conversationMeta.updateMany.mockResolvedValueOnce({
    count: metaUpdated ? 1 : 0,
  } as never);
  prisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 } as never);
  prisma.conversation.findUniqueOrThrow.mockResolvedValueOnce({
    id: conversationId,
    status: freshStatus,
  } as never);
}

describe('ConversationRepository.findOrCreateOpen', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let repo: ConversationRepository;

  beforeEach(() => {
    prisma = makePrismaMock();
    // @ts-expect-error mock parcial de PrismaService
    repo = new ConversationRepository(prisma);
  });

  it('crea conversación OPEN cuando no existe una activa', async () => {
    prisma.conversation.findFirst.mockResolvedValueOnce(null as never);
    prisma.conversation.create.mockResolvedValueOnce({
      id: 'conv-1',
      status: ConversationStatus.open,
    } as never);

    const result = await repo.findOrCreateOpen('cit-1');

    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'conv-1', status: ConversationStatus.open });
  });

  it('recupera conversación concurrente si create falla por P2002', async () => {
    prisma.conversation.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        id: 'conv-existing',
        isCanonical: true,
        status: ConversationStatus.open,
        meta: null,
      } as never);

    prisma.conversation.create.mockRejectedValueOnce({ code: 'P2002' } as never);

    const result = await repo.findOrCreateOpen('cit-1');

    expect(prisma.conversationMeta.create).toHaveBeenCalledWith({
      data: { conversationId: 'conv-existing' },
    });
    expect(result).toMatchObject({ id: 'conv-existing', status: ConversationStatus.open });
  });
});

describe('ConversationRepository.findOrCreateCanonical', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let repo: ConversationRepository;

  beforeEach(() => {
    prisma = makePrismaMock();
    // @ts-expect-error mock parcial de PrismaService
    repo = new ConversationRepository(prisma);
  });

  it('reutiliza la conversación OPEN existente del ciudadano', async () => {
    prisma.conversation.findFirst.mockResolvedValueOnce({
      id: 'conv-open',
      status: ConversationStatus.open,
      isCanonical: true,
      meta: { id: 'meta-1' },
    } as never);

    const result = await repo.findOrCreateCanonical('cit-1');

    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.conversation.findFirst).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: 'conv-open',
      status: ConversationStatus.open,
      created: false,
      reactivated: false,
    });
  });

  it('promueve a canónica una OPEN existente que no lo era', async () => {
    prisma.conversation.findFirst.mockResolvedValueOnce({
      id: 'conv-open',
      status: ConversationStatus.open,
      isCanonical: false,
      meta: { id: 'meta-1' },
    } as never);
    prisma.conversation.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prisma.conversation.update.mockResolvedValueOnce({ id: 'conv-open' } as never);

    const result = await repo.findOrCreateCanonical('cit-1');

    expect(result).toMatchObject({ id: 'conv-open', created: false, reactivated: false });
    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        citizenId: 'cit-1',
        channel: 'whatsapp',
        communicationLineId: null,
        id: { not: 'conv-open' },
        isCanonical: true,
      },
      data: { isCanonical: false },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-open' },
      data: { isCanonical: true },
    });
  });

  it('REACTIVA la canónica cerrada en vez de crear una fila nueva', async () => {
    prisma.conversation.findFirst
      .mockResolvedValueOnce(null as never) // sin OPEN
      .mockResolvedValueOnce({
        id: 'conv-closed',
        status: ConversationStatus.closed,
        isCanonical: true,
        meta: { flowState: 'CLOSED' },
      } as never);
    mockReactivateCycle(prisma, 'conv-closed');

    const result = await repo.findOrCreateCanonical('cit-1');

    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'conv-closed',
      status: ConversationStatus.open,
      created: false,
      reactivated: true,
    });
    expect(prisma.conversationMeta.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-closed', flowState: { not: 'BOT_FLOW' } },
      data: expect.objectContaining({
        flowState: 'BOT_FLOW',
        version: { increment: 1 },
        lockedByUserId: null,
      }),
    });
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 'conv-closed', status: { in: ['OPEN', 'IN_PROGRESS'] } },
        data: expect.objectContaining({ status: 'CLOSED', closeReason: 'cycle_restart' }),
      }),
    );
  });

  it('reactiva la fila legacy con status open y FSM CLOSED (estado bug)', async () => {
    const legacyRow = {
      id: 'conv-legacy',
      status: ConversationStatus.open,
      isCanonical: true,
      meta: { flowState: 'CLOSED' },
    };
    prisma.conversation.findFirst
      .mockResolvedValueOnce(legacyRow as never) // findOpen: open pero FSM CLOSED → cerrada
      .mockResolvedValueOnce(legacyRow as never); // canónica
    mockReactivateCycle(prisma, 'conv-legacy', { statusUpdated: false });

    const result = await repo.findOrCreateCanonical('cit-1');

    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'conv-legacy',
      status: ConversationStatus.open,
      created: false,
      reactivated: true,
    });
    expect(prisma.conversation.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'conv-legacy' },
    });
  });

  it('el perdedor de la carrera concurrente no reporta reactivación (sin doble evento)', async () => {
    prisma.conversation.findFirst.mockResolvedValueOnce(null as never).mockResolvedValueOnce({
      id: 'conv-closed',
      status: ConversationStatus.closed,
      isCanonical: true,
      meta: { flowState: 'CLOSED' },
    } as never);
    // Ambos guards matchean 0 filas: otra corrida ya reactivó el ciclo.
    mockReactivateCycle(prisma, 'conv-closed', { statusUpdated: false, metaUpdated: false });

    const result = await repo.findOrCreateCanonical('cit-1');

    expect(result).toEqual({
      id: 'conv-closed',
      status: ConversationStatus.open,
      created: false,
      reactivated: false,
    });
  });

  it('reutiliza la más reciente no cerrada (in_progress) sin crear entidad nueva', async () => {
    prisma.conversation.findFirst
      .mockResolvedValueOnce(null as never) // sin OPEN
      .mockResolvedValueOnce({
        id: 'conv-inprogress',
        status: ConversationStatus.in_progress,
        isCanonical: true,
        meta: { flowState: 'HUMAN_FLOW' },
      } as never);

    const result = await repo.findOrCreateCanonical('cit-1');

    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'conv-inprogress',
      status: ConversationStatus.in_progress,
      created: false,
      reactivated: false,
    });
  });

  it('crea conversación nueva solo si no existe ninguna previa', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null as never);
    prisma.conversation.create.mockResolvedValueOnce({
      id: 'conv-new',
      status: ConversationStatus.open,
    } as never);

    const result = await repo.findOrCreateCanonical('cit-1');

    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: 'conv-new',
      status: ConversationStatus.open,
      created: true,
      reactivated: false,
    });
  });

  it('recupera la OPEN ganadora si create falla por P2002', async () => {
    prisma.conversation.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        id: 'conv-winner',
        status: ConversationStatus.open,
        isCanonical: true,
        meta: { id: 'meta-2' },
      } as never);
    prisma.conversation.create.mockRejectedValueOnce({ code: 'P2002' } as never);

    const result = await repo.findOrCreateCanonical('cit-1');

    expect(result).toEqual({
      id: 'conv-winner',
      status: ConversationStatus.open,
      created: false,
      reactivated: false,
    });
  });

  it('si el ganador del P2002 está cerrado, lo reactiva (nunca devuelve un ciclo CLOSED)', async () => {
    prisma.conversation.findFirst
      .mockResolvedValueOnce(null as never) // pre-create: sin OPEN
      .mockResolvedValueOnce(null as never) // pre-create: sin canónica
      .mockResolvedValueOnce(null as never) // pre-create: sin previas
      .mockResolvedValueOnce(null as never) // post-P2002: sin OPEN
      .mockResolvedValueOnce({
        id: 'conv-winner',
        status: ConversationStatus.closed,
        isCanonical: true,
        meta: { flowState: 'CLOSED' },
      } as never);
    prisma.conversation.create.mockRejectedValueOnce({ code: 'P2002' } as never);
    mockReactivateCycle(prisma, 'conv-winner');

    const result = await repo.findOrCreateCanonical('cit-1');

    expect(result).toEqual({
      id: 'conv-winner',
      status: ConversationStatus.open,
      created: false,
      reactivated: true,
    });
  });

  it('hace backfill de meta si la OPEN existente no tiene meta', async () => {
    prisma.conversation.findFirst.mockResolvedValueOnce({
      id: 'conv-open',
      status: ConversationStatus.open,
      isCanonical: true,
      meta: null,
    } as never);

    const result = await repo.findOrCreateCanonical('cit-1');

    expect(prisma.conversationMeta.create).toHaveBeenCalledWith({
      data: { conversationId: 'conv-open' },
    });
    expect(result).toMatchObject({ id: 'conv-open' });
  });
});

describe('ConversationRepository.listWithContext', () => {
  it('incluye último mensaje, agente y tickets activos, y pagina por actividad', async () => {
    const prisma = makePrismaMock();
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.listWithContext({ limit: 20 });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isCanonical: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 21,
        include: expect.objectContaining({
          assignedUser: expect.any(Object),
          messages: expect.objectContaining({ take: 1 }),
          tickets: expect.any(Object),
        }),
      }),
    );
  });

  it('filtra activas por EXISTS de ticket OPEN/IN_PROGRESS', async () => {
    const prisma = makePrismaMock();
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.listWithContext({ limit: 20, inboxStatus: 'active' });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { isCanonical: true },
            { tickets: { some: { status: { in: ['OPEN', 'IN_PROGRESS'] } } } },
          ],
        },
      }),
    );
  });

  it('resuelve department_id a slugs y no consulta si ningún departamento existe', async () => {
    const prisma = makePrismaMock();
    prisma.department.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    const result = await repo.listWithContext({
      limit: 20,
      departmentIds: ['11111111-1111-1111-1111-111111111111'],
    });

    expect(result).toEqual({ items: [], hasNextPage: false });
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
  });

  it('aplica línea telefónica, departamento y búsqueda en la misma query', async () => {
    const prisma = makePrismaMock();
    prisma.department.findMany.mockResolvedValueOnce([
      { slug: 'agua' },
      { slug: 'obras' },
    ] as never);
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.listWithContext({
      limit: 20,
      inboxStatus: 'inactive',
      departmentIds: [
        '11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333',
      ],
      communicationLineId: '22222222-2222-2222-2222-222222222222',
      search: 'Juan',
    });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { isCanonical: true },
            { tickets: { none: { status: { in: ['OPEN', 'IN_PROGRESS'] } } } },
            {
              OR: [
                { assignedDept: { in: ['agua', 'obras'] } },
                { meta: { is: { departmentSlug: { in: ['agua', 'obras'] } } } },
              ],
            },
            {
              meta: {
                is: { communicationLineId: '22222222-2222-2222-2222-222222222222' },
              },
            },
            {
              citizen: {
                OR: expect.arrayContaining([
                  { name: { contains: 'Juan', mode: 'insensitive' } },
                  { neighborhood: { contains: 'Juan', mode: 'insensitive' } },
                ]),
              },
            },
          ],
        },
      }),
    );
    expect(prisma.department.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'],
        },
        isActive: true,
      },
      select: { slug: true },
    });
  });
});

describe('ConversationRepository.listWithContext — filtro por agente IA', () => {
  it('botIds [null] resuelve líneas con agente IA activo y filtra por communicationLineId', async () => {
    const prisma = makePrismaMock();
    prisma.communicationLine.findMany.mockResolvedValueOnce([
      { id: 'line-1' },
      { id: 'line-2' },
    ] as never);
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.listWithContext({ limit: 20, botIds: [null] });

    expect(prisma.communicationLine.findMany).toHaveBeenCalledWith({
      where: { agent: { isActive: true }, agentId: { not: null } },
      select: { id: true },
    });
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { isCanonical: true },
            { meta: { is: { communicationLineId: { in: ['line-1', 'line-2'] } } } },
          ],
        },
      }),
    );
  });

  it('botIds con un agente limita a las líneas del agente indicado (activo)', async () => {
    const prisma = makePrismaMock();
    prisma.communicationLine.findMany.mockResolvedValueOnce([{ id: 'line-9' }] as never);
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.listWithContext({
      limit: 20,
      botIds: ['33333333-3333-3333-3333-333333333333'],
    });

    expect(prisma.communicationLine.findMany).toHaveBeenCalledWith({
      where: {
        agent: { isActive: true },
        agentId: { in: ['33333333-3333-3333-3333-333333333333'] },
      },
      select: { id: true },
    });
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { isCanonical: true },
            { meta: { is: { communicationLineId: { in: ['line-9'] } } } },
          ],
        },
      }),
    );
  });

  it('botIds con varios agentes filtra por todos los seleccionados', async () => {
    const prisma = makePrismaMock();
    prisma.communicationLine.findMany.mockResolvedValueOnce([{ id: 'line-9' }] as never);
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.listWithContext({ limit: 20, botIds: ['agent-1', 'agent-2'] });

    expect(prisma.communicationLine.findMany).toHaveBeenCalledWith({
      where: { agent: { isActive: true }, agentId: { in: ['agent-1', 'agent-2'] } },
      select: { id: true },
    });
  });

  it('null dentro de botIds incluye TODAS las líneas con agente activo (unión)', async () => {
    const prisma = makePrismaMock();
    prisma.communicationLine.findMany.mockResolvedValueOnce([{ id: 'line-1' }] as never);
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.listWithContext({ limit: 20, botIds: ['agent-1', null] });

    expect(prisma.communicationLine.findMany).toHaveBeenCalledWith({
      where: { agent: { isActive: true }, agentId: { not: null } },
      select: { id: true },
    });
  });

  it('botIds que resuelven a cero líneas devuelven página vacía sin consultar conversaciones', async () => {
    const prisma = makePrismaMock();
    prisma.communicationLine.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    const result = await repo.listWithContext({ limit: 20, botIds: [null] });

    expect(result).toEqual({ items: [], hasNextPage: false });
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
  });

  it('departmentIds + botIds combinan con OR entre grupos (nunca AND)', async () => {
    const prisma = makePrismaMock();
    prisma.department.findMany.mockResolvedValueOnce([{ slug: 'agua' }] as never);
    prisma.communicationLine.findMany.mockResolvedValueOnce([{ id: 'line-1' }] as never);
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.listWithContext({
      limit: 20,
      departmentIds: ['11111111-1111-1111-1111-111111111111'],
      botIds: [null],
    });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { isCanonical: true },
            {
              OR: [
                {
                  OR: [
                    { assignedDept: { in: ['agua'] } },
                    { meta: { is: { departmentSlug: { in: ['agua'] } } } },
                  ],
                },
                { meta: { is: { communicationLineId: { in: ['line-1'] } } } },
              ],
            },
          ],
        },
      }),
    );
  });

  it('bots que resuelven a cero líneas NO vacían el resultado cuando hay departamentos activos (OR)', async () => {
    const prisma = makePrismaMock();
    prisma.department.findMany.mockResolvedValueOnce([{ slug: 'agua' }] as never);
    prisma.communicationLine.findMany.mockResolvedValueOnce([] as never);
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.listWithContext({
      limit: 20,
      departmentIds: ['11111111-1111-1111-1111-111111111111'],
      botIds: [null],
    });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { isCanonical: true },
            {
              OR: [
                { assignedDept: { in: ['agua'] } },
                { meta: { is: { departmentSlug: { in: ['agua'] } } } },
              ],
            },
          ],
        },
      }),
    );
  });

  it('departamentos que resuelven a cero slugs NO vacían el resultado cuando hay bots activos (OR)', async () => {
    const prisma = makePrismaMock();
    prisma.department.findMany.mockResolvedValueOnce([] as never);
    prisma.communicationLine.findMany.mockResolvedValueOnce([{ id: 'line-1' }] as never);
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.listWithContext({
      limit: 20,
      departmentIds: ['11111111-1111-1111-1111-111111111111'],
      botIds: [null],
    });

    expect(prisma.communicationLine.findMany).toHaveBeenCalled();
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { isCanonical: true },
            { meta: { is: { communicationLineId: { in: ['line-1'] } } } },
          ],
        },
      }),
    );
  });

  it('sin filtros bot no consulta communicationLine (comportamiento unchanged)', async () => {
    const prisma = makePrismaMock();
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.listWithContext({ limit: 20 });

    expect(prisma.communicationLine.findMany).not.toHaveBeenCalled();
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isCanonical: true } }),
    );
  });
});

describe('ConversationRepository.findBotAgentsByLineIds', () => {
  it('mapea línea → agente activo en una sola query batcheada', async () => {
    const prisma = makePrismaMock();
    prisma.communicationLine.findMany.mockResolvedValueOnce([
      { id: 'line-1', agent: { id: 'agent-1', name: 'Bot Reclamos' } },
      { id: 'line-2', agent: null },
    ] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    const map = await repo.findBotAgentsByLineIds(['line-1', 'line-2']);

    expect(prisma.communicationLine.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['line-1', 'line-2'] }, agent: { isActive: true } },
      select: { id: true, agent: { select: { id: true, name: true } } },
    });
    expect(map.get('line-1')).toEqual({ id: 'agent-1', name: 'Bot Reclamos' });
    expect(map.has('line-2')).toBe(false);
  });

  it('sin líneas no consulta la base y devuelve mapa vacío', async () => {
    const prisma = makePrismaMock();
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    const map = await repo.findBotAgentsByLineIds([]);

    expect(map.size).toBe(0);
    expect(prisma.communicationLine.findMany).not.toHaveBeenCalled();
  });
});

describe('buildConversationListWhere', () => {
  it('busca tokens de nombre y colonia con ILIKE', () => {
    const where = buildConversationListWhere({ search: 'juan centro' });
    expect(where).toEqual({
      AND: [
        { isCanonical: true },
        {
          citizen: {
            OR: [
              { name: { contains: 'juan', mode: 'insensitive' } },
              { lastName: { contains: 'juan', mode: 'insensitive' } },
              { phone: { contains: 'juan', mode: 'insensitive' } },
              { neighborhood: { contains: 'juan', mode: 'insensitive' } },
            ],
          },
        },
        {
          citizen: {
            OR: [
              { name: { contains: 'centro', mode: 'insensitive' } },
              { lastName: { contains: 'centro', mode: 'insensitive' } },
              { phone: { contains: 'centro', mode: 'insensitive' } },
              { neighborhood: { contains: 'centro', mode: 'insensitive' } },
            ],
          },
        },
      ],
    });
  });

  it('agrega meta.communicationLineId in(...) cuando hay botLineIds', () => {
    const where = buildConversationListWhere({ botLineIds: ['line-1', 'line-2'] });
    expect(where).toEqual({
      AND: [
        { isCanonical: true },
        { meta: { is: { communicationLineId: { in: ['line-1', 'line-2'] } } } },
      ],
    });
  });

  it('combina departamento y botLineIds con OR entre grupos (nunca AND)', () => {
    const where = buildConversationListWhere({
      departmentSlugs: ['agua'],
      botLineIds: ['line-1'],
    });
    expect(where).toEqual({
      AND: [
        { isCanonical: true },
        {
          OR: [
            {
              OR: [
                { assignedDept: { in: ['agua'] } },
                { meta: { is: { departmentSlug: { in: ['agua'] } } } },
              ],
            },
            { meta: { is: { communicationLineId: { in: ['line-1'] } } } },
          ],
        },
      ],
    });
  });

  it('solo departamentos mantiene la condición actual (regresión)', () => {
    const where = buildConversationListWhere({ departmentSlugs: ['agua'] });
    expect(where).toEqual({
      AND: [
        { isCanonical: true },
        {
          OR: [
            { assignedDept: { in: ['agua'] } },
            { meta: { is: { departmentSlug: { in: ['agua'] } } } },
          ],
        },
      ],
    });
  });

  it('sin filtros devuelve solo la condición de canónica (regresión)', () => {
    expect(buildConversationListWhere({})).toEqual({ isCanonical: true });
  });
});

describe('ConversationRepository.clearInboxOwnershipInTransaction', () => {
  it('limpia agente, departamento, lock de meta y assignments activos', async () => {
    const prisma = makePrismaMock();
    prisma.conversation.update.mockResolvedValueOnce({} as never);
    prisma.conversationMeta.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prisma.assignment.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.clearInboxOwnershipInTransaction(prisma as never, 'conv-1');

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { assignedUserId: null, assignedDept: null },
    });
    expect(prisma.conversationMeta.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      data: { lockedByUserId: null, lockedAt: null, departmentSlug: null },
    });
    expect(prisma.assignment.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1', isActive: true },
      data: expect.objectContaining({ isActive: false }),
    });
  });
});

describe('ConversationRepository.closeActiveTicketsInTransaction', () => {
  it('cierra tickets OPEN e IN_PROGRESS de la conversación', async () => {
    const prisma = makePrismaMock();
    prisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    const count = await repo.closeActiveTicketsInTransaction(
      prisma as never,
      'conv-1',
      'user_request',
    );

    expect(count).toBe(1);
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId: 'conv-1',
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        data: expect.objectContaining({
          status: 'CLOSED',
          closeReason: 'user_request',
          assignedUserId: null,
          departmentSlug: null,
        }),
      }),
    );
  });
});

describe('ConversationRepository unread counters', () => {
  it('counts inbound messages after the per-user read cursor', async () => {
    const prisma = makePrismaMock();
    prisma.conversationRead.findMany.mockResolvedValueOnce([
      {
        conversationId: 'conv-1',
        lastReadAt: new Date('2026-09-20T12:00:00.000Z'),
      },
    ] as never);
    prisma.message.findMany.mockResolvedValueOnce([
      { conversationId: 'conv-1', createdAt: new Date('2026-09-20T11:00:00.000Z') },
      { conversationId: 'conv-1', createdAt: new Date('2026-09-20T13:00:00.000Z') },
      { conversationId: 'conv-2', createdAt: new Date('2026-09-20T13:00:00.000Z') },
    ] as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    const counts = await repo.countUnreadByConversationIds('user-1', ['conv-1', 'conv-2']);

    expect(counts.get('conv-1')).toBe(1);
    expect(counts.get('conv-2')).toBe(1);
  });

  it('upserts the conversation read cursor', async () => {
    const prisma = makePrismaMock();
    prisma.conversationRead.upsert.mockResolvedValueOnce({} as never);
    // @ts-expect-error mock parcial de PrismaService
    const repo = new ConversationRepository(prisma);

    await repo.markConversationRead('user-1', 'conv-1', new Date('2026-09-23T00:00:00.000Z'));

    expect(prisma.conversationRead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_conversationId: { userId: 'user-1', conversationId: 'conv-1' } },
      }),
    );
  });
});

describe('ConversationRepository.reactivateCycle con reopenReason', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let repo: ConversationRepository;

  beforeEach(() => {
    prisma = makePrismaMock();
    // @ts-expect-error mock parcial de PrismaService
    repo = new ConversationRepository(prisma);
  });

  it('reapertura por agente: HUMAN_FLOW + attendance human (bot silenciado)', async () => {
    prisma.conversation.findFirst
      .mockResolvedValueOnce(null as never) // sin OPEN
      .mockResolvedValueOnce({
        id: 'conv-closed',
        status: ConversationStatus.closed,
        isCanonical: true,
        meta: { flowState: 'CLOSED' },
      } as never);
    mockReactivateCycle(prisma, 'conv-closed');

    const result = await repo.findOrCreateCanonical('cit-1', { reopenReason: 'agent' });

    expect(result).toEqual({
      id: 'conv-closed',
      status: ConversationStatus.open,
      created: false,
      reactivated: true,
    });
    // Limpieza de asignación: aplica el plan con attendance human.
    expect(prisma.conversation.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'conv-closed' },
        data: expect.objectContaining({
          assignedUserId: null,
          assignedDept: null,
          attendanceMode: 'human',
          botEnabled: false,
        }),
      }),
    );
    // Meta: pasa a HUMAN_FLOW (no BOT_FLOW como en citizen_recontact).
    expect(prisma.conversationMeta.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-closed', flowState: { not: 'HUMAN_FLOW' } },
      data: expect.objectContaining({
        flowState: 'HUMAN_FLOW',
        version: { increment: 1 },
        lockedByUserId: null,
      }),
    });
  });

  it('recontacto de ciudadano (default): BOT_FLOW + attendance bot (IA activa)', async () => {
    prisma.conversation.findFirst.mockResolvedValueOnce(null as never).mockResolvedValueOnce({
      id: 'conv-closed',
      status: ConversationStatus.closed,
      isCanonical: true,
      meta: { flowState: 'CLOSED' },
    } as never);
    mockReactivateCycle(prisma, 'conv-closed');

    await repo.findOrCreateCanonical('cit-1');

    expect(prisma.conversation.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          attendanceMode: 'bot',
          botEnabled: true,
        }),
      }),
    );
  });
});

describe('ConversationRepository conciliación de atención', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let repo: ConversationRepository;

  beforeEach(() => {
    prisma = makePrismaMock();
    // @ts-expect-error mock parcial de PrismaService
    repo = new ConversationRepository(prisma);
  });

  it('reconcileAttendanceMode corrige bot→human solo donde hay agente asignado', async () => {
    prisma.conversation.updateMany.mockResolvedValueOnce({ count: 3 } as never);

    const count = await repo.reconcileAttendanceMode();

    expect(count).toBe(3);
    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        assignedUserId: { not: null },
        attendanceMode: 'bot',
      },
      data: {
        attendanceMode: 'human',
        botEnabled: false,
      },
    });
  });

  it('setAttendanceMode escribe attendanceMode y botEnabled en la conversación', async () => {
    prisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1' } as never);

    await repo.setAttendanceMode('conv-1', 'human', false);

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { attendanceMode: 'human', botEnabled: false },
    });
  });
});

describe('ConversationRepository control de atención (transferencias)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let repo: ConversationRepository;

  beforeEach(() => {
    prisma = makePrismaMock();
    // @ts-expect-error mock parcial de PrismaService
    repo = new ConversationRepository(prisma);
  });

  it('setDepartmentControl silencia el bot (attendance human) al transferir a departamento', async () => {
    prisma.assignment.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    prisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1' } as never);
    prisma.conversationMeta.updateMany.mockResolvedValueOnce({ count: 1 } as never);

    await repo.setDepartmentControl('conv-1', 'atencion');

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv-1' },
        data: expect.objectContaining({
          assignedUserId: null,
          assignedDept: 'atencion',
          attendanceMode: 'human',
          botEnabled: false,
        }),
      }),
    );
  });

  it('releaseOwnership reactiva el bot (attendance bot) al devolver la conversación a IA', async () => {
    prisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1' } as never);
    prisma.conversationMeta.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prisma.assignment.updateMany.mockResolvedValueOnce({ count: 0 } as never);

    await repo.releaseOwnership('conv-1');

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv-1' },
        data: expect.objectContaining({
          assignedUserId: null,
          assignedDept: null,
          attendanceMode: 'bot',
          botEnabled: true,
        }),
      }),
    );
  });

  it('applyAssignmentInTransaction marca atención humana al asignar agente', async () => {
    prisma.assignment.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    prisma.assignment.create.mockResolvedValueOnce({ id: 'assignment-1' } as never);
    prisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1' } as never);
    prisma.conversationMeta.updateMany.mockResolvedValueOnce({ count: 1 } as never);

    // @ts-expect-error tx mock parcial
    await repo.applyAssignmentInTransaction(prisma, {
      conversationId: 'conv-1',
      userId: 'user-1',
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv-1' },
        data: expect.objectContaining({
          assignedUserId: 'user-1',
          attendanceMode: 'human',
          botEnabled: false,
        }),
      }),
    );
  });

  it('transferToDepartment hace handoff unificado: bloquea fila, silencia IA, limpia locks y audita', async () => {
    prisma.assignment.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    prisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1' } as never);
    prisma.conversationMeta.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prisma.auditLog.create.mockResolvedValueOnce({ id: 'audit-1' } as never);

    await repo.transferToDepartment({
      conversationId: 'conv-1',
      departmentSlug: 'atencion',
      transferredBy: 'bot',
      reason: 'assignDepartment',
    });

    const rawCall = prisma.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray];
    expect(rawCall[0].join(' ')).toContain('FOR UPDATE');

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv-1' },
        data: expect.objectContaining({
          assignedUserId: null,
          assignedDept: 'atencion',
          attendanceMode: 'human',
          botEnabled: false,
          transferredBy: 'bot',
          transferReason: 'assignDepartment',
          transferredAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        action: 'conversation.transferred_to_department',
        targetType: 'Conversation',
        targetId: 'conv-1',
      }),
    });
  });

  it('setDepartmentControl propaga el actor de plataforma a la auditoría', async () => {
    prisma.assignment.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    prisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1' } as never);
    prisma.conversationMeta.updateMany.mockResolvedValueOnce({ count: 1 } as never);

    await repo.setDepartmentControl('conv-1', 'atencion', 'user-admin');

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ transferredBy: 'user-admin' }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user-admin',
        action: 'conversation.transferred_to_department',
      }),
    });
  });

  it('findStuckDepartmentHandoffs devuelve handoffs a departamento con IA aún activa', async () => {
    prisma.conversation.findMany.mockResolvedValue([
      { id: 'conv-1', transferredAt: new Date() },
    ] as never);

    await repo.findStuckDepartmentHandoffs(5 * 60_000);

    expect(prisma.conversation.findMany).toHaveBeenCalledWith({
      where: {
        transferReason: { not: null },
        attendanceMode: 'bot',
        transferredAt: { lt: expect.any(Date) },
      },
      select: { id: true, transferredAt: true },
      take: 100,
    });
  });
});
