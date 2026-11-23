import { neighborhoodsApi } from '@/lib/catalog-api';
import { ineOcrApi } from '@/lib/ine-ocr-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PromovidoForm } from '../promovido-form';

vi.mock('@/lib/promovidos-api', () => ({
  promovidosApi: {
    checkVoterKey: vi.fn().mockResolvedValue({ ok: true, data: { conflict: null } }),
  },
}));

vi.mock('@/lib/ine-ocr-api', () => ({
  ineOcrApi: {
    matchNeighborhood: vi.fn(),
  },
}));

vi.mock('@/lib/catalog-api', () => ({
  neighborhoodsApi: {
    list: vi.fn(),
  },
}));

const sections = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    sectionCode: '0042',
    state: { id: 'state-1', name: 'CHIAPAS' },
    district: { id: 'district-1', code: '01' },
    leaders: [],
  },
];

const leaders = [
  {
    id: '22222222-2222-2222-2222-222222222222',
    fullName: 'Juan Pérez',
    sectionId: '11111111-1111-1111-1111-111111111111',
    section: { sectionCode: '0042', state: { name: 'CHIAPAS' }, district: { code: '01' } },
  },
];

function setup(props = {}) {
  const onSubmit = vi.fn().mockResolvedValue({ success: true });
  const onCancel = vi.fn();
  const rendered = render(
    <PromovidoForm
      mode="create"
      sections={sections}
      leaders={leaders}
      loadingCatalogs={false}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitting={false}
      {...props}
    />,
  );
  return { ...rendered, onSubmit, onCancel };
}

describe('PromovidoForm', () => {
  it('renders identity, address and management blocks', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Identidad' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Domicilio' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Gestión' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar promovido' })).toBeInTheDocument();
  });

  it('shows validation errors for empty required fields on submit', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar promovido' }));

    await waitFor(() => {
      expect(screen.getByText('El nombre es obligatorio.')).toBeInTheDocument();
      expect(screen.getByText('El apellido paterno es obligatorio.')).toBeInTheDocument();
      expect(
        screen.getByText('La clave de elector debe tener al menos 12 caracteres.'),
      ).toBeInTheDocument();
      expect(screen.getByText('La CURP debe tener 18 caracteres.')).toBeInTheDocument();
      expect(screen.getByText('Seleccioná una colonia del catálogo.')).toBeInTheDocument();
    });
  });

  it('renders a country phone input defaulting to Mexico', () => {
    setup();
    expect(screen.getByLabelText('Teléfono')).toBeInTheDocument();
    const country = screen.getByRole('combobox', { name: 'Phone number country' });
    expect(country).toHaveValue('MX');
  });

  it('submits a national MX number as digits including the country code', async () => {
    vi.mocked(neighborhoodsApi.list).mockResolvedValue({
      ok: true,
      data: {
        neighborhoods: [{ id: '33333333-3333-3333-3333-333333333333', name: 'Centro' }],
        meta: { count: 1, hasNextPage: false },
      },
    } as never);
    const { onSubmit } = setup({
      initialValues: {
        firstName: 'ARLY DAYANARA',
        paternalLastName: 'LAM',
        curp: 'LARA961120MCSMQR01',
        voterKey: 'LMRQAR96112007M700',
        sex: 'M',
        sectionId: '11111111-1111-1111-1111-111111111111',
        leaderId: '22222222-2222-2222-2222-222222222222',
        neighborhoodId: '33333333-3333-3333-3333-333333333333',
        neighborhood: 'Centro',
        phone: '9611234567',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar promovido' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '529611234567',
        }),
      );
    });
  });

  it('pre-selects a uniquely resolved OCR section and leader', async () => {
    vi.mocked(neighborhoodsApi.list).mockResolvedValue({
      ok: true,
      data: {
        neighborhoods: [{ id: '33333333-3333-3333-3333-333333333333', name: 'Colonia' }],
        meta: { count: 1, hasNextPage: false },
      },
    } as never);
    const { onSubmit } = setup({
      detected: {
        firstName: 'ARLY DAYANARA',
        paternalLastName: 'LAM',
        curp: 'LARA961120MCSMQR01',
        voterKey: 'LMRQAR96112007M700',
        birthDate: '20/11/1996',
        sex: 'M',
        sectionId: '11111111-1111-1111-1111-111111111111',
        leaderId: '22222222-2222-2222-2222-222222222222',
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre *')).toHaveValue('ARLY DAYANARA');
    });
    expect(screen.getByLabelText('Clave de elector *')).toHaveValue('LMRQAR96112007M700');

    fireEvent.click(screen.getByRole('combobox', { name: 'Buscar colonia del catálogo' }));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Colonia' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('option', { name: 'Colonia' }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar promovido' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionId: '11111111-1111-1111-1111-111111111111',
        leaderId: '22222222-2222-2222-2222-222222222222',
      }),
    );
  });

  it('does not pre-select section or leader when OCR resolution is ambiguous', async () => {
    const { onSubmit } = setup({
      detected: {
        firstName: 'ARLY DAYANARA',
        paternalLastName: 'LAM',
        curp: 'LARA961120MCSMQR01',
        voterKey: 'LMRQAR96112007M700',
        birthDate: '1996-11-20',
        sex: 'M',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar promovido' }));

    await waitFor(() => {
      expect(screen.getByText('Seleccioná una sección válida.')).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('pre-selects a safe OCR catalog match without rendering a free-text colonia input', async () => {
    vi.mocked(ineOcrApi.matchNeighborhood).mockResolvedValue({
      ok: true,
      data: {
        match: {
          rawValue: 'COL CENTR0',
          normalizedValue: 'centro',
          matchPrincipal: {
            id: '33333333-3333-3333-3333-333333333333',
            name: 'Centro',
            matchKey: 'centro',
            score: 0.91,
          },
          alternatives: [
            {
              id: '33333333-3333-3333-3333-333333333333',
              name: 'Centro',
              matchKey: 'centro',
              score: 0.91,
            },
          ],
          confidence: 0.91,
          requiresManualDecision: false,
        },
      },
    } as never);
    const { onSubmit } = setup({
      detected: {
        firstName: 'ARLY DAYANARA',
        paternalLastName: 'LAM',
        curp: 'LARA961120MCSMQR01',
        voterKey: 'LMRQAR96112007M700',
        birthDate: '1996-11-20',
        sex: 'M',
        neighborhood: 'COL CENTR0',
        sectionId: '11111111-1111-1111-1111-111111111111',
        leaderId: '22222222-2222-2222-2222-222222222222',
      },
    });

    await waitFor(() => {
      expect(ineOcrApi.matchNeighborhood).toHaveBeenCalledWith({
        rawValue: 'COL CENTR0',
        sectionId: '11111111-1111-1111-1111-111111111111',
      });
    });
    expect(screen.queryByLabelText('Texto de la credencial')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Texto manual si no existe en catálogo'),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Coincidencia OCR preseleccionada: Centro/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar promovido' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          neighborhood: 'Centro',
          neighborhoodId: '33333333-3333-3333-3333-333333333333',
        }),
      );
    });
  });

  it('lets manual capture select a catalog colonia', async () => {
    vi.mocked(neighborhoodsApi.list).mockResolvedValue({
      ok: true,
      data: {
        neighborhoods: [{ id: '33333333-3333-3333-3333-333333333333', name: 'Centro' }],
        meta: { count: 1, hasNextPage: false },
      },
    } as never);
    const { onSubmit } = setup({
      initialValues: {
        firstName: 'ARLY DAYANARA',
        paternalLastName: 'LAM',
        curp: 'LARA961120MCSMQR01',
        voterKey: 'LMRQAR96112007M700',
        sex: 'M',
        sectionId: '11111111-1111-1111-1111-111111111111',
        leaderId: '22222222-2222-2222-2222-222222222222',
        phone: '9611234567',
      },
    });

    fireEvent.click(screen.getByRole('combobox', { name: 'Buscar colonia del catálogo' }));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Centro' })).toBeInTheDocument();
    });
    expect(neighborhoodsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: '11111111-1111-1111-1111-111111111111' }),
    );
    fireEvent.click(screen.getByRole('option', { name: 'Centro' }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar promovido' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          neighborhood: 'Centro',
          neighborhoodId: '33333333-3333-3333-3333-333333333333',
        }),
      );
    });
  });

  it('lets manual capture search the full catalog before a section is chosen', async () => {
    vi.mocked(neighborhoodsApi.list).mockResolvedValue({
      ok: true,
      data: {
        neighborhoods: [
          {
            id: '33333333-3333-3333-3333-333333333333',
            name: 'Centro',
            municipality: 'Tuxtla Gutiérrez',
          },
        ],
        meta: { count: 1, hasNextPage: false },
      },
    } as never);
    setup({
      initialValues: {
        firstName: 'ARLY DAYANARA',
        paternalLastName: 'LAM',
        curp: 'LARA961120MCSMQR01',
        voterKey: 'LMRQAR96112007M700',
        sex: 'M',
        phone: '9611234567',
      },
    });

    const combobox = screen.getByRole('combobox', { name: 'Buscar colonia del catálogo' });
    expect(combobox).toBeEnabled();
    fireEvent.click(combobox);

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Centro/ })).toBeInTheDocument();
    });
    expect(neighborhoodsApi.list).toHaveBeenCalledWith({ limit: 20 });
    fireEvent.click(screen.getByRole('option', { name: /Centro/ }));
    expect(combobox).toHaveTextContent(/Centro/);
  });

  it('requires a catalog selection when OCR has no safe neighborhood match', async () => {
    vi.mocked(ineOcrApi.matchNeighborhood).mockResolvedValue({
      ok: true,
      data: {
        match: {
          rawValue: 'COL DESCONOCIDA',
          normalizedValue: 'desconocida',
          alternatives: [],
          confidence: 0,
          requiresManualDecision: true,
        },
      },
    } as never);
    const { onSubmit } = setup({
      detected: {
        firstName: 'ARLY DAYANARA',
        paternalLastName: 'LAM',
        curp: 'LARA961120MCSMQR01',
        voterKey: 'LMRQAR96112007M700',
        neighborhood: 'COL DESCONOCIDA',
        sectionId: '11111111-1111-1111-1111-111111111111',
        leaderId: '22222222-2222-2222-2222-222222222222',
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Lectura OCR sin coincidencia segura')).toBeInTheDocument();
      expect(screen.getByText('COL DESCONOCIDA')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Texto de la credencial')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar promovido' }));

    await waitFor(() => {
      expect(screen.getByText('Seleccioná una colonia del catálogo.')).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps persisted edit territory until an operator accepts a re-scan suggestion, then allows manual override', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(ineOcrApi.matchNeighborhood).mockResolvedValue({
      ok: true,
      data: {
        match: {
          rawValue: 'COL NORTE',
          normalizedValue: 'norte',
          bestMatch: {
            id: '44444444-4444-4444-4444-444444444444',
            name: 'Norte',
            matchKey: 'norte',
            sectionId: '11111111-1111-1111-1111-111111111111',
            score: 0.94,
          },
          alternatives: [],
          confidence: 0.94,
          requiresManualDecision: false,
        },
      },
    } as never);
    vi.mocked(neighborhoodsApi.list).mockResolvedValue({
      ok: true,
      data: {
        neighborhoods: [{ id: '55555555-5555-5555-5555-555555555555', name: 'Manual' }],
        meta: { count: 1, hasNextPage: false },
      },
    } as never);
    const { onSubmit } = setup({
      mode: 'edit',
      initialValues: {
        firstName: 'ANTONIO',
        paternalLastName: 'CRUZ',
        curp: 'CUHA950613HCSRRN06',
        voterKey: 'CUHAPE95061306H700',
        sex: 'H',
        sectionId: '11111111-1111-1111-1111-111111111111',
        leaderId: '22222222-2222-2222-2222-222222222222',
        phone: '9611234567',
        neighborhoodId: '33333333-3333-3333-3333-333333333333',
        neighborhood: 'Centro',
      },
      rescanDetected: { neighborhood: 'COL NORTE' },
    });

    expect(screen.getByRole('combobox', { name: 'Buscar colonia del catálogo' })).toHaveTextContent(
      'Centro',
    );
    expect(await screen.findByText('Nueva sugerencia OCR: Norte')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugerencia OCR' }));
    expect(screen.getByRole('combobox', { name: 'Buscar colonia del catálogo' })).toHaveTextContent(
      'Norte',
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Buscar colonia del catálogo' }));
    expect(await screen.findByRole('option', { name: 'Manual' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Manual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          neighborhoodId: '55555555-5555-5555-5555-555555555555',
          neighborhood: 'Manual',
        }),
      );
    });
  });

  it('passes municipality and postalCode from OCR data to the neighborhood matcher for multi-municipio disambiguation', async () => {
    vi.mocked(ineOcrApi.matchNeighborhood).mockResolvedValue({
      ok: true,
      data: {
        match: {
          rawValue: 'COL CENTRO',
          normalizedValue: 'centro',
          matchPrincipal: {
            id: '33333333-3333-3333-3333-333333333333',
            name: 'Centro',
            matchKey: 'centro',
            score: 0.92,
          },
          alternatives: [],
          confidence: 0.92,
          requiresManualDecision: false,
        },
      },
    } as never);

    setup({
      detected: {
        firstName: 'JUAN',
        paternalLastName: 'LOPEZ',
        curp: 'LOJ900101HCHRRN00',
        voterKey: 'LOPRJU90010107H700',
        birthDate: '1990-01-01',
        sex: 'H',
        neighborhood: 'COL CENTRO',
        municipality: 'Cintalapa de Figueroa',
        postalCode: '30400',
        sectionId: '11111111-1111-1111-1111-111111111111',
        leaderId: '22222222-2222-2222-2222-222222222222',
      },
    });

    await waitFor(() => {
      expect(ineOcrApi.matchNeighborhood).toHaveBeenCalledWith({
        rawValue: 'COL CENTRO',
        sectionId: '11111111-1111-1111-1111-111111111111',
        municipality: 'Cintalapa de Figueroa',
        postalCode: '30400',
      });
    });
  });

  it('shows OCR-missing banners for CURP and voter key when OCR did not detect them', () => {
    setup({ detected: { firstName: 'JUAN', paternalLastName: 'LOPEZ' } });
    expect(
      screen.getByText('El OCR no detectó la CURP. Ingresala manualmente.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('El OCR no detectó la clave de elector. Ingresala manualmente.'),
    ).toBeInTheDocument();
  });

  it('does not show OCR-missing banners when OCR detected CURP and voter key', () => {
    setup({
      detected: {
        firstName: 'JUAN',
        paternalLastName: 'LOPEZ',
        curp: 'LOJ900101HCHRRN00',
        voterKey: 'LOPRJU90010107H700',
      },
    });
    expect(
      screen.queryByText('El OCR no detectó la CURP. Ingresala manualmente.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('El OCR no detectó la clave de elector. Ingresala manualmente.'),
    ).not.toBeInTheDocument();
  });
});
