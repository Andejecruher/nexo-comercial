import { RoleForm } from '@/components/admin/access-control/RoleForm';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('RoleForm', () => {
  it('muestra errores de validación y evita enviar payload inválido', async () => {
    const onSubmit = vi.fn();
    render(<RoleForm open onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear rol' }));

    expect(
      await screen.findByText('El nombre debe tener al menos 2 caracteres.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envía payload válido y cierra el formulario al crear un rol', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    const onOpenChange = vi.fn();
    render(<RoleForm open onOpenChange={onOpenChange} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Editor territorial' } });
    fireEvent.change(screen.getByLabelText('Clave interna'), {
      target: { value: 'editor_territorial' },
    });
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: 'Gestiona reportes territoriales' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear rol' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Editor territorial',
        slug: 'editor_territorial',
        description: 'Gestiona reportes territoriales',
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('bloquea nombre y clave de un rol protegido', () => {
    render(
      <RoleForm
        open
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        role={{
          id: '1',
          name: 'SUPER_ADMIN',
          slug: 'super-admin',
          description: 'Sistema',
          permissions: [],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }}
      />,
    );

    expect(screen.getByLabelText('Nombre')).toBeDisabled();
    expect(screen.getByLabelText('Clave interna')).toBeDisabled();
    expect(screen.getByText('Protegido')).toBeInTheDocument();
  });
});
