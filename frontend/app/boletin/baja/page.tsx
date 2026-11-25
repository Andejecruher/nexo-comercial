import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPageLoader, AuthPageShell } from '@/components/shared/auth-page-shell';
import { NewsletterTokenAction } from '@/components/boletin/newsletter-token-action';

export const metadata: Metadata = {
  title: 'Baja del boletín | Nexo Comercial',
  description: 'Dejá de recibir el boletín de Nexo Comercial.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function BajaBoletinPage() {
  return (
    <AuthPageShell
      eyebrow="Boletín"
      cardEyebrow="Cancelar suscripción"
      title="Darte de baja del boletín"
      description="Estamos procesando tu solicitud para dejar de enviarte correos."
    >
      <Suspense fallback={<AuthPageLoader />}>
        <NewsletterTokenAction action="unsubscribe" />
      </Suspense>
    </AuthPageShell>
  );
}
