import { afterEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../config/env.config', () => ({
  env: {
    MAILTRAP_API_TOKEN: 'test-token',
    MAILTRAP_API_URL: 'https://send.api.mailtrap.test/api/send',
    MAIL_FROM_ADDRESS: 'no-reply@example.test',
    MAIL_FROM_NAME: 'Voz Ciudadana',
    MAIL_REPLY_TO_ADDRESS: 'soporte@example.test',
    MAIL_SEND_TIMEOUT_MS: 1000,
  },
}));

import { MailtrapEmailProvider } from '../../../services/email/mailtrap-email.provider';

describe('MailtrapEmailProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes rate limit responses without exposing provider payloads', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => '30' },
      json: async () => ({ errors: ['token abc'] }),
    } as unknown as Response);

    const provider = new MailtrapEmailProvider();
    const result = await provider.send({
      to: { email: 'ana@example.test' },
      subject: 'Test',
      html: '<p>Hola</p>',
      text: 'Hola',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('EMAIL_RATE_LIMITED');
    expect(result.retryAfterSeconds).toBe(30);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes accepted responses with provider message id', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ message_ids: ['mt-123'] }),
    } as unknown as Response);

    const provider = new MailtrapEmailProvider();
    const result = await provider.send({
      to: { email: 'ana@example.test' },
      subject: 'Test',
      html: '<p>Hola</p>',
      text: 'Hola',
    });

    expect(result).toMatchObject({ success: true, provider: 'mailtrap', messageId: 'mt-123' });
  });

  it('mapea los adjuntos inline al formato content_id de la Email API', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ message_ids: ['mt-124'] }),
    } as unknown as Response);

    const provider = new MailtrapEmailProvider();
    await provider.send({
      to: { email: 'ana@example.test' },
      subject: 'Test',
      html: '<img src="cid:brand-logo">',
      text: 'Hola',
      attachments: [
        {
          filename: 'email-logo.png',
          content: 'QUJD',
          type: 'image/png',
          disposition: 'inline',
          contentId: 'brand-logo',
        },
      ],
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1]?.body as string) ?? '{}');
    expect(body.attachments).toEqual([
      {
        filename: 'email-logo.png',
        content: 'QUJD',
        type: 'image/png',
        disposition: 'inline',
        content_id: 'brand-logo',
      },
    ]);
  });

  it('omite la clave attachments cuando no hay adjuntos', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ message_ids: ['mt-125'] }),
    } as unknown as Response);

    const provider = new MailtrapEmailProvider();
    await provider.send({
      to: { email: 'ana@example.test' },
      subject: 'Test',
      html: '<p>Hola</p>',
      text: 'Hola',
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1]?.body as string) ?? '{}');
    expect(body).not.toHaveProperty('attachments');
  });
});
