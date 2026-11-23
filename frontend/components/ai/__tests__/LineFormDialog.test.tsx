import { LineFormDialog } from '@/components/ai/LineFormDialog';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('LineFormDialog', () => {
  it('mantiene el footer fuera del área de scroll para que las acciones queden visibles', () => {
    render(
      <LineFormDialog
        open
        title="Nueva línea"
        onClose={vi.fn()}
        footer={
          <>
            <button type="button">Cancelar</button>
            <button type="button">Crear línea</button>
          </>
        }
      >
        <p>Campos del formulario</p>
      </LineFormDialog>,
    );

    const content = screen.getByRole('dialog');
    expect(content.className).toMatch(/overflow-hidden/);
    expect(content.className).toMatch(/max-h-\[calc\(100dvh-1rem\)\]/);

    const body = screen.getByText('Campos del formulario').parentElement;
    expect(body?.className).toMatch(/overflow-y-auto/);

    const footer = screen.getByRole('button', { name: 'Crear línea' }).parentElement;
    expect(footer).not.toBe(body);
    expect(footer?.contains(body)).toBe(false);
    expect(body?.contains(footer)).toBe(false);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Crear línea' })).toBeVisible();
  });

  it('cierra el diálogo desde el botón de cerrar', () => {
    const onClose = vi.fn();
    render(
      <LineFormDialog
        open
        title="Configurar línea"
        onClose={onClose}
        footer={<button>Guardar</button>}
      >
        <p>Cuerpo</p>
      </LineFormDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
