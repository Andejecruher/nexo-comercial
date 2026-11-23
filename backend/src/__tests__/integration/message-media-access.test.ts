import { GcsMediaStorage } from '../../services/media/gcs-media-storage';
import express from 'express';
import request from 'supertest';
import { Readable } from 'stream';
import { createConversationsRouter } from '../../routes/conversations.routes';
import { createMessagesRouter } from '../../routes/messages.routes';
import { GoogleDriveFileStorageProvider } from '../../services/ine/google-drive-file-storage.provider';

jest.mock('../../middlewares/jwt.middleware', () => ({
  jwtMiddleware: (req: any, res: any, next: any) =>
    req.headers['x-test-user'] ? next() : res.status(401).json({ error: 'Unauthorized' }),
}));
jest.mock('../../middlewares/permission.middleware', () => ({
  requirePermissions: () => (req: any, res: any, next: any) =>
    req.headers['x-test-permission'] ? next() : res.status(403).json({ error: 'Forbidden' }),
  requireAnyPermission: () => (req: any, res: any, next: any) =>
    req.headers['x-test-permission'] ? next() : res.status(403).json({ error: 'Forbidden' }),
}));
jest.mock('../../services/ine/google-drive-file-storage.provider', () => ({
  GoogleDriveFileStorageProvider: jest.fn(),
}));
const conversationId = '550e8400-e29b-41d4-a716-446655440001';
const attachmentId = '550e8400-e29b-41d4-a716-446655440002';
function setup() {
  const download = jest
    .fn()
    .mockImplementation(async () => ({ stream: Readable.from([Buffer.from('private fixture')]) }));
  (GoogleDriveFileStorageProvider as jest.Mock).mockImplementation(() => ({ getStream: download }));
  const prisma: any = {
    attachment: {
      findFirst: jest.fn().mockResolvedValue({
        id: attachmentId,
        processingState: 'stored',
        driveFileId: 'drive-id',
        storageKey: 'legacy-meta-id',
        mimeType: 'application/pdf',
        originalFilename: '../../safe\r\n.pdf',
      }),
    },
  };
  const controller: any = new Proxy(
    {},
    { get: () => (_req: any, res: any) => res.status(204).end() },
  );
  const app = express();
  app.use('/conversations', createConversationsRouter(controller, prisma));
  app.use('/messages', createMessagesRouter(controller, prisma));
  return { app, prisma, download };
}
it('requires authentication and permissions before looking up or downloading a private file', async () => {
  const { app, prisma, download } = setup();
  await request(app)
    .get(`/conversations/${conversationId}/attachments/${attachmentId}/content`)
    .expect(401);
  await request(app)
    .get(`/conversations/${conversationId}/attachments/${attachmentId}/content`)
    .set('x-test-user', 'fixture')
    .expect(403);
  expect(prisma.attachment.findFirst).not.toHaveBeenCalled();
  expect(download).not.toHaveBeenCalled();
});

it('removes the obsolete message media proxy', async () => {
  const { app, download } = setup();
  await request(app)
    .get(`/messages/${attachmentId}/media`)
    .set('x-test-user', 'fixture')
    .expect(404);
  expect(download).not.toHaveBeenCalled();
});

it('redirects GCS content requests to storage without streaming through the backend', async () => {
  const { app, prisma, download } = setup();
  prisma.attachment.findFirst.mockResolvedValue({
    processingState: 'stored',
    storageKey: 'gs://voz_ciudadana/messages/att',
    mimeType: 'image/png',
  });
  const sign = jest
    .spyOn(GcsMediaStorage.prototype, 'getSignedUrl')
    .mockResolvedValue({
      url: 'https://storage.googleapis.com/signed',
      expiresAt: '2026-10-23T12:15:00Z',
    });
  try {
    const response = await request(app)
      .get(`/conversations/${conversationId}/attachments/${attachmentId}/content`)
      .set('x-test-user', 'fixture')
      .set('x-test-permission', 'view')
      .expect(307);
    expect(response.headers.location).toBe('https://storage.googleapis.com/signed');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(download).not.toHaveBeenCalled();
  } finally {
    sign.mockRestore();
  }
});
it('binds file access to the requested conversation and does not reveal a file from another conversation', async () => {
  const { app, prisma, download } = setup();
  prisma.attachment.findFirst.mockResolvedValue(null);
  await request(app)
    .get(`/conversations/${conversationId}/attachments/${attachmentId}/content`)
    .set('x-test-user', 'fixture')
    .set('x-test-permission', 'view')
    .expect(404);
  expect(prisma.attachment.findFirst).toHaveBeenCalledWith({
    where: { id: attachmentId, message: { conversationId } },
  });
  expect(download).not.toHaveBeenCalled();
});
it('streams private documents as downloads with no-store and nosniff headers', async () => {
  const { app, download } = setup();
  const response = await request(app)
    .get(`/conversations/${conversationId}/attachments/${attachmentId}/content`)
    .set('x-test-user', 'fixture')
    .set('x-test-permission', 'view')
    .expect(200);
  expect(response.headers['content-disposition']).toMatch(/^attachment;/);
  expect(response.headers['content-disposition']).not.toMatch(/[\r\n]/);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(download).toHaveBeenCalledWith('drive-id');
});
it('does not serve an attachment while storage is still pending', async () => {
  const { app, prisma, download } = setup();
  prisma.attachment.findFirst.mockResolvedValue({
    processingState: 'pending',
    driveFileId: 'reserved-id',
  });
  await request(app)
    .get(`/conversations/${conversationId}/attachments/${attachmentId}/content`)
    .set('x-test-user', 'fixture')
    .set('x-test-permission', 'view')
    .expect(404);
  expect(download).not.toHaveBeenCalled();
});

it('issues signed URLs only for stored GCS objects bound to the authorized conversation', async () => {
  const { app, prisma } = setup();
  prisma.attachment.findFirst.mockResolvedValue({
    processingState: 'stored',
    storageKey: 'gs://voz_ciudadana/messages/att',
    mimeType: 'image/png',
    originalFilename: 'photo.png',
  });
  const sign = jest.spyOn(GcsMediaStorage.prototype, 'getSignedUrl').mockResolvedValue({
    url: 'https://storage.googleapis.com/signed',
    expiresAt: '2026-10-23T12:15:00Z',
  });
  const path = `/conversations/${conversationId}/attachments/${attachmentId}/signed-url`;
  await request(app).get(path).expect(401);
  await request(app).get(path).set('x-test-user', 'fixture').expect(403);
  expect(sign).not.toHaveBeenCalled();
  const response = await request(app)
    .get(path)
    .set('x-test-user', 'fixture')
    .set('x-test-permission', 'view')
    .expect(200);
  expect(response.body.url).toBe('https://storage.googleapis.com/signed');
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(prisma.attachment.findFirst).toHaveBeenCalledWith({
    where: { id: attachmentId, message: { conversationId } },
  });
  sign.mockClear();
  prisma.attachment.findFirst.mockResolvedValue(null);
  await request(app)
    .get(path)
    .set('x-test-user', 'fixture')
    .set('x-test-permission', 'view')
    .expect(404);
  expect(sign).not.toHaveBeenCalled();
  sign.mockRestore();
});
