import { describe, expect, it } from '@jest/globals';
import { EmailService } from '../../../services/email/email.service';
import { FakeEmailProvider } from '../../../services/email/fake-email.provider';
import { LOGO_CID } from '../../../services/email/templates/branding';

const props = {
  recipientName: 'Ana',
  platformName: 'Nexo Comercial',
  activationUrl: 'https://app.example.test/activate-account?token=abc',
  expirationDate: '15 de julio de 2026',
  expirationTime: '10:00',
};

describe('EmailService.send', () => {
  it('renderiza la plantilla y deriva asunto y categoría del registro', async () => {
    const provider = new FakeEmailProvider();
    await new EmailService(provider).send({
      to: { email: 'ana@example.test', name: 'Ana' },
      template: 'user-invitation',
      props,
    });

    const [message] = provider.sent;
    expect(message?.subject).toBe('Te invitaron a formar parte de Nexo Comercial');
    expect(message?.category).toBe('user-invitation');
    expect(message?.html).toContain('Configurar mi acceso');
    expect(message?.text.length).toBeGreaterThan(0);
  });

  it('adjunta el logo en línea referenciado por el HTML', async () => {
    const provider = new FakeEmailProvider();
    await new EmailService(provider).send({
      to: { email: 'ana@example.test' },
      template: 'user-invitation',
      props,
    });

    const [message] = provider.sent;
    expect(message?.html).toContain(`cid:${LOGO_CID}`);
    expect(message?.attachments).toEqual([
      expect.objectContaining({
        filename: 'email-logo.png',
        type: 'image/png',
        disposition: 'inline',
        contentId: LOGO_CID,
      }),
    ]);
    expect(message?.attachments?.[0]?.content.length).toBeGreaterThan(0);
  });

  it('permite sobrescribir asunto y categoría para previsualizaciones', async () => {
    const provider = new FakeEmailProvider();
    await new EmailService(provider).send({
      to: { email: 'ana@example.test' },
      template: 'user-invitation',
      props,
      subject: '[PRUEBA] Invitación',
      category: 'email-diagnostics-invitation',
    });

    const [message] = provider.sent;
    expect(message?.subject).toBe('[PRUEBA] Invitación');
    expect(message?.category).toBe('email-diagnostics-invitation');
  });

  it('sendRawText no adjunta el logo ni renderiza HTML', async () => {
    const provider = new FakeEmailProvider();
    await new EmailService(provider).sendRawText({
      to: { email: 'ana@example.test' },
      subject: 'Prueba',
      text: 'Hola',
    });

    const [message] = provider.sent;
    expect(message?.html).toBe('');
    expect(message?.attachments).toBeUndefined();
  });
});
