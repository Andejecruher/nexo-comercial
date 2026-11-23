'use client';

import { StructureColorSwatch } from '@/components/admin/structures/StructureColorSwatch';
import { formatStructureManager } from '@/components/admin/structures/structure-utils';
import { TableAction } from '@/components/ui/table-action';
import { TableStatusBadge } from '@/components/ui/table-status-badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { TableSkeleton } from '@/components/ui/table-states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OrganizationalStructureDto } from '@/lib/structures-api';
import { Edit, Layers, RotateCcw, Trash2 } from 'lucide-react';

interface StructuresTableProps {
  structures: OrganizationalStructureDto[];
  loading: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (structure: OrganizationalStructureDto) => void;
  onDeactivate: (structure: OrganizationalStructureDto) => void;
  onReactivate: (structure: OrganizationalStructureDto) => void;
}

export function StructuresTable({
  structures,
  loading,
  canEdit,
  canDelete,
  onEdit,
  onDeactivate,
  onReactivate,
}: StructuresTableProps) {
  if (loading)
    return (
      <TableSkeleton headers={['Nombre', 'Encargado', 'Identificador', 'Estado', 'Acciones']} />
    );

  if (structures.length === 0) {
    return (
      <Empty className="min-h-75">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Layers />
          </EmptyMedia>
          <EmptyTitle>No hay estructuras para mostrar</EmptyTitle>
          <EmptyDescription>
            Todavía no hay estructuras registradas o los filtros no tienen resultados.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Encargado</TableHead>
            <TableHead>Identificador</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {structures.map((structure) => {
            const managerName = formatStructureManager(structure);
            return (
              <TableRow key={structure.id}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <StructureColorSwatch color={structure.color} />
                    {structure.name}
                  </span>
                </TableCell>
                <TableCell>
                  {managerName || structure.managerPhone ? (
                    <div>
                      <div>{managerName ?? '—'}</div>
                      {structure.managerPhone && (
                        <div className="text-sm text-muted-foreground">
                          {structure.managerPhone}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {structure.slug}
                </TableCell>
                <TableCell>
                  <TableStatusBadge
                    active={structure.isActive}
                    activeLabel="Activa"
                    inactiveLabel="Inactiva"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canEdit && (
                      <TableAction
                        tone="primary"
                        onClick={() => onEdit(structure)}
                        label={`Editar ${structure.name}`}
                      >
                        <Edit className="h-4 w-4" />
                      </TableAction>
                    )}
                    {canEdit && !structure.isActive && (
                      <TableAction
                        onClick={() => onReactivate(structure)}
                        label={`Reactivar ${structure.name}`}
                        title="Reactivar estructura"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </TableAction>
                    )}
                    {canDelete && (
                      <TableAction
                        tone="danger"
                        disabled={!structure.isActive}
                        onClick={() => onDeactivate(structure)}
                        label={`Desactivar ${structure.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </TableAction>
                    )}
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
