'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthStatus } from '@/components/auth/auth-status';
import { PasswordField } from '@/components/auth/password-field';
import { Button } from '@/components/ui/button';
import {
  passwordResetApi,
  type PasswordResetFailureReason,
  type PasswordResetValidation,
} from '@/lib/password-reset-api';

const PASSWORD_MIN_LENGTH = 8;
const ResetPasswordSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH, 'Usá al menos 8 caracteres'),
    passwordConfirmation: z.string().min(1, 'Confirmá tu contraseña'),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirmation'],
  });

type FormValues = z.infer<typeof ResetPasswordSchema>;

type ViewState =
  | { kind: 'missing' }
  | { kind: 'validating' }
  | { kind: 'valid'; reset: Extract<PasswordResetValidation, { valid: true }> }
  | { kind: 'failure'; reason: PasswordResetFailureReason }
  | { kind: 'unexpected' }
  | { kind: 'success' };

const failureCopy: Record<PasswordResetFailureReason, { title: string; body: string }> = {
  invalid: {
    title: 'Este enlace no es válido',
    body: 'El enlace fue alterado o ya no corresponde a una solicitud vigente. Pedí uno nuevo desde la pantalla de acceso.',
  },
  expired: {
    title: 'El enlace venció',
    body: 'Por seguridad los enlaces caducan. Solicitá uno nuevo para restablecer tu contraseña.',
  },
  used: {
    title: 'El enlace ya fue utilizado',
    body: 'Este enlace era de un solo uso. Si ya cambiaste tu contraseña, ingresá con ella.',
  },
};

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const requestStarted = useRef(false);
  const [resetToken, setResetToken] = useState<string>();
  const [state, setState] = useState<ViewState>({ kind: 'validating' });
  const [serverError, setServerError] = useState<string>();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(
      ResetPasswordSchema as unknown as Parameters<typeof zodResolver>[0],
    ) as Resolver<FormValues>,
  });

  useEffect(() => {
    if (requestStarted.current) return;
    requestStarted.current = true;

    const token = searchParams.get('token')?.trim();
    if (!token) {
      setState({ kind: 'missing' });
      return;
    }
    setResetToken(token);

    void passwordResetApi.validate(token).then((response) => {
      // Saca el secreto del historial del navegador sin persistirlo en otro lado.
      window.history.replaceState(window.history.state, '', '/reset-password');
      if (!response.ok) {
        setState({ kind: 'unexpected' });
        return;
      }
      if (!response.data.valid) {
        setState({ kind: 'failure', reason: response.data.reason });
        return;
      }
      setState({ kind: 'valid', reset: response.data });
    });
  }, [searchParams]);

  const onSubmit = async (values: FormValues) => {
    if (isSubmitting || !resetToken) return;
    setServerError(undefined);

    const response = await passwordResetApi.reset(
      resetToken,
      values.password,
      values.passwordConfirmation,
    );

    if (!response.ok) {
      if (response.status === 409) setState({ kind: 'failure', reason: 'used' });
      else if (response.status === 410) setState({ kind: 'failure', reason: 'expired' });
      else if (response.status === 400) setState({ kind: 'failure', reason: 'invalid' });
      else
        setServerError('No pudimos actualizar tu contraseña. Intentá nuevamente en unos minutos.');
      return;
    }

    setResetToken(undefined);
    setState({ kind: 'success' });
  };

  if (state.kind === 'validating') {
    return (
      <AuthStatus title="Estamos validando tu enlace" body="Esto tomará solo un momento." loading />
    );
  }
  if (state.kind === 'missing') {
    return (
      <AuthStatus
        title="Falta el enlace de restablecimiento"
        body="Abrí la liga completa que recibiste por correo para crear una contraseña nueva."
        action={{ href: '/forgot-password', label: 'Solicitar un enlace nuevo' }}
      />
    );
  }
  if (state.kind === 'failure') {
    return (
      <AuthStatus
        {...failureCopy[state.reason]}
        action={
          state.reason === 'used'
            ? { href: '/login', label: 'Ir a iniciar sesión' }
            : { href: '/forgot-password', label: 'Solicitar un enlace nuevo' }
        }
      />
    );
  }
  if (state.kind === 'unexpected') {
    return (
      <AuthStatus
        title="No pudimos validar el enlace"
        body="Ocurrió un problema inesperado. Intentá abrir nuevamente el enlace en unos minutos."
        action={{ href: '/forgot-password', label: 'Solicitar un enlace nuevo' }}
      />
    );
  }
  if (state.kind === 'success') {
    return (
      <AuthStatus
        title="Tu contraseña fue actualizada"
        body="Por seguridad cerramos las sesiones abiertas. Ingresá con tu nueva contraseña."
        success
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <Mail className="size-4" />
          </div>
          <div className="min-w-0 text-sm">
            <p className="font-bold text-foreground">Restablecimiento para</p>
            <p className="truncate text-muted-foreground">{state.reset.email}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              El enlace es válido hasta el{' '}
              {new Intl.DateTimeFormat('es-MX', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(state.reset.expiresAt))}
              .
            </p>
          </div>
        </div>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <PasswordField
          id="reset-password"
          label="Nueva contraseña"
          error={errors.password?.message}
          registration={register('password')}
        />
        <PasswordField
          id="reset-password-confirmation"
          label="Confirmar contraseña"
          error={errors.passwordConfirmation?.message}
          registration={register('passwordConfirmation')}
        />
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" />
          Usá al menos 8 caracteres. Tu contraseña se almacena de forma segura.
        </p>
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
              Guardando contraseña…
            </>
          ) : (
            <>
              <LockKeyhole className="mr-2 size-4" />
              Guardar nueva contraseña
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
