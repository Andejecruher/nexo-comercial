import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { dropIsolatedDatabase, migrateIsolatedDatabase } from './baseline-schema';

describe('consolidated baseline invariants — real PostgreSQL', () => {
  const database = `baseline_invariants_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let prisma: PrismaClient;

  beforeAll(async () => {
    admin = new PrismaClient();
    const url = await migrateIsolatedDatabase(admin, database);
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (admin) {
      await dropIsolatedDatabase(admin, database);
      await admin.$disconnect();
    }
  });

  it('inherits line scope and rejects reassignment on insert and update', async () => {
    const citizen = await prisma.citizen.create({ data: { phone: '+525500000001' } });
    const firstLine = randomUUID();
    const secondLine = randomUUID();
    await prisma.communicationLine.createMany({
      data: [
        {
          id: firstLine,
          externalIdentifier: firstLine,
          displayName: 'First test line',
          updatedAt: new Date(),
        },
        {
          id: secondLine,
          externalIdentifier: secondLine,
          displayName: 'Second test line',
          updatedAt: new Date(),
        },
      ],
    });
    const conversation = await prisma.conversation.create({
      data: { citizenId: citizen.id, communicationLineId: firstLine },
    });
    const meta = await prisma.conversationMeta.create({
      data: { conversationId: conversation.id },
    });
    expect(meta.communicationLineId).toBe(firstLine);
    await expect(
      prisma.conversationMeta.update({
        where: { id: meta.id },
        data: { communicationLineId: secondLine },
      }),
    ).rejects.toThrow();
    expect(
      (await prisma.conversationMeta.findUniqueOrThrow({ where: { id: meta.id } }))
        .communicationLineId,
    ).toBe(firstLine);

    const other = await prisma.conversation.create({
      data: { citizenId: citizen.id, status: 'closed', isCanonical: false },
    });
    await prisma.conversationMeta.create({
      data: { conversationId: other.id, communicationLineId: secondLine },
    });
    expect(
      (await prisma.conversation.findUniqueOrThrow({ where: { id: other.id } }))
        .communicationLineId,
    ).toBe(secondLine);
    await expect(
      prisma.conversationMeta.update({
        where: { conversationId: other.id },
        data: { communicationLineId: firstLine },
      }),
    ).rejects.toThrow();
  });

  it('keeps partial uniqueness for active conversations and tickets', async () => {
    const citizen = await prisma.citizen.create({ data: { phone: '+525500000002' } });
    const line = randomUUID();
    const first = await prisma.conversation.create({
      data: { citizenId: citizen.id, communicationLineId: line, isCanonical: false },
    });
    await expect(
      prisma.conversation.create({
        data: {
          citizenId: citizen.id,
          communicationLineId: line,
          isCanonical: false,
          status: 'in_progress',
        },
      }),
    ).rejects.toThrow();
    await prisma.conversation.create({
      data: {
        citizenId: citizen.id,
        communicationLineId: line,
        isCanonical: false,
        status: 'closed',
      },
    });
    await prisma.conversation.create({
      data: { citizenId: citizen.id, communicationLineId: randomUUID(), isCanonical: false },
    });

    await prisma.ticket.create({
      data: { conversationId: first.id, citizenId: citizen.id, folio: 'ACTIVE-1' },
    });
    await expect(
      prisma.ticket.create({
        data: {
          conversationId: first.id,
          citizenId: citizen.id,
          folio: 'ACTIVE-2',
          status: 'IN_PROGRESS',
        },
      }),
    ).rejects.toThrow();
    await prisma.ticket.create({
      data: {
        conversationId: first.id,
        citizenId: citizen.id,
        folio: 'CLOSED-1',
        status: 'CLOSED',
      },
    });
    const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN (
        'uq_conversations_active_per_citizen_channel_line',
        'uq_tickets_one_active_per_conversation')`;
    expect(indexes).toHaveLength(2);
    expect(indexes.find((row) => row.indexname.startsWith('uq_conversations'))?.indexdef).toContain(
      'COALESCE',
    );
    expect(indexes.every((row) => row.indexdef.includes('WHERE'))).toBe(true);
  });
});
