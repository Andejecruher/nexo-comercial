/**
 * API Client base — Nexo Comercial
 *
 * - Inyección automática de Authorization header
 * - Interceptor de refresh listo (scaffolding)
 * - Respuestas tipadas
 * - Preparado para extender a citizens/conversations/events
 */

import { authStorage } from '@/lib/shared/auth-storage';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const API_PREFIX = '/api/v1';
const TOKEN_REFRESHED_EVENT = 'vc:token-refreshed';
const SESSION_EXPIRED_EVENT = 'vc:session-expired';

// ─── Tipos base ──────────────────────────────────────────────────────────────

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skips Authorization header (login, refresh) */
  skipAuth?: boolean;
  responseType?: 'json' | 'blob';
}

// ─── Errores tipados ─────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Core fetch ──────────────────────────────────────────────────────────────

function dispatchAuthEvent(eventName: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(eventName));
  }
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
  hasRetriedAuth = false,
): Promise<ApiResponse<T>> {
  const { body, skipAuth = false, responseType = 'json', headers: extraHeaders, ...init } = options;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(extraHeaders as Record<string, string>),
  };

  if (!skipAuth) {
    const token = authStorage.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Device-id header para multi-sesión (máx. 5 sesiones/usuario)
  const deviceId = authStorage.getDeviceId();
  if (deviceId) {
    headers['x-device-id'] = deviceId;
  }

  try {
    const res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
      ...init,
      headers,
      body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });

    if (res.status === 401 && !skipAuth && !hasRetriedAuth) {
      // El refresh ocurre antes de devolver el 401 al consumidor.
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        // Reintentar la petición original con el nuevo token
        return request<T>(path, options, true);
      }
      // Sesión expirada — limpiar y dejar que el proxy redirija
      authStorage.clear();
      dispatchAuthEvent(SESSION_EXPIRED_EVENT);
      return { ok: false, status: 401, message: 'Sesión expirada. Iniciá sesión nuevamente.' };
    }

    if (res.status === 401 && !skipAuth) {
      authStorage.clear();
      dispatchAuthEvent(SESSION_EXPIRED_EVENT);
    }

    if (!res.ok) {
      let message = 'Error inesperado del servidor.';
      try {
        const err = await res.json();
        message = err?.message ?? err?.error ?? message;
        if (err?.code === 'WHATSAPP_WINDOW_CLOSED') dispatchAuthEvent('vc:whatsapp-window-closed');
      } catch {
        // ignorar error de parseo
      }
      return { ok: false, status: res.status, message };
    }

    const data: T = responseType === 'blob' ? ((await res.blob()) as T) : await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, message: 'No se pudo conectar con el servidor.' };
  }
}

// ─── Refresh token ────────────────────────────────────────────────────────────

let _refreshing: Promise<boolean> | undefined;

/**
 * Attempts a silent token refresh using the stored refresh token.
 *
 * - Deduplicates concurrent calls: multiple simultaneous callers receive
 *   the same promise and all get the same result.
 * - On success, persists the new token pair and dispatches `vc:token-refreshed`
 *   so that any listener in the same tab (e.g. useAuth) can update React state.
 * - On failure, returns false — caller is responsible for clearing storage
 *   and redirecting to login.
 */
export async function tryRefreshToken(): Promise<boolean> {
  if (_refreshing) return _refreshing;

  _refreshing = (async () => {
    const refreshToken = authStorage.getRefreshToken();
    const deviceId = authStorage.getDeviceId();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_BASE}${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId ?? 'web-default',
        },
        body: JSON.stringify({ refreshToken, deviceId: deviceId ?? 'web-default' }),
      });

      if (!res.ok) return false;

      const json = (await res.json()) as { accessToken: string; refreshToken: string };
      authStorage.setTokens(json.accessToken, json.refreshToken);

      // Notify same-tab listeners (e.g. useAuth proactive refresh timer)
      dispatchAuthEvent(TOKEN_REFRESHED_EVENT);

      return true;
    } catch {
      return false;
    } finally {
      _refreshing = undefined;
    }
  })();

  return _refreshing;
}

// ─── Métodos públicos ─────────────────────────────────────────────────────────

export const apiClient = {
  getBlob: (path: string, opts?: Omit<RequestOptions, 'body'>) =>
    request<Blob>(path, { ...opts, method: 'GET', responseType: 'blob' }),
  get: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),

  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),

  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'PUT', body }),

  delete: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};
