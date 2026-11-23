import { describe, expect, it } from '@jest/globals';
import { renderEmailTemplate } from '../../../services/email/render';
import { LOGO_CID, brand, logoHttpUrl } from '../../../services/email/templates/branding';

const invitationProps = {
  recipientName: '<Ana>',
  platformName: 'Voz Ciudadana',
  activationUrl: 'https://app.example.test/activate-account?token=secret-token',
  expirationDate: '15 de julio de 2026',
  expirationTime: '10:00',
  supportEmail: 'soporte@example.test',
  invitedByName: 'Admin',
};

describe('plantillas de correo — cromo compartido', () => {
  it('renderiza el logo inline con dimensiones y texto alternativo', async () => {
    const { html } = await renderEmailTemplate('user-invitation', invitationProps);

    expect(html).toContain(`cid:${LOGO_CID}`);
    expect(html).toContain('alt="KAB | Voz Ciudadana"');
    expect(html).toMatch(/width="48"/);
    expect(html).toMatch(/height="48"/);
    expect(logoHttpUrl()).toContain('/images/email-logo.png');
  });

  it('aplica la paleta corporativa y no la paleta anterior', async () => {
    const { html } = await renderEmailTemplate('user-invitation', invitationProps);

    expect(html.toLowerCase()).toContain(brand.primary.toLowerCase());
    expect(html.toLowerCase()).not.toContain('#0f766e');
  });

  it('incluye pie legal con derechos, privacidad y términos', async () => {
    const { html, text } = await renderEmailTemplate('user-invitation', invitationProps);

    expect(html).toContain('/politica-y-privacidad');
    expect(html).toContain('/terminos-y-condiciones');
    expect(text).toContain('Todos los derechos reservados');
  });
});

describe('plantilla de invitación', () => {
  it('escapa el contenido dinámico y no deja marcadores sin resolver', async () => {
    const rendered = await renderEmailTemplate('user-invitation', invitationProps);

    expect(rendered.subject).toBe('Te invitaron a formar parte de Voz Ciudadana');
    expect(rendered.category).toBe('user-invitation');
    expect(rendered.html).toContain('&lt;Ana&gt;');
    expect(rendered.html).not.toContain('<Ana>');
    expect(rendered.html).toContain('Configurar mi acceso');
    expect(rendered.text).toContain(invitationProps.activationUrl);
    expect(rendered.html).not.toContain('{{');
    expect(rendered.text).not.toContain('{{');
    expect(rendered.html).not.toContain('MAILTRAP_API_TOKEN');
  });

  it('usa el asunto de reenvío para reenvíos administrativos', async () => {
    const rendered = await renderEmailTemplate('user-invitation', {
      ...invitationProps,
      recipientName: 'Ana',
      isResend: true,
    });

    expect(rendered.subject).toBe('Nueva invitación para acceder a Voz Ciudadana');
  });
});

describe('plantilla de cuenta activada', () => {
  it('escapa el nombre y enlaza al login', async () => {
    const rendered = await renderEmailTemplate('account-activated', {
      recipientName: '<Ana>',
      platformName: 'Voz Ciudadana',
      loginUrl: 'https://app.example.test',
    });

    expect(rendered.subject).toBe('Tu cuenta de Voz Ciudadana está activa');
    expect(rendered.html).toContain('&lt;Ana&gt;');
    expect(rendered.html).toContain('https://app.example.test');
    expect(rendered.html).toContain('Ingresar a la plataforma');
  });
});

describe('plantilla de restablecimiento de contraseña', () => {
  it('incluye el enlace, la expiración y la advertencia de seguridad', async () => {
    const rendered = await renderEmailTemplate('password-reset', {
      recipientName: 'Ana',
      platformName: 'Voz Ciudadana',
      resetUrl: 'https://app.example.test/reset-password?token=abc',
      expirationDate: '15 de julio de 2026',
      expirationTime: '10:00',
      supportEmail: 'soporte@example.test',
    });

    expect(rendered.subject).toBe('Restablece tu contraseña de Voz Ciudadana');
    expect(rendered.category).toBe('password-reset');
    expect(rendered.html).toContain('https://app.example.test/reset-password?token=abc');
    expect(rendered.html).toContain('15 de julio de 2026');
    expect(rendered.text).toContain('Si no solicitaste este cambio');
  });
});

describe('plantillas de boletín', () => {
  it('la confirmación incluye el enlace de doble opt-in', async () => {
    const rendered = await renderEmailTemplate('newsletter-confirm', {
      recipientName: 'Ana',
      platformName: 'Voz Ciudadana',
      confirmUrl: 'https://app.example.test/boletin/confirmar?token=abc',
      expirationDate: '15 de julio de 2026',
      expirationTime: '10:00',
    });

    expect(rendered.subject).toBe('Confirma tu suscripción al boletín');
    expect(rendered.html).toContain('/boletin/confirmar?token=abc');
    expect(rendered.html).toContain('Confirmar mi suscripción');
  });

  it('la bienvenida ofrece siempre el enlace de baja', async () => {
    const rendered = await renderEmailTemplate('newsletter-welcome', {
      platformName: 'Voz Ciudadana',
      siteUrl: 'https://app.example.test',
      unsubscribeUrl: 'https://app.example.test/boletin/baja?token=xyz',
    });

    expect(rendered.subject).toBe('Tu suscripción al boletín está activa');
    expect(rendered.html).toContain('/boletin/baja?token=xyz');
    expect(rendered.text).toContain('darte de baja');
  });
});

describe('plantilla de notificación', () => {
  it('omite el CTA cuando no hay acción', async () => {
    const rendered = await renderEmailTemplate('notification', {
      title: 'Reporte recibido',
      message: 'Registramos tu reporte y lo asignamos al área correspondiente.',
    });

    expect(rendered.subject).toBe('Reporte recibido');
    expect(rendered.html).not.toContain('Si el botón no funciona');
  });

  it('incluye el CTA cuando hay acción', async () => {
    const rendered = await renderEmailTemplate('notification', {
      recipientName: 'Ana',
      title: 'Reporte actualizado',
      message: 'Tu reporte cambió de estado.',
      actionUrl: 'https://app.example.test/reportes/1',
      actionLabel: 'Ver reporte',
    });

    expect(rendered.html).toContain('Ver reporte');
    expect(rendered.html).toContain('https://app.example.test/reportes/1');
  });
});
