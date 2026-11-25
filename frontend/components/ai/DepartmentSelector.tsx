'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDepartments } from '@/hooks/shared/useDepartments';
import type { Department } from '@/lib/shared/catalog-api';
import { Building2, Loader2, Pencil, Plus, Search } from 'lucide-react';

interface DepartmentSelectorProps {
  selectedIds: string[];
  saving?: boolean;
  onToggle: (id: string) => void;
  onEdit?: (dept: Department) => void;
  onNew?: () => void;
}

export function DepartmentSelector({
  selectedIds,
  saving = false,
  onToggle,
  onEdit,
  onNew,
}: DepartmentSelectorProps) {
  const { departments, loading, search, setSearch } = useDepartments({ pageSize: 50 });

  if (loading && departments.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Cargando departamentos…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar departamentos…"
            className="pl-8 h-8 text-sm"
          />
        </div>
        {onNew && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onNew}>
            <Plus className="w-3.5 h-3.5" />
            Nuevo
          </Button>
        )}
      </div>

      {departments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
          <Building2 className="w-8 h-8 opacity-30" />
          <p className="text-sm">No hay departamentos</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {departments.map((dept) => {
            const isSelected = selectedIds.includes(dept.id);
            return (
              <div
                key={dept.id}
                className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors ${
                  isSelected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
                } ${!dept.isActive ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{dept.name}</p>
                    {dept.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {dept.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!dept.isActive && (
                    <Badge variant="secondary" className="text-xs">
                      Inactivo
                    </Badge>
                  )}
                  {isSelected && (
                    <Badge className="text-xs bg-primary/20 text-primary border-primary/30">
                      Asignado
                    </Badge>
                  )}
                  {onEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => onEdit(dept)}
                      title="Editar departamento"
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  )}
                  <Button
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-3"
                    onClick={() => onToggle(dept.id)}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isSelected ? (
                      'Quitar'
                    ) : (
                      'Asignar'
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedIds.length} departamento(s) asignado(s)
        </p>
      )}
    </div>
  );
}
