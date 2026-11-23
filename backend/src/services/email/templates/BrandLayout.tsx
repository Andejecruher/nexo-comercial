import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { env } from '../../../config/env.config';
import {
  BRAND_LOCATION,
  BRAND_NAME,
  CONTENT_WIDTH,
  LOGO_CID,
  LOGO_SIZE,
  brand,
  fontStack,
  frontendUrl,
} from './branding';

export type BrandLayoutProps = {
  /** Texto de vista previa en la bandeja de entrada. */
  preview: string;
  /** Bajada que acompaña al logo en el encabezado guinda. */
  eyebrow: string;
  children: React.ReactNode;
};

const bodyStyle: React.CSSProperties = {
  margin: 0,
  padding: '24px 0',
  backgroundColor: brand.mutedSurface,
  color: brand.text,
  fontFamily: fontStack,
};

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: `${CONTENT_WIDTH}px`,
  margin: '0 auto',
  backgroundColor: brand.surface,
  border: `1px solid ${brand.border}`,
  borderRadius: '16px',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  backgroundColor: brand.primary,
  padding: '24px 32px',
};

const contentStyle: React.CSSProperties = {
  padding: '32px',
};

const footerStyle: React.CSSProperties = {
  padding: '24px 32px 28px',
  backgroundColor: brand.mutedSurface,
  borderTop: `1px solid ${brand.border}`,
};

const footerTextStyle: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: '12px',
  lineHeight: '18px',
  color: brand.muted,
};

const footerLinkStyle: React.CSSProperties = {
  color: brand.primary,
  textDecoration: 'underline',
};

/**
 * Cromo compartido por todos los correos transaccionales: encabezado guinda con
 * el logo, cuerpo de 600px y pie legal. Las plantillas solo aportan contenido.
 */
export function BrandLayout({ preview, eyebrow, children }: BrandLayoutProps): React.ReactElement {
  const year = new Date().getFullYear();
  const supportEmail = env.MAIL_SUPPORT_EMAIL;

  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Img
              src={`cid:${LOGO_CID}`}
              alt={BRAND_NAME}
              width={LOGO_SIZE}
              height={LOGO_SIZE}
              style={{
                width: `${LOGO_SIZE}px`,
                height: `${LOGO_SIZE}px`,
                display: 'block',
                border: 0,
                outline: 'none',
                textDecoration: 'none',
              }}
            />
            <Text
              style={{
                margin: '14px 0 0',
                fontSize: '18px',
                lineHeight: '24px',
                fontWeight: 'bold',
                color: brand.onPrimary,
              }}
            >
              {env.MAIL_PLATFORM_NAME}
            </Text>
            <Text
              style={{
                margin: '4px 0 0',
                fontSize: '11px',
                lineHeight: '16px',
                letterSpacing: '1.6px',
                textTransform: 'uppercase',
                fontWeight: 'bold',
                color: '#F0D9DE',
              }}
            >
              {eyebrow}
            </Text>
          </Section>

          <Section style={contentStyle}>{children}</Section>

          <Section style={footerStyle}>
            <Text style={{ ...footerTextStyle, fontWeight: 'bold', color: brand.secondary }}>
              {env.MAIL_PLATFORM_NAME} — {BRAND_LOCATION}
            </Text>
            {supportEmail ? (
              <Text style={footerTextStyle}>
                ¿Necesitas ayuda? Escríbenos a{' '}
                <Link href={`mailto:${supportEmail}`} style={footerLinkStyle}>
                  {supportEmail}
                </Link>
              </Text>
            ) : null}
            <Text style={footerTextStyle}>
              <Link href={frontendUrl('/politica-y-privacidad')} style={footerLinkStyle}>
                Aviso de privacidad
              </Link>
              {'  ·  '}
              <Link href={frontendUrl('/terminos-y-condiciones')} style={footerLinkStyle}>
                Términos y condiciones
              </Link>
            </Text>
            <Hr style={{ borderColor: brand.border, margin: '14px 0 10px' }} />
            <Text style={{ ...footerTextStyle, margin: 0 }}>
              © {year} {env.MAIL_PLATFORM_NAME}. Todos los derechos reservados.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
