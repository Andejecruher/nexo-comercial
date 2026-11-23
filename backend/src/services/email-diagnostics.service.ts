import { env } from '../config/env.config';
import { AppError } from '../utils/app-error';
import type { EmailDeliveryResult } from './email.types';
import { EmailService } from './email/email.service';
import { formatExpiration } from './email/format';
import { userInvitationSubject } from './email/templates/user-invitation';
import type { PostgresRateLimiter } from './postgres-rate-limiter.service';

export type EmailDiagnosticsCode =
  | 'EMAIL_TEST_ENDPOINTS_DISABLED'
  | 'EMAIL_CONFIGURATION_INCOMPLETE'
  | 'EMAIL_CONNECTION_FAILED'
  | 'EMAIL_AUTHENTICATION_FAILED'
  | 'EMAIL_RECIPIENT_NOT_ALLOWED'
  | 'EMAIL_RECIPIENT_REJECTED'
  | 'EMAIL_RATE_LIMITED'
  | 'EMAIL_TEMPLATE_RENDER_FAILED'
  | 'EMAIL_PROVIDER_TIMEOUT'
  | 'EMAIL_PROVIDER_UNAVAILABLE'
  | 'EMAIL_SEND_FAILED';

type EmailDiagnosticsTransport = 'email-api' | 'fake';

export type EmailDiagnosticsConfigurationStatus = {
  enabled: boolean;
  provider: typeof env.MAIL_PROVIDER;
  transport: EmailDiagnosticsTransport;
  environment: typeof env.NODE_ENV;
  configured: boolean;
  configuration: {
    apiTokenConfigured: boolean;
    apiUrlConfigured: boolean;
    fromAddressConfigured: boolean;
    fromNameConfigured: boolean;
  };
};

export type EmailDiagnosticsConnectionStatus = {
  provider: typeof env.MAIL_PROVIDER;
  transport: EmailDiagnosticsTransport;
  connected: boolean;
  checkedAt: string;
  durationMs: number;
  note: string;
};

export type EmailDiagnosticsSendResult = {
  provider: EmailDeliveryResult['provider'];
  status: 'accepted';
  messageId: string | undefined;
  recipient: string;
  sentAt: string;
};

const allowedEnvironments = new Set(['development', 'test']);
function hasUnsafeCharacters(value: string): boolean {
  return value.split('').some((char) => {
    const code = char.charCodeAt(0);
    return code === 10 || code === 13 || code === 127 || (code < 32 && code !== 9);
  });
}

function splitList(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

function diagnosticError(
  code: EmailDiagnosticsCode,
  message: string,
  statusCode: number,
  details?: unknown,
) {
  return new AppError(message, statusCode, code, details);
}

export class EmailDiagnosticsService {
  constructor(
    private readonly emailService: EmailService,
    private readonly rateLimiter: PostgresRateLimiter,
  ) {}

  getConfigurationStatus(): EmailDiagnosticsConfigurationStatus {
    const configuration = {
      apiTokenConfigured: Boolean(env.MAILTRAP_API_TOKEN),
      apiUrlConfigured: Boolean(env.MAILTRAP_API_URL),
      fromAddressConfigured: Boolean(env.MAIL_FROM_ADDRESS),
      fromNameConfigured: Boolean(env.MAIL_FROM_NAME),
    };
    return {
      enabled: this.isEnabled(),
      provider: env.MAIL_PROVIDER,
      transport: env.MAIL_PROVIDER === 'mailtrap' ? 'email-api' : 'fake',
      environment: env.NODE_ENV,
      configured: Object.values(configuration).every(Boolean),
      configuration,
    };
  }

  async checkConnection(userId: string): Promise<EmailDiagnosticsConnectionStatus> {
    this.assertEnabled();
    this.assertConfigured();
    await this.enforceRateLimit(userId, 'connection');
    return {
      provider: env.MAIL_PROVIDER,
      transport: env.MAIL_PROVIDER === 'mailtrap' ? 'email-api' : 'fake',
      connected: false,
      checkedAt: new Date().toISOString(),
      durationMs: 0,
      note: 'Mailtrap Email API no ofrece una verificación de conexión sin envío; usa los endpoints de envío controlado como prueba efectiva.',
    };
  }

  async sendText(
    input: { to: string; subject: string; message: string },
    userId: string,
  ): Promise<EmailDiagnosticsSendResult> {
    this.assertEnabled();
    this.assertConfigured();
    this.assertAllowedRecipient(input.to);
    this.assertSafeText(input.subject, 'subject');
    this.assertSafeText(input.message, 'message');
    await this.enforceRateLimit(userId, 'send');
    const result = await this.emailService.sendRawText({
      to: { email: input.to },
      subject: input.subject,
      text: input.message,
    });
    return this.normalizeSendResult(result, input.to);
  }

  async sendHtml(
    input: { to: string; subject: string; title: string; message: string },
    userId: string,
  ): Promise<EmailDiagnosticsSendResult> {
    this.assertEnabled();
    this.assertConfigured();
    this.assertAllowedRecipient(input.to);
    [input.subject, input.title, input.message].forEach((value) =>
      this.assertSafeText(value, 'content'),
    );
    await this.enforceRateLimit(userId, 'send');

    let result: EmailDeliveryResult;
    try {
      result = await this.emailService.send({
        to: { email: input.to },
        template: 'email-diagnostics',
        props: {
          platformName: env.MAIL_PLATFORM_NAME,
          environment: env.NODE_ENV,
          title: input.title,
          message: input.message,
          sentAtIso: new Date().toISOString(),
        },
        subject: input.subject,
        category: 'email-diagnostics-html',
      });
    } catch {
      throw diagnosticError(
        'EMAIL_TEMPLATE_RENDER_FAILED',
        'No fue posible renderizar la plantilla de prueba.',
        500,
      );
    }

    return this.normalizeSendResult(result, input.to);
  }

  async sendInvitationPreview(
    input: { to: string; recipientName: string },
    userId: string,
  ): Promise<EmailDiagnosticsSendResult> {
    this.assertEnabled();
    this.assertConfigured();
    this.assertAllowedRecipient(input.to);
    this.assertSafeText(input.recipientName, 'recipientName');
    await this.enforceRateLimit(userId, 'send');
    const expiration = new Date(Date.now() + env.INVITATION_EXPIRATION_MINUTES * 60_000);
    const activationUrl = `${env.FRONTEND_URL.replace(/\/$/, '')}/activation-preview`;
    const props = {
      recipientName: input.recipientName,
      platformName: env.MAIL_PLATFORM_NAME,
      activationUrl,
      ...formatExpiration(expiration),
      supportEmail: env.MAIL_SUPPORT_EMAIL,
      invitedByName: `${env.MAIL_FROM_NAME} (diagnóstico)`,
    };

    const result = await this.emailService.send({
      to: { email: input.to, name: input.recipientName },
      template: 'user-invitation',
      props,
      subject: `[PRUEBA] ${userInvitationSubject(props)}`,
      category: 'email-diagnostics-invitation',
    });
    return this.normalizeSendResult(result, input.to);
  }

  private isEnabled(): boolean {
    return env.ENABLE_EMAIL_TEST_ENDPOINTS && allowedEnvironments.has(env.NODE_ENV);
  }

  private assertEnabled(): void {
    if (!this.isEnabled())
      throw diagnosticError('EMAIL_TEST_ENDPOINTS_DISABLED', 'Endpoint no encontrado.', 404);
  }

  private assertConfigured(): void {
    if (!this.getConfigurationStatus().configured) {
      throw diagnosticError(
        'EMAIL_CONFIGURATION_INCOMPLETE',
        'La configuración de correo está incompleta.',
        503,
      );
    }
  }

  private assertAllowedRecipient(email: string): void {
    const normalized = email.toLowerCase();
    const recipients = splitList(env.EMAIL_TEST_ALLOWED_RECIPIENTS);
    const domains = splitList(env.EMAIL_TEST_ALLOWED_DOMAINS);
    const domain = normalized.split('@')[1] ?? '';
    const allowed = recipients.includes(normalized) || domains.includes(domain);
    if (!allowed) {
      throw diagnosticError(
        'EMAIL_RECIPIENT_NOT_ALLOWED',
        'El destinatario no está permitido para pruebas de correo.',
        403,
      );
    }
  }

  private assertSafeText(value: string, field: string): void {
    if (hasUnsafeCharacters(value)) {
      throw diagnosticError(
        'EMAIL_RECIPIENT_REJECTED',
        `El campo ${field} contiene caracteres no permitidos.`,
        422,
      );
    }
  }

  private async enforceRateLimit(userId: string, scope: string): Promise<void> {
    const bucketKey = `${scope}:${userId}`;
    const count = await this.rateLimiter.increment(
      'email_test',
      bucketKey,
      env.EMAIL_TEST_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (count > env.EMAIL_TEST_RATE_LIMIT_MAX) {
      const retryAfter = this.rateLimiter.remainingSeconds(
        'email_test',
        bucketKey,
        env.EMAIL_TEST_RATE_LIMIT_WINDOW_SECONDS,
      );
      throw diagnosticError(
        'EMAIL_RATE_LIMITED',
        'Se alcanzó el límite de correos de prueba. Intenta nuevamente más tarde.',
        429,
        { retryAfter },
      );
    }
  }

  private normalizeSendResult(
    result: EmailDeliveryResult,
    recipient: string,
  ): EmailDiagnosticsSendResult {
    if (!result.success) {
      const map: Record<string, [EmailDiagnosticsCode, string, number]> = {
        EMAIL_CONFIGURATION_ERROR: [
          'EMAIL_CONFIGURATION_INCOMPLETE',
          'La configuración de correo está incompleta.',
          503,
        ],
        EMAIL_AUTHENTICATION_ERROR: [
          'EMAIL_AUTHENTICATION_FAILED',
          'No fue posible autenticar con el proveedor de correo.',
          503,
        ],
        EMAIL_RECIPIENT_REJECTED: [
          'EMAIL_RECIPIENT_REJECTED',
          'El proveedor rechazó el destinatario.',
          422,
        ],
        EMAIL_RATE_LIMITED: [
          'EMAIL_RATE_LIMITED',
          'Se alcanzó el límite del proveedor de correo.',
          429,
        ],
        EMAIL_TIMEOUT: [
          'EMAIL_PROVIDER_TIMEOUT',
          'El proveedor de correo no respondió a tiempo.',
          504,
        ],
        EMAIL_CONNECTION_ERROR: [
          'EMAIL_PROVIDER_UNAVAILABLE',
          'El proveedor de correo no está disponible.',
          503,
        ],
        EMAIL_DELIVERY_FAILED: [
          'EMAIL_SEND_FAILED',
          'No fue posible enviar el correo de prueba.',
          502,
        ],
        EMAIL_SENDER_REJECTED: [
          'EMAIL_SEND_FAILED',
          'No fue posible enviar el correo de prueba.',
          502,
        ],
        EMAIL_TEMPLATE_ERROR: [
          'EMAIL_TEMPLATE_RENDER_FAILED',
          'No fue posible renderizar la plantilla.',
          500,
        ],
        EMAIL_UNKNOWN_ERROR: [
          'EMAIL_SEND_FAILED',
          'No fue posible enviar el correo de prueba.',
          502,
        ],
      };
      const [code, message, status] = map[result.errorCode ?? 'EMAIL_UNKNOWN_ERROR'];
      throw diagnosticError(code, message, status, { retryAfter: result.retryAfterSeconds });
    }
    console.log('[EmailDiagnostics]', {
      provider: result.provider,
      transport: env.MAIL_PROVIDER === 'mailtrap' ? 'email-api' : 'fake',
      recipient: maskEmail(recipient),
      result: 'accepted',
      durationMs: result.durationMs,
      messageId: result.messageId,
    });
    return {
      provider: result.provider,
      status: 'accepted',
      messageId: result.messageId,
      recipient,
      sentAt: new Date().toISOString(),
    };
  }
}
