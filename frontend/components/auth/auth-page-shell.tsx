import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand/brand-logo';

type AuthPageShellProps = {
  /** Bajada breve bajo el logo, en mayúsculas. */
  eyebrow: string;
  /** Etiqueta de sección sobre el título de la tarjeta. */
  cardEyebrow: string;
  title: string;
  description: string;
  footnote?: string;
  children: ReactNode;
};

/** Cromo compartido por las pantallas públicas de acceso y recuperación. */
export function AuthPageShell({
  eyebrow,
  cardEyebrow,
  title,
  description,
  footnote,
  children,
}: AuthPageShellProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fbf7f4] px-4 py-10">
      <div
        aria-hidden
        className="absolute -left-24 top-10 size-72 rounded-full bg-primary/8 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -right-24 bottom-0 size-80 rounded-full bg-[#c94f68]/10 blur-3xl"
      />
      <div className="relative w-full max-w-md">
        <header className="mb-7 flex flex-col items-center gap-3 text-center">
          <BrandLogo size="xl" label="" />
          <div>
            <p className="text-xl font-black tracking-tight text-foreground">Nexo Comercial</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-primary">
              {eyebrow}
            </p>
          </div>
        </header>
        <section className="rounded-3xl border border-primary/10 bg-card p-6 shadow-[0_24px_70px_-35px_rgba(61,13,22,0.45)] sm:p-8">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              {cardEyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-foreground">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          {children}
        </section>
        {footnote ? (
          <p className="mt-5 text-center text-xs text-muted-foreground">{footnote}</p>
        ) : null}
      </div>
    </main>
  );
}

export function AuthPageLoader() {
  return (
    <div className="flex justify-center py-12">
      <span
        className="size-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
        aria-label="Cargando"
      />
    </div>
  );
}
