import { PublicFooter } from '@/components/public/public-footer';
import { PublicNav } from '@/components/public/public-nav';

/**
 * Layout de las páginas públicas de contenido (documentos legales).
 * Usa el nav en variante sólida porque estas páginas no tienen hero oscuro.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNav variant="solid" />
      <main>{children}</main>
      <PublicFooter />
    </>
  );
}
