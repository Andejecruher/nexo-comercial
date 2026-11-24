/**
 * Tests del flujo de autenticación JWT:
 *   - Login
 *   - Hidratación (access token válido / expirado)
 *   - Refresh silencioso en hydration
 *   - Refresh fallido → redirect a login
 *   - Logout
 *   - Sincronización multi-pestaña vía StorageEvent
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/shared/useAuth';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));

const mockTryRefreshToken = vi.fn<() => Promise<boolean>>();
const mockApiClientPost = vi.fn();

vi.mock('@/lib/shared/api-client', () => ({
  tryRefreshToken: () => mockTryRefreshToken(),
  apiClient: {
    post: (...args: unknown[]) => mockApiClientPost(...args),
    get: vi.fn(),
  },
}));

// ─── Helpers para JWT ─────────────────────────────────────────────────────────

function makeJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
  const payload = btoa(
    JSON.stringify({ sub: 'user-1', exp, email: 'a@b.com', type: 'access' }),
  ).replace(/=/g, '');
  return `${header}.${payload}.signature`;
}

function futureJwt(secondsFromNow = 900): string {
  return makeJwt(Math.floor(Date.now() / 1000) + secondsFromNow);
}

function expiredJwt(): string {
  return makeJwt(Math.floor(Date.now() / 1000) - 60);
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function seedStorage(
  opts: {
    accessToken?: string;
    refreshToken?: string;
    user?: object;
  } = {},
) {
  if (opts.accessToken !== undefined) {
    localStorage.setItem('vc_access_token', opts.accessToken);
  }
  if (opts.refreshToken !== undefined) {
    localStorage.setItem('vc_refresh_token', opts.refreshToken);
  }
  if (opts.user !== undefined) {
    localStorage.setItem('vc_user', JSON.stringify(opts.user));
  }
}

const MOCK_USER = {
  id: 'user-1',
  email: 'admin@test.com',
  fullName: 'Admin Test',
  roles: ['SUPER_ADMIN'],
  isActive: true,
};

function wrapper({ children }: { children: ReactNode }) {
  return createElement(AuthProvider, undefined, children);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockTryRefreshToken.mockResolvedValue(false);
    mockApiClientPost.mockResolvedValue({ ok: false, status: 500, message: 'error' });
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── Hidratación ─────────────────────────────────────────────────────────────

  it('status=refreshing cuando el silent refresh inicial sigue pendiente', () => {
    // Con access token expirado + refresh token → el provider queda en refreshing
    // mientras espera la resolución de tryRefreshToken (promise que nunca resuelve)
    seedStorage({
      accessToken: expiredJwt(),
      refreshToken: 'rt-valid',
      user: MOCK_USER,
    });
    mockTryRefreshToken.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.status).toBe('refreshing');
  });

  it('status=authenticated cuando el access token es válido en storage', async () => {
    seedStorage({
      accessToken: futureJwt(),
      refreshToken: 'rt-valid',
      user: MOCK_USER,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user?.email).toBe('admin@test.com');
    expect(mockTryRefreshToken).not.toHaveBeenCalled();
  });

  it('status=unauthenticated cuando no hay nada en storage', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.user).toBeUndefined();
  });

  // ── Refresh silencioso en hydration ─────────────────────────────────────────

  it('intenta silent refresh cuando el access token expiró pero existe refresh token', async () => {
    seedStorage({
      accessToken: expiredJwt(),
      refreshToken: 'rt-valid',
      user: MOCK_USER,
    });

    mockTryRefreshToken.mockImplementationOnce(async () => {
      // Simular que setTokens actualiza localStorage con nuevo access token
      localStorage.setItem('vc_access_token', futureJwt());
      return true;
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(mockTryRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('status=unauthenticated y limpia storage cuando el silent refresh falla', async () => {
    seedStorage({
      accessToken: expiredJwt(),
      refreshToken: 'rt-expired',
      user: MOCK_USER,
    });

    mockTryRefreshToken.mockResolvedValueOnce(false);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(localStorage.getItem('vc_access_token')).toBeNull();
    expect(localStorage.getItem('vc_refresh_token')).toBeNull();
  });

  it('no llama tryRefreshToken si no hay refresh token (sesión completamente expirada)', async () => {
    seedStorage({
      accessToken: expiredJwt(),
      // Sin refreshToken
      user: MOCK_USER,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(mockTryRefreshToken).not.toHaveBeenCalled();
  });

  it('preserva el refresh token cuando el access token está expirado (no llama clear antes del refresh)', async () => {
    seedStorage({
      accessToken: expiredJwt(),
      refreshToken: 'rt-must-survive',
      user: MOCK_USER,
    });

    // Bloquear el refresh para poder inspeccionar localStorage durante el intento
    let inspectedRefreshToken: string | null = null;
    mockTryRefreshToken.mockImplementationOnce(async () => {
      inspectedRefreshToken = localStorage.getItem('vc_refresh_token');
      return false;
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    // El refresh token debía existir cuando tryRefreshToken fue llamado
    expect(inspectedRefreshToken).toBe('rt-must-survive');
  });

  // ── Login ───────────────────────────────────────────────────────────────────

  it('login exitoso guarda tokens y actualiza status', async () => {
    const newAccessToken = futureJwt();

    mockApiClientPost.mockResolvedValueOnce({
      ok: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: 'new-rt',
        user: MOCK_USER,
      },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    await act(async () => {
      const res = await result.current.login({
        email: 'admin@test.com',
        password: 'pass123',
      });
      expect(res.error).toBeUndefined();
    });

    expect(result.current.status).toBe('authenticated');
    expect(localStorage.getItem('vc_access_token')).toBe(newAccessToken);
    expect(localStorage.getItem('vc_refresh_token')).toBe('new-rt');
  });

  it('login con credenciales inválidas devuelve error y no cambia status', async () => {
    mockApiClientPost.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: 'Credenciales inválidas',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    await act(async () => {
      const res = await result.current.login({
        email: 'bad@test.com',
        password: 'wrong',
      });
      expect(res.error).toMatch(/credenciales/i);
    });

    expect(result.current.status).toBe('unauthenticated');
    expect(localStorage.getItem('vc_access_token')).toBeNull();
  });

  // ── Logout ──────────────────────────────────────────────────────────────────

  it('logout limpia storage, actualiza status y redirige a /login', async () => {
    seedStorage({
      accessToken: futureJwt(),
      refreshToken: 'rt-active',
      user: MOCK_USER,
    });

    mockApiClientPost.mockResolvedValueOnce({ ok: true, data: {} });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.status).toBe('unauthenticated');
    expect(localStorage.getItem('vc_access_token')).toBeNull();
    expect(localStorage.getItem('vc_refresh_token')).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('logout funciona aunque el backend falle (best-effort)', async () => {
    seedStorage({
      accessToken: futureJwt(),
      refreshToken: 'rt-active',
      user: MOCK_USER,
    });

    // Simular error de red en logout
    mockApiClientPost.mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.status).toBe('unauthenticated');
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  // ── Sincronización multi-pestaña ─────────────────────────────────────────

  it('actualiza status a authenticated cuando otra pestaña guarda un nuevo token', async () => {
    // Solo user en storage (sin access token) → unauthenticated
    seedStorage({ user: MOCK_USER });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    // Simular que otra pestaña completó el refresh y actualizó localStorage
    const newToken = futureJwt();
    localStorage.setItem('vc_access_token', newToken);
    localStorage.setItem('vc_refresh_token', 'new-rt');
    localStorage.setItem('vc_user', JSON.stringify(MOCK_USER));

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'vc_access_token',
          newValue: newToken,
          storageArea: localStorage,
        }),
      );
    });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
  });

  it('actualiza status a unauthenticated cuando otra pestaña elimina el token (logout)', async () => {
    seedStorage({
      accessToken: futureJwt(),
      refreshToken: 'rt-active',
      user: MOCK_USER,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    localStorage.removeItem('vc_access_token');

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'vc_access_token',
          newValue: null,
          storageArea: localStorage,
        }),
      );
    });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
  });

  it('ignora eventos storage de claves no relacionadas', async () => {
    seedStorage({
      accessToken: futureJwt(),
      refreshToken: 'rt-active',
      user: MOCK_USER,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'some_other_key',
          newValue: 'irrelevant',
          storageArea: localStorage,
        }),
      );
    });

    expect(result.current.status).toBe('authenticated');
  });
});
