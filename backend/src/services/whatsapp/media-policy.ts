import { createHash } from 'crypto';
import { detectFileType } from '../../utils/detect-file-type';
import { AppError } from '../../utils/app-error';

export const MEDIA_POLICY = {
  maxBytes: 25 * 1024 * 1024, // Product memory cap, stricter than Meta's document limit.
  timeoutMs: 30_000,
  maxAttempts: 5,
  leaseMs: 5 * 60_000,
  pollMs: 5000,
} as const;
export const mediaSizeCaps: Record<string, number> = {
  image: 5 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  sticker: 500 * 1024,
  document: MEDIA_POLICY.maxBytes,
};
const mimes: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png'],
  sticker: ['image/webp'],
  audio: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
  video: ['video/mp4', 'video/3gpp'],
  document: [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
};
export function safeFilename(name: string): string {
  const printable = Array.from(name)
    .map((char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? '_' : char))
    .join('');
  return (
    printable
      .replace(/[/\\"<>:|?*]/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 180) || 'archivo'
  );
}
export async function validateMedia(
  buffer: Buffer,
  declared: string,
  kind: string,
): Promise<{ mimeType: string; extension: string; checksumSha256: string }> {
  if (!buffer.length || buffer.length > (mediaSizeCaps[kind] ?? 0))
    throw AppError.badRequest('Tamaño de archivo no permitido');
  const detected = await detectFileType(buffer);
  let mime: string | undefined = detected?.mime.split(';')[0].trim();
  // Plain UTF-8 text has no magic number; never serve it inline.
  if (!mime && declared === 'text/plain' && !buffer.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      mime = 'text/plain';
    } catch {
      /* invalid UTF-8 */
    }
  }
  const claim = declared.toLowerCase().split(';')[0].trim();
  // file-type identifies ISO BMFF audio as audio/x-m4a.
  if (mime === 'audio/x-m4a') mime = 'audio/mp4';
  if (mime === 'audio/opus') mime = 'audio/ogg';
  if (
    !mime ||
    !mimes[kind]?.includes(mime) ||
    (claim !== mime && claim !== 'application/octet-stream')
  )
    throw AppError.badRequest('Formato real del archivo no permitido o MIME incorrecto');
  if (mime === 'audio/ogg' && !buffer.subarray(0, 4096).includes(Buffer.from('OpusHead')))
    throw AppError.badRequest('El audio OGG debe utilizar Opus');
  if (
    kind === 'sticker' &&
    buffer.length > (buffer.includes(Buffer.from('ANIM')) ? 500 : 100) * 1024
  )
    throw AppError.badRequest('Sticker demasiado grande');
  return {
    mimeType: mime,
    extension: detected?.ext ?? 'txt',
    checksumSha256: createHash('sha256').update(buffer).digest('hex'),
  };
}
export function assertProviderMediaUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !['lookaside.fbsbx.com', 'lookaside.whatsapp.net'].includes(url.hostname)
  )
    throw new Error('MEDIA_DESTINATION_REJECTED');
  return url;
}
export async function boundedMediaBody(
  response: Response,
  limit = MEDIA_POLICY.maxBytes,
): Promise<Buffer> {
  if (!response.ok) throw new Error(`MEDIA_HTTP_${response.status}`);
  const size = Number(response.headers.get('content-length'));
  if (size > limit) {
    await response.body?.cancel();
    throw new Error('MEDIA_SIZE_EXCEEDED');
  }
  if (!response.body) throw new Error('MEDIA_EMPTY');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) throw new Error('MEDIA_SIZE_EXCEEDED');
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
  }
}
