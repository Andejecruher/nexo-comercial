/**
 * ConversationLeaseLock contra PostgreSQL real.
 *
 * El hueco que dejó pasar el 22P02 en producción: los tests unitarios inyectan
 * un fsmLock falso cuyo `acquire` devuelve una constante, así que el cast
 * `${conversationId}::uuid` nunca llegaba a la base. Estos tests ejercitan el
 * lock real contra la columna real `conversation_meta.conversation_id` (uuid).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ConversationLeaseLock } from '../../services/fsm-lock.service';

describe('ConversationLeaseLock — real PostgreSQL', () => {
  let prisma: PrismaClient;
  let lock: ConversationLeaseLock;
  const createdCitizenIds: string[] = [];
  const createdLineIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    lock = new ConversationLeaseLock(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Citizens cascade to conversations and meta; delete lines only afterwards.
    await prisma.citizen.deleteMany({ where: { id: { in: createdCitizenIds } } });
    await prisma.communicationLine.deleteMany({ where: { id: { in: createdLineIds } } });
    createdCitizenIds.length = 0;
    createdLineIds.length = 0;
  });

  /**
   * Crea una conversación real porque `conversation_meta.conversation_id` es
   * foreign key a `conversations.id`: sin fila válida el INSERT ni siquiera
   * llega al cast.
   */
  async function createConversation(
    communicationLineId: string | null = null,
    withMeta = true,
  ): Promise<string> {
    const citizen = await prisma.citizen.create({
      data: { phone: `+54911${randomUUID().slice(0, 8)}` },
    });
    createdCitizenIds.push(citizen.id);
    const conversation = await prisma.conversation.create({
      data: { citizenId: citizen.id, communicationLineId },
    });
    if (withMeta) {
      await prisma.conversationMeta.create({
        data: { conversationId: conversation.id, communicationLineId },
      });
    }
    return conversation.id;
  }

  async function createLine(): Promise<string> {
    const line = await prisma.communicationLine.create({
      data: { displayName: 'FSM regression', externalIdentifier: randomUUID() },
    });
    createdLineIds.push(line.id);
    return line.id;
  }

  async function expectLine(conversationId: string, communicationLineId: string | null) {
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { meta: true },
    });
    expect(conversation.communicationLineId).toBe(communicationLineId);
    expect(conversation.meta?.communicationLineId).toBe(communicationLineId);
  }

  it('acquires and releases the lease for a real conversation UUID', async () => {
    const conversationId = await createConversation();

    const token = await lock.acquire(conversationId);
    expect(token).not.toBeNull();

    const held = await prisma.conversationMeta.findUnique({ where: { conversationId } });
    expect(held?.fsmLockToken).toBe(token);

    await expect(lock.release(conversationId, token!)).resolves.toBe(true);

    const released = await prisma.conversationMeta.findUnique({ where: { conversationId } });
    expect(released?.fsmLockToken).toBeNull();
    expect(released?.fsmLockedAt).toBeNull();
  });

  it('returns null while a live lease is held, and succeeds once it expires', async () => {
    const conversationId = await createConversation();

    const first = await lock.acquire(conversationId);
    expect(first).not.toBeNull();
    await expect(lock.acquire(conversationId)).resolves.toBeNull();

    // Expirado hacia el pasado: el WHERE de fsm_locked_at deja reentrar.
    await prisma.$executeRaw`
      UPDATE conversation_meta
      SET fsm_locked_at = now() - interval '1 hour'
      WHERE conversation_id = ${conversationId}::uuid
    `;

    await expect(lock.acquire(conversationId)).resolves.not.toBeNull();
  });

  it.each([true, false])(
    'preserves a bound line through the lease lifecycle (existing meta: %s)',
    async (withMeta) => {
      const lineId = await createLine();
      const conversationId = await createConversation(lineId, withMeta);

      // BEFORE INSERT runs even on the conflict path. The proposed meta row
      // has no line in the lease UPSERT and must inherit the indexed scope.
      const first = await lock.acquire(conversationId);
      expect(first).not.toBeNull();
      await expectLine(conversationId, lineId);
      await expect(lock.acquire(conversationId)).resolves.toBeNull();

      await prisma.$executeRaw`
        UPDATE conversation_meta SET fsm_locked_at = now() - interval '1 hour'
        WHERE conversation_id = ${conversationId}::uuid
      `;
      const second = await lock.acquire(conversationId);
      expect(second).not.toBeNull();
      expect(second).not.toBe(first);
      await expect(lock.release(conversationId, first!)).resolves.toBe(false);
      await expect(lock.release(conversationId, second!)).resolves.toBe(true);
      await expectLine(conversationId, lineId);
      await expect(lock.acquire(conversationId)).resolves.not.toBeNull();
    },
  );

  it.each([true, false])(
    'allows only one concurrent lease owner on a bound line (existing meta: %s)',
    async (withMeta) => {
      const lineId = await createLine();
      const conversationId = await createConversation(lineId, withMeta);
      const tokens = await Promise.all([
        lock.acquire(conversationId),
        lock.acquire(conversationId),
      ]);
      const owners = tokens.filter((token) => token !== null);
      expect(owners).toHaveLength(1);
      const meta = await prisma.conversationMeta.findUniqueOrThrow({
        where: { conversationId },
      });
      expect(meta.fsmLockToken).toBe(owners[0]);
      await expectLine(conversationId, lineId);
    },
  );

  it('creates missing legacy meta without binding an unbound conversation', async () => {
    const conversationId = await createConversation(null, false);
    await expect(lock.acquire(conversationId)).resolves.not.toBeNull();
    await expectLine(conversationId, null);
  });

  it.each([true, false])(
    'rejects an explicitly different line before resolving an UPSERT conflict (existing meta: %s)',
    async (withMeta) => {
      const lineId = await createLine();
      const otherLineId = await createLine();
      const conversationId = await createConversation(lineId, withMeta);

      await expect(prisma.$executeRaw`
        INSERT INTO conversation_meta (conversation_id, communication_line_id, updated_at)
        VALUES (${conversationId}::uuid, ${otherLineId}::uuid, now())
        ON CONFLICT (conversation_id) DO UPDATE SET updated_at = EXCLUDED.updated_at
      `).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });

      // A failed reassignment must not poison subsequent legitimate processing.
      await expect(lock.acquire(conversationId)).resolves.not.toBeNull();
      await expectLine(conversationId, lineId);
    },
  );

  it('rejects both reassignment and explicit clearing on UPDATE, but allows the same line', async () => {
    const lineId = await createLine();
    const otherLineId = await createLine();
    const conversationId = await createConversation(lineId);

    for (const proposedLineId of [otherLineId, null]) {
      await expect(prisma.$executeRaw`
        UPDATE conversation_meta SET communication_line_id = ${proposedLineId}::uuid
        WHERE conversation_id = ${conversationId}::uuid
      `).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });
      await expectLine(conversationId, lineId);
    }
    await prisma.conversationMeta.update({
      where: { conversationId },
      data: { communicationLineId: lineId },
    });
    await expectLine(conversationId, lineId);
  });

  it('still synchronizes the first line binding after a lease creates unbound meta', async () => {
    const conversationId = await createConversation(null, false);
    await lock.acquire(conversationId);
    const lineId = await createLine();
    await prisma.conversationMeta.update({
      where: { conversationId },
      data: { communicationLineId: lineId },
    });
    await expectLine(conversationId, lineId);
  });

  it('rejects a phone number with a caller-located error instead of a 22P02', async () => {
    await expect(lock.acquire('521999888777')).rejects.toThrow(/Invalid conversationId/);
    await expect(lock.release('521999888777', 'any-token')).rejects.toThrow(
      /Invalid conversationId/,
    );
  });

  it('rejects a bare numeric string before it reaches the database', async () => {
    // El valor exacto del incidente en producción.
    await expect(lock.acquire('523223188252')).rejects.toThrow(/Invalid conversationId/);
  });
});
