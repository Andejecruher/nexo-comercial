import type { Request } from 'express';
import { AppError } from './app-error';

export interface MultipartFilePart {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface ParsedMultipartForm {
  fields: Record<string, string>;
  files: Record<string, MultipartFilePart>;
}

function boundaryFromContentType(contentType: string): string | undefined {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const value = match?.[1] ?? match?.[2];
  return value?.trim();
}

/** Parse express.raw multipart bytes; latin1 preserves every byte one-to-one. */
export function parseMultipartForm(req: Request): ParsedMultipartForm {
  const contentType = req.headers['content-type'] ?? '';
  const boundary = boundaryFromContentType(contentType);
  if (!boundary || !Buffer.isBuffer(req.body)) {
    throw AppError.badRequest('Se esperaba multipart/form-data');
  }

  const fields: Record<string, string> = {};
  const files: Record<string, MultipartFilePart> = {};
  const raw = req.body.toString('latin1');
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match framing, not boundary-like byte sequences inside the file.
  const delimiters = [
    ...raw.matchAll(new RegExp(`(?:^|\\r\\n)--${escaped}(?=\\r\\n|--(?:\\r\\n|$))`, 'g')),
  ];
  const last = delimiters.at(-1);
  if (!last || raw.slice(last.index! + last[0].length, last.index! + last[0].length + 2) !== '--')
    throw AppError.badRequest('Multipart incompleto');

  for (let i = 0; i < delimiters.length - 1; i++) {
    const current = delimiters[i];
    const start = current.index! + current[0].length;
    if (raw.slice(start, start + 2) === '--') break;
    const part = raw.slice(start + 2, delimiters[i + 1].index);
    const marker = '\r\n\r\n';
    const separator = part.indexOf(marker);
    if (separator < 0) continue;

    const headers = part.slice(0, separator);
    const content = part.slice(separator + marker.length);

    const disposition = headers.match(/name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
    const name = disposition?.[1];
    if (!name) continue;

    const filename = disposition?.[2];
    if (filename) {
      const mimeType =
        headers.match(/content-type:\s*([^\r\n;]+)/i)?.[1]?.trim() || 'application/octet-stream';
      files[name] = {
        filename,
        mimeType,
        buffer: Buffer.from(content, 'latin1'),
      };
      continue;
    }

    fields[name] = Buffer.from(content, 'latin1').toString('utf8');
  }

  return { fields, files };
}
