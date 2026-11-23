import { ElectoralCatalogView } from '@/components/admin/electoral-catalog-view';
import { ineOcrApi } from '@/lib/ine-ocr-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ine-ocr-api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ineOcrApi: {
    catalog: {
      listStates: vi.fn(),
      listDistricts: vi.fn(),
      listSections: vi.fn(),
      createState: vi.fn(),
      createDistrict: vi.fn(),
      createSection: vi.fn(),
      updateState: vi.fn(),
      updateDistrict: vi.fn(),
      updateSection: vi.fn(),
      deleteState: vi.fn(),
      deleteDistrict: vi.fn(),
      deleteSection: vi.fn(),
    },
  },
}));

vi.mock('@/lib/catalog-api', () => ({
  neighborhoodsApi: {
    list: vi.fn().mockResolvedValue({
      ok: true,
      data: { neighborhoods: [], meta: { count: 0, hasNextPage: false } },
    }),
  },
}));

const catalog = vi.mocked(ineOcrApi.catalog);

const state = { id: 'state-1', code: '07', name: 'Chiapas', isActive: true };
const district = {
  id: 'district-1',
  stateId: state.id,
  code: '01',
  name: 'Tuxtla',
  isActive: true,
  state: { id: state.id, name: state.name },
};
const section = {
  id: 'section-1',
  stateId: state.id,
  districtId: district.id,
  sectionCode: '0042',
  isActive: true,
  state: { id: state.id, name: state.name },
  district: { id: district.id, code: district.code },
  leaders: [],
};
function mockCatalog({
  states = [],
  districts = [],
  sections = [],
}: {
  states?: (typeof state)[];
  districts?: (typeof district)[];
  sections?: (typeof section)[];
} = {}) {
  catalog.listStates.mockResolvedValue({ ok: true, data: { states } });
  catalog.listDistricts.mockResolvedValue({ ok: true, data: { districts } });
  catalog.listSections.mockResolvedValue({ ok: true, data: { sections } });
}

describe('ElectoralCatalogView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps downstream registration steps disabled when the catalog is empty', async () => {
    mockCatalog();
    render(<ElectoralCatalogView />);

    await waitFor(() => expect(catalog.listStates).toHaveBeenCalledWith(true));

    const createButton = screen.getByRole('button', { name: /Nuevo registro jerárquico/i });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);
    expect(await screen.findByText('Alta de catálogo electoral')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar estado' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Distrito/i }));
    expect(screen.getByRole('button', { name: 'Agregar distrito' })).toBeDisabled();
    expect(
      screen.getByText(/Registrá un estado activo para habilitar este nivel/i),
    ).toBeInTheDocument();
  });

  it('unlocks and prefills the hierarchy from existing active records', async () => {
    mockCatalog({ states: [state], districts: [district], sections: [section] });
    render(<ElectoralCatalogView />);

    await waitFor(() => expect(catalog.listSections).toHaveBeenCalled());
    const createButton = screen.getByRole('button', { name: /Nuevo registro jerárquico/i });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);
    expect(await screen.findByText('Alta de catálogo electoral')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sección/i }));
    expect(screen.getByRole('button', { name: 'Agregar sección' })).toBeEnabled();

    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes[0]).toHaveTextContent('07 · Chiapas');
    expect(comboboxes[1]).toHaveTextContent('Distrito 01 · Tuxtla');
  });

  it('defaults to the states tab and renders geographic columns', async () => {
    mockCatalog({ states: [state], districts: [district], sections: [section] });
    render(<ElectoralCatalogView />);

    await waitFor(() => expect(catalog.listStates).toHaveBeenCalledWith(true));
    const statesTab = screen.getByRole('tab', { name: /Estados/i });
    await waitFor(() => expect(statesTab).toHaveAttribute('data-state', 'active'));

    expect(await screen.findByText('Chiapas')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Código' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Líderes activos/i })).not.toBeInTheDocument();
  });

  it('creates a section from the guided catalog form', async () => {
    mockCatalog({ states: [state], districts: [district], sections: [section] });
    catalog.createSection.mockResolvedValue({
      ok: true,
      data: {
        section: {
          id: 'section-2',
          stateId: state.id,
          districtId: district.id,
          sectionCode: '0099',
          isActive: true,
        },
      },
    });
    render(<ElectoralCatalogView />);

    await waitFor(() => expect(catalog.listSections).toHaveBeenCalled());
    const createButton = screen.getByRole('button', { name: /Nuevo registro jerárquico/i });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);
    expect(await screen.findByText('Alta de catálogo electoral')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sección/i }));

    fireEvent.change(screen.getByLabelText('Código de sección'), {
      target: { value: '0099' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar sección' }));

    await waitFor(() =>
      expect(catalog.createSection).toHaveBeenCalledWith(
        expect.objectContaining({
          stateId: state.id,
          districtId: district.id,
          sectionCode: '0099',
        }),
      ),
    );
  });
});
