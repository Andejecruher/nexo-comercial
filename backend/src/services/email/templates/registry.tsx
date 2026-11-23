import * as React from 'react';
import {
  AccountActivatedEmail,
  type AccountActivatedProps,
  accountActivatedSubject,
} from './account-activated';
import {
  EmailDiagnosticsEmail,
  type EmailDiagnosticsProps,
  emailDiagnosticsSubject,
} from './email-diagnostics';
import {
  NewsletterConfirmEmail,
  type NewsletterConfirmProps,
  newsletterConfirmSubject,
} from './newsletter-confirm';
import {
  NewsletterWelcomeEmail,
  type NewsletterWelcomeProps,
  newsletterWelcomeSubject,
} from './newsletter-welcome';
import { NotificationEmail, type NotificationProps, notificationSubject } from './notification';
import {
  PasswordResetEmail,
  type PasswordResetProps,
  passwordResetSubject,
} from './password-reset';
import {
  UserInvitationEmail,
  type UserInvitationProps,
  userInvitationSubject,
} from './user-invitation';

/**
 * Contrato de cada plantilla: componente React Email, asunto derivado de los
 * props y la categoría que se reporta al proveedor.
 */
type TemplateDefinition<TProps> = {
  component: (props: TProps) => React.ReactElement;
  subject: (props: TProps) => string;
  category: string;
};

const define = <TProps,>(definition: TemplateDefinition<TProps>): TemplateDefinition<TProps> =>
  definition;

export const emailTemplates = {
  'user-invitation': define<UserInvitationProps>({
    component: UserInvitationEmail,
    subject: userInvitationSubject,
    category: 'user-invitation',
  }),
  'account-activated': define<AccountActivatedProps>({
    component: AccountActivatedEmail,
    subject: accountActivatedSubject,
    category: 'account-activated',
  }),
  'password-reset': define<PasswordResetProps>({
    component: PasswordResetEmail,
    subject: passwordResetSubject,
    category: 'password-reset',
  }),
  'newsletter-confirm': define<NewsletterConfirmProps>({
    component: NewsletterConfirmEmail,
    subject: newsletterConfirmSubject,
    category: 'newsletter-confirm',
  }),
  'newsletter-welcome': define<NewsletterWelcomeProps>({
    component: NewsletterWelcomeEmail,
    subject: newsletterWelcomeSubject,
    category: 'newsletter-welcome',
  }),
  notification: define<NotificationProps>({
    component: NotificationEmail,
    subject: notificationSubject,
    category: 'notification',
  }),
  'email-diagnostics': define<EmailDiagnosticsProps>({
    component: EmailDiagnosticsEmail,
    subject: emailDiagnosticsSubject,
    category: 'email-diagnostics',
  }),
} as const;

export type EmailTemplateName = keyof typeof emailTemplates;

export type EmailTemplateProps<TName extends EmailTemplateName> =
  (typeof emailTemplates)[TName] extends TemplateDefinition<infer TProps> ? TProps : never;
