import { DateTimePicker } from '@/components/ui/date-time-picker';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('DateTimePicker', () => {
  it('parsea la entrada enmascarada y llama onChange', () => {
    const onChange = vi.fn();
    render(<DateTimePicker value={undefined} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText('DD/MM/AAAA HH:mm'), {
      target: { value: '100520260930' },
    });

    expect(onChange).toHaveBeenCalled();
    const value = onChange.mock.calls.at(-1)?.[0] as Date;
    expect(value.getDate()).toBe(10);
    expect(value.getMonth()).toBe(4);
    expect(value.getFullYear()).toBe(2026);
    expect(value.getHours()).toBe(9);
    expect(value.getMinutes()).toBe(30);
  });

  it('en modo date no muestra selectores de hora', async () => {
    render(<DateTimePicker mode="date" value={undefined} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir calendario' }));
    expect(screen.queryByLabelText('Hora')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="calendar"]')).toBeTruthy();
  });

  it('muestra error accesible cuando la fecha es inválida', () => {
    render(<DateTimePicker mode="date" value={undefined} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText('DD/MM/AAAA');
    fireEvent.change(input, { target: { value: '32132026' } });
    fireEvent.blur(input);
    expect(screen.getByText('Usá el formato DD/MM/AAAA.')).toBeInTheDocument();
  });

  it('permite elegir hora y minutos desde el popover', async () => {
    const onChange = vi.fn();
    render(<DateTimePicker value={new Date(2026, 4, 10, 9, 0)} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir calendario' }));
    fireEvent.change(await screen.findByLabelText('Hora'), { target: { value: '14' } });
    const value = onChange.mock.calls.at(-1)?.[0] as Date;
    expect(value.getHours()).toBe(14);
    expect(value.getDate()).toBe(10);
  });
});
