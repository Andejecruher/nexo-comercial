import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPageLoader, AuthPageShell } from '@/components/auth/auth-page-shell';
import { NewsletterTokenAction } from '@/components/newsletter/newsletter-token-action';

export const metadata: Metadata = {
  title: 'Confirmar suscripción | Voz Ciudadana',
  description: 'Confirmá tu correo para recibir el boletín de Voz Ciudadana.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ConfirmarBoletinPage() {
  return (
    <AuthPageShell
      eyebrow="Boletín"
      cardEyebrow="Confirmación de correo"
      title="Confirmá tu suscripción"
      description="Estamos verificando tu enlace para activar la suscripción al boletín."
    >
      <Suspense fallback={<AuthPageLoader />}>
        <NewsletterTokenAction action="confirm" />
      </Suspense>
    </AuthPageShell>
  );
}
