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
  activationApi,
  type ActivationFailureReason,
  type ActivationValidation,
} from '@/lib/activation-api';

const PASSWORD_MIN_LENGTH = 8;
const ActivationSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH, 'Usá al menos 8 caracteres'),
    passwordConfirmation: z.string().min(1, 'Confirmá tu contraseña'),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirmation'],
  });

type FormValues = z.infer<typeof ActivationSchema>;
type ViewState =
  | { kind: 'missing' }
  | { kind: 'validating' }
  | { kind: 'valid'; invitation: Extract<ActivationValidation, { valid: true }> }
  | { kind: 'failure'; reason: ActivationFailureReason }
  | { kind: 'unexpected' }
  | { kind: 'success' };

const failureCopy: Record<ActivationFailureReason, { title: string; body: string }> = {
  invalid: {
    title: 'Esta invitación no es válida',
    body: 'El enlace fue alterado o ya no corresponde a una invitación disponible.',
  },
  expired: {
    title: 'La invitación venció',
    body: 'Pedile a la persona administradora del equipo que te envíe una nueva invitación.',
  },
  used: {
    title: 'La cuenta ya fue activada',
    body: 'Este enlace era de un solo uso. Ya podés ingresar con tus credenciales.',
  },
};

export function ActivateAccountForm() {
  const searchParams = useSearchParams();
  const requestStarted = useRef(false);
  const [activationToken, setActivationToken] = useState<string>();
  const [state, setState] = useState<ViewState>({ kind: 'validating' });
  const [serverError, setServerError] = useState<string>();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(
      ActivationSchema as unknown as Parameters<typeof zodResolver>[0],
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
    setActivationToken(token);

    void activationApi.validate(token).then((response) => {
      // Remove the secret from browser history without persisting it elsewhere.
      window.history.replaceState(window.history.state, '', '/activate-account');
      if (!response.ok) {
        setState({ kind: 'unexpected' });
        return;
      }
      if (!response.data.valid) {
        setState({ kind: 'failure', reason: response.data.reason });
        return;
      }
      setState({ kind: 'valid', invitation: response.data });
    });
  }, [searchParams]);

  const onSubmit = async (values: FormValues) => {
    if (isSubmitting || !activationToken) return;
    setServerError(undefined);
    const response = await activationApi.activate(
      activationToken,
      values.password,
      values.passwordConfirmation,
    );
    if (!response.ok) {
      if (response.status === 409) setState({ kind: 'failure', reason: 'used' });
      else if (response.status === 410) setState({ kind: 'failure', reason: 'expired' });
      else if (response.status === 400) setState({ kind: 'failure', reason: 'invalid' });
      else setServerError('No pudimos activar tu cuenta. Intentá nuevamente en unos minutos.');
      return;
    }
    setActivationToken(undefined);
    setState({ kind: 'success' });
  };

  if (state.kind === 'validating') {
    return (
      <AuthStatus
        title="Estamos validando tu invitación"
        body="Esto tomará solo un momento."
        loading
      />
    );
  }
  if (state.kind === 'missing') {
    return (
      <AuthStatus
        title="Falta el enlace de activación"
        body="Abrí la liga completa que recibiste por correo para configurar tu acceso."
      />
    );
  }
  if (state.kind === 'failure') {
    return <AuthStatus {...failureCopy[state.reason]} />;
  }
  if (state.kind === 'unexpected') {
    return (
      <AuthStatus
        title="No pudimos validar la invitación"
        body="Ocurrió un problema inesperado. Intentá abrir nuevamente el enlace en unos minutos."
      />
    );
  }
  if (state.kind === 'success') {
    return (
      <AuthStatus
        title="Tu cuenta está lista"
        body="La activación se completó correctamente. Ya podés ingresar a Voz Ciudadana."
        success
      />
    );
  }

  const { invitation } = state;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <Mail className="size-4" />
          </div>
          <div className="min-w-0 text-sm">
            <p className="font-bold text-foreground">
              {invitation.name ?? 'Te damos la bienvenida'}
            </p>
            <p className="truncate text-muted-foreground">{invitation.email}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Invitación a <strong>{invitation.teamName}</strong>
              {invitation.invitedBy ? ` enviada por ${invitation.invitedBy}` : ''}. Válida hasta el{' '}
              {new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(invitation.expiresAt),
              )}
              .
            </p>
          </div>
        </div>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <PasswordField
          id="activation-password"
          label="Contraseña"
          error={errors.password?.message}
          registration={register('password')}
        />
        <PasswordField
          id="activation-password-confirmation"
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
              Activando cuenta…
            </>
          ) : (
            <>
              <LockKeyhole className="mr-2 size-4" />
              Activar mi cuenta
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
