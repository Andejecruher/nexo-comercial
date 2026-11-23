'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Check } from 'lucide-react';

export interface DepartmentCheckboxOption {
  id: string;
  name: string;
}

interface DepartmentCheckboxGroupProps {
  /** Prefijo para los id de los checkboxes (evita colisiones si hay varios grupos). */
  idPrefix?: string;
  departments: DepartmentCheckboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  emptyText?: string;
}

/**
 * Listado presentacional de checkboxes de departamentos. Sin Popover ni fetch:
 * el padre resuelve los departamentos y decide dónde renderizarlo.
 */
export function DepartmentCheckboxGroup({
  idPrefix = 'department',
  departments,
  value,
  onChange,
  disabled = false,
  emptyText = 'No hay departamentos activos.',
}: DepartmentCheckboxGroupProps) {
  const toggleDepartment = (departmentId: string) => {
    if (disabled) return;
    const next = value.includes(departmentId)
      ? value.filter((id) => id !== departmentId)
      : [...value, departmentId];
    onChange(next);
  };

  return (
    <div className="mt-1 max-h-56 space-y-0.5 overflow-y-auto">
      {departments.map((department) => {
        const inputId = `${idPrefix}-${department.id}`;
        const checked = value.includes(department.id);
        return (
          <label
            key={department.id}
            htmlFor={inputId}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Checkbox
              id={inputId}
              checked={checked}
              disabled={disabled}
              onCheckedChange={() => toggleDepartment(department.id)}
            />
            <span className="min-w-0 flex-1 truncate">{department.name}</span>
            {checked && <Check className="size-3.5 text-primary" />}
          </label>
        );
      })}
      {departments.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}
