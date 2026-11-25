import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactEditor } from '@/components/conversaciones/ContactEditor';

const list = vi.hoisted(() => vi.fn());

vi.mock('@/lib/shared/citizens-api', () => ({
  citizensApi: { list },
}));

describe('ContactEditor', () => {
  beforeEach(() => {
    list.mockResolvedValue({
      ok: true,
      data: {
        citizens: [
          {
            id: 'citizen-1',
            name: 'María',
            lastName: 'González',
            phone: '5215512345678',
            email: 'maria@example.com',
            neighborhood: 'La Candelaria',
          },
        ],
      },
    });
  });

  it('searches citizens and submits only the selected citizen id', async () => {
    const onAdd = vi.fn();
    const onOpenChange = vi.fn();
    render(<ContactEditor open onOpenChange={onOpenChange} onAdd={onAdd} />);

    expect(screen.queryByText('Teléfonos separados por comas')).not.toBeInTheDocument();
    expect(screen.queryByText('Correo electrónico (opcional)')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar ciudadano'), { target: { value: 'Mar' } });
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Mar' }),
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(await screen.findByRole('option', { name: /María González/ }));

    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir al mensaje' }));

    expect(onAdd).toHaveBeenCalledWith({ citizenId: 'citizen-1', name: 'María González' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
