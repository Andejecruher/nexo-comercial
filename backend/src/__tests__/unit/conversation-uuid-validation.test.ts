import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middlewares/errorHandler';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { TicketRepository } from '../../repositories/ticket.repository';

const uuid = '550e8400-e29b-41d4-a716-446655440000';

function repositories() {
  const prisma = {
    conversation: { findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
    conversationMeta: { updateMany: jest.fn() },
    ticket: { findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
  };
  const transaction = {
    conversation: { findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
    ticket: { findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
  };
  const conversations = new ConversationRepository(prisma as never);
  const tickets = new TicketRepository(prisma as never);
  const reads = [
    (id: string) => conversations.getConversationContext(id),
    (id: string) => conversations.getConversationContextInTransaction(transaction as never, id),
    (id: string) => conversations.bindCommunicationLine(id, uuid),
    (id: string) => tickets.findConversationById(id),
    (id: string) => tickets.findConversationContact(id),
    (id: string) => tickets.findActiveTicketByConversation(id),
    (id: string) => tickets.findActiveTicketByConversation(id, transaction as never),
  ];
  return { prisma, transaction, conversations, reads };
}

describe('Conversation UUID validation before Prisma queries', () => {
  it.each([
    'usr_123',
    'user_123',
    'null',
    '521999888777',
    '',
    ` ${uuid}`,
    uuid.replace(/-/g, ''),
    '550e8400-e29b-41d4-a716-44665544000g',
    '550e8400-e29b-41d4-7716-446655440000',
    null,
    undefined,
    123,
  ])('rejects %p without querying either client', async (invalidId) => {
    const { prisma, transaction, reads } = repositories();
    for (const read of reads) {
      await expect(read(invalidId as string)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        issues: [{ path: 'conversationId', message: expect.any(String) }],
      });
    }
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
    expect(transaction.conversation.findUnique).not.toHaveBeenCalled();
    expect(prisma.conversationMeta.updateMany).not.toHaveBeenCalled();
    expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
    expect(transaction.ticket.findFirst).not.toHaveBeenCalled();
  });

  it.each([uuid, uuid.toUpperCase()])(
    'preserves valid UUID %s and not-found behavior',
    async (id) => {
      const { prisma, transaction, conversations } = repositories();
      prisma.conversation.findUnique.mockResolvedValue(null);
      transaction.conversation.findUnique.mockResolvedValue(null);

      await expect(conversations.getConversationContext(id)).resolves.toBeNull();
      await expect(
        conversations.getConversationContextInTransaction(transaction as never, id),
      ).resolves.toBeNull();
      for (const client of [prisma, transaction]) {
        expect(client.conversation.findUnique).toHaveBeenCalledWith({
          where: { id },
          include: {
            meta: true,
            citizen: { select: { id: true, phone: true, name: true, leadStatus: true } },
          },
        });
      }
    },
  );

  it('returns a controlled HTTP 400 through the application error handler', async () => {
    const { prisma, conversations } = repositories();
    const app = express();
    app.get('/conversations/:id', (req, res, next) => {
      void conversations.getConversationContext(req.params.id).then((context) => {
        res.json(context);
      }, next);
    });
    app.use(errorHandler);

    const response = await request(app).get('/conversations/user_123');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
      issues: [{ path: 'conversationId', message: expect.any(String) }],
    });
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
  });
});
