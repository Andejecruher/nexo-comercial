'use client';

import { BrandLogo } from '@/components/brand/brand-logo';
import { legalRoutes } from '@/lib/legal-config';
import { subscribeNewsletter } from '@/lib/newsletter-api';
import { Check, Facebook, Loader2, Mail, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

type NewsletterUiState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'success'; message: string };

const DEFAULT_SITE_LINKS = [
  { label: 'Ejes de atención', href: '/#propuestas' },
  { label: 'Jornadas de atención', href: '/#eventos' },
  { label: 'Galería', href: '/#galeria' },
  { label: 'Voces', href: '/#voces' },
];

const DEFAULT_CONTACT_LINKS = [
  { label: 'Voluntariado social', href: '/#sumate' },
  { label: 'Prensa y medios', href: '/#voces' },
  { label: 'Reporte ciudadano', href: '/#sumate' },
  { label: 'Aviso de privacidad', href: legalRoutes.privacy },
  { label: 'Términos y condiciones', href: legalRoutes.terms },
];

const DEFAULT_SOCIALS: PublicFooterSocial[] = [
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/karinaalvaradoburguete',
    icon: Facebook,
  },
];

export type PublicFooterLink = { label: string; href: string };
export type PublicFooterSocial = { label: string; href: string; icon: LucideIcon };
export type PublicFooterCta = { label: string; href: string };

export function PublicFooter({
  links = DEFAULT_SITE_LINKS,
  contactLinks = DEFAULT_CONTACT_LINKS,
  socials = DEFAULT_SOCIALS,
  cta,
}: {
  links?: PublicFooterLink[];
  contactLinks?: PublicFooterLink[];
  socials?: PublicFooterSocial[];
  cta?: PublicFooterCta;
}) {
  const [email, setEmail] = useState('');
  const [newsletter, setNewsletter] = useState<NewsletterUiState>({ phase: 'idle' });

  async function handleNewsletter(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setNewsletter({ phase: 'loading' });
    const res = await subscribeNewsletter({ email: email.trim(), source: 'footer' });
    if (!res.ok) {
      setNewsletter({ phase: 'error', message: res.message });
      return;
    }
    if (res.data.status === 'pending') {
      setNewsletter({
        phase: 'success',
        message: res.data.message,
      });
      return;
    }
    setNewsletter({
      phase: 'success',
      message: res.data.alreadySubscribed
        ? 'Ya estabas suscrito a nuestras novedades. Gracias por seguir con nosotros.'
        : '¡Suscrito! Gracias por sumarte.',
    });
  }

  return (
    <footer id="contacto" className="bg-sidebar text-sidebar-foreground">
      {/* Newsletter bar */}
      <div className="border-b border-sidebar-border">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div>
              <h3 className="text-xl font-black text-white mb-1">Mantente al tanto</h3>
              <p className="text-sidebar-foreground/50 text-sm">
                Recibe avisos de jornadas de atención, gestión vecinal y participación directamente
                en tu correo.
              </p>
            </div>
            {newsletter.phase === 'success' ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-primary-light font-bold max-w-md text-center sm:text-left">
                <div className="flex items-center justify-center gap-2 shrink-0">
                  <Check className="w-5 h-5 stroke-3 shrink-0" />
                  <span className="text-sm sm:text-base leading-snug">{newsletter.message}</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleNewsletter} className="flex flex-col gap-2 w-full md:w-auto">
                <div className="flex gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:w-72">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sidebar-foreground/40" />
                    <input
                      type="email"
                      required
                      disabled={newsletter.phase === 'loading'}
                      placeholder="Tu correo electrónico"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (newsletter.phase === 'error') setNewsletter({ phase: 'idle' });
                      }}
                      className="w-full pl-10 pr-4 py-3 bg-sidebar-accent border border-sidebar-border rounded-xl text-sm text-sidebar-foreground placeholder-sidebar-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors disabled:opacity-60"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={newsletter.phase === 'loading'}
                    className="bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-bold px-5 py-3 rounded-xl text-sm transition-colors whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-2"
                  >
                    {newsletter.phase === 'loading' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                        Enviando…
                      </>
                    ) : (
                      'Suscribirme'
                    )}
                  </button>
                </div>
                {newsletter.phase === 'error' ? (
                  <p className="text-destructive text-sm md:text-right" role="alert">
                    {newsletter.message}
                  </p>
                ) : null}
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <BrandLogo variant="onDark" label="" className="size-9" />
              <div>
                <div className="text-white font-black text-xl leading-none">
                  Nexo Comercial
                </div>
                <div className="text-sidebar-foreground/40 text-[10px] font-semibold uppercase tracking-widest">
                  Atención y enlace social · Chiapas
                </div>
              </div>
            </div>
            <p className="text-sidebar-foreground/50 text-sm leading-relaxed max-w-xs">
              Una iniciativa de servicio social impulsada por el equipo KAB en Cintalapa de
              Figueroa.
            </p>
            {cta ? (
              <Link
                href={cta.href}
                className="mt-5 inline-flex items-center justify-center bg-accent-teal hover:bg-accent-teal-hover text-accent-teal-foreground font-black text-sm px-5 py-2.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
              >
                {cta.label}
              </Link>
            ) : null}
            {/* Social */}
            <div id="redes" className="flex items-center gap-3 mt-6 scroll-mt-24">
              {socials.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  target="_blank"
                  rel="noopener noreferrer"
                  href={href}
                  className="w-8 h-8 rounded-lg bg-sidebar-accent hover:bg-primary/30 flex items-center justify-center text-sidebar-foreground/50 hover:text-white transition-colors"
                  aria-label={label}
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-white font-black text-sm uppercase tracking-wide mb-4">Sitio</h4>
            <ul className="space-y-2">
              {links.map(({ label, href }) => (
                <li key={label}>
                  <a
                    href={href}
                    className="text-sidebar-foreground/50 hover:text-white text-sm transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-black text-sm uppercase tracking-wide mb-4">Contacto</h4>
            <ul className="space-y-2">
              {contactLinks.map(({ label, href }) => (
                <li key={label}>
                  <a
                    href={href}
                    className="text-sidebar-foreground/50 hover:text-white text-sm transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-sidebar-border pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sidebar-foreground/30 text-xs">
            © {new Date().getFullYear()} Nexo Comercial · Cintalapa de Figueroa, Chiapas. Todos los
            derechos reservados.
          </p>
          <p className="text-sidebar-foreground/20 text-xs">
            Información de contacto y enlaces sujetos a actualización. Consulta el{' '}
            <a href={legalRoutes.privacy} className="underline hover:text-sidebar-foreground/50">
              aviso de privacidad
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
