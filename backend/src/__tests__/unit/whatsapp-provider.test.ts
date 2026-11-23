/**
 * Tests unitarios para WhatsAppProvider — foco en privacidad de logs.
 *
 * Verifica que sendTextWithTemplateFallback no filtre el teléfono
 * en claro cuando registra el warning de ventana 24h.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { PostgresRateLimiter } from '../../services/postgres-rate-limiter.service';
import { WhatsAppLineConfigResolver } from '../../services/whatsapp/whatsapp-line-config.resolver';
import { WhatsAppProvider } from '../../services/whatsapp/whatsapp.provider';

// ─── Mock de PostgresRateLimiter ─────────────────────────────────────────────

const asyncMock = <T = unknown>() => jest.fn<(...args: unknown[]) => Promise<T>>();

function makeRateLimiterMock() {
  return {
    increment: asyncMock().mockResolvedValue(1),
    remainingSeconds: asyncMock().mockResolvedValue(60),
    prune: asyncMock().mockResolvedValue(0),
    windowStart: jest.fn(() => Date.now()),
  };
}

function makeLineResolverMock() {
  return {
    resolve: asyncMock().mockResolvedValue({
      lineId: 'line-1',
      externalIdentifier: '1234567890',
      accessToken: 'fake-token',
      appSecret: 'fake-secret',
      phoneNumberId: '1234567890',
      httpTimeoutMs: 10_000,
      messagesUrl: 'https://fake.meta.api/messages',
      mediaUrl: 'https://fake.meta.api/media',
    }),
  };
}

// ─── Mock de generateAppSecretProof ─────────────────────────────────────────

jest.mock('../../utils/hmac-validator', () => ({
  generateAppSecretProof: jest.fn().mockReturnValue('fake-proof'),
}));

// ─── Mock de meta-error-parser ───────────────────────────────────────────────

jest.mock('../../utils/meta-error-parser', () => ({
  isMetaErrorResponse: jest.fn().mockReturnValue(false),
  isOutsideConversationWindow: jest.fn((code: number) => code === 131047),
  parseMetaError: jest.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────

describe('WhatsAppProvider — privacidad de logs', () => {
  const PHONE = '+521234567890';

  it('sendTextWithTemplateFallback: no debe filtrar phone en claro al loguear fuera de ventana 24h', async () => {
    const rateLimiter = makeRateLimiterMock();
    const lineResolver = makeLineResolverMock();
    const provider = new WhatsAppProvider(
      rateLimiter as unknown as PostgresRateLimiter,
      lineResolver as unknown as WhatsAppLineConfigResolver,
    );

    // Spy sobre sendText para lanzar error de fuera de ventana
    const outsideWindowError = { code: 131047, message: 'Outside conversation window' };
    jest.spyOn(provider as any, 'sendText').mockRejectedValueOnce(outsideWindowError);
    jest
      .spyOn(provider as any, 'sendTemplate')
      .mockResolvedValueOnce({ messages: [{ id: 'wamid.tmpl' }] });
    // checkRateLimit debe pasar sin bloquear
    jest.spyOn(provider as any, 'checkRateLimit').mockResolvedValue(undefined);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await provider.sendTextWithTemplateFallback(PHONE, 'Hola ciudadano', {
      name: 'welcome_template',
      languageCode: 'es_MX',
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(logged) as Record<string, unknown>;

    // Debe ser log estructurado con el evento correcto
    expect(parsed.event).toBe('whatsapp.outside_window');
    expect(parsed.service).toBe('WhatsAppProvider');

    // El phone NO debe aparecer en claro
    expect(logged).not.toContain(PHONE);
    // El campo to debe estar enmascarado
    expect(parsed.to).toMatch(/\*+/);

    warnSpy.mockRestore();
  });

  it('sendTypingIndicator: debe enviar payload oficial con read + typing_indicator', async () => {
    const rateLimiter = makeRateLimiterMock();
    const lineResolver = makeLineResolverMock();
    const provider = new WhatsAppProvider(
      rateLimiter as unknown as PostgresRateLimiter,
      lineResolver as unknown as WhatsAppLineConfigResolver,
    );

    const postSpy = jest.spyOn(provider as any, 'post').mockResolvedValue({ success: true });
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

    await provider.sendTypingIndicator(PHONE, 'wamid.typing.1');

    expect(postSpy).toHaveBeenCalledWith(
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: 'wamid.typing.1',
        typing_indicator: {
          type: 'text',
        },
      },
      undefined,
    );

    debugSpy.mockRestore();
  });

  it('sendTypingIndicator: no debe relanzar errores y debe loguear warning con phone enmascarado', async () => {
    const rateLimiter = makeRateLimiterMock();
    const lineResolver = makeLineResolverMock();
    const provider = new WhatsAppProvider(
      rateLimiter as unknown as PostgresRateLimiter,
      lineResolver as unknown as WhatsAppLineConfigResolver,
    );

    jest.spyOn(provider as any, 'post').mockRejectedValueOnce(new Error('meta error'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(provider.sendTypingIndicator(PHONE, 'wamid.typing.2')).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(logged) as Record<string, unknown>;

    expect(parsed.event).toBe('whatsapp.typing.failed');
    expect(parsed.service).toBe('WhatsAppProvider');
    expect(parsed.messageId).toBe('wamid.typing.2');
    expect(logged).not.toContain(PHONE);
    expect(parsed.to).toMatch(/\*+/);

    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('WhatsAppProvider — formato 521 para Meta en `to`', () => {
  function makeProvider() {
    const rateLimiter = makeRateLimiterMock();
    const lineResolver = makeLineResolverMock();
    const provider = new WhatsAppProvider(
      rateLimiter as unknown as PostgresRateLimiter,
      lineResolver as unknown as WhatsAppLineConfigResolver,
    );
    return { provider };
  }

  it('send(payload): convierte to de 52… (12) a 521… (13) antes de enviar a Meta', async () => {
    const { provider } = makeProvider();

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({ messaging_product: 'whatsapp' }),
      } as never);

    await provider.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '529612345678',
      type: 'text',
      text: { body: 'Hola' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toContain('messages');
    const sentBody = JSON.parse(init.body) as Record<string, unknown>;
    expect(sentBody.to).toBe('5219612345678');

    fetchMock.mockRestore();
  });

  it('payloads sin `to` (read receipt) se envían intactos', async () => {
    const { provider } = makeProvider();

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({ messaging_product: 'whatsapp' }),
      } as never);

    await provider.markAsRead('wamid.read.1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const sentBody = JSON.parse(init.body) as Record<string, unknown>;
    expect(sentBody).not.toHaveProperty('to');
    expect(sentBody.message_id).toBe('wamid.read.1');

    fetchMock.mockRestore();
  });
});
