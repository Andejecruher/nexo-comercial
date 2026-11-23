import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { NotificationsController } from '../../../controllers/notifications.controller';
import type { PrismaService } from '../../../services/prisma.service';

const upper = new Date('2026-10-13T10:05:00.000Z');
const at = '2026-10-13T10:00:00.000Z';
const id = '550e8400-e29b-41d4-a716-446655440000';
const cursor = Buffer.from(JSON.stringify({ at, id })).toString('base64url');

function harness(rows: unknown[] = []) {
  const findMany = jest.fn().mockResolvedValue(rows as never);
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ now: upper }] as never),
    notification: { findMany },
  } as unknown as PrismaService;
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnThis(), json } as unknown as Response;
  const next = jest.fn();
  return { controller: new NotificationsController(prisma), findMany, res, json, next };
}

describe('notification replay checkpoints', () => {
  it('uses the DB clock and a commit overlap for the first catch-up page', async () => {
    const h = harness();
    await h.controller.list(
      { query: { replay: '1', cursor, limit: '2' } } as unknown as Request,
      h.res,
      h.next,
    );
    expect(h.next).not.toHaveBeenCalled();
    expect(h.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { createdAt: { lte: upper } },
          { createdAt: { gte: new Date('2026-10-13T09:59:00.000Z') } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 3,
    });
    expect(h.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ until: upper.toISOString() }) }),
    );
  });

  it('uses an exact timestamp/id keyset after the first page', async () => {
    const h = harness();
    await h.controller.list(
      { query: { replay: '1', after: cursor, until: upper.toISOString() } } as unknown as Request,
      h.res,
      h.next,
    );
    expect(h.next).not.toHaveBeenCalled();
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { createdAt: { lte: upper } },
            {
              OR: [
                { createdAt: { gt: new Date(at) } },
                { createdAt: new Date(at), id: { gt: id } },
              ],
            },
          ],
        },
      }),
    );
  });

  it('rejects a malformed cursor as a validation error', async () => {
    const h = harness();
    await h.controller.list(
      { query: { replay: '1', cursor: 'invalid-json' } } as unknown as Request,
      h.res,
      h.next,
    );
    expect(h.next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
    expect(h.findMany).not.toHaveBeenCalled();
  });
});
