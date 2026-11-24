import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TypingIndicator } from '@/components/ui/typing-indicator';

function getDots(indicator: HTMLElement): HTMLElement[] {
  return Array.from(indicator.querySelectorAll("[data-slot='typing-dots'] span"));
}

describe('TypingIndicator', () => {
  it('renders three decorative dots with staggered animation delays', () => {
    render(<TypingIndicator />);
    const indicator = screen.getByRole('status');
    const dots = getDots(indicator);
    expect(dots).toHaveLength(3);
    const delays = dots.map((dot) => dot.style.animationDelay);
    expect(delays).toEqual(['0ms', '160ms', '320ms']);
  });

  it('exposes the label to screen readers without visible text', () => {
    render(<TypingIndicator label="IA escribiendo…" />);
    const label = screen.getByText('IA escribiendo…');
    expect(label.className).toContain('sr-only');
  });

  it('defaults to the platform copy when no label is provided', () => {
    render(<TypingIndicator />);
    expect(screen.getByText('Escribiendo…')).toBeInTheDocument();
  });

  it('honors custom container and dot classes for different bubble surfaces', () => {
    render(<TypingIndicator className="mt-1" dotClassName="bg-white/80" />);
    const indicator = screen.getByRole('status');
    expect(indicator.className).toContain('mt-1');
    for (const dot of getDots(indicator)) {
      expect(dot.className).toContain('bg-white/80');
    }
  });
});
