'use client';

/**
 * ProtectedRoute — Voz Ciudadana
 *
 * Wrapper que verifica autenticación antes de renderizar children.
 * Si el usuario no está autenticado, redirige a /login preservando el path actual.
 *
 * Uso:
 *   <ProtectedRoute>
 *     <AdminLayout>...</AdminLayout>
 *   </ProtectedRoute>
 */

import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Path al que redirigir si no hay sesión. Default: '/login' */
  redirectTo?: string;
}

export function ProtectedRoute({ children, redirectTo = '/login' }: ProtectedRouteProps) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      const dest = `${redirectTo}?redirectTo=${encodeURIComponent(pathname)}`;
      router.push(dest);
    }
  }, [status, router, pathname, redirectTo]);

  if (status === 'loading' || status === 'refreshing') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    // Renderizar vacío mientras se procesa el redirect
    return null;
  }

  return <>{children}</>;
}
