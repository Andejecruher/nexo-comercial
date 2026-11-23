import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingMessages } from '../loading-messages';

describe('LoadingMessages', () => {
  it('shows the visible status text with three animated dots', () => {
    render(<LoadingMessages />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Cargando mensajes…');
    const dots = status.querySelectorAll("[data-slot='typing-dots'] span");
    expect(dots).toHaveLength(3);
  });

  it('supports a custom label for other loading surfaces', () => {
    render(<LoadingMessages label="Cargando tickets…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando tickets…');
  });

  it('honors custom container and dot classes', () => {
    render(<LoadingMessages className="py-2" dotClassName="bg-white/80" />);
    const status = screen.getByRole('status');
    expect(status.className).toContain('py-2');
    const dots = Array.from(status.querySelectorAll("[data-slot='typing-dots'] span"));
    for (const dot of dots) {
      expect(dot.className).toContain('bg-white/80');
    }
  });
});
