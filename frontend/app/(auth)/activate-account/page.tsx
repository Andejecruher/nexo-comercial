import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ActivateAccountForm } from '@/components/activate-account/ActivateAccountForm';
import { AuthPageLoader, AuthPageShell } from '@/components/shared/auth-page-shell';

export const metadata: Metadata = {
  title: 'Activar cuenta | Nexo Comercial',
  description: 'Configurá de forma segura tu acceso a Nexo Comercial.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ActivateAccountPage() {
  return (
    <AuthPageShell
      eyebrow="Acceso seguro"
      cardEyebrow="Bienvenida al equipo"
      title="Configurá tu acceso"
      description="Creá una contraseña para proteger tu cuenta y comenzar a participar."
      footnote="Este enlace es personal y de un solo uso."
    >
      <Suspense fallback={<AuthPageLoader />}>
        <ActivateAccountForm />
      </Suspense>
    </AuthPageShell>
  );
}
