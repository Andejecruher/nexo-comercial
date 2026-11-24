'use client';

import { Badge } from '@/components/ui/badge';
import { TableAction } from '@/components/ui/table-action';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Pencil, Trash2, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { TableEmptyState } from '@/components/ui/table-states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Citizen } from '@/lib/shared/citizens-api';
export type CitizenTableRow = Citizen;
import Link from 'next/link';

interface CitizenTableProps {
  citizens: CitizenTableRow[];
  loading: boolean;
  selectedCitizenIds: string[];
  onToggleCitizen: (citizenId: string) => void;
  onToggleSelectAll: () => void;
  onEdit?: (citizen: CitizenTableRow) => void;
  onDelete?: (citizen: CitizenTableRow) => void;
}

function getLeadStatusLabel(status: string) {
  switch (status) {
    case 'new':
      return 'Nuevo Reporte';
    case 'contacted':
      return 'En Gestión';
    case 'engaged':
      return 'Canalizado';
    case 'converted':
      return 'Caso Resuelto';
    case 'unsubscribed':
      return 'Sin seguimiento';
    default:
      return status;
  }
}

export function CitizenTable({
  citizens,
  loading,
  selectedCitizenIds,
  onToggleCitizen,
  onToggleSelectAll,
  onEdit,
  onDelete,
}: CitizenTableProps) {
  const allSelected =
    citizens.length > 0 && citizens.every((citizen) => selectedCitizenIds.includes(citizen.id));

  if (!loading && citizens.length === 0) {
    return (
      <TableEmptyState icon={Users} title="No hay ciudadanos para los filtros seleccionados" />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <p className="border-b px-4 py-2 text-xs text-muted-foreground md:hidden">
        Desliza horizontalmente para ver todos los datos y acciones.
      </p>
      <div className="max-w-full overflow-x-auto overscroll-x-contain">
        <Table className="min-w-[780px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  disabled={loading || !citizens.length}
                  checked={allSelected}
                  onCheckedChange={() => onToggleSelectAll()}
                  aria-label="Seleccionar todos"
                />
              </TableHead>
              <TableHead>Ciudadano</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Barrio</TableHead>
              <TableHead>Estado de seguimiento</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: 7 }, (_, cell) => (
                    <TableCell key={cell}>
                      <Skeleton className="h-4 w-full max-w-32 bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!loading &&
              citizens.map((citizen) => {
                const fullName = [citizen.name, citizen.lastName].filter(Boolean).join(' ').trim();
                return (
                  <TableRow key={citizen.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedCitizenIds.includes(citizen.id)}
                        onCheckedChange={() => onToggleCitizen(citizen.id)}
                        aria-label={`Seleccionar ${fullName || citizen.phone}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{fullName || 'Sin nombre'}</div>
                      {citizen.email && (
                        <div className="text-xs text-muted-foreground">{citizen.email}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{citizen.phone}</TableCell>
                    <TableCell>{citizen.neighborhood ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getLeadStatusLabel(citizen.leadStatus)}</Badge>
                    </TableCell>
                    <TableCell>{citizen.sourceChannel}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <TableAction
                          asChild
                          label={`Ver perfil de ${fullName || citizen.phone}`}
                          touch
                        >
                          <Link href={`/admin/ciudadanos/${citizen.id}`}>
                            <Eye className="size-4" />
                          </Link>
                        </TableAction>
                        {onEdit && (
                          <TableAction
                            tone="primary"
                            touch
                            label={`Editar ${fullName || citizen.phone}`}
                            onClick={() => onEdit(citizen)}
                          >
                            <Pencil className="size-4" />
                          </TableAction>
                        )}
                        {onDelete && (
                          <TableAction
                            tone="danger"
                            touch
                            label={`Eliminar ${fullName || citizen.phone}`}
                            onClick={() => onDelete(citizen)}
                          >
                            <Trash2 className="size-4" />
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
    </div>
  );
}
