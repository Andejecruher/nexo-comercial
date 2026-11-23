export type EmailAddress = { email: string; name?: string };

export type EmailAttachment = {
  filename: string;
  /** Contenido codificado en base64. */
  content: string;
  type: string;
  /** `inline` requiere `contentId` y se referencia como `cid:<contentId>`. */
  disposition: 'inline' | 'attachment';
  contentId?: string;
};

export type EmailMessage = {
  to: EmailAddress;
  subject: string;
  html: string;
  text: string;
  category?: string;
  metadata?: Record<string, string>;
  attachments?: EmailAttachment[];
};

export type EmailErrorCode =
  | 'EMAIL_CONFIGURATION_ERROR'
  | 'EMAIL_AUTHENTICATION_ERROR'
  | 'EMAIL_SENDER_REJECTED'
  | 'EMAIL_RECIPIENT_REJECTED'
  | 'EMAIL_CONNECTION_ERROR'
  | 'EMAIL_TIMEOUT'
  | 'EMAIL_RATE_LIMITED'
  | 'EMAIL_DELIVERY_FAILED'
  | 'EMAIL_TEMPLATE_ERROR'
  | 'EMAIL_UNKNOWN_ERROR';

export type EmailDeliveryResult = {
  success: boolean;
  provider: 'mailtrap' | 'fake';
  messageId?: string;
  errorCode?: EmailErrorCode;
  retryAfterSeconds?: number;
  durationMs: number;
};

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailDeliveryResult>;
}
