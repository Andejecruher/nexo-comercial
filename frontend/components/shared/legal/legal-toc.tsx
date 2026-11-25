'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { LegalTocItem } from '@/lib/shared/legal-config';
import { cn } from '@/lib/shared/utils';
import { useEffect, useState } from 'react';

type LegalTocProps = {
  items: LegalTocItem[];
};

/**
 * Tabla de contenidos del documento legal.
 * Escritorio: barra lateral fija (sticky). Móvil: acordeón colapsable.
 * La sección visible se resalta con IntersectionObserver.
 */
export function LegalToc({ items }: LegalTocProps) {
  const activeId = useActiveSection(items);

  return (
    <>
      {/* Móvil / tablet: acordeón */}
      <nav aria-label="Contenido del documento" className="legal-no-print lg:hidden">
        <Accordion
          type="single"
          collapsible
          className="rounded-xl border border-border bg-muted/40"
        >
          <AccordionItem value="toc" className="border-b-0">
            <AccordionTrigger className="px-4 text-sm font-black text-secondary uppercase tracking-wide hover:no-underline">
              Contenido
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <TocList items={items} activeId={activeId} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </nav>

      {/* Escritorio: lateral fija */}
      <nav
        aria-label="Contenido del documento"
        className="legal-no-print hidden lg:sticky lg:top-24 lg:block lg:self-start"
      >
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
          Contenido
        </p>
        <TocList items={items} activeId={activeId} />
      </nav>
    </>
  );
}

function TocList({ items, activeId }: { items: LegalTocItem[]; activeId: string | null }) {
  return (
    <ol className="space-y-1 border-l border-border">
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={isActive ? 'location' : undefined}
              className={cn(
                '-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors',
                isActive
                  ? 'border-primary font-bold text-primary'
                  : 'border-transparent text-muted-foreground hover:border-primary-light hover:text-secondary',
              )}
            >
              {item.label}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** Devuelve el id de la sección visible más cercana a la parte superior. */
function useActiveSection(items: LegalTocItem[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // El margen superior compensa el nav fijo y activa la sección al entrar.
      { rootMargin: '-96px 0px -65% 0px', threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  return activeId;
}
