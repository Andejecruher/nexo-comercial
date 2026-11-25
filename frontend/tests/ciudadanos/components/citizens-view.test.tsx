import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CitizensView } from '@/components/ciudadanos/citizens-view';
import { useCitizens } from '@/hooks/ciudadanos/useCitizens';
import { citizensApi, type Citizen } from '@/lib/shared/citizens-api';

vi.mock('@/hooks/ciudadanos/useCitizens', () => ({ useCitizens: vi.fn() }));
vi.mock('@/hooks/shared/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('@/lib/shared/citizens-api', async (original) => ({
  ...(await original<object>()),
  citizensApi: { update: vi.fn(), remove: vi.fn() },
}));
vi.mock('@/components/ciudadanos/CitizenFilters', () => ({ CitizenFilters: () => null }));
vi.mock('@/components/ciudadanos/CitizenWhatsAppPanel', () => ({
  CitizenWhatsAppPanel: () => null,
}));
vi.mock('@/components/shared/catalogs/PaginationControls', () => ({
  PaginationControls: () => null,
}));
vi.mock('@/components/ciudadanos/ExportButton', () => ({ ExportButton: () => null }));

const citizen: Citizen = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  name: 'Ana',
  lastName: 'López',
  phone: '525512345678',
  email: 'ana@example.com',
  consentGiven: true,
  interests: [],
  sourceChannel: 'web',
  leadStatus: 'new',
  createdAt: '',
  updatedAt: '',
};
const updateCitizenLocally = vi.fn();
const removeCitizenLocally = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCitizens).mockReturnValue({
    citizens: [citizen],
    loading: false,
    error: undefined,
    totalCount: 1,
    selectedCitizenIds: [],
    filters: { search: '', phone: '' },
    hasNextPage: false,
    hasPreviousPage: false,
    currentPage: 1,
    toggleCitizenSelection: vi.fn(),
    toggleSelectAllCurrentPage: vi.fn(),
    clearSelection: vi.fn(),
    refresh: vi.fn(),
    clearFilters: vi.fn(),
    setSearch: vi.fn(),
    setPhone: vi.fn(),
    setLeadStatus: vi.fn(),
    setNeighborhood: vi.fn(),
    nextPage: vi.fn(),
    previousPage: vi.fn(),
    firstPage: vi.fn(),
    updateCitizenLocally,
    removeCitizenLocally,
  } as ReturnType<typeof useCitizens>);
});

describe('CitizensView actions', () => {
  it('saves edited fields and updates the list locally', async () => {
    vi.mocked(citizensApi.update).mockResolvedValueOnce({
      ok: true,
      data: { citizen: { ...citizen, name: 'María', email: undefined } },
    });
    render(<CitizensView />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar Ana López' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'María' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(citizensApi.update).toHaveBeenCalledWith(citizen.id, { name: 'María', email: null }),
    );
    expect(updateCitizenLocally).toHaveBeenCalledWith(expect.objectContaining({ name: 'María' }));
  });

  it('asks for confirmation before deletion and removes the row locally', async () => {
    vi.mocked(citizensApi.remove).mockResolvedValueOnce({ ok: true, data: { citizen } });
    render(<CitizensView />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Ana López' }));
    expect(
      screen.getByText(/¿Estás seguro de que deseas eliminar al ciudadano Ana López/),
    ).toBeInTheDocument();
    expect(citizensApi.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Eliminar$/ }));
    await waitFor(() => expect(citizensApi.remove).toHaveBeenCalledWith(citizen.id));
    expect(removeCitizenLocally).toHaveBeenCalledWith(citizen.id);
  });
});
