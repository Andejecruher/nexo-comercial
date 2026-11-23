/**
 * Unit tests: ReactionService
 *
 * Cubre el contrato central del módulo de reacciones: una reacción NUNCA crea
 * un mensaje nuevo; solo muta `meta.reaction` del mensaje objetivo y emite un
 * evento durable de tipo `message.updated`.
 */
import { describe, expect, it, jest } from '@jest/globals';
import type { RealtimeNotifier } from '../../services/realtime/realtime-notifier.service';
import { ReactionService } from '../../services/whatsapp/reaction.service';
import type { ParsedWebhookReaction } from '../../utils/wa-message-parser';

const TARGET_ID = '11111111-1111-1111-1111-111111111111';

function makeReaction(overrides: Partial<ParsedWebhookReaction> = {}): ParsedWebhookReaction {
  return {
    wamid: 'wamid-reaction-1',
    targetMessageId: 'wamid-target-1',
    emoji: '👍',
    phone: '529612345678',
    timestamp: '1700000000',
    phoneNumberId: 'phone-id',
    ...overrides,
  };
}

function makeTargetMessage(meta: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    conversationId: '22222222-2222-2222-2222-222222222222',
    ticketId: '33333333-3333-3333-3333-333333333333',
    body: 'Mensaje original',
    direction: 'inbound',
    messageType: 'text',
    externalMessageId: 'wamid-target-1',
    sendByUserId: null,
    meta,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

type TargetMessage = ReturnType<typeof makeTargetMessage>;

function makePrisma(target: TargetMessage | null) {
  const updated = target ? { ...target } : null;
  const tx = {
    $executeRaw: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    message: {
      findFirst: jest.fn<() => Promise<TargetMessage | null>>().mockResolvedValue(target),
      update: jest
        .fn<(args: { data: { meta: unknown } }) => Promise<unknown>>()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...(target as object), meta: data.meta }),
        ),
    },
  };
  return {
    prisma: {
      $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    } as any,
    tx,
    updated,
  };
}

function enabledNotifier(): {
  isEnabled: () => boolean;
  notifyCritical: jest.Mock<(tx: unknown, event: Record<string, unknown>) => Promise<void>>;
} {
  return {
    isEnabled: () => true,
    notifyCritical: jest
      .fn<(tx: unknown, event: Record<string, unknown>) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
}

describe('ReactionService.apply', () => {
  it('aplica el emoji sobre el mensaje objetivo sin crear un mensaje nuevo', async () => {
    const { prisma, tx } = makePrisma(makeTargetMessage());
    const notifier = enabledNotifier();

    const complete = await new ReactionService(
      prisma,
      notifier as unknown as RealtimeNotifier,
    ).apply([makeReaction()]);

    expect(complete).toBe(true);
    // El único write es un UPDATE sobre el mensaje existente — nunca un create.
    expect(tx.message.update).toHaveBeenCalledTimes(1);
    expect((tx.message as any).create).toBeUndefined();
    expect(tx.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TARGET_ID },
        data: {
          meta: expect.objectContaining({
            reaction: { emoji: '👍', from: '529612345678', updated_at: '1700000000' },
          }),
        },
      }),
    );
  });

  it('emite un evento durable `message.updated` con el patch de la burbuja existente', async () => {
    const { prisma } = makePrisma(makeTargetMessage());
    const notifier = enabledNotifier();

    await new ReactionService(prisma, notifier as unknown as RealtimeNotifier).apply([
      makeReaction(),
    ]);

    expect(notifier.notifyCritical).toHaveBeenCalledTimes(1);
    const event = notifier.notifyCritical.mock.calls[0][1];
    expect(event).toMatchObject({
      eventType: 'message.updated',
      socketEventName: 'conversation.message.new',
      conversationId: '22222222-2222-2222-2222-222222222222',
      messagePatch: expect.objectContaining({
        id: TARGET_ID,
        body: 'Mensaje original',
        meta: expect.objectContaining({
          reaction: { emoji: '👍', from: '529612345678', updated_at: '1700000000' },
        }),
      }),
    });
    // Reaccionar no debe alterar el inbox ni disparar notificaciones.
    expect(event.notificationPatch).toBeUndefined();
    expect(event.inboxPatch).toBeUndefined();
  });

  it('sobrescribe una reacción previa con emoji diferente', async () => {
    const { prisma, tx } = makePrisma(
      makeTargetMessage({
        reaction: { emoji: '❤️', from: '520000000000', updated_at: '1600000000' },
      }),
    );
    const notifier = enabledNotifier();

    await new ReactionService(prisma, notifier as unknown as RealtimeNotifier).apply([
      makeReaction({ emoji: '🔥' }),
    ]);

    expect(tx.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          meta: expect.objectContaining({
            reaction: { emoji: '🔥', from: '529612345678', updated_at: '1700000000' },
          }),
        },
      }),
    );
  });

  it('sin emoji limpia la reacción existente (emoji: null)', async () => {
    const { prisma, tx } = makePrisma(
      makeTargetMessage({
        reaction: { emoji: '👍', from: '529612345678', updated_at: '1600000000' },
      }),
    );
    const notifier = enabledNotifier();

    const { emoji: _omitted, ...withoutEmoji } = makeReaction();
    await new ReactionService(prisma, notifier as unknown as RealtimeNotifier).apply([
      withoutEmoji,
    ]);

    expect(tx.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          meta: expect.objectContaining({
            reaction: { emoji: null, from: '529612345678', updated_at: '1700000000' },
          }),
        },
      }),
    );
  });

  it('preserva el resto del meta del mensaje al escribir la reacción', async () => {
    const { prisma, tx } = makePrisma(
      makeTargetMessage({ media: { id: 'media-1' }, type: 'image' }),
    );
    const notifier = enabledNotifier();

    await new ReactionService(prisma, notifier as unknown as RealtimeNotifier).apply([
      makeReaction(),
    ]);

    const data = tx.message.update.mock.calls[0]?.[0].data;
    expect(data.meta).toMatchObject({ media: { id: 'media-1' }, type: 'image' });
  });

  it('ignora la reacción si el mensaje objetivo no existe, sin romper el lote', async () => {
    const { prisma, tx } = makePrisma(null);
    const notifier = enabledNotifier();

    await expect(
      new ReactionService(prisma, notifier as unknown as RealtimeNotifier).apply([makeReaction()]),
    ).resolves.toBe(true);
    expect(tx.message.update).not.toHaveBeenCalled();
    expect(notifier.notifyCritical).not.toHaveBeenCalled();
  });

  it('una reacción fallida no aborta las siguientes del lote', async () => {
    const { prisma, tx } = makePrisma(makeTargetMessage());
    tx.$executeRaw.mockRejectedValueOnce(new Error('lock timeout'));
    const notifier = enabledNotifier();

    const complete = await new ReactionService(
      prisma,
      notifier as unknown as RealtimeNotifier,
    ).apply([
      makeReaction({ wamid: 'wamid-reaction-1' }),
      makeReaction({ wamid: 'wamid-reaction-2' }),
    ]);

    expect(complete).toBe(false);
    expect(tx.message.update).toHaveBeenCalledTimes(1);
  });
});
