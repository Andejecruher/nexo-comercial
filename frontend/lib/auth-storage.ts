/**
 * Auth Storage — Nexo Comercial
 *
 * Persistencia liviana de sesión en localStorage.
 * Sin dependencias externas. TypeScript estricto, undefined (nunca null).
 *
 * Claves privadas para evitar colisiones con otras apps en el mismo origin.
 */

const KEYS = {
  ACCESS_TOKEN: 'vc_access_token',
  REFRESH_TOKEN: 'vc_refresh_token',
  USER: 'vc_user',
  DEVICE_ID: 'vc_device_id',
} as const;

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type UserRole = 'SUPER_ADMIN' | 'COORDINADOR' | 'CAPTURISTA' | 'OPERADOR_CHAT' | 'LIDER';

export type ScopeKind = 'admin' | 'coordinator' | 'leader' | 'none';

/**
 * Espejo de ScopeContext del backend (auth.types.ts). NUNCA se construye en el
 * cliente: viaja en la respuesta de login/me decidido por el servidor (D4,
 * F3). El alcance gobierna qué datos puede ver el usuario (cargo-only para
 * COORDINADOR, propios para LIDER).
 */
export interface ScopeContext {
  kind: ScopeKind;
  sectionId?: string;
  coordinatorId?: string;
  leaderId?: string;
}

export interface StoredUser {
  id: string;
  email: string;
  fullName: string;
  roles: UserRole[];
  isActive: boolean;
  permissions?: string[];
  permissionsByModule?: Record<string, string[]>;
  scope?: ScopeContext;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function safeLocalStorage() {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}

function generateDeviceId(): string {
  return `web-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

// ─── API pública ──────────────────────────────────────────────────────────────

export const authStorage = {
  getAccessToken(): string | undefined {
    return safeLocalStorage()?.getItem(KEYS.ACCESS_TOKEN) ?? undefined;
  },

  getRefreshToken(): string | undefined {
    return safeLocalStorage()?.getItem(KEYS.REFRESH_TOKEN) ?? undefined;
  },

  setTokens(accessToken: string, refreshToken: string): void {
    const ls = safeLocalStorage();
    if (!ls) return;
    ls.setItem(KEYS.ACCESS_TOKEN, accessToken);
    ls.setItem(KEYS.REFRESH_TOKEN, refreshToken);
    // Sincronizar cookie para que el proxy Edge pueda leerla como señal de sesión.
    // SameSite=Strict evita CSRF; no es HttpOnly porque el cliente también la lee.
    if (typeof document !== 'undefined') {
      document.cookie = `vc_access_token=${accessToken}; path=/; SameSite=Strict`;
    }
  },

  getUser(): StoredUser | undefined {
    const raw = safeLocalStorage()?.getItem(KEYS.USER);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      return undefined;
    }
  },

  setUser(user: StoredUser): void {
    safeLocalStorage()?.setItem(KEYS.USER, JSON.stringify(user));
  },

  /** Device ID persistente para multi-sesión (máx. 5 por usuario en el backend) */
  getDeviceId(): string {
    const ls = safeLocalStorage();
    if (!ls) return 'web-default';
    let id = ls.getItem(KEYS.DEVICE_ID);
    if (!id) {
      id = generateDeviceId();
      ls.setItem(KEYS.DEVICE_ID, id);
    }
    return id;
  },

  /**
   * Returns true only if the access token exists and has not expired yet.
   * A false result does NOT mean the session is over — use hasRefreshToken()
   * to determine if a silent refresh is still possible.
   */
  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return (payload.exp ?? 0) * 1000 > Date.now();
    } catch {
      return false;
    }
  },

  /**
   * Returns true if a refresh token is stored, meaning the session may
   * still be recoverable via the /auth/refresh endpoint.
   */
  hasRefreshToken(): boolean {
    return !!safeLocalStorage()?.getItem(KEYS.REFRESH_TOKEN);
  },

  /**
   * Milliseconds until the stored access token expires.
   * Returns 0 if expired or token is missing/malformed.
   */
  msUntilExpiry(): number {
    const token = this.getAccessToken();
    if (!token) return 0;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const remaining = (payload.exp ?? 0) * 1000 - Date.now();
      return Math.max(remaining, 0);
    } catch {
      return 0;
    }
  },

  clear(): void {
    const ls = safeLocalStorage();
    if (!ls) return;
    ls.removeItem(KEYS.ACCESS_TOKEN);
    ls.removeItem(KEYS.REFRESH_TOKEN);
    ls.removeItem(KEYS.USER);
    // Invalidar cookie del proxy
    if (typeof document !== 'undefined') {
      document.cookie =
        'vc_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict';
    }
    // Device ID se mantiene intencional para identificar el dispositivo
  },
};
