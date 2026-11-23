#!/usr/bin/env node
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Storage } from '@google-cloud/storage';
import { google } from 'googleapis';
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Standalone Node script. No API server/worker imports or startup side effects.
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const rootFolder =
  args.find((arg) => arg.startsWith('--folder='))?.slice(9) || process.env.GOOGLE_DRIVE_FOLDER_ID;
const bucketName = process.env.GCS_MEDIA_BUCKET || 'voz_ciudadana';

async function main() {
  if (args.some((arg) => arg !== '--apply' && !arg.startsWith('--folder=')))
    throw new Error('Uso: node scripts/migrations/drive-media-to-gcs.mjs --folder=ID [--apply]');
  if (!rootFolder || rootFolder.includes('ID_CARPETA_DRIVE'))
    throw new Error('Falta --folder=ID_CARPETA_DRIVE real');
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN } =
    process.env;
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_DRIVE_REFRESH_TOKEN)
    throw new Error(
      'Se requieren las credenciales OAuth existentes de Drive para leer los originales',
    );
  const oauth = new google.auth.OAuth2(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: GOOGLE_DRIVE_REFRESH_TOKEN });
  const drive = google.drive({ version: 'v3', auth: oauth });
  const bucket = new Storage().bucket(bucketName); // GOOGLE_APPLICATION_CREDENTIALS / ADC
  const prisma = new PrismaClient();
  const ancestry = new Map();
  const summary = { inspected: 0, migrated: 0, outsideFolder: 0, failed: 0 };

  async function inFolder(parents, seen = new Set()) {
    for (const parent of parents || []) {
      if (parent === rootFolder) return true;
      if (seen.has(parent)) continue;
      seen.add(parent);
      if (!ancestry.has(parent)) {
        const { data } = await drive.files.get(
          { fileId: parent, fields: 'parents' },
          { timeout: 30_000 },
        );
        ancestry.set(parent, data.parents || []);
      }
      if (await inFolder(ancestry.get(parent), seen)) return true;
    }
    return false;
  }

  try {
    let cursor;
    for (;;) {
      const rows = await prisma.attachment.findMany({
        where: {
          driveFileId: { not: null },
          processingState: { in: ['stored', 'legacy'] },
          NOT: {
            OR: [
              { storageKey: { startsWith: 'gs://' } },
              { storageKey: { startsWith: 'conversations/' } },
            ],
          },
        },
        orderBy: { id: 'asc' },
        take: 100,
        include: { message: { include: { conversation: { include: { meta: true } } } } },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      cursor = rows.at(-1).id;
      for (const row of rows) {
        summary.inspected++;
        try {
          const { data: source } = await drive.files.get(
            {
              fileId: row.driveFileId,
              fields: 'id,name,size,md5Checksum,mimeType,parents,trashed',
            },
            { timeout: 30_000 },
          );
          if (!(await inFolder(source.parents))) {
            summary.outsideFolder++;
            continue;
          }
          if (source.trashed || !source.md5Checksum || !source.size || BigInt(source.size) <= 0n)
            throw new Error('DRIVE_SOURCE_INVALID');
          if (!apply) {
            console.log(
              JSON.stringify({ attachmentId: row.id, action: 'would-migrate', bytes: source.size }),
            );
            continue;
          }
          const lineId =
            row.communicationLineId ?? row.message?.conversation.meta?.communicationLineId;
          const conversationId = row.message?.conversationId;
          if (!lineId || !conversationId) throw new Error('MEDIA_REFERENCE_MISSING');
          const filename =
            (row.originalFilename || source.name || 'archivo')
              .replace(/[\\/"<>:|?*\x00-\x1f\x7f]/g, '_')
              .replace(/^\.+/, '')
              .slice(0, 180) || 'archivo';
          const file = bucket.file(
            `conversations/${lineId}/${conversationId}/${row.id}-${filename}`,
          );
          let existing;
          try {
            [existing] = await file.getMetadata();
          } catch (error) {
            if (Number(error.code) !== 404) throw error;
          }
          if (
            existing &&
            (existing.metadata?.sourceDriveFileId !== row.driveFileId ||
              existing.metadata?.attachmentId !== row.id ||
              existing.md5Hash !== Buffer.from(source.md5Checksum, 'hex').toString('base64') ||
              BigInt(existing.size) !== BigInt(source.size))
          )
            throw new Error('GCS_DESTINATION_CONFLICT');
          // An upload completed but its final metadata write failed: replace only that
          // exact generation, leaving unrelated objects untouched.
          if (existing && existing.metadata?.validated !== 'true') {
            await file.delete({ ifGenerationMatch: existing.generation });
            existing = undefined;
          }
          if (!existing) {
            const response = await drive.files.get(
              { fileId: row.driveFileId, alt: 'media' },
              { responseType: 'stream', timeout: 30_000 },
            );
            const md5 = createHash('md5');
            const sha = createHash('sha256');
            let bytes = 0n;
            const meter = new Transform({
              transform(chunk, _encoding, callback) {
                bytes += BigInt(chunk.length);
                if (bytes > BigInt(source.size)) {
                  callback(new Error('DRIVE_SIZE_MISMATCH'));
                  return;
                }
                md5.update(chunk);
                sha.update(chunk);
                callback(null, chunk);
              },
              flush(callback) {
                if (bytes !== BigInt(source.size) || md5.digest('hex') !== source.md5Checksum)
                  callback(new Error('DRIVE_CHECKSUM_MISMATCH'));
                else callback();
              },
            });
            await pipeline(
              response.data,
              meter,
              file.createWriteStream({
                resumable: false,
                validation: 'crc32c',
                preconditionOpts: { ifGenerationMatch: 0 },
                metadata: {
                  contentType: source.mimeType || row.mimeType,
                  cacheControl: 'private, no-store',
                  metadata: { attachmentId: row.id, sourceDriveFileId: row.driveFileId },
                },
              }),
              { signal: AbortSignal.timeout(240_000) },
            );
            const [uploaded] = await file.getMetadata();
            if (
              uploaded.md5Hash !== Buffer.from(source.md5Checksum, 'hex').toString('base64') ||
              BigInt(uploaded.size) !== BigInt(source.size)
            )
              throw new Error('GCS_CHECKSUM_MISMATCH');
            await file.setMetadata(
              {
                metadata: {
                  attachmentId: row.id,
                  sourceDriveFileId: row.driveFileId,
                  validated: 'true',
                  sha256: sha.digest('hex'),
                  md5: source.md5Checksum,
                },
              },
              { ifGenerationMatch: uploaded.generation },
            );
            [existing] = await file.getMetadata();
          }
          if (!existing.metadata?.sha256) throw new Error('GCS_CHECKSUM_MISSING');
          const updated = await prisma.attachment.updateMany({
            where: {
              id: row.id,
              driveFileId: row.driveFileId,
              storageKey: row.storageKey,
              processingState: row.processingState,
            },
            data: {
              storageKey: file.name,
              driveFileId: null,
              driveFolderId: null,
              cdnUrl: file.name,
              mimeType: source.mimeType || row.mimeType,
              fileSizeBytes: BigInt(source.size),
              checksumMd5: source.md5Checksum,
              checksumSha256: String(existing.metadata.sha256),
              processingState: 'stored',
              storedAt: row.storedAt || new Date(),
              lockedAt: null,
              lastErrorCode: null,
            },
          });
          if (!updated.count) throw new Error('ATTACHMENT_CHANGED_CONCURRENTLY');
          summary.migrated++;
          console.log(JSON.stringify({ attachmentId: row.id, action: 'migrated' }));
        } catch (error) {
          summary.failed++;
          // Avoid logging Google error objects (they may contain tokens/request URLs).
          console.error(
            JSON.stringify({
              attachmentId: row.id,
              error: /^[A-Z_]+$/.test(error.message || '') ? error.message : 'MIGRATION_FAILED',
              status: typeof error.code === 'number' ? error.code : undefined,
            }),
          );
        }
      }
    }
  } finally {
    await prisma.$disconnect();
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...summary }));
  }
  if (summary.failed) process.exitCode = 1;
}

main().catch(() => {
  console.error(
    'No se pudo iniciar la migración. Verifica argumentos, DATABASE_URL, OAuth de Drive y ADC de GCS.',
  );
  process.exitCode = 1;
});
