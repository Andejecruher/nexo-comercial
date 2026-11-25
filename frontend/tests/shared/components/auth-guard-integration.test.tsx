import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/shared/useAuth';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { authStorage } from '@/lib/shared/auth-storage';

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => '/admin/tickets/a b',
}));
vi.mock('@/lib/shared/api-client', () => ({
  tryRefreshToken: () => mocks.refresh(),
  apiClient: { post: vi.fn() },
}));
const states: string[] = [];
function Observer() {
  states.push(useAuth().status);
  return null;
}
function App() {
  return (
    <AuthProvider>
      <Observer />
      <ProtectedRoute>
        <span>Private</span>
        <PermissionGate permission="tickets.view" roles={['LIDER']} fallback="Denied">
          Allowed
        </PermissionGate>
      </ProtectedRoute>
    </AuthProvider>
  );
}
function seed(valid: boolean) {
  localStorage.setItem(
    'vc_user',
    JSON.stringify({
      id: 'test',
      email: 'test@example.test',
      fullName: 'Test',
      roles: ['LIDER'],
      permissions: ['tickets.view'],
      isActive: true,
    }),
  );
  const exp = Math.floor(Date.now() / 1000) + (valid ? 3600 : -60);
  localStorage.setItem('vc_access_token', `x.${btoa(JSON.stringify({ exp }))}.x`);
  localStorage.setItem('vc_refresh_token', 'refresh');
}
beforeEach(() => {
  localStorage.clear();
  states.length = 0;
  vi.clearAllMocks();
  mocks.refresh.mockReset();
});
it.each([true, false])('keeps the real guard closed until refresh settles: %s', async (success) => {
  seed(false);
  const before = JSON.stringify({ ...localStorage });
  let finish!: (ok: boolean) => void;
  mocks.refresh.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  render(<App />);
  await waitFor(() => expect(states).toContain('refreshing'));
  expect(states[0]).toBe('loading');
  expect(screen.queryByText('Private')).toBeNull();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(JSON.stringify({ ...localStorage })).toBe(before);
  await act(async () => {
    if (success) seed(true);
    finish(success);
  });
  if (success) {
    expect(screen.getByText('Allowed')).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  } else {
    expect(screen.queryByText('Private')).toBeNull();
    expect(localStorage.getItem('vc_refresh_token')).toBeNull();
    expect(mocks.push.mock.calls).toEqual([['/login?redirectTo=%2Fadmin%2Ftickets%2Fa%20b']]);
  }
});
it('updates the real permission consumer after the shared user event', async () => {
  seed(true);
  render(<App />);
  await screen.findByText('Allowed');
  act(() => {
    authStorage.setUser({ ...authStorage.getUser()!, roles: ['CAPTURISTA'] });
    window.dispatchEvent(new Event('vc:user-updated'));
  });
  expect(screen.getByText('Private')).toBeInTheDocument();
  expect(screen.getByText('Denied')).toBeInTheDocument();
  expect(screen.queryByText('Allowed')).toBeNull();
  expect(mocks.push).not.toHaveBeenCalled();
});
