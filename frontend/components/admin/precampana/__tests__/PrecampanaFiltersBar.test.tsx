import { PrecampanaFiltersBar } from '@/components/admin/precampana/PrecampanaFiltersBar';
import type { PrecampanaFilterOptions } from '@/lib/precampana-api';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const OPTIONS: PrecampanaFilterOptions = {
  sections: [{ id: 'sec-1', sectionCode: '2401', votesRequired: 400, districtCode: '05' }],
  coordinators: [
    {
      id: 'coord-1',
      fullName: 'Ana Torres',
      sectionId: 'sec-1',
      sectionCode: '2401',
      structureId: null,
      structureName: null,
    },
  ],
  leaders: [
    {
      id: 'leader-1',
      fullName: 'Juan Pérez',
      coordinatorId: 'coord-1',
      coordinatorName: 'Ana Torres',
      sectionId: 'sec-1',
      sectionCode: '2401',
      promovidoQuota: null,
    },
  ],
};

const NOOP = vi.fn();

describe('PrecampanaFiltersBar', () => {
  it('lists Por Coordinador and populates selectors from filter-options', () => {
    render(
      <PrecampanaFiltersBar
        filterMode="coordinator"
        sectionId=""
        leaderId=""
        coordinatorId="coord-1"
        dateFrom=""
        dateTo=""
        hasFilter
        options={OPTIONS}
        onFilterModeChange={NOOP}
        onSectionIdChange={NOOP}
        onLeaderIdChange={NOOP}
        onCoordinatorIdChange={NOOP}
        onDateFromChange={NOOP}
        onDateToChange={NOOP}
        onClear={NOOP}
      />,
    );

    expect(screen.getByText('Filtro Global')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[0]).toHaveTextContent('Por Coordinador');
    expect(screen.getByText('Coordinador')).toBeInTheDocument();
    expect(screen.getAllByText(/Ana Torres/).length).toBeGreaterThan(0);
  });

  it('shows the selected section code while keeping sectionId as the value', () => {
    render(
      <PrecampanaFiltersBar
        filterMode="section"
        sectionId="sec-1"
        leaderId=""
        coordinatorId=""
        dateFrom=""
        dateTo=""
        hasFilter
        options={OPTIONS}
        onFilterModeChange={NOOP}
        onSectionIdChange={NOOP}
        onLeaderIdChange={NOOP}
        onCoordinatorIdChange={NOOP}
        onDateFromChange={NOOP}
        onDateToChange={NOOP}
        onClear={NOOP}
      />,
    );

    expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('2401');
  });
});
