'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MailCheck, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { passwordResetApi } from '@/lib/shared/password-reset-api';

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email('Ingresá un email válido'),
});

type FormValues = z.infer<typeof ForgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [submittedEmail, setSubmittedEmail] = useState<string>();
  const [serverError, setServerError] = useState<string>();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(
      ForgotPasswordSchema as unknown as Parameters<typeof zodResolver>[0],
    ) as Resolver<FormValues>,
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(undefined);
    const response = await passwordResetApi.request(values.email);

    if (!response.ok) {
      setServerError(
        response.status === 429
          ? 'Recibimos demasiadas solicitudes. Esperá unos minutos e intentá de nuevo.'
          : 'No pudimos procesar tu solicitud. Intentá nuevamente en unos minutos.',
      );
      return;
    }

    setSubmittedEmail(values.email);
  };

  // Confirmación deliberadamente neutra: no revela si el correo está registrado.
  if (submittedEmail) {
    return (
      <div className="py-3 text-center" role="status" aria-live="polite">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="size-7" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Revisá tu correo</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Si <strong className="break-all text-foreground">{submittedEmail}</strong> está
          registrado, te enviamos un enlace para crear una contraseña nueva. Revisá también la
          carpeta de spam.
        </p>
        <Button asChild className="mt-6 rounded-full">
          <Link href="/login">Volver a iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="forgot-email">Correo electrónico</Label>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'forgot-email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="forgot-email-error" role="alert" className="text-xs text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      {serverError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}

      <Button className="w-full rounded-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Enviando enlace…
          </>
        ) : (
          <>
            <Send className="mr-2 size-4" />
            Enviarme el enlace
          </>
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
