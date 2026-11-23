import { createHash } from 'crypto';
import { Transform, type TransformCallback } from 'stream';
import { mediaSizeCaps, validateMedia } from '../whatsapp/media-policy';

/** Only the signature sample is retained; all bytes are counted and hashed. */
export class MediaValidationStream extends Transform {
  private sample = Buffer.alloc(0);
  private readonly sha = createHash('sha256');
  private readonly md5 = createHash('md5');
  private readonly decoder = new TextDecoder('utf-8', { fatal: true });
  private total = 0;
  result?: { mimeType: string; extension: string; size: number; sha256: string; md5: string };

  constructor(
    private readonly mime: string,
    private readonly kind: string,
    private readonly expectedHash?: string,
  ) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      this.total += chunk.length;
      if (this.total > (mediaSizeCaps[this.kind] ?? 0)) throw new Error('MEDIA_SIZE_EXCEEDED');
      if (this.mime === 'text/plain') {
        if (chunk.includes(0)) throw new Error('MEDIA_FORMAT_REJECTED');
        this.decoder.decode(chunk, { stream: true });
      }
      if (this.sample.length < 65536)
        this.sample = Buffer.concat([this.sample, chunk.subarray(0, 65536 - this.sample.length)]);
      this.sha.update(chunk);
      this.md5.update(chunk);
      callback(null, chunk);
    } catch {
      callback(
        new Error(
          this.total > (mediaSizeCaps[this.kind] ?? 0)
            ? 'MEDIA_SIZE_EXCEEDED'
            : 'MEDIA_FORMAT_REJECTED',
        ),
      );
    }
  }

  override _flush(callback: TransformCallback): void {
    void this.validate().then(
      () => callback(),
      (error: Error) =>
        callback(
          /^MEDIA_[A-Z_]+$/.test(error.message) ? error : new Error('MEDIA_FORMAT_REJECTED'),
        ),
    );
  }

  private async validate(): Promise<void> {
    if (!this.total) throw new Error('MEDIA_FORMAT_REJECTED');
    // UTF-8 is validated across every chunk, including incomplete trailing sequences.
    if (this.mime === 'text/plain') this.decoder.decode();
    const checked = await validateMedia(
      this.mime === 'text/plain'
        ? Buffer.from(
            new TextDecoder('utf-8', { fatal: true }).decode(this.sample, { stream: true }),
          )
        : this.sample,
      this.mime,
      this.kind,
    );
    if (
      this.kind === 'sticker' &&
      this.total > (this.sample.includes(Buffer.from('ANIM')) ? 500 : 100) * 1024
    )
      throw new Error('MEDIA_SIZE_EXCEEDED');
    const digest = this.sha.digest();
    if (
      this.expectedHash &&
      ![digest.toString('hex'), digest.toString('base64')].includes(this.expectedHash)
    )
      throw new Error('MEDIA_HASH_MISMATCH');
    this.result = {
      mimeType: checked.mimeType,
      extension: checked.extension,
      size: this.total,
      sha256: digest.toString('hex'),
      md5: this.md5.digest('hex'),
    };
  }
}
