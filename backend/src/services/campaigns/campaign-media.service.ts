import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import type { CampaignAttachment } from '@prisma/client';
import type { PrismaService } from '../prisma.service';
import { GCSFileStorageProvider } from '../ine/gcs-file-storage.provider';
import { safeFilename } from '../whatsapp/media-policy';
import { TemplateManagementService } from '../templates/template-management.service';
import { templateVariables, campaignMediaType } from './campaign-contract';
import type { MultipartFilePart } from '../../utils/multipart';
import { AppError } from '../../utils/app-error';

const DEFAULT_PUBLIC_BUCKET = 'voz_ciudadana_public';

function publicBucketName(): string {
  return process.env.GCS_PUBLIC_BUCKET?.trim() || DEFAULT_PUBLIC_BUCKET;
}

function publicObjectUrl(bucket: string, objectPath: string): string {
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  return `https://storage.googleapis.com/${bucket}/${encodedPath}`;
}

export function validateCampaignMedia(file: MultipartFilePart, kind: string): void {
  const b = file.buffer;
  const signatures: Record<string, boolean> = {
    'image/jpeg': b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    'image/png': b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'application/pdf': b.subarray(0, 5).toString() === '%PDF-',
    'video/mp4': b.length >= 12 && b.subarray(4, 8).toString() === 'ftyp',
  };
  const allowed: Record<string, string[]> = {
    IMAGE: ['image/jpeg', 'image/png'],
    VIDEO: ['video/mp4'],
    DOCUMENT: ['application/pdf'],
  };
  const max = (kind === 'IMAGE' ? 5 : 16) * 1024 * 1024;
  if (!allowed[kind]?.includes(file.mimeType) || !signatures[file.mimeType])
    throw AppError.badRequest('Archivo incompatible: usa JPEG/PNG, MP4 o PDF según el encabezado');
  if (!b.length || b.length > max)
    throw AppError.badRequest(`El archivo supera ${max / 1024 / 1024} MB`);
}

export class CampaignMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage = new GCSFileStorageProvider(undefined, publicBucketName()),
    private readonly publicBucket = publicBucketName(),
  ) {}

  async upload(
    input: { name: string; lineId: string; templateId: string },
    userId: string,
    file: MultipartFilePart,
  ): Promise<Pick<CampaignAttachment, 'id' | 'filename' | 'mediaType' | 'url' | 'viewUrl'>> {
    const template = await new TemplateManagementService(this.prisma).assertOwnership(
      input.lineId,
      input.templateId,
    );
    templateVariables(template);
    const kind = campaignMediaType(template);
    if (!kind) throw AppError.badRequest('La plantilla no requiere un adjunto');
    validateCampaignMedia(file, kind);
    const id = randomUUID();
    let fileId: string | undefined;
    try {
      const folderId = `campanas/${safeFilename(input.name.trim())}`;
      const filename = safeFilename(file.filename);
      const objectPath = `${folderId}/${id}-${filename}`;
      const stored = await this.storage.uploadStream({
        path: objectPath,
        mimeType: file.mimeType,
        readable: Readable.from([file.buffer]),
      });
      fileId = stored.objectId;
      // This bucket has uniform bucket-level access and is public by policy.
      // Never mutate object ACLs here; uniform bucket-level access rejects them.
      const url = publicObjectUrl(this.publicBucket, objectPath);
      const viewUrl = url;
      return await this.prisma.campaignAttachment.create({
        data: {
          id,
          createdBy: userId,
          lineId: input.lineId,
          templateId: input.templateId,
          fileId,
          folderId,
          filename,
          mimeType: file.mimeType,
          mediaType: kind,
          url,
          viewUrl,
        },
        select: { id: true, filename: true, mediaType: true, url: true, viewUrl: true },
      });
    } catch {
      // Do not leave an untracked public file if sharing or persistence fails.
      if (fileId)
        await this.storage.delete(fileId).catch(() => {
          console.error('[Campaign] No se pudo limpiar el adjunto', { attachmentId: id });
        });
      throw new AppError(
        'No se pudo cargar el adjunto de campaña en GCS. Verifica la configuración del bucket público.',
        502,
        'CAMPAIGN_GCS_UPLOAD_FAILED',
      );
    }
  }
}
