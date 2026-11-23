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
  it('loads the neighborhood catalog only after opening', async () => {
    render(<BarrioSelectCombobox onChange={vi.fn()} />);

    expect(list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('combobox'));

    await waitFor(() => expect(list).toHaveBeenCalledWith({ limit: 20 }));
    expect(await screen.findByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('Tuxtla Gutiérrez')).toBeInTheDocument();
  });

  it('preserves the selected option callback used by event creation', async () => {
    const onChange = vi.fn();
    render(<BarrioSelectCombobox onChange={onChange} />);
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
      <BarrioSelectCombobox value="barrio-9" selectedLabel="Barrio Nuevo" onChange={vi.fn()} />,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Barrio Nuevo');
    expect(list).not.toHaveBeenCalled();
  });
});
