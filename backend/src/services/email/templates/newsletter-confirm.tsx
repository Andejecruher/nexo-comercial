import * as React from 'react';
import { BrandLayout } from './BrandLayout';
import { CallToAction, Callout, LinkFallback, Paragraph, Title } from './components';

export type NewsletterConfirmProps = {
  recipientName?: string;
  platformName: string;
  confirmUrl: string;
  expirationDate: string;
  expirationTime: string;
};

export const newsletterConfirmSubject = (): string => 'Confirma tu suscripción al boletín';

export function NewsletterConfirmEmail(props: NewsletterConfirmProps): React.ReactElement {
  const greeting = props.recipientName ? `Hola ${props.recipientName},` : 'Hola,';

  return (
    <BrandLayout
      preview={`Confirma tu correo para recibir el boletín de ${props.platformName}`}
      eyebrow="Confirmación de correo"
    >
      <Title>Confirma tu suscripción</Title>
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>
        Recibimos una solicitud para suscribir este correo al boletín de {props.platformName}.
        Confirma que eres tú para empezar a recibir noticias, convocatorias y avances de la gestión.
      </Paragraph>
      <CallToAction href={props.confirmUrl} label="Confirmar mi suscripción" />
      <Callout>
        Este enlace expira el {props.expirationDate} a las {props.expirationTime}.
      </Callout>
      <LinkFallback href={props.confirmUrl} />
      <Paragraph muted>
        Si no solicitaste esta suscripción, ignora este mensaje y no recibirás ningún correo.
      </Paragraph>
    </BrandLayout>
  );
}
