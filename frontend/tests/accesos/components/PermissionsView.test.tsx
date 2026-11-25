import { usePermissionsCatalog } from '@/hooks/shared/useAccessControl';
import type { PermissionDto } from '@/lib/shared/roles-permissions-api';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsView } from '@/components/accesos/PermissionsView';

/** Radix menus open on pointerdown/keyboard, which jsdom only delivers explicitly. */
const openMenu = (trigger: HTMLElement) => fireEvent.keyDown(trigger, { key: 'Enter' });

vi.mock('@/hooks/shared/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    roles: ['SUPER_ADMIN'],
    guards: {
      canViewPermissions: () => true,
      canCreatePermissions: () => true,
      canUpdatePermissions: () => true,
      canDeactivatePermissions: () => true,
    },
  }),
}));

vi.mock('@/hooks/shared/useAccessControl', () => ({
  usePermissionsCatalog: vi.fn(),
}));

vi.mock('@/lib/shared/roles-permissions-api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  rolesPermissionsApi: {
    listPermissionRoles: vi.fn(async () => ({ ok: true, data: { roles: [] } })),
  },
}));

const permission = (overrides: Partial<PermissionDto> = {}): PermissionDto => ({
  id: 'p-1',
  name: 'Actualizar canales e IA',
  slug: 'ai.update',
  module: 'ai',
  description: 'Editar registros del módulo canales e IA.',
  createdAt: '2026-08-23T22:57:00.000Z',
  updatedAt: '2026-08-23T22:57:00.000Z',
  isActive: true,
  isSystem: false,
  roleCount: 3,
  rolesPreview: [
    { id: 'r-1', name: 'ADMIN', slug: 'admin' },
    { id: 'r-2', name: 'LIDER', slug: 'lider' },
  ],
  ...overrides,
});

const catalog = vi.mocked(usePermissionsCatalog);

function mockCatalog(overrides: Partial<ReturnType<typeof usePermissionsCatalog>> = {}) {
  const value = {
    permissions: [permission()],
    modules: ['ai', 'barrios'],
    moduleFacets: [
      { module: 'ai', count: 4 },
      { module: 'barrios', count: 5 },
    ],
    pagination: { page: 1, limit: 15, total: 83, totalPages: 6 },
    loading: false,
    error: undefined,
    refresh: vi.fn(),
    createPermission: vi.fn(async () => ({ success: true })),
    updatePermission: vi.fn(async () => ({ success: true })),
    setPermissionStatus: vi.fn(async () => ({ success: true })),
    ...overrides,
  } as unknown as ReturnType<typeof usePermissionsCatalog>;
  catalog.mockReturnValue(value);
  return value;
}

describe('PermissionsView', () => {
  beforeEach(() => {
    catalog.mockReset();
  });

  it('renders the toolbar, backend note and module tabs with facet counts', async () => {
    mockCatalog();
    render(<PermissionsView />);

    expect(screen.getByRole('heading', { name: 'Administración de permisos' })).toBeInTheDocument();
    expect(screen.getByText(/permisos registrados/)).toHaveTextContent('83 permisos registrados');
    expect(
      screen.getByText(/no asigna automáticamente la regla de autorización en el backend/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Validación en backend')).toBeChecked();

    const tabs = screen.getByRole('tablist', { name: 'Módulos de permisos' });
    expect(within(tabs).getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(tabs).getByRole('tab', { name: 'Canales e IA (4)' })).toBeInTheDocument();
    expect(within(tabs).getByRole('tab', { name: 'Barrios (5)' })).toBeInTheDocument();
  });

  it('filters the catalog by module when a tab is selected', async () => {
    mockCatalog();
    render(<PermissionsView />);

    fireEvent.click(screen.getByRole('tab', { name: 'Barrios (5)' }));

    await waitFor(() => {
      expect(catalog).toHaveBeenLastCalledWith(expect.objectContaining({ module: 'barrios' }));
    });
    expect(screen.getByRole('tab', { name: 'Barrios (5)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('shows the row data, role avatars and the actions menu', async () => {
    mockCatalog();
    render(<PermissionsView />);

    const row = screen.getByRole('row', { name: /Actualizar canales e IA/ });
    expect(within(row).getByText('ai.update')).toBeInTheDocument();
    expect(within(row).getByText('AD')).toBeInTheDocument();
    expect(within(row).getByText('LI')).toBeInTheDocument();
    expect(within(row).getByText('+1 Rol')).toBeInTheDocument();
    expect(within(row).getByText('Activo')).toBeInTheDocument();

    openMenu(within(row).getByRole('button', { name: 'Acciones para Actualizar canales e IA' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Clonar' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Desactivar' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Archivo' })).not.toBeInTheDocument();
  });

  it('opens the clone dialog prefilled from the row', async () => {
    mockCatalog();
    render(<PermissionsView />);

    openMenu(screen.getByRole('button', { name: 'Acciones para Actualizar canales e IA' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Clonar' }));

    expect(await screen.findByRole('heading', { name: 'Clonar permiso' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Actualizar canales e IA (copia)');
    expect(screen.getByLabelText('Clave técnica')).toHaveValue('');
  });

  it('appends the next page when loading more', async () => {
    mockCatalog();
    render(<PermissionsView />);

    expect(screen.getByText('Mostrando 1 de 83')).toBeInTheDocument();
    mockCatalog({ permissions: [permission({ id: 'p-2', name: 'Ver canales e IA' })] });

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    await waitFor(() => {
      expect(catalog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });
    expect(await screen.findByText('Ver canales e IA')).toBeInTheDocument();
    expect(screen.getByText('Actualizar canales e IA')).toBeInTheDocument();
  });
});
