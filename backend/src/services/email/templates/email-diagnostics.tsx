import { Row, Section, Text } from '@react-email/components';
import * as React from 'react';
import { BrandLayout } from './BrandLayout';
import { Paragraph, Title } from './components';
import { brand } from './branding';

export type EmailDiagnosticsProps = {
  platformName: string;
  environment: string;
  title: string;
  message: string;
  sentAtIso: string;
  /** Aclara que los enlaces del correo previsualizado no son válidos. */
  disclaimer?: string;
};

export const emailDiagnosticsSubject = (props: EmailDiagnosticsProps): string => props.title;

function MetaRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <Row>
      <Text style={{ margin: '0 0 6px', fontSize: '13px', lineHeight: '20px', color: brand.muted }}>
        <strong style={{ color: brand.secondary }}>{label}:</strong> {value}
      </Text>
    </Row>
  );
}

export function EmailDiagnosticsEmail(props: EmailDiagnosticsProps): React.ReactElement {
  return (
    <BrandLayout preview={`Correo de prueba — ${props.title}`} eyebrow="Correo de prueba">
      <Title>{props.title}</Title>
      <Paragraph>{props.message}</Paragraph>
      <Section
        style={{
          margin: '0 0 20px',
          padding: '14px 16px',
          backgroundColor: brand.mutedSurface,
          border: `1px solid ${brand.border}`,
          borderRadius: '8px',
        }}
      >
        <MetaRow label="Plataforma" value={props.platformName} />
        <MetaRow label="Ambiente" value={props.environment} />
        <MetaRow label="Fecha" value={props.sentAtIso} />
      </Section>
      {props.disclaimer ? <Paragraph muted>{props.disclaimer}</Paragraph> : null}
      <Paragraph muted>
        Este mensaje fue generado desde el endpoint administrativo de diagnóstico. No es necesario
        realizar ninguna acción.
      </Paragraph>
    </BrandLayout>
  );
}
