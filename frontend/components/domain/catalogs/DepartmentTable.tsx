/**
 * DepartmentTable — Tabla responsive de departamentos con acciones
 *
 * Desktop: tabla tradicional. Mobile: cards con Sheet.
 * Soporta soft delete (toggle isActive).
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { TableStatusBadge } from '@/components/ui/table-status-badge';
import { TableAction } from '@/components/ui/table-action';
import { TableEmptyState, TableSkeleton } from '@/components/ui/table-states';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Department } from '@/lib/catalog-api';
import { Building2, Edit } from 'lucide-react';

interface DepartmentTableProps {
  departments: Department[];
  loading: boolean;
  onEdit: (department: Department) => void;
  onToggleActive: (department: Department) => void;
}

export function DepartmentTable({
  departments,
  loading,
  onEdit,
  onToggleActive,
}: DepartmentTableProps) {
  const isMobile = useIsMobile();

  // ─── Loading State ─────────────────────────────────────────────────────────
  if (loading)
    return (
      <TableSkeleton
        headers={['Slug', 'Nombre', 'Estado', 'Keywords', 'Descripción', 'Acciones']}
      />
    );

  if (departments.length === 0)
    return (
      <TableEmptyState
        icon={Building2}
        title="No se encontraron departamentos"
        description="Ajustá los filtros para ver departamentos."
      />
    );

  // ─── Sort Header ───────────────────────────────────────────────────────────
  // ─── Mobile: Cards ─────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="space-y-3">
        {departments.map((department) => {
          const isGeneral = department.slug === 'general';

          return (
            <div key={department.id} className="bg-card border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">{department.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{department.slug}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <TableStatusBadge active={department.isActive} />
                    {isGeneral && (
                      <Badge variant="outline" className="text-xs">
                        Protegido
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <TableAction
                    touch
                    tone="primary"
                    onClick={() => onEdit(department)}
                    label={`Editar ${department.name}`}
                  >
                    <Edit className="w-4 h-4" />
                  </TableAction>
                  <Switch
                    checked={department.isActive}
                    onCheckedChange={() => onToggleActive(department)}
                    disabled={isGeneral && department.isActive}
                    aria-label={`${department.isActive ? 'Desactivar' : 'Activar'} ${department.name}`}
                  />
                </div>
              </div>
              {department.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {department.description}
                </p>
              )}
              {department.keywords && department.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {department.keywords.slice(0, 3).map((keyword) => (
                    <Badge key={keyword} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                  {department.keywords.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{department.keywords.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ─── Desktop: Table ────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[15%]">Slug</TableHead>
            <TableHead className="w-[20%]">Nombre</TableHead>
            <TableHead className="w-[10%]">Estado</TableHead>
            <TableHead className="w-[25%]">Keywords</TableHead>
            <TableHead className="w-[20%]">Descripción</TableHead>
            <TableHead className="w-[10%] text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {departments.map((department) => {
            const isGeneral = department.slug === 'general';

            return (
              <TableRow key={department.id}>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{department.slug}</code>
                  {isGeneral && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      Protegido
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-medium">{department.name}</TableCell>
                <TableCell>
                  <TableStatusBadge active={department.isActive} />
                </TableCell>
                <TableCell>
                  {department.keywords && department.keywords.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {department.keywords.slice(0, 3).map((keyword) => (
                        <Badge key={keyword} variant="outline" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                      {department.keywords.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{department.keywords.length - 3}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {department.description || '—'}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <TableAction
                      tone="primary"
                      onClick={() => onEdit(department)}
                      label={`Editar ${department.name}`}
                    >
                      <Edit className="w-4 h-4" />
                    </TableAction>
                    <Switch
                      checked={department.isActive}
                      onCheckedChange={() => onToggleActive(department)}
                      disabled={isGeneral && department.isActive}
                      aria-label={`${department.isActive ? 'Desactivar' : 'Activar'} ${department.name}`}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
