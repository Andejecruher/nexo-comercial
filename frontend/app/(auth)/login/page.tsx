import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import { BrandLogo } from '@/components/brand/brand-logo';

export const metadata: Metadata = {
  title: 'Iniciar sesión | Nexo Comercial',
  description: 'Acceso al panel administrativo de Nexo Comercial.',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <BrandLogo size="xl" label="" />
          <div className="text-center">
            <h1 className="text-xl font-black text-foreground tracking-tight">Nexo Comercial</h1>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest mt-0.5">
              Panel Administrativo
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-foreground">Iniciar sesión</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Ingresá tus credenciales para continuar
            </p>
          </div>

          {/* Suspense requerido por useSearchParams */}
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
