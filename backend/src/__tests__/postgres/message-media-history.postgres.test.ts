import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { MessageRepository } from '../../repositories/message.repository';
import { MessageMediaService } from '../../services/media/message-media.service';
import { PrismaService } from '../../services/prisma.service';
import { templateSnapshot } from '../../services/whatsapp/template-snapshot';

const prisma = new PrismaService();
const conversations: string[] = [];
const citizens: string[] = [];
const lines: string[] = [];
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
  'base64',
);
jest.setTimeout(30000);
async function conversation() {
  const citizen = await prisma.citizen.create({
    data: { phone: `audit-${randomUUID().slice(0, 20)}` },
  });
  citizens.push(citizen.id);
  const row = await prisma.conversation.create({ data: { citizenId: citizen.id } });
  conversations.push(row.id);
  return row.id;
}
afterAll(async () => {
  await prisma.attachment.deleteMany({
    where: { message: { conversationId: { in: conversations } } },
  });
  await prisma.conversation.deleteMany({ where: { id: { in: conversations } } });
  await prisma.communicationLine.deleteMany({ where: { id: { in: lines } } });
  await prisma.citizen.deleteMany({ where: { id: { in: citizens } } });
  await prisma.disconnect();
});
it('atomically deduplicates inbound messages and their attachments under concurrent PostgreSQL writes', async () => {
  const conversationId = await conversation();
  const externalMessageId = 'wamid.audit.' + randomUUID();
  const repo = new MessageRepository(prisma);
  const input = {
    conversationId,
    externalMessageId,
    body: '🧑🏽‍💻\nCaption',
    direction: 'inbound' as const,
    messageType: 'image' as const,
    meta: { media: { id: 'audit-media', phoneNumberId: 'audit-phone', mime_type: 'image/png' } },
  };
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => repo.create(input)));
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const messages = await prisma.message.findMany({
    where: { conversationId },
    include: { attachmentsViaMessageId: true },
  });
  expect(messages).toHaveLength(1);
  expect(messages[0].body).toBe(input.body);
  expect(messages[0].attachmentsViaMessageId).toHaveLength(1);
  expect(messages[0].attachmentsViaMessageId[0].processingState).toBe('pending');
});
it('persists a historical template snapshot as JSON without mutating its parameters', async () => {
  const conversationId = await conversation();
  const instance = {
    name: 'audit_notice',
    language: { code: 'es_MX' },
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Uno' },
          { type: 'text', text: 'Dos' },
        ],
      },
    ],
  };
  const definition = {
    id: '123',
    name: 'audit_notice',
    language: 'es_MX',
    category: 'UTILITY',
    status: 'APPROVED',
    components: [{ type: 'BODY', text: '{{1}}\n{{2}}' }],
  };
  const snapshot = templateSnapshot(instance, definition);
  const message = await new MessageRepository(prisma).create({
    conversationId,
    body: 'Uno\nDos',
    direction: 'outbound',
    messageType: 'template',
    meta: { templateSnapshot: snapshot },
  });
  definition.components[0].text = 'Changed';
  instance.components[0].parameters.reverse();
  const stored = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
  expect(stored.meta).toEqual({ templateSnapshot: snapshot });
  expect(snapshot.resolved[0].text).toBe('Uno\nDos');
});
it('claims a pending media job once across two real PostgreSQL workers and persists a GCS path after upload', async () => {
  const conversationId = await conversation();
  const line = await prisma.communicationLine.create({
    data: { displayName: 'Media audit', channel: 'whatsapp', externalIdentifier: randomUUID() },
  });
  lines.push(line.id);
  await prisma.conversationMeta.create({
    data: { conversationId, communicationLineId: line.id },
  });
  const message = await new MessageRepository(prisma).create({
    conversationId,
    body: '',
    direction: 'inbound',
    messageType: 'image',
    externalMessageId: 'wamid.' + randomUUID(),
    meta: { media: { id: 'audit-image', phoneNumberId: 'audit-phone', mime_type: 'image/png' } },
  });
  const provider: any = { downloadMediaStream: jest.fn(async () => Readable.from([png])) };
  const storage: any = {
    key: (_lineId: string, _conversationId: string, attachmentId: string) =>
      `gs://voz_ciudadana/messages/${attachmentId}`,
    recover: jest.fn(async () => null),
    put: jest.fn(async ({ key, stream }: any) => {
      const reference = await prisma.attachment.findFirstOrThrow({
        where: { messageId: message.id },
      });
      expect(reference.processingState).toBe('processing');
      for await (const _chunk of stream) {
        /* consume the fixture stream */
      }
      return { storageKey: key, fileSizeBytes: BigInt(png.length), mimeType: 'image/png' };
    }),
  };
  // The reconciler can also see earlier fixture attachments; isolate this job by scheduling those later.
  await prisma.attachment.updateMany({
    where: {
      message: { conversationId: { in: conversations.filter((id) => id !== conversationId) } },
    },
    data: { nextAttemptAt: new Date(Date.now() + 86400000) },
  });
  await Promise.all([
    new MessageMediaService(prisma, provider, undefined, storage).reconcile(),
    new MessageMediaService(prisma, provider, undefined, storage).reconcile(),
  ]);
  const stored = await prisma.attachment.findFirstOrThrow({ where: { messageId: message.id } });
  expect(stored.processingState).toBe('stored');
  expect(stored.storageKey).toBe(`gs://voz_ciudadana/messages/${stored.id}`);
  expect(stored.fileSizeBytes).toBe(BigInt(png.length));
  expect(provider.downloadMediaStream).toHaveBeenCalledTimes(1);
  expect(storage.put).toHaveBeenCalledTimes(1);
});
