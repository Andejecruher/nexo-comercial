import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { BulkActionsController } from '../../controllers/bulk-actions.controller';
import { BulkActionQueue } from '../../services/bulk/bulk-action-queue.service';
import { BulkActionWorker } from '../../services/bulk/bulk-action-worker.service';
import { BulkActionSchema } from '../../services/bulk/bulk-action.schema';
import type { ConversationsService } from '../../services/conversations.service';
import type { MessageService } from '../../services/message.service';
import type { PrismaService } from '../../services/prisma.service';
import type { TicketService } from '../../services/tickets/ticket.service';

const id = '11111111-1111-4111-8111-111111111111';
const requestKey = '22222222-2222-4222-8222-222222222222';
function setup() {
  const transfer = jest.fn<ConversationsService['transfer']>();
  const sendMessage = jest.fn<MessageService['sendMessage']>();
  const getActiveTicketByConversation = jest.fn<TicketService['getActiveTicketByConversation']>();
  const closeTicket = jest.fn<TicketService['closeTicket']>();
  const worker = new BulkActionWorker(
    {} as PrismaService,
    { transfer },
    { sendMessage },
    { getActiveTicketByConversation, closeTicket },
  );
  return { worker, transfer, sendMessage, getActiveTicketByConversation, closeTicket };
}

describe('bulk action validation and existing domain services', () => {
  it('deduplicates ids and rejects oversized, empty and invalid payloads', () => {
    expect(
      BulkActionSchema.parse({ action: 'activate_bot', conversation_ids: [id, id] })
        .conversation_ids,
    ).toEqual([id]);
    for (const conversation_ids of [[], ['invalid'], Array(501).fill(id)]) {
      expect(BulkActionSchema.safeParse({ action: 'activate_bot', conversation_ids }).success).toBe(
        false,
      );
    }
    for (const message of ['', '   ', 'x'.repeat(1001)]) {
      expect(
        BulkActionSchema.safeParse({ action: 'send_message', conversation_ids: [id], message })
          .success,
      ).toBe(false);
    }
    expect(
      BulkActionSchema.safeParse({ action: 'deactivate_bot', conversation_ids: [id] }).success,
    ).toBe(false);
  });
  it('delegates both bot destinations to the existing transfer service', async () => {
    const { worker, transfer } = setup();
    await worker.execute({ action: 'activate_bot', conversation_ids: [id] }, id, 'actor', 'item');
    expect(transfer).toHaveBeenCalledWith(id, { type: 'ai' }, { performedBy: 'actor' });
    for (const target of [
      { type: 'agent' as const, toUserId: id },
      { type: 'department' as const, departmentSlug: 'salud' },
    ]) {
      await worker.execute(
        { action: 'deactivate_bot', conversation_ids: [id], target },
        id,
        'actor',
        'item',
      );
      expect(transfer).toHaveBeenLastCalledWith(id, target, { performedBy: 'actor' });
    }
  });
  it('closes only the current ticket through TicketService', async () => {
    const { worker, getActiveTicketByConversation, closeTicket } = setup();
    getActiveTicketByConversation
      .mockResolvedValueOnce({ id: 'ticket' } as never)
      .mockResolvedValueOnce(undefined);
    await worker.execute({ action: 'close_tickets', conversation_ids: [id] }, id, 'actor', 'item');
    await worker.execute({ action: 'close_tickets', conversation_ids: [id] }, id, 'actor', 'item');
    expect(closeTicket).toHaveBeenCalledTimes(1);
    expect(closeTicket).toHaveBeenCalledWith('ticket', { reason: 'user_request' });
  });
  it('rechecks inactive conversations and supplies a stable message idempotency key', async () => {
    const { worker, getActiveTicketByConversation, sendMessage } = setup();
    const payload = { action: 'send_message' as const, conversation_ids: [id], message: 'Hola' };
    getActiveTicketByConversation
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'ticket' } as never);
    await expect(worker.execute(payload, id, 'actor', 'item')).rejects.toThrow('inactiva');
    expect(sendMessage).not.toHaveBeenCalled();
    await worker.execute(payload, id, 'actor', 'item');
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: id,
        senderId: 'actor',
        body: 'Hola',
        idempotencyKey: 'bulk-item',
      }),
    );
  });
  it('rejects reuse of a request key with another payload', async () => {
    const upsert = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ id, payloadHash: 'different' });
    const queue = new BulkActionQueue({
      conversationBulkJob: { upsert },
    } as unknown as PrismaService);
    await expect(
      queue.enqueue(id, requestKey, { action: 'activate_bot', conversation_ids: [id] }),
    ).rejects.toThrow('otra acción');
  });
  it('returns 202 only after durable enqueue and rejects invalid data before enqueue', async () => {
    const enqueue = jest
      .fn<BulkActionQueue['enqueue']>()
      .mockResolvedValue({ job_id: id, total: 1 });
    const controller = new BulkActionsController({ enqueue } as unknown as BulkActionQueue);
    const req = {
      user: { id },
      body: { action: 'activate_bot', conversation_ids: [id] },
      get: () => requestKey,
    } as unknown as Request;
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status, json } as unknown as Response;
    const next = jest.fn();
    await controller.enqueue(req, res, next);
    expect(status).toHaveBeenCalledWith(202);
    expect(enqueue).toHaveBeenCalledTimes(1);
    req.body = { action: 'unknown', conversation_ids: [id] };
    await controller.enqueue(req, res, next);
    expect(status).toHaveBeenLastCalledWith(400);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});
