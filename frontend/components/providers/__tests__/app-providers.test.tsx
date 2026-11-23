import { render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../app-providers';

// El setup global mockea sonner; acá necesitamos el Toaster real para comprobar que se monta.
vi.unmock('sonner');

describe('AppProviders', () => {
  it('mounts the Sonner toaster so notifications are visible', async () => {
    render(
      <AppProviders>
        <span>contenido</span>
      </AppProviders>,
    );

    expect(screen.getByText('contenido')).toBeInTheDocument();

    toast.success('Integrante eliminado correctamente');

    expect(await screen.findByText('Integrante eliminado correctamente')).toBeInTheDocument();
  });
});
