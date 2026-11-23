import type { EmailDeliveryResult, EmailMessage, EmailProvider } from '../email.types';

export class FakeEmailProvider implements EmailProvider {
  public readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<EmailDeliveryResult> {
    this.sent.push(message);
    return Promise.resolve({
      success: true,
      provider: 'fake',
      messageId: `fake-${this.sent.length}`,
      durationMs: 0,
    });
  }
}
