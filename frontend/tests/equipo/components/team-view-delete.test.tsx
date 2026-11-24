import type * as AdminUsersApiModule from '@/lib/shared/admin-users-api';
import { adminUsersApi } from '@/lib/shared/admin-users-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamView } from '@/components/equipo/TeamView';

vi.mock('@/lib/shared/admin-users-api', async () => {
  const actual = await vi.importActual<typeof AdminUsersApiModule>('@/lib/shared/admin-users-api');
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

vi.mock('@/hooks/shared/usePermissions', () => ({
  usePermissions: () => ({
    guards: { check: () => true, canAssignRoles: () => true },
  }),
}));

vi.mock('@/hooks/shared/useAccessControl', () => ({
  useRolesCatalog: () => ({ roles: [], loading: false }),
}));

const successToast = vi.mocked(toast.success);
const errorToast = vi.mocked(toast.error);
const listUsers = vi.mocked(adminUsersApi.list);
const deleteUser = vi.mocked(adminUsersApi.delete);
const deactivate = vi.mocked(adminUsersApi.deactivate);

const user = {
  id: 'u-1',
  email: 'coordinacion@voz.test',
  fullName: 'Coordinación General',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  roles: [{ id: 'r-1', name: 'COORDINADOR' }],
};

describe('TeamView destructive confirmations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listUsers.mockResolvedValue({ ok: true, data: { users: [user] } });
  });

  async function openDeleteDialog() {
    fireEvent.click(await screen.findByRole('button', { name: /eliminar coordinación general/i }));
    return screen.findByRole('alertdialog');
  }

  it('asks for confirmation instead of deleting on the first click', async () => {
    render(<TeamView />);

    await openDeleteDialog();

    expect(screen.getByText(/¿Eliminar integrante\?/i)).toBeInTheDocument();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('does not call the API when the confirmation is cancelled', async () => {
    render(<TeamView />);
    await openDeleteDialog();

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('deletes the user and closes the dialog after confirming', async () => {
    deleteUser.mockResolvedValue({ ok: true, data: { user } });
    render(<TeamView />);
    await openDeleteDialog();

    fireEvent.click(screen.getByRole('button', { name: /^eliminar$/i }));

    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith('u-1'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(successToast).toHaveBeenCalledWith('Integrante eliminado correctamente');
  });

  it('still confirms before deactivating an active member', async () => {
    deactivate.mockResolvedValue({ ok: true, data: { user: { ...user, isActive: false } } });
    render(<TeamView />);
    fireEvent.click(
      await screen.findByRole('button', { name: /desactivar coordinación general/i }),
    );

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(deactivate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^desactivar$/i }));

    await waitFor(() => expect(deactivate).toHaveBeenCalledWith('u-1'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('keeps the dialog open when the deletion fails', async () => {
    deleteUser.mockResolvedValue({ ok: false, status: 403, message: 'Sin permisos' });
    render(<TeamView />);
    await openDeleteDialog();

    fireEvent.click(screen.getByRole('button', { name: /^eliminar$/i }));

    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith('u-1'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(errorToast).toHaveBeenCalledWith('No tenés permisos para realizar esta acción.');
  });

  it('notifies with a toast when an unexpected exception breaks the request', async () => {
    deleteUser.mockRejectedValue(new Error('network down'));
    render(<TeamView />);
    await openDeleteDialog();

    fireEvent.click(screen.getByRole('button', { name: /^eliminar$/i }));

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith('Ocurrió un error inesperado. Intentá nuevamente.'),
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('notifies with a toast when the list cannot be loaded', async () => {
    listUsers.mockResolvedValue({ ok: false, status: 500, message: 'boom' });
    render(<TeamView />);

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith(
        'Ocurrió un error en el servidor. Intentá nuevamente.',
      ),
    );
  });
});
