import * as React from 'react';
import { BrandLayout } from './BrandLayout';
import { CallToAction, Callout, LinkFallback, Paragraph, Title } from './components';

export type UserInvitationProps = {
  recipientName: string;
  platformName: string;
  activationUrl: string;
  expirationDate: string;
  expirationTime: string;
  supportEmail?: string;
  invitedByName?: string;
  isResend?: boolean;
};

export const userInvitationSubject = (props: UserInvitationProps): string =>
  props.isResend
    ? 'Nueva invitación para acceder a Nexo Comercial'
    : 'Te invitaron a formar parte de Nexo Comercial';

export function UserInvitationEmail(props: UserInvitationProps): React.ReactElement {
  const recipientName = props.recipientName || 'integrante del equipo';
  const invitedBy = props.invitedByName ? `${props.invitedByName} te invitó` : 'Te invitaron';

  return (
    <BrandLayout
      preview={`Configura tu acceso a ${props.platformName}`}
      eyebrow="Invitación al equipo"
    >
      <Title>Configura tu acceso</Title>
      <Paragraph>Hola {recipientName},</Paragraph>
      <Paragraph>
        {invitedBy} a formar parte del equipo de {props.platformName}. Para proteger tu cuenta,
        configura tu acceso desde el siguiente enlace de un solo uso.
      </Paragraph>
      <CallToAction href={props.activationUrl} label="Configurar mi acceso" />
      <Callout>
        Este enlace expira el {props.expirationDate} a las {props.expirationTime}.
      </Callout>
      <LinkFallback href={props.activationUrl} />
      <Paragraph muted>
        Si no reconoces esta invitación, ignora este mensaje.
        {props.supportEmail ? ` Si necesitas ayuda, escribe a ${props.supportEmail}.` : ''}
      </Paragraph>
    </BrandLayout>
  );
}
