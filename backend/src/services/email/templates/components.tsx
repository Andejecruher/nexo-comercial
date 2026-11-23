import { Button, Heading, Link, Section, Text } from '@react-email/components';
import * as React from 'react';
import { brand } from './branding';

export function Title({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Heading
      as="h1"
      style={{
        margin: '0 0 16px',
        fontSize: '22px',
        lineHeight: '30px',
        fontWeight: 'bold',
        color: brand.text,
      }}
    >
      {children}
    </Heading>
  );
}

export function Paragraph({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}): React.ReactElement {
  return (
    <Text
      style={{
        margin: '0 0 16px',
        fontSize: muted ? '14px' : '16px',
        lineHeight: muted ? '22px' : '26px',
        color: muted ? brand.muted : brand.secondary,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * CTA principal. Outlook aplana los radios grandes, por eso se usa uno moderado
 * y padding explícito en lugar de una pastilla.
 */
export function CallToAction({ href, label }: { href: string; label: string }): React.ReactElement {
  return (
    <Section style={{ textAlign: 'center', margin: '28px 0' }}>
      <Button
        href={href}
        style={{
          backgroundColor: brand.primary,
          color: brand.onPrimary,
          fontSize: '16px',
          fontWeight: 'bold',
          textDecoration: 'none',
          borderRadius: '8px',
          padding: '14px 28px',
          display: 'inline-block',
        }}
      >
        {label}
      </Button>
    </Section>
  );
}

/** Enlace en texto plano para clientes que no renderizan el botón. */
export function LinkFallback({ href }: { href: string }): React.ReactElement {
  return (
    <>
      <Text style={{ margin: '0 0 8px', fontSize: '14px', lineHeight: '22px', color: brand.muted }}>
        Si el botón no funciona, copia y pega este enlace en tu navegador:
      </Text>
      <Text
        style={{
          margin: '0 0 20px',
          padding: '12px',
          fontSize: '13px',
          lineHeight: '20px',
          wordBreak: 'break-all',
          backgroundColor: brand.mutedSurface,
          border: `1px solid ${brand.border}`,
          borderRadius: '8px',
        }}
      >
        <Link href={href} style={{ color: brand.primary, textDecoration: 'none' }}>
          {href}
        </Link>
      </Text>
    </>
  );
}

/** Bloque destacado para expiraciones y advertencias de seguridad. */
export function Callout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Section
      style={{
        margin: '0 0 20px',
        padding: '14px 16px',
        backgroundColor: '#FBF4F5',
        borderLeft: `4px solid ${brand.primary}`,
        borderRadius: '6px',
      }}
    >
      <Text style={{ margin: 0, fontSize: '14px', lineHeight: '22px', color: brand.secondary }}>
        {children}
      </Text>
    </Section>
  );
}
