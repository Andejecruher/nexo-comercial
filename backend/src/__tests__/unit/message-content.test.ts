import { describe, expect, it } from '@jest/globals';
import {
  inboundContent,
  internalMessageType,
  presentationMeta,
} from '../../services/message-content';
import {
  buildCampaignPayload,
  resolveVariables,
  templateVariables,
} from '../../services/campaigns/campaign-contract';
import type { WaInboundMessage } from '../../types/whatsapp.types';

describe('message content contract', () => {
  it.each(['image', 'audio', 'document', 'video', 'sticker'])(
    'preserves media-only %s content, metadata, event time and replies',
    (type) => {
      const payload = {
        id: 'wamid.test',
        type,
        from: '52',
        timestamp: '1700000000',
        context: { id: 'wamid.original' },
        [type]: {
          id: '12345',
          mime_type: 'image/webp',
          filename: 'original.webp',
          animated: true,
          voice: true,
        },
      } as unknown as WaInboundMessage;
      const meta = inboundContent(payload);
      expect(meta).toMatchObject({
        type,
        eventTimestamp: 1700000000,
        context: { id: 'wamid.original' },
        media: { id: '12345', filename: 'original.webp', animated: true, voice: true },
      });
      expect(presentationMeta({ id: 'internal-id', meta })).toMatchObject({
        media: { id: '12345', mimeType: 'image/webp' },
      });
      expect(presentationMeta({ id: 'internal-id', meta }).media).not.toHaveProperty('url');
      expect(internalMessageType(type)).toBe(type);
    },
  );
  it('does not use malformed or future provider timestamps as an inbound window', () => {
    for (const timestamp of ['bad', 'Infinity', '99999999999'])
      expect(
        inboundContent({ type: 'text', id: 'id', from: '52', timestamp, text: { body: 'hello' } })
          .eventAt,
      ).toBeUndefined();
  });
  it('supports named parameters and dynamic URL buttons without silently dropping parameters', () => {
    const template = {
      id: '1',
      name: 'hello',
      language: 'es_MX',
      status: 'APPROVED',
      category: 'UTILITY',
      parameter_format: 'NAMED',
      components: [
        { type: 'BODY', text: 'Hola {{name}}' },
        {
          type: 'BUTTONS',
          buttons: [{ type: 'URL', text: 'Ver', url: 'https://example.test/{{1}}' }],
        },
      ],
    };
    const variables = templateVariables(template);
    const values = resolveVariables(
      variables,
      {
        'body.name': { mode: 'static', value: 'Ana' },
        'button.0.1': { mode: 'static', value: 'abc' },
      },
      {},
    );
    expect(
      buildCampaignPayload(template, values, '525500000000', 'id').template.components,
    ).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'Ana', parameter_name: 'name' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'abc' }] },
    ]);
    expect(() =>
      resolveVariables(variables, { 'body.name': { mode: 'static', value: '{{name}}' } }, {}),
    ).toThrow();
  });
  it('keeps private Meta media references for template headers', () => {
    const template = {
      id: '1',
      name: 'photo',
      language: 'es',
      status: 'APPROVED',
      category: 'UTILITY',
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Hola' },
      ],
    };
    expect(
      buildCampaignPayload(template, { 'header.media': '12345' }, '52', 'id').template
        .components[0],
    ).toEqual({ type: 'header', parameters: [{ type: 'image', image: { id: '12345' } }] });
  });
});
