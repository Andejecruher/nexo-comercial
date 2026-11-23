import { StructuresView } from '@/components/admin/structures/StructuresView';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createStructure = vi.fn();
const updateStructure = vi.fn();
const removeStructure = vi.fn();

vi.mock('@/hooks/useStructures', () => ({
  useStructures: () => ({
    structures: [
      {
        id: 'st-1',
        slug: 'territorial',
        name: 'Territorial',
        color: '#10B981',
        managerFirstName: 'Ana',
        managerLastName: 'Torres',
        isActive: true,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ],
    activeStructures: [
      {
        id: 'st-1',
        slug: 'territorial',
        name: 'Territorial',
        color: '#10B981',
        managerFirstName: 'Ana',
        managerLastName: 'Torres',
        isActive: true,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ],
    loading: false,
    refresh: vi.fn(),
    createStructure,
    updateStructure,
    removeStructure,
  }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    guards: {
      canViewCoordinators: () => true,
      canCreateCoordinators: () => true,
      canUpdateCoordinators: () => true,
      canDeleteCoordinators: () => true,
    },
  }),
}));

describe('StructuresView', () => {
  beforeEach(() => {
    createStructure.mockReset();
    updateStructure.mockReset();
    removeStructure.mockReset();
  });

  it('renders the campaign catalog table and create action', () => {
    render(<StructuresView />);
    expect(screen.getByRole('heading', { name: 'Estructuras' })).toBeInTheDocument();
    expect(screen.getByText('Territorial')).toBeInTheDocument();
    expect(screen.getByText('Ana Torres')).toBeInTheDocument();
    expect(screen.getByText('territorial')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear estructura' })).toBeInTheDocument();
  });

  it('asks for confirmation before deactivating a structure', () => {
    render(<StructuresView />);
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar Territorial' }));
    expect(screen.getByText('¿Desactivar estructura?')).toBeInTheDocument();
    expect(removeStructure).not.toHaveBeenCalled();
  });
});
