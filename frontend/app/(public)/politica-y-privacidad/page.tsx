import {
  AvisoPrivacidadContent,
  avisoPrivacidadToc,
} from '@/components/politica-y-privacidad/aviso-privacidad-content';
import { LegalDocument } from '@/components/shared/legal/legal-document';
import { legalConfig, legalRoutes } from '@/lib/shared/legal-config';
import { createPageMetadata } from '@/lib/shared/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = createPageMetadata({
  title: 'Aviso de Privacidad',
  description:
    'Aviso de Privacidad de Nexo Comercial: qué datos personales recabamos, con qué finalidades los tratamos, cuándo se transfieren y cómo ejercer tus derechos ARCO conforme a la LFPDPPP.',
  path: legalRoutes.privacy,
  openGraphTitle: 'Aviso de Privacidad — Nexo Comercial',
});

export default function PoliticaPrivacidadPage() {
  return (
    <LegalDocument
      title="Aviso de Privacidad"
      intro="Tratamos tus datos personales con transparencia y conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares."
      updatedAt={legalConfig.lastUpdated}
      tocItems={avisoPrivacidadToc}
    >
      <AvisoPrivacidadContent />
    </LegalDocument>
  );
}
