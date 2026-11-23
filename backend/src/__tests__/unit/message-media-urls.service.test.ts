import type { MessageWithStatuses } from '../../repositories/message.repository';
import { serializeMessageForJson } from '../../repositories/message.repository';
import { withSignedMediaUrls } from '../../services/media/message-media-urls.service';
import { GcsMediaStorage } from '../../services/media/gcs-media-storage';
import { MessageService } from '../../services/message.service';
import { TicketsController } from '../../controllers/tickets.controller';
import type { NextFunction, Request, Response } from 'express';

function message(
  id: string,
  state = 'stored',
  key = `conversations/line/conv/${id}`,
): MessageWithStatuses {
  return {
    id,
    body: 'Caption',
    meta: {},
    statuses: [],
    attachmentsViaMessageId: [
      {
        id: `att-${id}`,
        storageKey: key,
        processingState: state,
        mimeType: 'image/png',
        originalFilename: 'photo.png',
        fileSizeBytes: BigInt(512),
      },
    ],
  } as unknown as MessageWithStatuses;
}

afterEach(() => jest.restoreAllMocks());

it('starts every signature across messages and attachments before awaiting any of them', async () => {
  const completions: (() => void)[] = [];
  const getSignedUrl = jest.fn(
    () =>
      new Promise<{ url: string; expiresAt: string }>((resolve) => {
        const index = completions.length;
        completions.push(() =>
          resolve({
            url: `https://storage.googleapis.com/${index}`,
            expiresAt: '2026-10-23T12:15:00Z',
          }),
        );
      }),
  );
  const first = message('first');
  first.attachmentsViaMessageId.push(message('extra').attachmentsViaMessageId[0]);
  const pending = withSignedMediaUrls([first, message('second')], { getSignedUrl });
  expect(getSignedUrl).toHaveBeenCalledTimes(6);
  completions.reverse().forEach((complete) => complete());
  const result = await pending;
  expect(result.map((item) => item.id)).toEqual(['first', 'second']);
  expect(result[0].mediaUrl).toBe('https://storage.googleapis.com/0');
  expect(result[0].attachmentsViaMessageId[1].mediaUrl).toBe('https://storage.googleapis.com/2');
  expect(result[1].mediaDownloadUrl).toBe('https://storage.googleapis.com/5');
  expect(first).not.toHaveProperty('mediaUrl');
  const json = serializeMessageForJson(result[0]);
  expect(json.attachmentsViaMessageId[0]).toMatchObject({
    fileSizeBytes: '512',
    storageKey: '',
    cdnUrl: null,
    mediaUrl: result[0].mediaUrl,
  });
  expect(() => JSON.stringify(json)).not.toThrow();
});

it('does not sign text, pending, failed or historical Drive media', async () => {
  const getSignedUrl = jest.fn();
  const text = { ...message('text'), attachmentsViaMessageId: [] };
  const result = await withSignedMediaUrls(
    [
      text,
      message('pending', 'pending'),
      message('processing', 'processing'),
      message('failed', 'failed'),
      message('legacy', 'stored', '12345'),
    ],
    { getSignedUrl },
  );
  expect(getSignedUrl).not.toHaveBeenCalled();
  expect(result.every((item) => item.mediaUrl === undefined)).toBe(true);
});

it('isolates signing failures and never exposes credential errors in the history', async () => {
  const consoleLog = jest.spyOn(console, 'log').mockImplementation();
  const getSignedUrl = jest.fn(async (key: string) => {
    if (key.endsWith('/bad')) throw new Error('private credential detail');
    return { url: 'https://storage.googleapis.com/good', expiresAt: '2026-10-23T12:15:00Z' };
  });
  const result = await withSignedMediaUrls([message('bad'), message('good')], { getSignedUrl });
  expect(result[0]).toMatchObject({ body: 'Caption', mediaError: 'MEDIA_URL_UNAVAILABLE' });
  expect(result[0].mediaUrl).toBeNull();
  expect(result[1].mediaUrl).toBe('https://storage.googleapis.com/good');
  expect(JSON.stringify(result.map(serializeMessageForJson))).not.toContain('private credential');
  expect(consoleLog).not.toHaveBeenCalled();
});

it('adds signed media to conversation history without changing pagination', async () => {
  jest.spyOn(GcsMediaStorage.prototype, 'getSignedUrl').mockResolvedValue({
    url: 'https://storage.googleapis.com/image',
    expiresAt: '2026-10-23T12:15:00Z',
  });
  const repo = {
    findConversationWithCitizenPhone: jest.fn().mockResolvedValue({ id: 'conversation' }),
    listByConversation: jest
      .fn()
      .mockResolvedValue({ items: [message('first')], hasNextPage: true }),
  };
  const service = new MessageService(repo as never, {} as never);
  const result = await service.listByConversation({ conversationId: 'conversation', limit: 20 });
  expect(result.meta).toEqual({ nextCursor: 'first', hasNextPage: true });
  expect(result.items[0].mediaUrl).toBe('https://storage.googleapis.com/image');
});

it('adds signed media to ticket history and prevents caching temporary credentials', async () => {
  jest.spyOn(GcsMediaStorage.prototype, 'getSignedUrl').mockResolvedValue({
    url: 'https://storage.googleapis.com/image',
    expiresAt: '2026-10-23T12:15:00Z',
  });
  const repo = {
    listByTicket: jest.fn().mockResolvedValue({ items: [message('first')], hasNextPage: false }),
  };
  const controller = new TicketsController({} as never, repo as never);
  const json = jest.fn();
  const setHeader = jest.fn();
  const next = jest.fn();
  await controller.getTicketMessages(
    {
      params: { ticketId: '550e8400-e29b-41d4-a716-446655440001' },
      pagination: { limit: 20 },
    } as unknown as Request,
    { json, setHeader } as unknown as Response,
    next as NextFunction,
  );
  expect(next).not.toHaveBeenCalled();
  expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  expect(json).toHaveBeenCalledWith(
    expect.objectContaining({
      items: [expect.objectContaining({ mediaUrl: 'https://storage.googleapis.com/image' })],
    }),
  );
});
