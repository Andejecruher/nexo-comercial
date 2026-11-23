import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';
import { parseMultipartForm } from '../../utils/multipart';

function fakeMultipartRequest(boundary: string, body: Buffer, contentType?: string): Request {
  return {
    headers: {
      'content-type': contentType ?? `multipart/form-data; boundary=${boundary}`,
    },
    body,
  } as Request;
}

describe('parseMultipartForm', () => {
  it.each(['--vc-boundary', '\r\n--vc-boundary-not-a-delimiter'])(
    'preserves boundary-like file bytes: %j',
    (embedded) => {
      const boundary = 'vc-boundary';
      const bytes = Buffer.concat([
        Buffer.from([...Array(256).keys()]),
        Buffer.from(embedded),
        Buffer.from('\r\n'),
      ]);
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
        ),
        bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      expect(parseMultipartForm(fakeMultipartRequest(boundary, body)).files.file.buffer).toEqual(
        bytes,
      );
    },
  );

  it('rejects an interrupted multipart body rather than accepting truncated bytes', () => {
    const body = Buffer.from(
      '--vc\r\nContent-Disposition: form-data; name="file"; filename="x.pdf"\r\n\r\n%PDF-truncated',
    );
    expect(() => parseMultipartForm(fakeMultipartRequest('vc', body))).toThrow();
  });

  it('extrae archivo binario y campos de texto', () => {
    const boundary = '----vcbound';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="durationSeconds"',
      '',
      '12',
      `--${boundary}`,
      'Content-Disposition: form-data; name="audio"; filename="nota.ogg"',
      'Content-Type: audio/ogg',
      '',
      'ogg-bytes',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const parsed = parseMultipartForm(fakeMultipartRequest(boundary, Buffer.from(payload, 'utf8')));

    expect(parsed.fields.durationSeconds).toBe('12');
    expect(parsed.files.audio?.filename).toBe('nota.ogg');
    expect(parsed.files.audio?.mimeType).toBe('audio/ogg');
    expect(parsed.files.audio?.buffer.toString('utf8')).toBe('ogg-bytes');
  });

  it('lanza si no hay multipart', () => {
    expect(() => parseMultipartForm({ headers: {}, body: {} } as Request)).toThrow(
      'Se esperaba multipart/form-data',
    );
  });
});
