import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPageLoader, AuthPageShell } from '@/components/auth/auth-page-shell';
import { NewsletterTokenAction } from '@/components/newsletter/newsletter-token-action';

export const metadata: Metadata = {
  title: 'Baja del boletín | Voz Ciudadana',
  description: 'Dejá de recibir el boletín de Voz Ciudadana.',
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
