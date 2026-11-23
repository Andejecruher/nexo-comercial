import * as React from 'react';
import { BrandLayout } from './BrandLayout';
import { CallToAction, Callout, LinkFallback, Paragraph, Title } from './components';

export type PasswordResetProps = {
  recipientName: string;
  platformName: string;
  resetUrl: string;
  expirationDate: string;
  expirationTime: string;
  supportEmail?: string;
};

export const passwordResetSubject = (): string => 'Restablece tu contraseña de Voz Ciudadana';

export function PasswordResetEmail(props: PasswordResetProps): React.ReactElement {
  const recipientName = props.recipientName || 'integrante del equipo';

  return (
    <BrandLayout
      preview={`Restablece tu contraseña de ${props.platformName}`}
      eyebrow="Seguridad de la cuenta"
    >
      <Title>Restablece tu contraseña</Title>
      <Paragraph>Hola {recipientName},</Paragraph>
      <Paragraph>
        Recibimos una solicitud para restablecer la contraseña de tu cuenta de {props.platformName}.
        Crea una contraseña nueva desde el siguiente enlace de un solo uso.
      </Paragraph>
      <CallToAction href={props.resetUrl} label="Crear nueva contraseña" />
      <Callout>
        Este enlace expira el {props.expirationDate} a las {props.expirationTime} y solo puede
        usarse una vez.
      </Callout>
      <LinkFallback href={props.resetUrl} />
      <Paragraph muted>
        Si no solicitaste este cambio, ignora este mensaje: tu contraseña actual seguirá siendo
        válida.
        {props.supportEmail ? ` Ante cualquier duda, escribe a ${props.supportEmail}.` : ''}
      </Paragraph>
    </BrandLayout>
  );
}
