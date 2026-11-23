/**
 * Next.js Proxy — Nexo Comercial
 *
 * Normaliza rutas del panel administrativo en el Edge Runtime.
 *
 * IMPORTANTE: la sesión recuperable vive en localStorage (refresh token), por lo
 * que el proxy no puede decidir si el usuario debe ir al login cuando el access
 * token expiró. Esa decisión pertenece a AuthProvider + ProtectedRoute, que sí
 * pueden intentar /auth/refresh antes de declarar la sesión como expirada.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// ─── Config ───────────────────────────────────────────────────────────────────

const PROTECTED_PREFIXES = ['/admin'];

// ─── Proxy ────────────────────────────────────────────────────────────────────

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) {
    return NextResponse.next();
  }

  // Si pathname es /admin, retornar a la página de inicio del panel.
  if (pathname === '/admin') {
    return NextResponse.redirect(new URL('/admin/indicadores/precampana', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas excepto:
     * - _next/static (assets)
     * - _next/image (optimización de imágenes)
     * - favicon, icons, manifest
     * - api routes
     */
    '/((?!_next/static|_next/image|favicon|icon|apple-icon|apple-touch-icon|manifest|api).*)',
  ],
};
