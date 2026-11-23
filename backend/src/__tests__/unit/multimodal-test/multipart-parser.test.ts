import { describe, expect, it } from '@jest/globals';
import { parseMultipartFile } from '../../../services/multimodal-test/multipart-parser';

function multipart(
  boundary: string,
  parts: Array<{ name: string; filename?: string; mimeType?: string; body: string }>,
): { raw: Buffer; contentType: string } {
  const chunks: string[] = [];
  for (const part of parts) {
    chunks.push(`--${boundary}\r\n`);
    const disposition = part.filename
      ? `form-data; name="${part.name}"; filename="${part.filename}"`
      : `form-data; name="${part.name}"`;
    chunks.push(`Content-Disposition: ${disposition}\r\n`);
    if (part.mimeType) chunks.push(`Content-Type: ${part.mimeType}\r\n`);
    chunks.push('\r\n');
    chunks.push(part.body);
    chunks.push('\r\n');
  }
  chunks.push(`--${boundary}--\r\n`);
  return {
    raw: Buffer.from(chunks.join(''), 'latin1'),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe('parseMultipartFile', () => {
  it('extracts the first file part with filename and mimetype', () => {
    const { raw, contentType } = multipart('BOUNDARY1', [
      { name: 'description', body: 'ignored text field' },
      { name: 'file', filename: 'audio.ogg', mimeType: 'audio/ogg', body: 'BINARY-AUDIO' },
    ]);
    const parsed = parseMultipartFile(raw, contentType);
    expect(parsed).not.toBeNull();
    expect(parsed?.filename).toBe('audio.ogg');
    expect(parsed?.mimeType).toBe('audio/ogg');
    expect(parsed?.contents.toString('latin1')).toBe('BINARY-AUDIO');
  });

  it('preserves binary bytes through latin1 round-trip', () => {
    const binary = String.fromCharCode(0, 1, 255, 254, 16);
    const { raw, contentType } = multipart('BOUNDARY2', [
      { name: 'file', filename: 'img.png', mimeType: 'image/png', body: binary },
    ]);
    const parsed = parseMultipartFile(raw, contentType);
    expect(parsed?.contents).toEqual(Buffer.from(binary, 'latin1'));
  });

  it('ignores text fields and returns null when no file part exists', () => {
    const { raw, contentType } = multipart('BOUNDARY3', [
      { name: 'forceOcr', body: 'true' },
    ]);
    expect(parseMultipartFile(raw, contentType)).toBeNull();
  });

  it('throws a clear 400 error when content-type has no boundary', () => {
    expect(() => parseMultipartFile(Buffer.from('x'), 'application/json')).toThrow(
      /multipart/i,
    );
  });

  it('throws when the body is not a buffer-like raw payload', () => {
    expect(() => parseMultipartFile(Buffer.from(''), 'multipart/form-data')).toThrow(
      /multipart/i,
    );
  });
});
