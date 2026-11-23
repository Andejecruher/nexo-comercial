import {
  canonicalMessageType,
  inboundContent,
  contactsSchema,
} from '../../services/whatsapp/message-content';
import {
  templateSnapshot,
  templateSnapshotSchema,
} from '../../services/whatsapp/template-snapshot';
import {
  assertProviderMediaUrl,
  boundedMediaBody,
  safeFilename,
  validateMedia,
} from '../../services/whatsapp/media-policy';
import { extractMessageText, parseWebhookPayload } from '../../utils/wa-message-parser';
import type { WaInboundMessage, WaWebhookPayload } from '../../types/whatsapp.types';
import type { MetaTemplate } from '../../services/templates/template-management.service';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
  'base64',
);
describe('provider content and historical snapshots', () => {
  it('preserves Unicode, captions, reply context and voice markers without signed URLs', () => {
    const message = {
      type: 'image',
      id: 'wamid.test',
      from: '525555555555',
      timestamp: '1700000000',
      context: { id: 'wamid.quoted' },
      image: {
        id: 'media-1',
        mime_type: 'image/png',
        caption: '🧑🏽‍💻\nÁ',
        url: 'https://secret.example/?token=secret',
      },
    } as WaInboundMessage;
    expect(extractMessageText(message)).toBe('🧑🏽‍💻\nÁ');
    const meta = inboundContent(message, 'phone-id');
    expect(meta).toMatchObject({
      context: { id: 'wamid.quoted' },
      media: { id: 'media-1', caption: '🧑🏽‍💻\nÁ', phoneNumberId: 'phone-id' },
    });
    expect(JSON.stringify(meta)).not.toContain('secret');
    expect(
      inboundContent({
        ...message,
        type: 'audio',
        audio: { id: 'a', voice: true },
      } as WaInboundMessage),
    ).toMatchObject({ media: { voice: true } });
  });
  it('retains multiple contact cards and phones, organization and emails', () => {
    const contacts = [
      {
        name: { formatted_name: 'Synthetic' },
        phones: [{ phone: '+525555555555' }, { phone: '+525555555556' }],
        org: { company: 'Fixture' },
        emails: [{ email: 'fixture@example.test' }],
      },
      { name: { formatted_name: 'Second' } },
    ];
    expect(
      inboundContent({ type: 'contacts', id: 'c', from: '525555555555', timestamp: '1', contacts })
        .contacts,
    ).toEqual(contacts);
    expect(contactsSchema.safeParse([{ name: {} }]).success).toBe(false);
  });
  it('does not classify unknown provider types as text or system actions', () => {
    expect(canonicalMessageType('future-provider-type')).toBe('unsupported');
    expect(canonicalMessageType('sticker')).toBe('sticker');
  });
  it('skips malformed batch elements and isolates metadata per communication line', () => {
    const payload = {
      entry: [
        {
          id: 'waba',
          changes: ['one', 'two'].map((phone) => ({
            field: 'messages',
            value: {
              metadata: { phone_number_id: phone },
              messages: [
                null,
                {
                  id: `wamid.${phone}`,
                  from: '525555555555',
                  timestamp: '1',
                  type: 'text',
                  text: { body: phone },
                },
              ],
            },
          })),
        },
      ],
    };
    const parsed = parseWebhookPayload(payload as unknown as WaWebhookPayload);
    expect(parsed.messages.map((m) => m.phoneNumberId)).toEqual(['one', 'two']);
  });
  it('snapshots definition and ordered parameters without depending on future catalog changes', () => {
    const definition: MetaTemplate = {
      id: '123',
      name: 'notice',
      language: 'es_MX',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Aviso' },
        { type: 'BODY', text: 'Hola {{1}}\n{{2}}' },
        { type: 'FOOTER', text: 'Pie' },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Ver', url: 'https://example.test' }] },
      ],
    };
    const instance = {
      name: 'notice',
      language: { code: 'es_MX' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Uno' },
            { type: 'text', text: 'Dos' },
          ],
        },
      ],
    };
    const snapshot = templateSnapshot(instance, definition);
    definition.components[1].text = 'Changed';
    instance.components[0].parameters[0].text = 'Mutated';
    expect(snapshot.resolved[1].text).toBe('Hola Uno\nDos');
    expect(snapshot.parameters[0]).toMatchObject({
      parameters: [{ text: 'Uno' }, { text: 'Dos' }],
    });
    expect(snapshot.incomplete).toBe(false);
  });
  it('marks request-only and unresolvable historical content as incomplete', () => {
    expect(templateSnapshot({ name: 'legacy', language: { code: 'es' } }).incomplete).toBe(true);
    expect(templateSnapshotSchema.safeParse({ schemaVersion: 99 }).success).toBe(false);
  });
});
describe('media safety', () => {
  it.each([
    'http://lookaside.fbsbx.com/a',
    'https://127.0.0.1/a',
    'https://lookaside.fbsbx.com.evil.test/a',
    'https://lookaside.fbsbx.com@evil.test/a',
    'https://lookaside.fbsbx.com:8443/a',
    'file:///etc/passwd',
  ])('rejects SSRF destinations: %s', (value) =>
    expect(() => assertProviderMediaUrl(value)).toThrow(),
  );
  it('accepts only the provider download hosts', () =>
    expect(
      assertProviderMediaUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123')
        .hostname,
    ).toBe('lookaside.fbsbx.com'));
  it('identifies content and rejects spoofed MIME, empty files and oversize images', async () => {
    expect(await validateMedia(png, 'image/png', 'image')).toMatchObject({
      mimeType: 'image/png',
      extension: 'png',
      checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    await expect(validateMedia(png, 'image/jpeg', 'image')).rejects.toThrow();
    await expect(
      validateMedia(Buffer.from('<script>x</script>'), 'image/png', 'image'),
    ).rejects.toThrow();
    await expect(validateMedia(Buffer.alloc(0), 'image/png', 'image')).rejects.toThrow();
    await expect(
      validateMedia(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png', 'image'),
    ).rejects.toThrow();
  });
  it('bounds streamed bytes even without Content-Length and rejects HTTP errors', async () => {
    await expect(boundedMediaBody(new Response('12345'), 4)).rejects.toThrow('MEDIA_SIZE_EXCEEDED');
    await expect(boundedMediaBody(new Response('x', { status: 403 }))).rejects.toThrow(
      'MEDIA_HTTP_403',
    );
    await expect(boundedMediaBody(new Response('ok'), 4)).resolves.toEqual(Buffer.from('ok'));
  });
  it('sanitizes traversal, quotes and control characters in filenames', () => {
    expect(safeFilename('../../unsafe\r\n".pdf')).not.toMatch(/[\r\n"/\\]/);
  });
});
