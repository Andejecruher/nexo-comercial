import { CreateEventModal } from '@/components/admin/create-event-modal';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/admin/electoral-catalog/BarrioSelectCombobox', () => ({
  formatBarrioLabel: (name: string, municipality?: string | null) =>
    municipality ? `${name}, ${municipality}` : name,
  BarrioSelectCombobox: ({
    onChange,
    id,
  }: {
    id?: string;
    onChange: (option: { id: string; name: string } | null) => void;
  }) => (
    <button type="button" id={id} onClick={() => onChange({ id: 'n1', name: 'Centro' })}>
      Barrio / Colonia
    </button>
  ),
}));

describe('CreateEventModal', () => {
  it('muestra errores de validación si falta el título o el inicio', async () => {
    const onSubmit = vi.fn();
    render(<CreateEventModal open onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    expect(
      await screen.findByText('El título debe tener al menos 2 caracteres.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envía el payload ISO y cierra el modal al crear', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    const initialDate = new Date(2026, 4, 10, 0, 0, 0);

    render(
      <CreateEventModal
        open
        onOpenChange={onOpenChange}
        initialDate={initialDate}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Jornada en Centro' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Barrio / Colonia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0] as {
      title: string;
      neighborhood?: string;
      startsAt: string;
    };
    expect(payload.title).toBe('Jornada en Centro');
    expect(payload.neighborhood).toBe('Centro');
    expect(payload.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('no cierra el modal si la creación falla', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false });
    const onOpenChange = vi.fn();

    render(
      <CreateEventModal
        open
        onOpenChange={onOpenChange}
        initialDate={new Date(2026, 4, 10, 9, 0)}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Jornada fallida' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('puebla el formulario y guarda cambios en modo edición', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    const eventData = {
      id: 'evt-1',
      title: 'Asamblea centro',
      slug: 'asamblea-centro',
      eventType: 'townhall' as const,
      status: 'published' as const,
      startsAt: new Date(2026, 4, 10, 18, 0).toISOString(),
      neighborhood: 'Centro',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(
      <CreateEventModal
        open
        onOpenChange={onOpenChange}
        eventData={eventData}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Editar jornada' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Asamblea centro');
    expect(screen.queryByRole('button', { name: 'Crear evento' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0] as { title: string; neighborhood?: string };
    expect(payload.title).toBe('Asamblea centro');
    expect(payload.neighborhood).toBe('Centro');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
