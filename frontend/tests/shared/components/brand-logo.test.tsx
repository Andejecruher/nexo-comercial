import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLockup, BrandLogo, BRAND_NAME } from '@/components/shared/brand/brand-logo';
import {
  BRAND_BUBBLE_PATH,
  BRAND_COMPACT_BUBBLE_PATH,
  BRAND_COMPACT_FIGURE_PATH,
  BRAND_COMPACT_VIEW_BOX,
  BRAND_FIGURE_PATH,
  BRAND_VIEW_BOX,
} from '@/components/shared/brand/logo-paths.generated';

const BRAND_DIR = path.resolve(__dirname, '../../../components/shared/brand');
const readSource = (name: string) => readFileSync(path.join(BRAND_DIR, name), 'utf8');

describe('brand vector sources', () => {
  const sources = ['logo-icon.svg', 'logo-icon-compact.svg'];

  it.each(sources)('%s is a real, self-contained vector', (name) => {
    const svg = readSource(name);

    expect(svg).toMatch(/viewBox="[\d.\s-]+"/);
    // the mark must never degrade into a raster wrapper or depend on fonts/CSS
    expect(svg).not.toMatch(/<image/i);
    expect(svg).not.toMatch(/xlink:href/i);
    expect(svg).not.toMatch(/\.(png|jpe?g|webp)/i);
    expect(svg).not.toMatch(/<text|font-family|<style/i);
    // no fixed dimensions, so it scales from favicon to hero size
    expect(svg).not.toMatch(/<svg[^>]*\s(width|height)=/);
    expect(svg.length).toBeLessThan(8 * 1024);
  });

  it.each(sources)('%s draws with pure path geometry', (name) => {
    const paths = readSource(name).match(/<path\b/g) ?? [];
    expect(paths).toHaveLength(2);
  });

  // guards against editing an SVG without re-running `pnpm brand:icons`
  it('keeps the generated paths in sync with the SVG sources', () => {
    const master = readSource('logo-icon.svg');
    expect(master).toContain(BRAND_VIEW_BOX);
    expect(master).toContain(BRAND_BUBBLE_PATH);
    expect(master).toContain(BRAND_FIGURE_PATH);

    const compact = readSource('logo-icon-compact.svg');
    expect(compact).toContain(BRAND_COMPACT_VIEW_BOX);
    expect(compact).toContain(BRAND_COMPACT_BUBBLE_PATH);
    expect(compact).toContain(BRAND_COMPACT_FIGURE_PATH);
  });
});

describe('BrandLogo', () => {
  it('exposes an accessible name by default', () => {
    render(<BrandLogo />);
    expect(screen.getByRole('img', { name: BRAND_NAME })).toBeInTheDocument();
  });

  it('accepts a custom accessible name', () => {
    render(<BrandLogo label="Ir al inicio" />);
    expect(screen.getByRole('img', { name: 'Ir al inicio' })).toBeInTheDocument();
  });

  it('hides itself from assistive tech when decorative', () => {
    const { container } = render(<BrandLogo label="" />);
    const svg = container.querySelector('svg')!;

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('aria-label');
  });

  it('renders a scalable viewBox instead of fixed dimensions', () => {
    const { container } = render(<BrandLogo />);
    const svg = container.querySelector('svg')!;

    expect(svg).toHaveAttribute('viewBox', BRAND_VIEW_BOX);
    expect(svg).not.toHaveAttribute('width');
    expect(svg).not.toHaveAttribute('height');
  });

  it('keeps a square footprint for every preset size', () => {
    const cases = [
      ['xs', 'size-4'],
      ['sm', 'size-6'],
      ['md', 'size-8'],
      ['lg', 'size-10'],
      ['xl', 'size-12'],
      ['2xl', 'size-16'],
    ] as const;

    for (const [size, expected] of cases) {
      const { container, unmount } = render(<BrandLogo size={size} />);
      expect(container.querySelector('svg')).toHaveClass(expected);
      unmount();
    }
  });

  it('lets className win over the preset size', () => {
    const { container } = render(<BrandLogo size="md" className="size-9" />);
    const svg = container.querySelector('svg')!;

    expect(svg).toHaveClass('size-9');
    expect(svg).not.toHaveClass('size-8');
  });

  it('swaps the two brand colours for dark surfaces', () => {
    const { container: light } = render(<BrandLogo variant="onLight" />);
    const { container: dark } = render(<BrandLogo variant="onDark" />);

    const fills = (root: HTMLElement) =>
      [...root.querySelectorAll('path')].map((p) => p.getAttribute('fill'));

    expect(fills(light)).toEqual(['#711B2C', '#FFFFFF']);
    expect(fills(dark)).toEqual(['#FFFFFF', '#711B2C']);
  });
});

describe('BrandLockup', () => {
  it('shows the wordmark and treats the mark as decorative', () => {
    const { container } = render(<BrandLockup />);

    expect(screen.getByText(BRAND_NAME)).toBeInTheDocument();
    expect(screen.getByText('Canales y operación')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('can hide the tagline', () => {
    render(<BrandLockup showTagline={false} />);

    expect(screen.getByText(BRAND_NAME)).toBeInTheDocument();
    expect(screen.queryByText('Canales y operación')).not.toBeInTheDocument();
  });
});
