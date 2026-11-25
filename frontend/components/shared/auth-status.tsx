'use client';

import { CheckCircle2, Loader2, LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export type AuthStatusProps = {
  title: string;
  body: string;
  loading?: boolean;
  success?: boolean;
  action?: { href: string; label: string };
};

/** Estado terminal (éxito, error o carga) de los flujos de acceso. */
export function AuthStatus({
  title,
  body,
  loading = false,
  success = false,
  action = { href: '/login', label: 'Ir a iniciar sesión' },
}: AuthStatusProps) {
  return (
    <div className="py-3 text-center" role="status" aria-live="polite">
      <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        {loading ? (
          <Loader2 className="size-7 animate-spin" />
        ) : success ? (
          <CheckCircle2 className="size-7" />
        ) : (
          <LockKeyhole className="size-7" />
        )}
      </div>
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
      {!loading && (
        <Button asChild variant={success ? 'default' : 'outline'} className="mt-6 rounded-full">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
