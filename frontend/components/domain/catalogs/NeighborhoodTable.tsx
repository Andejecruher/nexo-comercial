/**
 * NeighborhoodTable — Tabla responsive de barrios con acciones
 *
 * Desktop: tabla tradicional. Mobile: cards con Sheet.
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { TableAction } from '@/components/ui/table-action';
import { TableEmptyState, TableSkeleton } from '@/components/ui/table-states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Neighborhood } from '@/lib/catalog-api';
import { Edit, MapPin, Trash2 } from 'lucide-react';

interface NeighborhoodTableProps {
  neighborhoods: Neighborhood[];
  loading: boolean;
  onEdit: (neighborhood: Neighborhood) => void;
  onDelete: (neighborhood: Neighborhood) => void;
}

export function NeighborhoodTable({
  neighborhoods,
  loading,
  onEdit,
  onDelete,
}: NeighborhoodTableProps) {
  const isMobile = useIsMobile();

  // ─── Loading State ─────────────────────────────────────────────────────────
  if (loading)
    return (
      <TableSkeleton
        headers={['Nombre', 'Zona', 'Código Postal', 'Municipio', 'Estado', 'Acciones']}
      />
    );

  if (neighborhoods.length === 0)
    return (
      <TableEmptyState
        icon={MapPin}
        title="No se encontraron barrios"
        description="Ajustá los filtros para ver barrios."
      />
    );

  // ─── Mobile: Cards ─────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="space-y-3">
        {neighborhoods.map((neighborhood) => (
          <div key={neighborhood.id} className="bg-card border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">{neighborhood.name}</h3>
                {neighborhood.zone && (
                  <Badge variant="secondary" className="mt-1.5 text-xs">
                    {neighborhood.zone}
                  </Badge>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <TableAction
                  touch
                  tone="primary"
                  onClick={() => onEdit(neighborhood)}
                  label={`Editar ${neighborhood.name}`}
                >
                  <Edit className="w-4 h-4" />
                </TableAction>
                <TableAction
                  touch
                  tone="danger"
                  onClick={() => onDelete(neighborhood)}
                  label={`Eliminar ${neighborhood.name}`}
                >
                  <Trash2 className="size-4" />
                </TableAction>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
              <div>
                <span className="text-muted-foreground">CP</span>
                <p className="font-medium">{neighborhood.postalCode || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Municipio</span>
                <p className="font-medium truncate">{neighborhood.municipality || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Estado</span>
                <p className="font-medium">{neighborhood.state}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── Desktop: Table ────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[28%]">Nombre</TableHead>
            <TableHead className="w-[12%]">Zona</TableHead>
            <TableHead className="w-[12%]">Código Postal</TableHead>
            <TableHead className="w-[20%]">Municipio</TableHead>
            <TableHead className="w-[16%]">Estado</TableHead>
            <TableHead className="w-[12%] text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {neighborhoods.map((neighborhood) => (
            <TableRow key={neighborhood.id}>
              <TableCell className="font-medium">{neighborhood.name}</TableCell>
              <TableCell>
                {neighborhood.zone ? (
                  <Badge variant="secondary">{neighborhood.zone}</Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {neighborhood.postalCode || '—'}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {neighborhood.municipality || '—'}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {neighborhood.state} ({neighborhood.stateCode})
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <TableAction
                    tone="primary"
                    onClick={() => onEdit(neighborhood)}
                    label={`Editar ${neighborhood.name}`}
                  >
                    <Edit className="w-4 h-4" />
                  </TableAction>
                  <TableAction
                    tone="danger"
                    onClick={() => onDelete(neighborhood)}
                    label={`Eliminar ${neighborhood.name}`}
                  >
                    <Trash2 className="size-4" />
                  </TableAction>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
