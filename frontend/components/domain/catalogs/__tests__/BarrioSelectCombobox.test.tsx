import {
  BarrioSelectCombobox,
  type BarrioOption,
} from '@/components/domain/catalogs/BarrioSelectCombobox';
import { neighborhoodsApi } from '@/lib/catalog-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/catalog-api', () => ({
  neighborhoodsApi: {
    list: vi.fn(),
  },
}));

const SECTION_ID = '11111111-1111-1111-1111-111111111111';
const list = vi.mocked(neighborhoodsApi.list);

function page(neighborhoods: BarrioOption[]) {
  return {
    ok: true,
    data: {
      neighborhoods,
      meta: { count: neighborhoods.length, hasNextPage: false },
    },
  } as never;
}

beforeEach(() => {
  list.mockReset();
  list.mockResolvedValue(
    page([{ id: 'barrio-1', name: 'Centro', municipality: 'Tuxtla Gutiérrez' }]),
  );
});

describe('BarrioSelectCombobox', () => {
  it('loads the section-scoped catalog only after opening', async () => {
    render(<BarrioSelectCombobox seccionId={SECTION_ID} onChange={vi.fn()} />);

    expect(list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('combobox'));

    await waitFor(() => expect(list).toHaveBeenCalledWith({ sectionId: SECTION_ID, limit: 20 }));
    expect(await screen.findByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('Tuxtla Gutiérrez')).toBeInTheDocument();
  });

  it('keeps the selector disabled when a required section is missing', () => {
    render(<BarrioSelectCombobox onChange={vi.fn()} />);

    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(list).not.toHaveBeenCalled();
  });

  it('loads all neighborhoods for CitizenFilters when section scoping is disabled', async () => {
    render(<BarrioSelectCombobox requireSection={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox'));

    await waitFor(() => expect(list).toHaveBeenCalledWith({ limit: 20 }));
    expect(await screen.findByText('Centro')).toBeInTheDocument();
  });

  it('preserves the selected option callback used by event creation', async () => {
    const onChange = vi.fn();
    render(<BarrioSelectCombobox seccionId={SECTION_ID} onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText('Centro'));

    expect(onChange).toHaveBeenCalledWith({
      id: 'barrio-1',
      name: 'Centro',
      municipality: 'Tuxtla Gutiérrez',
    });
  });

  it('keeps an assigned label visible before its catalog page loads', () => {
    render(
      <BarrioSelectCombobox
        seccionId={SECTION_ID}
        value="barrio-9"
        selectedLabel="Barrio Nuevo"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Barrio Nuevo');
    expect(list).not.toHaveBeenCalled();
  });
});
