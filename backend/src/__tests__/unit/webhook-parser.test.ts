/**
 * Unit tests: WebhookParserService
 * Cubre: parsing de texto, detección de payload WA, payload vacío, replay wamid.
 */
import { describe, expect, it } from '@jest/globals';
import { WebhookParserService } from '../../services/whatsapp/webhook-parser.service';
import { WaReactionContent, WaWebhookPayload } from '../../types/whatsapp.types';

const parser = new WebhookParserService();

function buildPayload(overrides?: Partial<WaWebhookPayload>): WaWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'business-id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5219610000000', phone_number_id: 'phone-id' },
              messages: [
                {
                  type: 'text',
                  id: 'wamid-001',
                  from: '5219612345678',
                  timestamp: '1700000000',
                  text: { body: 'Hola mundo' },
                },
              ],
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('WebhookParserService.parse', () => {
  it('debe parsear un mensaje de texto correctamente', () => {
    const result = parser.parse(buildPayload());
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].wamid).toBe('wamid-001');
    // phone ya sale normalizado al formato canónico de DB
    expect(result.messages[0].phone).toBe('529612345678');
  });

  it('debe normalizar el número de Meta (521…) al formato canónico de DB antes del lookup', () => {
    const result = parser.parse(buildPayload());
    // '5219612345678' (13 dígitos, formato de Meta MX) → '529612345678' (E.164 canónico)
    expect(result.messages[0].phone).toBe('529612345678');
    // El número crudo sigue accesible en el mensaje inbound original
    expect(result.messages[0].message.from).toBe('5219612345678');
  });

  it('debe retornar arreglo vacío para payload sin mensajes', () => {
    const result = parser.parse(buildPayload({ entry: [] }));
    expect(result.messages).toHaveLength(0);
  });

  it('debe preservar el wamid idéntico en replay (dedup es responsabilidad del worker)', () => {
    const result1 = parser.parse(buildPayload());
    const result2 = parser.parse(buildPayload());
    expect(result1.messages[0].wamid).toBe(result2.messages[0].wamid);
  });
});

function buildReactionPayload(reaction: Partial<WaReactionContent>): WaWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'business-id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5219610000000', phone_number_id: 'phone-id' },
              messages: [
                {
                  type: 'reaction',
                  id: 'wamid-reaction-1',
                  from: '5219612345678',
                  timestamp: '1700000000',
                  reaction: reaction as WaReactionContent,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('WebhookParserService.parse — reacciones', () => {
  it('separa una reacción de los mensajes: nunca crea un mensaje nuevo', () => {
    const result = parser.parse(buildReactionPayload({ message_id: 'wamid-001', emoji: '👍' }));

    expect(result.messages).toHaveLength(0);
    expect(result.reactions).toHaveLength(1);
    expect(result.reactions[0]).toMatchObject({
      wamid: 'wamid-reaction-1',
      targetMessageId: 'wamid-001',
      emoji: '👍',
      phone: '529612345678',
      timestamp: '1700000000',
      phoneNumberId: 'phone-id',
    });
  });

  it('una reacción sin emoji se parsea como retiro (emoji ausente)', () => {
    const result = parser.parse(buildReactionPayload({ message_id: 'wamid-001' }));

    expect(result.reactions).toHaveLength(1);
    expect(result.reactions[0].emoji).toBeUndefined();
    expect(result.reactions[0].targetMessageId).toBe('wamid-001');
  });

  it('ignora una reacción sin message_id válido', () => {
    const result = parser.parse(buildReactionPayload({ emoji: '👍' }));
    expect(result.messages).toHaveLength(0);
    expect(result.reactions).toHaveLength(0);
  });

  it('un payload mixto separa mensajes y reacciones', () => {
    const payload = buildPayload();
    const messages = payload.entry[0]?.changes[0]?.value.messages;
    if (!messages) throw new Error('expected messages');
    messages.push({
      type: 'reaction',
      id: 'wamid-reaction-1',
      from: '5219612345678',
      timestamp: '1700000001',
      reaction: { message_id: 'wamid-001', emoji: '❤️' },
    });

    const result = parser.parse(payload);
    expect(result.messages).toHaveLength(1);
    expect(result.reactions).toHaveLength(1);
    expect(result.reactions[0].emoji).toBe('❤️');
  });
});

describe('WebhookParserService.isWhatsAppPayload', () => {
  it('debe retornar true para payload WA válido', () => {
    expect(parser.isWhatsAppPayload(buildPayload())).toBe(true);
  });

  it('debe retornar false para objeto de otra plataforma', () => {
    expect(parser.isWhatsAppPayload(buildPayload({ object: 'instagram' }))).toBe(false);
  });

  it('debe retornar false para objeto nulo/undefined', () => {
    expect(parser.isWhatsAppPayload(null as unknown as WaWebhookPayload)).toBe(false);
  });
});
