import { LegalPrintButton } from '@/components/legal/legal-print-button';
import { LegalToc } from '@/components/legal/legal-toc';
import type { LegalTocItem } from '@/lib/legal-config';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import Link from 'next/link';

type LegalDocumentProps = {
  /** Título principal del documento (h1). */
  title: string;
  /** Frase corta bajo el título, en el encabezado. */
  intro: string;
  /** Fecha de última actualización, en texto. */
  updatedAt: string;
  /** Secciones h2 que alimentan la tabla de contenidos. */
  tocItems: LegalTocItem[];
  children: React.ReactNode;
};

/**
 * Estructura común de las páginas legales: encabezado, tabla de contenidos,
 * cuerpo del documento y pie con navegación e impresión.
 */
export function LegalDocument({ title, intro, updatedAt, tocItems, children }: LegalDocumentProps) {
  return (
    <div className="bg-background">
      <a
        href="#contenido-legal"
        className="legal-no-print sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-60 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Saltar al contenido del documento
      </a>

      {/* Encabezado */}
      <header className="border-b border-border bg-sidebar pt-28 pb-14 text-sidebar-foreground">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-primary-light">
            Documento legal
          </p>
          <h1 className="text-3xl font-black leading-tight text-white md:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-sidebar-foreground/60 md:text-base">
            {intro}
          </p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-sidebar-accent px-4 py-2 text-xs font-semibold text-sidebar-foreground/80">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Última actualización: {updatedAt}
          </p>
        </div>
      </header>

      {/* Cuerpo: TOC + documento */}
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-14 lg:py-16">
        <LegalToc items={tocItems} />

        <article
          id="contenido-legal"
          className="legal-prose max-w-3xl text-[0.95rem] leading-relaxed text-foreground md:text-base"
        >
          {children}
        </article>
      </div>

      {/* Pie del documento */}
      <div className="border-t border-border bg-muted/40">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-secondary transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver a la página principal
          </Link>
          <LegalPrintButton />
        </div>
      </div>
    </div>
  );
}
