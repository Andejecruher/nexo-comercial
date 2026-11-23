'use client';

/**
 * useAuth — Nexo Comercial
 *
 * Contexto central de autenticación. Gestiona login, logout, restauración,
 * renovación silenciosa y sincronización multi-pestaña.
 *
 * Flujo de renovación:
 *   1. Al montar, si el access token expiró pero existe refresh token → silent refresh.
 *   2. En cada petición, api-client detecta 401 y llama a tryRefreshToken() antes de reintentar.
 *   3. Un timer proactivo renueva el access token 2 minutos antes de que expire, evitando
 *      cualquier 401 en medio de una sesión activa.
 *   4. Los eventos `vc:token-refreshed` (misma pestaña) y `storage` (otras pestañas)
 *      mantienen el estado sincronizado sin polling.
 */

import { apiClient, tryRefreshToken } from '@/lib/api-client';
import { authStorage, type StoredUser } from '@/lib/auth-storage';
import { useRouter } from 'next/navigation';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
}

interface LoginApiResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    roles: StoredUser['roles'];
    permissions?: string[];
    permissionsByModule?: Record<string, string[]>;
    isActive?: boolean;
    scope?: StoredUser['scope'];
  };
}

export type AuthStatus = 'loading' | 'refreshing' | 'authenticated' | 'unauthenticated';

export interface UseAuthReturn {
  user: StoredUser | undefined;
  status: AuthStatus;
  login: (payload: LoginPayload) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<UseAuthReturn | undefined>(undefined);

const TOKEN_REFRESHED_EVENT = 'vc:token-refreshed';
const SESSION_EXPIRED_EVENT = 'vc:session-expired';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | undefined>(undefined);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const clearSession = useCallback(() => {
    authStorage.clear();
    setUser(undefined);
    setStatus('unauthenticated');
  }, []);

  const restoreSession = useCallback(async () => {
    const stored = authStorage.getUser();

    // Access token todavía vigente: decisión definitiva.
    if (stored && authStorage.isAuthenticated()) {
      setUser(stored);
      setStatus('authenticated');
      return;
    }

    // Access token ausente/expirado, pero la sesión todavía puede recuperarse.
    // Mientras este await esté pendiente, ProtectedRoute debe permanecer esperando.
    if (stored && authStorage.hasRefreshToken()) {
      setUser(stored);
      setStatus('refreshing');

      const refreshed = await tryRefreshToken();
      if (refreshed) {
        setUser(authStorage.getUser() ?? stored);
        setStatus('authenticated');
        return;
      }
    }

    clearSession();
  }, [clearSession]);

  // ── Hidratación inicial ────────────────────────────────────────────────────
  //
  // Orden de prioridad:
  //   1. Access token válido → autenticado de inmediato.
  //   2. Access token expirado + refresh token presente → intento silent refresh.
  //   3. Sin sesión recuperable → unauthenticated.
  //
  // IMPORTANTE: nunca llamar authStorage.clear() antes de intentar el refresh,
  // porque clear() elimina también el refresh token.

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  // ── Timer proactivo de renovación ─────────────────────────────────────────
  //
  // Programa un refresh 2 minutos antes de que expire el access token.
  // Se recalcula cada vez que el status cambia a 'authenticated' (nuevo token).
  // Evita cualquier 401 durante la navegación activa.

  useEffect(() => {
    if (status !== 'authenticated') return;

    const msLeft = authStorage.msUntilExpiry();
    // Refrescar 2 minutos antes; si queda menos de 2 minutos, refrescar en 5 segundos
    const delay = Math.max(msLeft - 120_000, 5_000);

    refreshTimerRef.current = setTimeout(async () => {
      const ok = await tryRefreshToken();
      if (!ok) {
        clearSession();
      }
      // Si ok === true, el evento vc:token-refreshed actualiza el estado (ver abajo)
    }, delay);

    return () => {
      if (refreshTimerRef.current !== undefined) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [status, clearSession]);

  // ── Sincronización multi-pestaña + notificaciones del mismo tab ────────────
  //
  // - `storage`: dispara en otras pestañas cuando localStorage cambia.
  //   Si el token fue borrado en otra pestaña (logout) → cerrar aquí también.
  //   Si fue actualizado (refresh en otra pestaña) → actualizar estado local.
  // - `vc:token-refreshed`: evento custom disparado por tryRefreshToken() en el
  //   mismo tab tras un refresh exitoso (el evento storage NO aplica al propio tab).

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === 'vc_user') {
        setUser(authStorage.getUser());
        return;
      }
      if (e.key !== 'vc_access_token') return;

      if (e.newValue) {
        // Otra pestaña refrescó el token
        const updatedUser = authStorage.getUser();
        if (updatedUser) {
          setUser(updatedUser);
          setStatus('authenticated');
        }
      } else {
        // Otra pestaña hizo logout o limpió la sesión
        setUser(undefined);
        setStatus('unauthenticated');
      }
    }

    function handleTokenRefreshed() {
      // El timer proactivo o una petición fallida renovó el token en este mismo tab.
      // El status puede mantenerse 'authenticated'; solo actualizamos el user por si cambió.
      const updatedUser = authStorage.getUser();
      if (updatedUser) {
        setUser(updatedUser);
        setStatus('authenticated');
      }
    }

    function handleSessionExpired() {
      setUser(undefined);
      setStatus('unauthenticated');
    }

    window.addEventListener('storage', handleStorage);
    window.addEventListener(TOKEN_REFRESHED_EVENT, handleTokenRefreshed);
    window.addEventListener('vc:user-updated', handleTokenRefreshed);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(TOKEN_REFRESHED_EVENT, handleTokenRefreshed);
      window.removeEventListener('vc:user-updated', handleTokenRefreshed);
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────

  const login = useCallback(
    async ({ email, password }: LoginPayload): Promise<{ error?: string }> => {
      setStatus('loading');

      const result = await apiClient.post<LoginApiResponse>(
        '/auth/login',
        { email, password },
        { skipAuth: true },
      );

      if (!result.ok) {
        setStatus('unauthenticated');
        if (result.status === 401) {
          return { error: 'Credenciales inválidas. Verificá tu email y contraseña.' };
        }
        return { error: result.message };
      }

      const { accessToken, refreshToken, user: apiUser } = result.data;

      authStorage.setTokens(accessToken, refreshToken);
      authStorage.setUser({
        id: apiUser.id,
        email: apiUser.email,
        fullName: apiUser.fullName,
        roles: apiUser.roles,
        permissions: apiUser.permissions ?? [],
        permissionsByModule: apiUser.permissionsByModule,
        isActive: apiUser.isActive ?? true,
        scope: apiUser.scope,
      });

      setUser(authStorage.getUser());
      setStatus('authenticated');
      return {};
    },
    [],
  );

  // ── Logout ─────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    const refreshToken = authStorage.getRefreshToken();

    // Intentar revocar el token en el backend (best-effort — no bloquear si falla)
    if (refreshToken) {
      await apiClient.post('/auth/logout', { refreshToken }).catch(() => undefined);
    }

    clearSession();
    router.push('/login');
  }, [router, clearSession]);

  const value: UseAuthReturn = {
    user,
    status,
    login,
    logout,
    isAuthenticated: status === 'authenticated',
  };

  return createElement(AuthContext.Provider, { value }, children);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): UseAuthReturn {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  }

  return context;
}
