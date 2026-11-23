'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PromovidoFilters as FilterState } from '@/lib/promovidos-api';
import { X } from 'lucide-react';

type CatalogSection = { id: string; sectionCode: string; state: { name: string } };
type CatalogLeader = { id: string; fullName: string; sectionId: string };

interface PromovidoFiltersProps {
  value: FilterState;
  onChange: (value: FilterState) => void;
  sections: CatalogSection[];
  leaders: CatalogLeader[];
  loading: boolean;
}

export function PromovidoFilters({
  value,
  onChange,
  sections,
  leaders,
  loading,
}: PromovidoFiltersProps) {
  const hasActiveFilters =
    value.leaderId || value.sex || value.sectionId || value.isActive !== undefined;

  const update = (patch: Partial<FilterState>) => {
    onChange({ ...value, ...patch });
  };

  const clear = () => {
    onChange({
      q: value.q,
      leaderId: undefined,
      sex: undefined,
      sectionId: undefined,
      isActive: undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Líder</label>
          <Select
            value={value.leaderId ?? 'all'}
            onValueChange={(v) => update({ leaderId: v === 'all' ? undefined : v })}
            disabled={loading}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {leaders.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Sexo</label>
          <Select
            value={value.sex ?? 'all'}
            onValueChange={(v) => update({ sex: v === 'all' ? undefined : (v as 'H' | 'M') })}
            disabled={loading}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="H">Hombre</SelectItem>
              <SelectItem value="M">Mujer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Sección</label>
          <Select
            value={value.sectionId ?? 'all'}
            onValueChange={(v) => update({ sectionId: v === 'all' ? undefined : v })}
            disabled={loading}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.sectionCode} — {s.state.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Vigencia</label>
          <Select
            value={value.isActive === undefined ? 'all' : value.isActive ? 'active' : 'inactive'}
            onValueChange={(v) =>
              update({
                isActive: v === 'all' ? undefined : v === 'active',
              })
            }
            disabled={loading}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="inactive">Inactivo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {hasActiveFilters && (
          <Button type="button" variant="outline" onClick={clear} disabled={loading}>
            <X className="mr-1 h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}
