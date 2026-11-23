import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPageLoader, AuthPageShell } from '@/components/auth/auth-page-shell';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Restablecer contraseña | Voz Ciudadana',
  description: 'Creá una contraseña nueva para tu cuenta de Voz Ciudadana.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ResetPasswordPage() {
  return (
    <AuthPageShell
      eyebrow="Acceso seguro"
      cardEyebrow="Seguridad de la cuenta"
      title="Creá tu nueva contraseña"
      description="Elegí una contraseña que no uses en otros servicios para proteger tu cuenta."
      footnote="Este enlace es personal y de un solo uso."
    >
      <Suspense fallback={<AuthPageLoader />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthPageShell>
  );
}
