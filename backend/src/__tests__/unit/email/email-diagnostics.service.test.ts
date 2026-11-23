import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { withEnv } from '../../helpers/with-env';

const baseTestEnv = {
  ...{
    NODE_ENV: 'test',
    BASE_URL: 'http://localhost',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_SECRET: 's'.repeat(32),
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    ENCRYPTION_KEY: 'c'.repeat(32),
    WHATSAPP_VERIFY_TOKEN: 'x',
    WHATSAPP_APP_ID: 'x',
    WHATSAPP_APP_SECRET: 'x',
    WHATSAPP_ACCESS_TOKEN: 'x',
    WHATSAPP_PHONE_NUMBER_ID: 'x',
    WHATSAPP_BUSINESS_ACCOUNT_ID: 'x',
    MAIL_PROVIDER: 'fake',
    MAIL_FROM_ADDRESS: 'no-reply@example.test',
    MAIL_FROM_NAME: 'Nexo Comercial',
    MAILTRAP_API_TOKEN: 'token',
    MAILTRAP_API_URL: 'https://send.test',
    ENABLE_EMAIL_TEST_ENDPOINTS: 'true',
    EMAIL_TEST_ALLOWED_RECIPIENTS: 'ana@example.test',
    EMAIL_TEST_RATE_LIMIT_MAX: '5',
    EMAIL_TEST_RATE_LIMIT_WINDOW_SECONDS: '600',
  },
};

describe('EmailDiagnosticsService', () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    jest.resetModules();
    restore = withEnv(baseTestEnv);
  });

  afterEach(() => {
    restore?.();
  });

  async function buildService(
    sendResult = { success: true, provider: 'fake' as const, messageId: 'm1', durationMs: 1 },
  ) {
    const email: any = {
      send: jest.fn(async () => sendResult),
      sendRawText: jest.fn(async () => sendResult),
    };
    const rateLimiter: any = {
      increment: jest.fn(async () => 1),
      remainingSeconds: jest.fn(async () => 300),
    };
    const { EmailDiagnosticsService } = await import('../../../services/email-diagnostics.service');
    return { service: new EmailDiagnosticsService(email, rateLimiter), email, rateLimiter };
  }

  it('reports complete configuration without exposing secrets', async () => {
    const { service } = await buildService();
    const status = service.getConfigurationStatus();
    expect(status.configured).toBe(true);
    expect(status.configuration).toEqual({
      apiTokenConfigured: true,
      apiUrlConfigured: true,
      fromAddressConfigured: true,
      fromNameConfigured: true,
    });
    expect(JSON.stringify(status)).not.toContain('token');
  });

  it('rejects disabled endpoints', async () => {
    restore?.();
    restore = withEnv({ ...baseTestEnv, ENABLE_EMAIL_TEST_ENDPOINTS: 'false' });
    jest.resetModules();
    const { EmailDiagnosticsService } = await import('../../../services/email-diagnostics.service');
    const service = new EmailDiagnosticsService({} as any, {
      increment: jest.fn(),
      remainingSeconds: jest.fn(),
    } as any);
    await expect(service.checkConnection('u1')).rejects.toMatchObject({
      code: 'EMAIL_TEST_ENDPOINTS_DISABLED',
      statusCode: 404,
    });
  });

  it('rejects recipients outside allowlist', async () => {
    const { service } = await buildService();
    await expect(
      service.sendText({ to: 'evil@example.test', subject: 'Test', message: 'Hola' }, 'u1'),
    ).rejects.toMatchObject({ code: 'EMAIL_RECIPIENT_NOT_ALLOWED' });
  });

  it('rejects header injection', async () => {
    const { service } = await buildService();
    await expect(
      service.sendText({ to: 'ana@example.test', subject: 'Hi\nBcc: x', message: 'Hola' }, 'u1'),
    ).rejects.toMatchObject({ code: 'EMAIL_RECIPIENT_REJECTED' });
  });

  it('normalizes successful provider response', async () => {
    const { service } = await buildService();
    const result = await service.sendText(
      { to: 'ana@example.test', subject: 'Test', message: 'Hola' },
      'u1',
    );
    expect(result).toMatchObject({
      status: 'accepted',
      messageId: 'm1',
      recipient: 'ana@example.test',
    });
  });

  it('applies rate limit', async () => {
    const { service, rateLimiter } = await buildService();
    rateLimiter.increment.mockResolvedValue(6);
    await expect(
      service.sendText({ to: 'ana@example.test', subject: 'Test', message: 'Hola' }, 'u1'),
    ).rejects.toMatchObject({ code: 'EMAIL_RATE_LIMITED', statusCode: 429 });
  });
});
