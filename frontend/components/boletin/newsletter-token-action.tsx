'use client';

import { CheckCircle2, Loader2, MailX, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { confirmNewsletter, unsubscribeNewsletter } from '@/lib/shared/newsletter-api';

type Action = 'confirm' | 'unsubscribe';

type State =
  | { kind: 'missing' }
  | { kind: 'working' }
  | { kind: 'done' }
  | { kind: 'invalid' }
  | { kind: 'unexpected' };

const copy: Record<
  Action,
  Record<Exclude<State['kind'], never>, { title: string; body: string }>
> = {
  confirm: {
    missing: {
      title: 'Falta el enlace de confirmación',
      body: 'Abrí la liga completa que recibiste por correo para confirmar tu suscripción.',
    },
    working: {
      title: 'Confirmando tu suscripción',
      body: 'Esto tomará solo un momento.',
    },
    done: {
      title: '¡Suscripción confirmada!',
      body: 'Ya vas a recibir noticias, convocatorias y avances de la gestión en tu correo.',
    },
    invalid: {
      title: 'El enlace no es válido o venció',
      body: 'Los enlaces de confirmación caducan por seguridad. Suscribite de nuevo para recibir uno nuevo.',
    },
    unexpected: {
      title: 'No pudimos confirmar tu suscripción',
      body: 'Ocurrió un problema inesperado. Intentá abrir nuevamente el enlace en unos minutos.',
    },
  },
  unsubscribe: {
    missing: {
      title: 'Falta el enlace de baja',
      body: 'Abrí la liga completa que aparece al pie de nuestros correos para darte de baja.',
    },
    working: {
      title: 'Procesando tu baja',
      body: 'Esto tomará solo un momento.',
    },
    done: {
      title: 'Te diste de baja',
      body: 'Ya no vas a recibir el boletín. Podés volver a suscribirte cuando quieras.',
    },
    invalid: {
      title: 'El enlace no es válido',
      body: 'Puede que ya te hayas dado de baja con este enlace. Si seguís recibiendo correos, escribinos.',
    },
    unexpected: {
      title: 'No pudimos procesar tu baja',
      body: 'Ocurrió un problema inesperado. Intentá abrir nuevamente el enlace en unos minutos.',
    },
  },
};

/** Consume el token de boletín (confirmación o baja) una sola vez al montar. */
export function NewsletterTokenAction({ action }: { action: Action }) {
  const searchParams = useSearchParams();
  const started = useRef(false);
  const [state, setState] = useState<State>({ kind: 'working' });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = searchParams.get('token')?.trim();
    if (!token) {
      setState({ kind: 'missing' });
      return;
    }

    const run = action === 'confirm' ? confirmNewsletter : unsubscribeNewsletter;
    void run(token).then((response) => {
      // Saca el token del historial del navegador.
      window.history.replaceState(window.history.state, '', window.location.pathname);
      if (response.ok) {
        setState({ kind: 'done' });
        return;
      }
      setState({
        kind: response.status >= 400 && response.status < 500 ? 'invalid' : 'unexpected',
      });
    });
  }, [action, searchParams]);

  const { title, body } = copy[action][state.kind];
  const loading = state.kind === 'working';
  const success = state.kind === 'done';

  return (
    <div className="py-3 text-center" role="status" aria-live="polite">
      <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        {loading ? (
          <Loader2 className="size-7 animate-spin" />
        ) : success ? (
          action === 'confirm' ? (
            <CheckCircle2 className="size-7" />
          ) : (
            <MailX className="size-7" />
          )
        ) : (
          <TriangleAlert className="size-7" />
        )}
      </div>
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
      {!loading && (
        <Button asChild variant={success ? 'default' : 'outline'} className="mt-6 rounded-full">
          <Link href="/">Volver al inicio</Link>
        </Button>
      )}
    </div>
  );
}
