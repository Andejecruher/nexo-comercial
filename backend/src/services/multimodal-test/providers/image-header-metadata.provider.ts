import { AppError } from '../../../utils/app-error';
import type { MediaMetadataProvider } from '../contracts';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Header probe only: does not decode pixels or verify PNG chunk CRCs. */
export class ImageHeaderMetadataProvider implements MediaMetadataProvider {
  readonly id = 'image-headers';
  readonly supportedMimeTypes = ['image/jpeg', 'image/png'] as const;

  probe(input: Parameters<MediaMetadataProvider['probe']>[0]): Promise<Record<string, unknown>> {
    // Header reads are synchronous. Defer them so invalid headers reject the
    // returned promise instead of throwing before the caller can attach a catch.
    return Promise.resolve().then(() => {
      const mimeType = input.mimeType.toLowerCase().split(';')[0]!.trim();
      if (mimeType === 'image/png') return this.pngMetadata(input.buffer);
      if (mimeType === 'image/jpeg') return this.jpegMetadata(input.buffer);
      // TODO: add header readers for other formats before advertising their support.
      return { format: 'unknown' };
    });
  }

  private invalidHeader(): AppError {
    return new AppError(
      'Cabecera de imagen inválida o incompleta',
      400,
      'VALIDATION_INVALID_IMAGE_HEADER',
    );
  }

  private pngMetadata(buffer: Buffer): Record<string, unknown> {
    if (
      buffer.length < 33 ||
      !buffer.subarray(0, 8).equals(PNG_SIGNATURE) ||
      buffer.readUInt32BE(8) !== 13 ||
      buffer.toString('ascii', 12, 16) !== 'IHDR'
    ) {
      throw this.invalidHeader();
    }
    const widthPx = buffer.readUInt32BE(16);
    const heightPx = buffer.readUInt32BE(20);
    const bitDepth = buffer[24]!;
    const colorType = buffer[25]!;
    const validDepths: Record<number, readonly number[]> = {
      0: [1, 2, 4, 8, 16],
      2: [8, 16],
      3: [1, 2, 4, 8],
      4: [8, 16],
      6: [8, 16],
    };
    if (
      !widthPx ||
      !heightPx ||
      widthPx > 0x7fffffff ||
      heightPx > 0x7fffffff ||
      !validDepths[colorType]?.includes(bitDepth) ||
      buffer[26] !== 0 ||
      buffer[27] !== 0 ||
      (buffer[28] !== 0 && buffer[28] !== 1)
    ) {
      throw this.invalidHeader();
    }
    // Detect an alpha channel from IHDR, not optional tRNS transparency chunks.
    return {
      format: 'png',
      widthPx,
      heightPx,
      bitDepth,
      hasAlpha: colorType === 4 || colorType === 6,
    };
  }

  private jpegMetadata(buffer: Buffer): Record<string, unknown> {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      throw this.invalidHeader();
    }
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) throw this.invalidHeader();
      while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
      if (offset >= buffer.length) throw this.invalidHeader();
      const marker = buffer[offset++]!;
      // No dimensions can be recovered after reaching the scan or end marker.
      if (marker === 0xda || marker === 0xd9 || marker === 0x00 || marker === 0xd8) break;
      // TEM and restart markers carry no length field.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) throw this.invalidHeader();
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) throw this.invalidHeader();
      if (marker === 0xc0 || marker === 0xc2) {
        if (length < 8) throw this.invalidHeader();
        const heightPx = buffer.readUInt16BE(offset + 3);
        const widthPx = buffer.readUInt16BE(offset + 5);
        const components = buffer[offset + 7]!;
        if (!widthPx || !heightPx || !components || length !== 8 + 3 * components) {
          throw this.invalidHeader();
        }
        return { format: 'jpeg', widthPx, heightPx };
      }
      offset += length;
    }
    throw this.invalidHeader();
  }
}
