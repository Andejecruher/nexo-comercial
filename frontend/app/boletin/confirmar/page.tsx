import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPageLoader, AuthPageShell } from '@/components/shared/auth-page-shell';
import { NewsletterTokenAction } from '@/components/boletin/newsletter-token-action';

export const metadata: Metadata = {
  title: 'Confirmar suscripción | Nexo Comercial',
  description: 'Confirmá tu correo para recibir el boletín de Nexo Comercial.',
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
