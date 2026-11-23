import * as React from 'react';
import { BrandLayout } from './BrandLayout';
import { CallToAction, LinkFallback, Paragraph, Title } from './components';

export type AccountActivatedProps = {
  recipientName: string;
  platformName: string;
  loginUrl: string;
};

export const accountActivatedSubject = (): string => 'Tu cuenta de Voz Ciudadana está activa';

export function AccountActivatedEmail(props: AccountActivatedProps): React.ReactElement {
  const recipientName = props.recipientName || 'integrante del equipo';

  return (
    <BrandLayout
      preview={`Tu cuenta de ${props.platformName} quedó activa`}
      eyebrow="Bienvenida al equipo"
    >
      <Title>¡Tu cuenta está activa!</Title>
      <Paragraph>Hola {recipientName},</Paragraph>
      <Paragraph>
        Tu cuenta de {props.platformName} quedó activa. Ya puedes ingresar al panel para dar
        seguimiento a reportes, gestionar tu comunidad y colaborar con el equipo.
      </Paragraph>
      <CallToAction href={props.loginUrl} label="Ingresar a la plataforma" />
      <LinkFallback href={props.loginUrl} />
      <Paragraph muted>
        Por seguridad, no compartas tu contraseña con nadie. Si no fuiste tú quien activó esta
        cuenta, contacta de inmediato al equipo administrador.
      </Paragraph>
    </BrandLayout>
  );
}
