import { JovenesPageView } from '@/components/jovenes/jovenes-page-view';
import { createPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = createPageMetadata({
  title: 'Jóvenes Cintalapa — El futuro es joven | Nexo Comercial',
  description:
    'Becas, primer empleo, emprendimiento, deporte y cultura para las juventudes de Cintalapa de Figueroa. Participa, registra tu propuesta y activa tu barrio.',
  path: '/jovenes',
});

export default function JovenesPage() {
  return <JovenesPageView />;
}
