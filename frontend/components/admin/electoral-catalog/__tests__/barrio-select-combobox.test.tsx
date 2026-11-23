import {
  BarrioSelectCombobox,
  type BarrioOption,
} from '@/components/admin/electoral-catalog/BarrioSelectCombobox';
import { neighborhoodsApi } from '@/lib/catalog-api';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/catalog-api', () => ({
  neighborhoodsApi: {
    list: vi.fn(),
  },
}));

const SECTION_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SECTION_ID = '22222222-2222-2222-2222-222222222222';

const list = vi.mocked(neighborhoodsApi.list);

/** Dispara manualmente los sentinels observados: jsdom no implementa IntersectionObserver. */
const intersectionCallbacks = new Set<IntersectionObserverCallback>();

function page(
  neighborhoods: BarrioOption[],
  meta: { hasNextPage: boolean; nextCursor?: string } = { hasNextPage: false },
) {
  return {
    ok: true,
    data: {
      neighborhoods,
      meta: { count: neighborhoods.length, ...meta },
    },
  } as never;
}

function triggerIntersection() {
  const observer = { disconnect: vi.fn() } as unknown as IntersectionObserver;
  act(() => {
    for (const callback of intersectionCallbacks) {
      callback([{ isIntersecting: true } as IntersectionObserverEntry], observer);
    }
  });
}

function setup(props: Partial<Parameters<typeof BarrioSelectCombobox>[0]> = {}) {
  const onChange = vi.fn();
  const rendered = render(
    <BarrioSelectCombobox seccionId={SECTION_ID} onChange={onChange} {...props} />,
  );
  return { ...rendered, onChange };
}

function openCombobox() {
  fireEvent.click(screen.getByRole('combobox'));
}

/** jsdom reporta 0 en las métricas de layout, así que el overflow se simula. */
function overflow(element: HTMLElement, sizes: { scrollWidth: number; clientWidth: number }) {
  Object.defineProperty(element, 'scrollWidth', { value: sizes.scrollWidth, configurable: true });
  Object.defineProperty(element, 'clientWidth', { value: sizes.clientWidth, configurable: true });
}

beforeEach(() => {
  intersectionCallbacks.clear();
  class IntersectionObserverMock implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];

    constructor(private readonly callback: IntersectionObserverCallback) {
      intersectionCallbacks.add(callback);
    }

    observe = vi.fn();
    unobserve = vi.fn();
    takeRecords = vi.fn(() => []);
    disconnect = () => {
      intersectionCallbacks.delete(this.callback);
    };
  }
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  list.mockResolvedValue(
    page([{ id: 'barrio-1', name: 'Centro', municipality: 'Tuxtla Gutiérrez' }]),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('BarrioSelectCombobox', () => {
  it('does not query the catalog until the dropdown opens', async () => {
    setup();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(list).not.toHaveBeenCalled();
  });

  it('requests the first page scoped to the section without a cursor', async () => {
    setup();
    openCombobox();

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(list).toHaveBeenCalledWith({ sectionId: SECTION_ID, limit: 20 });
    expect(await screen.findByText('Centro')).toBeInTheDocument();
  });

  it('debounces the search into a single request', async () => {
    setup();
    openCombobox();
    expect(await screen.findByText('Centro')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(1);

    // El reloj se congela recién acá: el debounce es lo único sensible al tiempo.
    vi.useFakeTimers();
    const input = screen.getByPlaceholderText('Buscar barrio o colonia...');
    fireEvent.change(input, { target: { value: 'ce' } });
    fireEvent.change(input, { target: { value: 'cen' } });
    fireEvent.change(input, { target: { value: 'centro' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(list).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenLastCalledWith({
      sectionId: SECTION_ID,
      limit: 20,
      search: 'centro',
    });
  });

  it('loads the next page with the cursor when the sentinel becomes visible', async () => {
    list.mockResolvedValueOnce(
      page([{ id: 'barrio-1', name: 'Centro' }], { hasNextPage: true, nextCursor: 'barrio-1' }),
    );
    list.mockResolvedValueOnce(page([{ id: 'barrio-2', name: 'Las Palmas' }]));

    setup();
    openCombobox();

    expect(await screen.findByText('Cargar más barrios')).toBeInTheDocument();

    triggerIntersection();

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(list).toHaveBeenLastCalledWith({
      sectionId: SECTION_ID,
      limit: 20,
      cursor: 'barrio-1',
    });

    expect(await screen.findByText('Las Palmas')).toBeInTheDocument();
    expect(screen.getByText('Centro')).toBeInTheDocument();
  });

  it('shows the section-scoped empty state when there are no results', async () => {
    list.mockResolvedValue(page([]));
    setup();
    openCombobox();

    expect(
      await screen.findByText('No se encontraron barrios en esta sección'),
    ).toBeInTheDocument();
  });

  it('shows the assigned barrio label before the catalog is loaded', () => {
    setup({ value: 'barrio-9', selectedLabel: 'Barrio Nuevo' });
    expect(screen.getByRole('combobox')).toHaveTextContent('Barrio Nuevo');
    expect(list).not.toHaveBeenCalled();
  });

  it('reports the selected barrio and closes the dropdown', async () => {
    const { onChange } = setup();
    openCombobox();

    fireEvent.click(await screen.findByText('Centro'));

    expect(onChange).toHaveBeenCalledWith({
      id: 'barrio-1',
      name: 'Centro',
      municipality: 'Tuxtla Gutiérrez',
    });
  });

  it('shows the municipality next to the colonia so homonyms are distinguishable', async () => {
    list.mockResolvedValue(
      page([
        { id: 'barrio-1', name: 'Centro', municipality: 'Tuxtla Gutiérrez' },
        { id: 'barrio-2', name: 'Centro', municipality: 'San Cristóbal de las Casas' },
      ]),
    );
    setup();
    openCombobox();

    expect(await screen.findByText('Tuxtla Gutiérrez')).toBeInTheDocument();
    expect(screen.getByText('San Cristóbal de las Casas')).toBeInTheDocument();
    expect(screen.getAllByText('Centro')).toHaveLength(2);
  });

  it('shows only the colonia name when it has no municipality', async () => {
    list.mockResolvedValue(page([{ id: 'barrio-1', name: 'Centro' }]));
    setup();
    openCombobox();

    expect(await screen.findByText('Centro')).toBeInTheDocument();
    expect(screen.queryByText('Tuxtla Gutiérrez')).not.toBeInTheDocument();
  });

  it('labels the trigger with the colonia and its municipality once loaded', async () => {
    setup({ value: 'barrio-1' });
    // El input de cmdk también expone role combobox, así que el trigger se toma antes de abrir.
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    await waitFor(() => expect(trigger).toHaveTextContent('Centro, Tuxtla Gutiérrez'));
  });

  it('clears the barrio option when choosing "Sin barrio asignado"', async () => {
    const { onChange } = setup({ value: 'barrio-1' });
    openCombobox();

    fireEvent.click(await screen.findByText('Sin barrio asignado'));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('hides the "Sin barrio asignado" option when the barrio is required', async () => {
    setup({ value: 'barrio-1', allowNone: false });
    openCombobox();

    expect(await screen.findByText('Centro')).toBeInTheDocument();
    expect(screen.queryByText('Sin barrio asignado')).not.toBeInTheDocument();
  });

  it('labels the trigger for assistive tech when an ariaLabel is given', () => {
    setup({ ariaLabel: 'Buscar colonia del catálogo' });
    expect(
      screen.getByRole('combobox', { name: 'Buscar colonia del catálogo' }),
    ).toBeInTheDocument();
  });

  it('drops the previous list when the section changes', async () => {
    const { rerender, onChange } = setup();
    openCombobox();
    expect(await screen.findByText('Centro')).toBeInTheDocument();

    list.mockResolvedValue(page([{ id: 'barrio-3', name: 'Terán' }]));
    rerender(<BarrioSelectCombobox seccionId={OTHER_SECTION_ID} onChange={onChange} />);

    expect(await screen.findByText('Terán')).toBeInTheDocument();
    expect(screen.queryByText('Centro')).not.toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith({ sectionId: OTHER_SECTION_ID, limit: 20 });
  });

  it('disables the trigger while no section is selected', () => {
    setup({ seccionId: undefined });
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('shows the full barrio name in a tooltip when the label is truncated', async () => {
    const longName = 'Fraccionamiento Residencial Los Laureles Segunda Etapa';
    list.mockResolvedValue(page([{ id: 'barrio-1', name: longName }]));
    setup();
    openCombobox();

    const label = await screen.findByText(longName);
    overflow(label, { scrollWidth: 480, clientWidth: 220 });
    fireEvent.focus(label);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(longName);
  });

  it('keeps the tooltip hidden when the barrio name fits', async () => {
    setup();
    openCombobox();

    const label = await screen.findByText('Centro');
    overflow(label, { scrollWidth: 120, clientWidth: 220 });
    fireEvent.focus(label);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('lists the full catalog when section scoping is not required', async () => {
    setup({ seccionId: undefined, requireSection: false });
    openCombobox();

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(list).toHaveBeenCalledWith({ limit: 20 });
    expect(await screen.findByText('Centro')).toBeInTheDocument();
  });
});
