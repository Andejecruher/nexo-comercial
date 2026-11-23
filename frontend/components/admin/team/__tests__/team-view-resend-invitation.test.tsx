import type * as AdminUsersApiModule from '@/lib/admin-users-api';
import { adminUsersApi, type PanelUserDto } from '@/lib/admin-users-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamView } from '../TeamView';

vi.mock('@/lib/admin-users-api', async () => {
  const actual = await vi.importActual<typeof AdminUsersApiModule>('@/lib/admin-users-api');
  return {
    ...actual,
    adminUsersApi: {
      list: vi.fn(),
      delete: vi.fn(),
      deactivate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      assignRole: vi.fn(),
      removeRole: vi.fn(),
      resendInvitation: vi.fn(),
    },
  };
});

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    guards: { check: () => true, canAssignRoles: () => true },
  }),
}));

vi.mock('@/hooks/useAccessControl', () => ({
  useRolesCatalog: () => ({ roles: [], loading: false }),
}));

const successToast = vi.mocked(toast.success);
const errorToast = vi.mocked(toast.error);
const warningToast = vi.mocked(toast.warning);
const listUsers = vi.mocked(adminUsersApi.list);
const resendInvitation = vi.mocked(adminUsersApi.resendInvitation);

const pendingUser: PanelUserDto = {
  id: 'u-2',
  email: 'pendiente@voz.test',
  fullName: 'Integrante Pendiente',
  isActive: false,
  createdAt: '2026-01-02T00:00:00.000Z',
  roles: [{ id: 'r-2', name: 'CAPTURISTA' }],
  invitation: {
    id: 'inv-1',
    status: 'failed',
    expiresAt: '2026-01-03T00:00:00.000Z',
  },
};

const activeUser: PanelUserDto = {
  id: 'u-1',
  email: 'coordinacion@voz.test',
  fullName: 'Coordinación General',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  roles: [{ id: 'r-1', name: 'COORDINADOR' }],
  invitation: { id: 'inv-0', status: 'accepted', expiresAt: '2026-01-02T00:00:00.000Z' },
};

describe('TeamView invitation resend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listUsers.mockResolvedValue({ ok: true, data: { users: [pendingUser, activeUser] } });
  });

  it('shows the real invitation status instead of the unsupported badge', async () => {
    render(<TeamView />);

    expect(await screen.findByText('Fallida')).toBeInTheDocument();
    expect(screen.getByText('Aceptada')).toBeInTheDocument();
    expect(screen.queryByText(/no soportada/i)).not.toBeInTheDocument();
  });

  it('resends the invitation for a member that has not activated yet', async () => {
    resendInvitation.mockResolvedValue({
      ok: true,
      data: {
        user: pendingUser,
        invitation: { id: 'inv-2', status: 'sent', expiresAt: '2026-01-04T00:00:00.000Z' },
      },
    });
    render(<TeamView />);

    fireEvent.click(
      await screen.findByRole('button', { name: /reenviar invitación a integrante pendiente/i }),
    );

    await waitFor(() => expect(resendInvitation).toHaveBeenCalledWith('u-2'));
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2));
    expect(successToast).toHaveBeenCalledWith('Invitación reenviada correctamente.');
  });

  it('warns with a toast when the invitation email could not be delivered', async () => {
    resendInvitation.mockResolvedValue({
      ok: true,
      data: {
        user: pendingUser,
        invitation: { id: 'inv-2', status: 'failed', expiresAt: '2026-01-04T00:00:00.000Z' },
        warning: {
          code: 'INVITATION_EMAIL_FAILED',
          message: 'No fue posible reenviar la invitación.',
        },
      },
    });
    render(<TeamView />);

    fireEvent.click(
      await screen.findByRole('button', { name: /reenviar invitación a integrante pendiente/i }),
    );

    await waitFor(() =>
      expect(warningToast).toHaveBeenCalledWith('No fue posible reenviar la invitación.'),
    );
    expect(successToast).not.toHaveBeenCalled();
  });

  it('shows the cooldown error as a toast when the backend rejects the resend', async () => {
    resendInvitation.mockResolvedValue({ ok: false, status: 429, message: 'Esperá' });
    render(<TeamView />);

    fireEvent.click(
      await screen.findByRole('button', { name: /reenviar invitación a integrante pendiente/i }),
    );

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith(
        'Se alcanzó el límite de reenvíos. Intentá nuevamente más tarde.',
      ),
    );
  });

  it('disables the resend action for an already active member', async () => {
    render(<TeamView />);
    const button = await screen.findByRole('button', {
      name: /reenviar invitación a coordinación general/i,
    });

    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(resendInvitation).not.toHaveBeenCalled();
  });
});
