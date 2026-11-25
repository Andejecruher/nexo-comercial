import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivateAccountForm } from '@/components/activate-account/ActivateAccountForm';

const validate = vi.fn();
const activate = vi.fn();
let query = '';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock('@/lib/activate-account/activation-api', () => ({
  activationApi: {
    validate: (...args: unknown[]) => validate(...args),
    activate: (...args: unknown[]) => activate(...args),
  },
}));

describe('ActivateAccountForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query = '';
    window.history.replaceState({}, '', '/activate-account');
  });

  it('no muestra el formulario cuando falta el token', async () => {
    render(<ActivateAccountForm />);
    expect(await screen.findByText('Falta el enlace de activación')).toBeInTheDocument();
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    expect(validate).not.toHaveBeenCalled();
  });

  it('muestra carga antes de resolver la validación', () => {
    query = 'token=nuevo-token-seguro-de-prueba';
    validate.mockReturnValue(new Promise(() => undefined));
    render(<ActivateAccountForm />);
    expect(screen.getByText('Estamos validando tu invitación')).toBeInTheDocument();
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
  });

  it.each([
    ['expired', 'La invitación venció'],
    ['used', 'La cuenta ya fue activada'],
    ['invalid', 'Esta invitación no es válida'],
  ])('representa el estado %s', async (reason, copy) => {
    query = 'token=nuevo-token-seguro-de-prueba';
    validate.mockResolvedValue({ ok: true, data: { valid: false, reason } });
    render(<ActivateAccountForm />);
    expect(await screen.findByText(copy)).toBeInTheDocument();
  });

  it('valida coincidencia, evita doble envío y confirma la activación', async () => {
    query = 'token=nuevo-token-seguro-de-prueba';
    validate.mockResolvedValue({
      ok: true,
      data: {
        valid: true,
        email: 'persona@example.test',
        name: 'Persona',
        teamName: 'Nexo Comercial',
        invitedBy: 'Admin',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    let resolveActivation!: (value: unknown) => void;
    activate.mockReturnValue(
      new Promise((resolve) => {
        resolveActivation = resolve;
      }),
    );
    render(<ActivateAccountForm />);
    const password = await screen.findByLabelText('Contraseña');
    const confirmation = screen.getByLabelText('Confirmar contraseña');
    fireEvent.change(password, { target: { value: 'ClaveSegura123' } });
    fireEvent.change(confirmation, { target: { value: 'otra-clave' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activar mi cuenta' }));
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(activate).not.toHaveBeenCalled();
    fireEvent.change(confirmation, { target: { value: 'ClaveSegura123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activar mi cuenta' }));
    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Activando cuenta…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Activando cuenta…' }));
    expect(activate).toHaveBeenCalledTimes(1);
    resolveActivation({ ok: true, data: { user: { email: 'persona@example.test' } } });
    expect(await screen.findByText('Tu cuenta está lista')).toBeInTheDocument();
  });
});
