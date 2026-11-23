import { act, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomToaster } from '../toaster-custom';

vi.unmock('sonner');

async function toastRoot(message: string): Promise<HTMLElement> {
  const node = await screen.findByText(message);
  const root = node.closest('[data-sonner-toast]');
  if (!(root instanceof HTMLElement)) {
    throw new Error(`Toast root not found for "${message}"`);
  }
  return root;
}

describe('CustomToaster', () => {
  afterEach(() => {
    toast.dismiss();
  });

  it('renders a clean card surface with brand type accents', async () => {
    render(<CustomToaster />);

    const cases = [
      {
        fire: () => toast.success('Guardado correctamente'),
        message: 'Guardado correctamente',
        type: 'success',
        accent: 'border-l-primary',
      },
      {
        fire: () => toast.error('No se pudo guardar'),
        message: 'No se pudo guardar',
        type: 'error',
        accent: 'border-l-destructive',
      },
      {
        fire: () => toast.warning('Revisa los datos'),
        message: 'Revisa los datos',
        type: 'warning',
        accent: 'border-l-accent',
      },
      {
        fire: () => toast.info('Hay una actualización'),
        message: 'Hay una actualización',
        type: 'info',
        accent: 'border-l-primary-light',
      },
    ] as const;

    for (const item of cases) {
      act(() => {
        toast.dismiss();
        item.fire();
      });
      const root = await toastRoot(item.message);
      expect(root).toHaveAttribute('data-type', item.type);
      expect(root.className).toContain('bg-card');
      expect(root.className).toContain(item.accent);
    }
  });

  it('exposes a close control on each notification', async () => {
    render(<CustomToaster />);
    act(() => {
      toast.message('Notificación de equipo');
    });

    const root = await toastRoot('Notificación de equipo');
    expect(root.querySelector('[data-close-button]')).not.toBeNull();
  });
});
