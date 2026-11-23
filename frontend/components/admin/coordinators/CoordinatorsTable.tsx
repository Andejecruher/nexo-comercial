'use client';

import { formatCoordinatorDate } from '@/components/admin/coordinators/coordinator-utils';
import { StructureColorSwatch } from '@/components/admin/structures/StructureColorSwatch';
import { Badge } from '@/components/ui/badge';
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
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CoordinatorDto } from '@/lib/coordinators-api';
import { Edit, MailPlus, Trash2, Users } from 'lucide-react';

interface CoordinatorsTableProps {
  coordinators: CoordinatorDto[];
  loading: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canResend: boolean;
  resendingId?: string;
  onEdit: (coordinator: CoordinatorDto) => void;
  onDelete: (coordinator: CoordinatorDto) => void;
  onResend: (coordinator: CoordinatorDto) => void;
}

export function CoordinatorsTable({
  coordinators,
  loading,
  canEdit,
  canDelete,
  canResend,
  resendingId,
  onEdit,
  onDelete,
  onResend,
}: CoordinatorsTableProps) {
  if (loading)
    return (
      <TableSkeleton
        headers={['Coordinador', 'Sección', 'Estructura', 'Estado', 'Cuenta', 'Alta', 'Acciones']}
      />
    );

  if (coordinators.length === 0) {
    return (
      <Empty className="min-h-75">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>No hay coordinadores para mostrar</EmptyTitle>
          <EmptyDescription>
            Todavía no hay coordinadores registrados o los filtros no tienen resultados.
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
            <TableHead>Coordinador</TableHead>
            <TableHead>Sección</TableHead>
            <TableHead>Estructura</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Cuenta</TableHead>
            <TableHead>Alta</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {coordinators.map((coordinator) => {
            const resending = resendingId === coordinator.id;
            const userActive = coordinator.user?.isActive ?? false;
            return (
              <TableRow key={coordinator.id}>
                <TableCell>
                  <div className="min-w-55">
                    <div className="font-medium">{coordinator.fullName}</div>
                    <div className="text-sm text-muted-foreground">{coordinator.email}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    Sección {coordinator.section?.sectionCode ?? '—'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {coordinator.structure?.name ? (
                    <Badge
                      variant="outline"
                      className="inline-flex items-center gap-1.5"
                      style={{ borderColor: coordinator.structure.color }}
                    >
                      <StructureColorSwatch color={coordinator.structure.color} />
                      {coordinator.structure.name}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <TableStatusBadge active={coordinator.isActive} />
                </TableCell>
                <TableCell>
                  {coordinator.user ? (
                    userActive ? (
                      <TableStatusBadge active activeLabel="Cuenta activa" />
                    ) : (
                      <TableStatusBadge active={false} inactiveLabel="Sin activar" />
                    )
                  ) : (
                    <span className="text-sm text-muted-foreground">Sin vínculo</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatCoordinatorDate(coordinator.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canResend && (
                      <TableAction
                        disabled={!coordinator.user || userActive || resending}
                        onClick={() => onResend(coordinator)}
                        label={`Reenviar invitación a ${coordinator.fullName}`}
                        title={
                          !coordinator.user
                            ? 'Sin usuario vinculado'
                            : userActive
                              ? 'El coordinador ya activó su cuenta'
                              : 'Reenviar invitación'
                        }
                      >
                        {resending ? (
                          <Spinner className="h-4 w-4" />
                        ) : (
                          <MailPlus className="h-4 w-4" />
                        )}
                      </TableAction>
                    )}
                    {canEdit && (
                      <TableAction
                        tone="primary"
                        onClick={() => onEdit(coordinator)}
                        label={`Editar ${coordinator.fullName}`}
                      >
                        <Edit className="h-4 w-4" />
                      </TableAction>
                    )}
                    {canDelete && (
                      <TableAction
                        tone="danger"
                        disabled={!coordinator.isActive}
                        onClick={() => onDelete(coordinator)}
                        label={`Desactivar ${coordinator.fullName}`}
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
