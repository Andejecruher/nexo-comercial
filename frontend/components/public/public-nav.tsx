'use client';

import { BrandLockup } from '@/components/brand/brand-logo';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const NAV_LINKS = [
  { label: 'Ejes de atención', href: '/#propuestas' },
  { label: 'Jornadas', href: '/#eventos' },
  { label: 'Galería', href: '/#galeria' },
  { label: 'Voces', href: '/#voces' },
];

const DEFAULT_CTA = { label: 'Registro ciudadano', href: '/#sumate', variant: 'primary' as const };

/**
 * `landing`: transparente sobre el hero oscuro y se vuelve sólido al hacer scroll.
 * `solid`: siempre sólido, para páginas de contenido sin hero (documentos legales).
 */
type PublicNavVariant = 'landing' | 'solid';

export type PublicNavLink = { label: string; href: string };
export type PublicNavCta = { label: string; href: string; variant?: 'primary' | 'teal' };

export function PublicNav({
  variant = 'landing',
  links = NAV_LINKS,
  cta = DEFAULT_CTA,
  homeHref = '/',
}: {
  variant?: PublicNavVariant;
  links?: PublicNavLink[];
  cta?: PublicNavCta;
  homeHref?: string;
}) {
  const [scrolled, setScrolled] = useState(variant === 'solid');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (variant === 'solid') return;
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [variant]);

  return (
    <header
      data-slot="public-nav"
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled ? 'bg-white/95 backdrop-blur-sm shadow-sm' : 'bg-transparent',
      )}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href={homeHref} className="flex items-center group min-w-0">
          <BrandLockup
            variant={scrolled ? 'onLight' : 'onDark'}
            className="h-10 w-auto shrink-0"
            showTagline
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {links.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={cn(
                'text-sm font-semibold transition-colors hover:text-primary',
                scrolled ? 'text-secondary' : 'text-white/80',
              )}
            >
              {label}
            </Link>
          ))}
          <Link
            href={cta.href}
            className={cn(
              'text-sm font-bold px-5 py-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              cta.variant === 'teal'
                ? 'bg-accent-teal hover:bg-accent-teal-hover text-accent-teal-foreground focus-visible:ring-accent-teal'
                : 'bg-primary hover:bg-primary-hover text-white focus-visible:ring-primary',
            )}
          >
            {cta.label}
          </Link>
        </nav>

        {/* Mobile burger */}
        <button
          className={cn('md:hidden', scrolled ? 'text-foreground' : 'text-white')}
          onClick={() => setOpen((o) => !o)}
          aria-label="Menú"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="md:hidden bg-white border-t border-border px-6 py-4 space-y-3"
          >
            {links.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                onClick={() => setOpen(false)}
                className="block text-secondary font-semibold py-1"
              >
                {label}
              </Link>
            ))}
            <Link
              href={cta.href}
              onClick={() => setOpen(false)}
              className={cn(
                'block w-full text-center font-bold px-5 py-2 rounded-full mt-2',
                cta.variant === 'teal'
                  ? 'bg-accent-teal hover:bg-accent-teal-hover text-accent-teal-foreground'
                  : 'bg-primary hover:bg-primary-hover text-white',
              )}
            >
              {cta.label}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
