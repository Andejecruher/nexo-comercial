import { LegalDocument } from '@/components/legal/legal-document';
import { TerminosContent, terminosToc } from '@/components/legal/terminos-content';
import { legalConfig, legalRoutes } from '@/lib/legal-config';
import { createPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = createPageMetadata({
  title: 'Términos y Condiciones de Uso',
  description:
    'Términos y Condiciones de Uso de la plataforma Nexo Comercial: registro, requisitos de edad, uso de la información, propiedad intelectual, responsabilidad y legislación aplicable.',
  path: legalRoutes.terms,
  openGraphTitle: 'Términos y Condiciones — Nexo Comercial',
});

export default function TerminosCondicionesPage() {
  return (
    <LegalDocument
      title="Términos y Condiciones de Uso"
      intro="Condiciones que rigen el registro y el uso de la plataforma Nexo Comercial. Al utilizar el sitio, aceptas estos términos."
      updatedAt={legalConfig.lastUpdated}
      tocItems={terminosToc}
    >
      <TerminosContent />
    </LegalDocument>
  );
}
