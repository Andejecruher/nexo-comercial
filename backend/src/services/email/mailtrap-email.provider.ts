import { env } from '../../config/env.config';
import type {
  EmailAttachment,
  EmailDeliveryResult,
  EmailErrorCode,
  EmailMessage,
  EmailProvider,
} from '../email.types';

function mapMailtrapStatus(status: number): EmailErrorCode {
  if (status === 401 || status === 403) return 'EMAIL_AUTHENTICATION_ERROR';
  if (status === 400 || status === 422) return 'EMAIL_RECIPIENT_REJECTED';
  if (status === 429) return 'EMAIL_RATE_LIMITED';
  if (status >= 500) return 'EMAIL_CONNECTION_ERROR';
  return 'EMAIL_DELIVERY_FAILED';
}

type MailtrapAttachment = Omit<EmailAttachment, 'contentId'> & { content_id?: string };

function mapMailtrapAttachments(
  attachments: EmailMessage['attachments'],
): { attachments: MailtrapAttachment[] } | Record<string, never> {
  if (!attachments?.length) return {};

  return {
    attachments: attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      type: attachment.type,
      disposition: attachment.disposition,
      ...(attachment.contentId ? { content_id: attachment.contentId } : {}),
    })),
  };
}

export class MailtrapEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailDeliveryResult> {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.MAIL_SEND_TIMEOUT_MS ?? 10_000);

    try {
      const response = await fetch(
        env.MAILTRAP_API_URL ?? 'https://send.api.mailtrap.io/api/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.MAILTRAP_API_TOKEN ?? ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: {
              email: env.MAIL_FROM_ADDRESS ?? '',
              name: env.MAIL_FROM_NAME,
            },
            to: [{ email: message.to.email, name: message.to.name ?? '' }],
            // ...(env.MAIL_REPLY_TO_ADDRESS
            //   ? { reply_to: { email: env.MAIL_REPLY_TO_ADDRESS } }
            //   : {}),
            subject: message.subject,
            html: message.html,
            text: message.text,
            category: message.category,
            custom_variables: message.metadata,
            ...mapMailtrapAttachments(message.attachments),
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const rawRetryAfter = response.headers.get('retry-after');
        const parsedRetryAfter = rawRetryAfter !== null ? Number(rawRetryAfter) : undefined;

        return {
          success: false,
          provider: 'mailtrap',
          errorCode: mapMailtrapStatus(response.status),
          retryAfterSeconds:
            parsedRetryAfter !== undefined && Number.isFinite(parsedRetryAfter)
              ? parsedRetryAfter
              : undefined,
          durationMs: Date.now() - started,
        };
      }

      const body = (await response.json()) as { message_ids?: string[] };
      return {
        success: true,
        provider: 'mailtrap',
        messageId: body.message_ids?.[0],
        durationMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          provider: 'mailtrap',
          errorCode: 'EMAIL_TIMEOUT',
          durationMs: Date.now() - started,
        };
      }

      return {
        success: false,
        provider: 'mailtrap',
        errorCode: 'EMAIL_CONNECTION_ERROR',
        durationMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
