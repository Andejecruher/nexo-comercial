import { PublicFooter } from '@/components/shared/public/public-footer';
import { PublicNav } from '@/components/shared/public/public-nav';

/**
 * Layout de las páginas públicas de contenido (documentos legales).
 * Usa el nav en variante sólida porque estas páginas no tienen hero oscuro.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNav />
      <main>{children}</main>
      <PublicFooter />
    </>
  );
}
