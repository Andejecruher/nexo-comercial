import { describe, expect, it } from 'vitest';
import type { PreparedAttachmentPayload } from '@/hooks/conversaciones/useConversationMessages';
import { validateAttachmentsForSend } from '@/components/conversaciones/AttachmentUploader';

const video = (overrides: Partial<PreparedAttachmentPayload> = {}): PreparedAttachmentPayload => ({
  file: new File([new Blob(['video-bytes'])], 'clip.mp4', { type: 'video/mp4' }),
  storageKey: '',
  mimeType: 'video/mp4',
  fileSizeBytes: '1024',
  originalFilename: 'clip.mp4',
  ...overrides,
});

describe('validateAttachmentsForSend (WhatsApp outbound video rules)', () => {
  it('accepts an MP4 video within 16 MB', () => {
    expect(validateAttachmentsForSend([video()])).toBeUndefined();
  });

  it('accepts a 3GPP video within 16 MB', () => {
    expect(validateAttachmentsForSend([video({ mimeType: 'video/3gpp' })])).toBeUndefined();
  });

  it('rejects video formats other than MP4/3GPP', () => {
    expect(validateAttachmentsForSend([video({ mimeType: 'video/webm' })])).toMatch(/MP4 o 3GP/);
  });

  it('rejects videos over 16 MB', () => {
    expect(
      validateAttachmentsForSend([video({ fileSizeBytes: String(16 * 1024 * 1024 + 1) })]),
    ).toMatch(/16 MB/);
  });

  it('keeps non-video attachments unaffected by the video rules', () => {
    expect(validateAttachmentsForSend([video({ mimeType: 'image/jpeg' })])).toBeUndefined();
  });
});
