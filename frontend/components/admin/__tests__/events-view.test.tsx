import { EventsView } from '@/components/admin/events-view';
import { eventsApi } from '@/lib/events-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createEvent = vi.fn();
const updateEvent = vi.fn();
const refresh = vi.fn();

vi.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({
    events: [],
    loading: false,
    error: undefined,
    hasNextPage: false,
    hasPreviousPage: false,
    totalCount: 0,
    currentPage: 1,
    filters: { search: '', status: undefined, eventType: undefined, visibility: undefined },
    setSearch: vi.fn(),
    setStatusFilter: vi.fn(),
    setEventTypeFilter: vi.fn(),
    setVisibilityFilter: vi.fn(),
    clearFilters: vi.fn(),
    refresh,
    nextPage: vi.fn(),
    previousPage: vi.fn(),
    firstPage: vi.fn(),
    createEvent,
    updateEvent,
    getEvent: vi.fn(),
  }),
}));

vi.mock('@/components/admin/electoral-catalog/BarrioSelectCombobox', () => ({
  formatBarrioLabel: (name: string, municipality?: string | null) =>
    municipality ? `${name}, ${municipality}` : name,
  BarrioSelectCombobox: ({ id }: { id?: string }) => (
    <button type="button" id={id}>
      Barrio / Colonia
    </button>
  ),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    roles: ['SUPER_ADMIN'],
    guards: {},
  }),
}));

vi.mock('@/lib/events-api', () => ({
  eventsApi: {
    list: vi.fn(),
  },
}));

const calendarEvent = {
  id: 'evt-1',
  title: 'Asamblea centro',
  slug: 'asamblea-centro',
  eventType: 'townhall' as const,
  status: 'published' as const,
  visibility: 'public' as const,
  startsAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('EventsView', () => {
  beforeEach(() => {
    createEvent.mockReset();
    updateEvent.mockReset();
    refresh.mockReset();
    vi.mocked(eventsApi.list).mockResolvedValue({
      ok: true,
      data: { events: [], meta: { hasNextPage: false, count: 0 } },
    } as never);
  });

  it('abre el modal desde el botón principal y refresca al crear', async () => {
    createEvent.mockResolvedValue({ ok: true, event: { id: 'evt-1' } });
    render(<EventsView />);

    fireEvent.click(await screen.findByRole('button', { name: /Nueva jornada/i }));
    expect(screen.getByRole('heading', { name: 'Nueva jornada de atención' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Jornada de prueba' },
    });
    fireEvent.change(screen.getByLabelText('Inicio'), {
      target: { value: '100520260900' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Nueva jornada de atención' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('crea eventos públicos por defecto', async () => {
    createEvent.mockResolvedValue({ ok: true, event: { id: 'evt-1' } });
    render(<EventsView />);

    fireEvent.click(await screen.findByRole('button', { name: /Nueva jornada/i }));
    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Jornada de prueba' },
    });
    fireEvent.change(screen.getByLabelText('Inicio'), {
      target: { value: '100520260900' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    await waitFor(() =>
      expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'public' })),
    );
  });

  it('abre el modal de edición desde el lápiz y llama updateEvent', async () => {
    updateEvent.mockResolvedValue({
      ok: true,
      event: { ...calendarEvent, title: 'Asamblea centro' },
    });
    vi.mocked(eventsApi.list).mockResolvedValue({
      ok: true,
      data: { events: [calendarEvent], meta: { hasNextPage: false, count: 1 } },
    } as never);

    render(<EventsView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Asamblea centro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar evento' }));

    expect(screen.getByRole('heading', { name: 'Editar jornada' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Asamblea centro');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(updateEvent).toHaveBeenCalledTimes(1));
    expect(createEvent).not.toHaveBeenCalled();
    expect(updateEvent.mock.calls[0]?.[0]).toBe('evt-1');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('mantiene una sola vista sin pestañas de agenda interna', async () => {
    render(<EventsView />);

    expect(screen.queryByRole('tab', { name: 'Agenda Interna' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Eventos Públicos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    await waitFor(() => expect(eventsApi.list).toHaveBeenCalled());
  });
});
