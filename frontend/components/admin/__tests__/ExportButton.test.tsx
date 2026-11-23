import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExportButton } from '../ExportButton';

describe('ExportButton', () => {
  it('exposes an accessible outline export button', () => {
    render(<ExportButton module="citizens" filters={{}} enabled />);
    expect(screen.getByRole('button', { name: 'Exportar Ciudadanos a Excel' })).toHaveAttribute(
      'aria-busy',
      'false',
    );
  });
});
