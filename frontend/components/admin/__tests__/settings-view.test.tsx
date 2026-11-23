import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsView } from '../settings-view';

const permissions = vi.hoisted(() => ({
  can: vi.fn((permission: string) => permission !== 'never'),
  roles: ['SUPER_ADMIN'] as string[],
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href?.toString()} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: permissions.can,
    roles: permissions.roles,
    guards: {},
  }),
}));

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions.can.mockImplementation(() => true);
    permissions.roles = ['SUPER_ADMIN'];
  });

  it('renders the settings hub with administration links', () => {
    render(<SettingsView />);

    expect(screen.getByText('Centro de administración')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /equipo/i })).toHaveAttribute('href', '/admin/equipo');
    expect(screen.getByRole('link', { name: /administración de roles/i })).toHaveAttribute(
      'href',
      '/admin/accesos/roles',
    );
    expect(screen.getByRole('link', { name: /catálogo de permisos/i })).toHaveAttribute(
      'href',
      '/admin/accesos/permissions',
    );
    expect(screen.queryByText(/cargando usuarios/i)).not.toBeInTheDocument();
  });

  it('hides links the current user cannot access', () => {
    permissions.roles = ['CAPTURISTA'];
    permissions.can.mockImplementation(
      (permission: string) =>
        permission !== 'users.view' &&
        permission !== 'roles.view' &&
        permission !== 'permissions.view',
    );

    render(<SettingsView />);

    expect(screen.queryByRole('link', { name: /equipo/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /administración de roles/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /catálogo de permisos/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /catálogo electoral/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /departamentos/i })).toBeInTheDocument();
  });

  it('keeps existing catalog and AI routes as configuration links', () => {
    render(<SettingsView />);

    expect(screen.getByRole('link', { name: /territorio y barrios/i })).toHaveAttribute(
      'href',
      '/admin/barrios',
    );
    expect(screen.getByRole('link', { name: /etiquetas/i })).toHaveAttribute(
      'href',
      '/admin/etiquetas',
    );
    expect(screen.getByRole('link', { name: /departamentos/i })).toHaveAttribute(
      'href',
      '/admin/departamentos',
    );
    expect(screen.getByRole('link', { name: /canales e ia avanzada/i })).toHaveAttribute(
      'href',
      '/admin/ai',
    );
  });
});
