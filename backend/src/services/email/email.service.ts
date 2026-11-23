import type { EmailAddress, EmailDeliveryResult, EmailProvider } from '../email.types';
import { loadLogoAttachment } from './logo-attachment';
import { renderEmailTemplate } from './render';
import type { EmailTemplateName, EmailTemplateProps } from './templates/registry';

export type SendEmailInput<TName extends EmailTemplateName> = {
  to: EmailAddress;
  template: TName;
  props: EmailTemplateProps<TName>;
  /** Sobrescribe el asunto derivado de la plantilla (p. ej. prefijo `[PRUEBA]`). */
  subject?: string;
  /** Sobrescribe la categoría reportada al proveedor. */
  category?: string;
  metadata?: Record<string, string>;
};

export class EmailService {
  constructor(private readonly provider: EmailProvider) {}

  /**
   * Único punto de envío: renderiza la plantilla solicitada, adjunta el logo en
   * línea y delega en el proveedor configurado.
   */
  async send<TName extends EmailTemplateName>(
    input: SendEmailInput<TName>,
  ): Promise<EmailDeliveryResult> {
    const rendered = await renderEmailTemplate(input.template, input.props);
    const logo = loadLogoAttachment();

    return this.provider.send({
      to: input.to,
      subject: input.subject ?? rendered.subject,
      html: rendered.html,
      text: rendered.text,
      category: input.category ?? rendered.category,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(logo ? { attachments: [logo] } : {}),
    });
  }

  /** Envío sin plantilla, reservado para los diagnósticos de texto plano. */
  async sendRawText(input: {
    to: EmailAddress;
    subject: string;
    text: string;
    category?: string;
  }): Promise<EmailDeliveryResult> {
    return this.provider.send({
      to: input.to,
      subject: input.subject,
      html: '',
      text: input.text,
      category: input.category ?? 'email-diagnostics-text',
    });
  }
}
