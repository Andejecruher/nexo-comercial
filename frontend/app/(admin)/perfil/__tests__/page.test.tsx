import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from '../page';
import { authStorage } from '@/lib/auth-storage';

const get = vi.fn();
const update = vi.fn();
const success = vi.fn();
vi.mock('@/lib/profile-api', () => ({
  profileApi: {
    get: (...args: unknown[]) => get(...args),
    update: (...args: unknown[]) => update(...args),
  },
}));
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => success(...args), error: vi.fn() },
}));
const user = {
  id: 'owner',
  nombre: 'Ana Pérez',
  correo: 'ana@example.com',
  telefono: null,
  roles: [{ id: 'role', name: 'Operador', slug: 'operador' }],
  fechaRegistro: '2026-01-01T12:00:00.000Z',
};

describe('Mi perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    get.mockResolvedValue({ ok: true, data: { user } });
  });

  it('carga datos y deshabilita guardar sin cambios o con formatos inválidos', async () => {
    render(<ProfilePage />);
    expect(await screen.findByDisplayValue('Ana Pérez')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(save).toBeDisabled();
    expect(screen.getByText('Rol: Operador')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'incorrecto' },
    });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'nuevo@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Número de teléfono'), { target: { value: 'abc' } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Número de teléfono'), {
      target: { value: '+52 961 123 4567' },
    });
    expect(save).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue(user.correo);
    expect(save).toBeDisabled();
    expect(save).toHaveClass('hover:cursor-pointer');
  });

  it('guarda, bloquea mientras envía y sincroniza la sesión', async () => {
    authStorage.setUser({
      id: user.id,
      fullName: user.nombre,
      email: user.correo,
      roles: ['CAPTURISTA'],
      isActive: true,
      permissions: ['example'],
    });
    let resolve!: (value: unknown) => void;
    update.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<ProfilePage />);
    const name = await screen.findByLabelText('Nombre completo');
    fireEvent.change(name, { target: { value: 'Ana Nueva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(update).toHaveBeenCalledWith({ nombre: 'Ana Nueva', correo: user.correo, telefono: '' });
    resolve({ ok: true, data: { user: { ...user, nombre: 'Ana Nueva' } } });
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    expect(authStorage.getUser()).toMatchObject({
      fullName: 'Ana Nueva',
      permissions: ['example'],
    });
  });

  it('muestra conflictos y conserva cambios para corregirlos', async () => {
    update.mockResolvedValue({ ok: false, status: 409, message: 'El correo ya está en uso' });
    render(<ProfilePage />);
    fireEvent.change(await screen.findByLabelText('Correo electrónico'), {
      target: { value: 'ocupado@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El correo ya está en uso');
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('ocupado@example.com');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });

  it('permite reintentar cuando falla la carga', async () => {
    get.mockResolvedValueOnce({ ok: false, message: 'Sin conexión' });
    render(<ProfilePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByDisplayValue(user.nombre)).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
