import type { Metadata } from 'next';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Recuperar contraseña | Nexo Comercial',
  description: 'Solicitá un enlace para restablecer tu contraseña de Nexo Comercial.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell
      eyebrow="Acceso seguro"
      cardEyebrow="Recuperar acceso"
      title="¿Olvidaste tu contraseña?"
      description="Escribí el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva."
      footnote="Por seguridad, el enlace es personal y de un solo uso."
    >
      <ForgotPasswordForm />
    </AuthPageShell>
  );
}
