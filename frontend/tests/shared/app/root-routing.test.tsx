import HomePage from '@/app/page';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { proxy } from '@/proxy';
import { render, screen } from '@testing-library/react';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  status: 'loading',
  push: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => '/admin/indicadores/atencion',
}));
vi.mock('@/hooks/shared/useAuth', () => ({
  useAuth: () => ({
    status: mocks.status,
    isAuthenticated: mocks.status === 'authenticated',
    user: undefined,
  }),
}));

describe('platform entry routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status = 'loading';
  });

  it('redirects the root to the existing admin entry point', () => {
    expect(() => HomePage()).toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith('/admin');
  });

  it('keeps admin normalization and unrelated routes unchanged', () => {
    const response = proxy(new NextRequest('http://localhost/admin'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/admin/indicadores/atencion');
    const login = proxy(new NextRequest('http://localhost/login'));
    expect(login.headers.get('location')).toBeNull();
  });

  it.each(['loading', 'refreshing'])('waits for %s before deciding authentication', (status) => {
    mocks.status = status;
    render(
      <ProtectedRoute>
        <p>Private platform</p>
      </ProtectedRoute>,
    );
    expect(screen.queryByText('Private platform')).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('preserves the login redirect for unauthenticated visitors', () => {
    mocks.status = 'unauthenticated';
    render(
      <ProtectedRoute>
        <p>Private platform</p>
      </ProtectedRoute>,
    );
    expect(screen.queryByText('Private platform')).not.toBeInTheDocument();
    expect(mocks.push).toHaveBeenCalledWith('/login?redirectTo=%2Fadmin%2Findicadores%2Fatencion');
  });

  it('allows authenticated visitors into the platform', () => {
    mocks.status = 'authenticated';
    render(
      <ProtectedRoute>
        <p>Private platform</p>
      </ProtectedRoute>,
    );
    expect(screen.getByText('Private platform')).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
