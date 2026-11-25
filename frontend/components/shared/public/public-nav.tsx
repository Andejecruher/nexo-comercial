'use client';

import { BrandLockup } from '@/components/shared/brand/brand-logo';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const NAV_LINKS = [
  { label: 'Aviso de privacidad', href: '/politica-y-privacidad' },
  { label: 'Términos y condiciones', href: '/terminos-y-condiciones' },
];

const DEFAULT_CTA = { label: 'Iniciar sesión', href: '/login' };

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const links = NAV_LINKS;
  const cta = DEFAULT_CTA;

  return (
    <header
      data-slot="public-nav"
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-white/95 backdrop-blur-sm shadow-sm"
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center group min-w-0">
          <BrandLockup variant="onLight" className="h-10 w-auto shrink-0" showTagline />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {links.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="text-sm font-semibold transition-colors hover:text-primary text-secondary"
            >
              {label}
            </Link>
          ))}
          <Link
            href={cta.href}
            className="text-sm font-bold px-5 py-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 bg-primary hover:bg-primary-hover text-white focus-visible:ring-primary"
          >
            {cta.label}
          </Link>
        </nav>

        {/* Mobile burger */}
        <button
          className="md:hidden text-foreground"
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
              className="block w-full text-center font-bold px-5 py-2 rounded-full mt-2 bg-primary hover:bg-primary-hover text-white"
            >
              {cta.label}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
