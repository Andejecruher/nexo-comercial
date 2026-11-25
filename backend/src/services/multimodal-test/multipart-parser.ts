/**
 * multipart-parser.ts — Minimal multipart/form-data file extraction.
 *
 * Uses manual boundary parsing for raw multipart bodies without a multer
 * dependency. Contents are handled as latin1 buffers end-to-end so arbitrary
 * bytes survive the round-trip.
 */
import { AppError } from '../../utils/app-error';

export interface ParsedMultipartFile {
  filename: string;
  mimeType: string;
  contents: Buffer;
}

function extractBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = match?.[1] ?? match?.[2];
  return boundary ? boundary.trim() : null;
}

/**
 * Extracts the FIRST file part (any field name) from a raw multipart body.
 * Text fields are ignored. Returns null when no file part exists.
 * Throws AppError 400 when the body is not a raw multipart payload.
 */
export function parseMultipartFile(raw: Buffer, contentType: string): ParsedMultipartFile | null {
  if (!Buffer.isBuffer(raw) || raw.length === 0) {
    throw AppError.badRequest('Se requiere un cuerpo multipart/form-data');
  }
  const boundary = extractBoundary(contentType);
  if (!boundary) {
    throw AppError.badRequest('Content-Type multipart sin boundary');
  }

  for (const part of raw.toString('latin1').split(`--${boundary}`)) {
    const marker = '\r\n\r\n';
    const separator = part.indexOf(marker);
    if (separator < 0) continue;
    const headers = part.slice(0, separator);
    // Drop the CRLF that precedes the next boundary. The closing chunk
    // ('--\r\n') has no header marker and is skipped by the separator check.
    const content = part.slice(separator + marker.length).replace(/\r\n$/, '');
    const disposition = headers.match(/filename="([^"]*)"/i);
    const mimeType = headers.match(/content-type:\s*([^\r\n;]+)/i)?.[1]?.trim();
    if (!disposition?.[1] || !mimeType) continue;
    const filename = disposition[1].trim();
    if (!filename) continue;
    return {
      filename,
      mimeType: mimeType.toLowerCase(),
      contents: Buffer.from(content, 'latin1'),
    };
  }
  return null;
}
