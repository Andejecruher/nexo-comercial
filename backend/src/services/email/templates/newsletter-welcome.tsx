import { Link, Text } from '@react-email/components';
import * as React from 'react';
import { BrandLayout } from './BrandLayout';
import { CallToAction, Paragraph, Title } from './components';
import { brand } from './branding';

export type NewsletterWelcomeProps = {
  recipientName?: string;
  platformName: string;
  siteUrl: string;
  unsubscribeUrl: string;
};

export const newsletterWelcomeSubject = (): string => 'Tu suscripción al boletín está activa';

export function NewsletterWelcomeEmail(props: NewsletterWelcomeProps): React.ReactElement {
  const greeting = props.recipientName ? `Hola ${props.recipientName},` : 'Hola,';

  return (
    <BrandLayout
      preview={`Ya estás suscrito al boletín de ${props.platformName}`}
      eyebrow="Suscripción confirmada"
    >
      <Title>¡Suscripción confirmada!</Title>
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>
        Gracias por confirmar tu correo. A partir de ahora recibirás las noticias, convocatorias y
        avances de {props.platformName} directamente en tu bandeja de entrada.
      </Paragraph>
      <CallToAction href={props.siteUrl} label="Visitar el sitio" />
      <Text style={{ margin: 0, fontSize: '13px', lineHeight: '20px', color: brand.muted }}>
        ¿Ya no quieres recibir el boletín? Puedes{' '}
        <Link
          href={props.unsubscribeUrl}
          style={{ color: brand.primary, textDecoration: 'underline' }}
        >
          darte de baja
        </Link>{' '}
        en cualquier momento.
      </Text>
    </BrandLayout>
  );
}
