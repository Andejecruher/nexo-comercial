import { PaginationControls } from '@/components/shared/catalogs/PaginationControls';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('PaginationControls', () => {
  it('shows the current page without totalPages when it is omitted', () => {
    render(
      <PaginationControls
        currentPage={1}
        hasNextPage={false}
        hasPreviousPage={false}
        totalCount={4}
        loading={false}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onFirst={vi.fn()}
      />,
    );

    expect(screen.getByText(/Total:/)).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Página')).toBeInTheDocument();
    expect(screen.getByText('(única)')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Filas por página' })).not.toBeInTheDocument();
  });

  it('renders totalPages and the optional page-size selector', async () => {
    const onPageSizeChange = vi.fn();
    render(
      <PaginationControls
        currentPage={2}
        hasNextPage
        hasPreviousPage
        totalCount={40}
        totalPages={4}
        loading={false}
        pageSize={10}
        pageSizeOptions={[10, 25, 50]}
        onPageSizeChange={onPageSizeChange}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onFirst={vi.fn()}
      />,
    );

    expect(screen.getByText('de')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByText('(única)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Filas por página' }));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: '25' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('option', { name: '25' }));
    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });
});
