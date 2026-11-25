import { DepartmentCheckboxGroup } from '@/components/shared/department-checkbox-group';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const departments = [
  { id: 'dept-1', name: 'Agua' },
  { id: 'dept-2', name: 'Obras' },
];

describe('DepartmentCheckboxGroup', () => {
  it('marca departamentos y notifica el array completo', () => {
    const onChange = vi.fn();
    render(
      <DepartmentCheckboxGroup departments={departments} value={['dept-1']} onChange={onChange} />,
    );

    expect(screen.getByRole('checkbox', { name: 'Agua' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Obras' }));

    expect(onChange).toHaveBeenCalledWith(['dept-1', 'dept-2']);
  });

  it('muestra el mensaje vacío cuando no hay departamentos', () => {
    render(
      <DepartmentCheckboxGroup
        departments={[]}
        value={[]}
        onChange={vi.fn()}
        emptyText="No hay departamentos activos."
      />,
    );

    expect(screen.getByText('No hay departamentos activos.')).toBeInTheDocument();
  });
});
