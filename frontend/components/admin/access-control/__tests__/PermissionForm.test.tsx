import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PermissionForm } from '../PermissionForm';

const systemPermission = {
  id: '1',
  name: 'Ver permisos',
  slug: 'permissions.view',
  module: 'permissions',
  description: 'Catálogo',
  isActive: true,
  isSystem: true,
  roleCount: 2,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('PermissionForm', () => {
  it('explains the technical key and protects a system key', () => {
    render(
      <PermissionForm
        open
        permission={systemPermission}
        canEdit
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText(/Identificador técnico utilizado/)).toBeInTheDocument();
    expect(screen.getByLabelText('Clave técnica')).toBeDisabled();
  });

  it('prefills a clone with an empty key so the user picks a unique one', () => {
    render(
      <PermissionForm
        open
        cloneFrom={systemPermission}
        canEdit
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Clonar permiso' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ver permisos (copia)');
    expect(screen.getByLabelText('Módulo')).toHaveValue('permissions');
    const key = screen.getByLabelText('Clave técnica');
    expect(key).toHaveValue('');
    expect(key).toBeEnabled();
  });

  it('shows client validation for required fields', () => {
    render(<PermissionForm open canEdit onOpenChange={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.submit(screen.getByRole('button', { name: 'Crear permiso' }).closest('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent('obligatorios');
  });
});
