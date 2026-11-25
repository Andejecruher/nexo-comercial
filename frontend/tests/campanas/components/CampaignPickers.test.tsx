import { citizensApi, type Citizen } from '@/lib/shared/citizens-api';
import { templatesApi } from '@/lib/shared/templates-api';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignAudiencePicker } from '@/components/campanas/CampaignAudiencePicker';
import { CampaignTemplatePicker } from '@/components/shared/CampaignTemplatePicker';

const SEARCH_DEBOUNCE_MS = 300;

vi.mock('@/lib/shared/citizens-api', async (original) => ({
  ...(await original<object>()),
  citizensApi: { list: vi.fn() },
}));
vi.mock('@/lib/shared/templates-api', async (original) => ({
  ...(await original<object>()),
  templatesApi: { list: vi.fn() },
}));
afterEach(() => vi.useRealTimers());

const ana: Citizen = {
  id: 'ana',
  name: 'Ana',
  lastName: 'García',
  phone: '525512345678',
  leadStatus: 'new',
  sourceChannel: 'whatsapp',
  consentGiven: true,
  interests: [],
  createdAt: '2026-10-14T12:00:00.000Z',
  updatedAt: '2026-10-14T12:00:00.000Z',
};
const beto: Citizen = { ...ana, id: 'beto', name: 'Beto' };

function citizenPage(
  citizens: Citizen[],
  meta: { nextCursor?: string; hasNextPage?: boolean } = {},
) {
  return {
    ok: true as const,
    data: {
      citizens,
      meta: {
        nextCursor: meta.nextCursor,
        hasNextPage: meta.hasNextPage ?? false,
        count: citizens.length,
      },
    },
  };
}

function Audience() {
  const [selected, setSelected] = useState<Record<string, Citizen>>({});
  return <CampaignAudiencePicker selected={selected} onChange={setSelected} />;
}

describe('CampaignAudiencePicker', () => {
  beforeEach(() => {
    vi.mocked(citizensApi.list).mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('preserves selection across pages and searches the server by name or phone', async () => {
    vi.mocked(citizensApi.list).mockImplementation(async (params) => {
      if (params?.search || params?.cursor === 'cursor-2') return citizenPage([beto]);
      return citizenPage([ana], { hasNextPage: true, nextCursor: 'cursor-2' });
    });
    render(<Audience />);
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Seleccionar Ana García' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(citizensApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: 'cursor-2',
        limit: 50,
        consentGiven: true,
        hasPhone: true,
      }),
      expect.any(AbortSignal),
    );
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Seleccionar Beto García' }));
    expect(screen.getByText(/2 seleccionados/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(await screen.findByRole('checkbox', { name: 'Seleccionar Ana García' })).toBeChecked();
    expect(citizensApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: undefined }),
      expect.any(AbortSignal),
    );

    fireEvent.change(screen.getByLabelText('Buscar por nombre o teléfono'), {
      target: { value: '  +52 55  ' },
    });
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(citizensApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: undefined,
        search: '+52 55',
        consentGiven: true,
        hasPhone: true,
      }),
      expect.any(AbortSignal),
    );
    expect(await screen.findByRole('checkbox', { name: 'Seleccionar Beto García' })).toBeChecked();

    fireEvent.change(screen.getByLabelText('Buscar por nombre o teléfono'), {
      target: { value: '' },
    });
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(await screen.findByRole('checkbox', { name: 'Seleccionar Ana García' })).toBeChecked();
  });

  it('ignores stale search responses', async () => {
    type ListResult = Awaited<ReturnType<typeof citizensApi.list>>;
    let finish!: (value: ListResult) => void;
    vi.mocked(citizensApi.list)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(citizenPage([beto]));
    render(<Audience />);
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(citizensApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: undefined,
        consentGiven: true,
        hasPhone: true,
      }),
      expect.any(AbortSignal),
    );
    const firstSignal = vi.mocked(citizensApi.list).mock.calls.at(-1)?.[1];

    fireEvent.change(screen.getByLabelText('Buscar por nombre o teléfono'), {
      target: { value: ' Beto García ' },
    });
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(firstSignal?.aborted).toBe(true);
    expect(citizensApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'Beto García', cursor: undefined }),
      expect.any(AbortSignal),
    );
    await act(async () => {
      finish(citizenPage([ana]));
    });
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Beto García' })).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Seleccionar Ana García' }),
    ).not.toBeInTheDocument();
  });

  it('shows empty and failed searches and allows retrying without losing selection', async () => {
    let failedAnaSearch = false;
    vi.mocked(citizensApi.list).mockImplementation(async (params) => {
      if (params?.search === 'nadie') return citizenPage([]);
      if (params?.search === 'Ana' && !failedAnaSearch) {
        failedAnaSearch = true;
        return { ok: false, status: 0, message: 'Sin conexión' };
      }
      return citizenPage([ana]);
    });
    render(<Audience />);
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Seleccionar Ana García' }));

    fireEvent.change(screen.getByLabelText('Buscar por nombre o teléfono'), {
      target: { value: 'nadie' },
    });
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(
      await screen.findByText('No hay ciudadanos para los filtros seleccionados'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Buscar por nombre o teléfono'), {
      target: { value: 'Ana' },
    });
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('checkbox', { name: 'Seleccionar Ana García' })).toBeChecked();
  });
});

describe('CampaignTemplatePicker', () => {
  it('searches and paginates templates without downloading every page', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const template = {
      id: '123',
      name: 'aviso',
      language: 'es_MX',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [{ type: 'BODY', text: 'Hola' }],
    };
    vi.mocked(templatesApi.list)
      .mockResolvedValueOnce({ data: [template], nextCursor: 'next', cursor: '0' })
      .mockResolvedValue({ data: [{ ...template, id: '456', name: 'recordatorio' }], cursor: '0' });
    const onChange = vi.fn();
    render(<CampaignTemplatePicker lineId="line" onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(await screen.findByText('aviso · es_MX')).toBeInTheDocument();
    expect(templatesApi.list).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('recordatorio · es_MX')).toBeInTheDocument();
    expect(screen.queryByText('aviso · es_MX')).not.toBeInTheDocument();
    expect(templatesApi.list).toHaveBeenLastCalledWith(
      'line',
      'next',
      expect.any(AbortSignal),
      '',
      25,
    );
    fireEvent.change(screen.getByLabelText('Buscar plantilla por nombre'), {
      target: { value: 'record' },
    });
    await waitFor(() =>
      expect(templatesApi.list).toHaveBeenLastCalledWith(
        'line',
        undefined,
        expect.any(AbortSignal),
        'record',
        25,
      ),
    );
    fireEvent.click(await screen.findByText('recordatorio · es_MX'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: '456' }));
  });
});
