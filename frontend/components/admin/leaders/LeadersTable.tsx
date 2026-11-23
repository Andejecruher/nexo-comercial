'use client';

import { formatLeaderDate } from '@/components/admin/leaders/leader-utils';
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
import { LEADER_ROLE_LABELS, type ElectoralLeader } from '@/lib/ine-ocr-api';
import { Edit, MailPlus, Trash2, Users } from 'lucide-react';

interface LeadersTableProps {
  leaders: ElectoralLeader[];
  loading: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canResend: boolean;
  resendingId?: string;
  onEdit: (leader: ElectoralLeader) => void;
  onDelete: (leader: ElectoralLeader) => void;
  onResend: (leader: ElectoralLeader) => void;
}

export function LeadersTable({
  leaders,
  loading,
  canEdit,
  canDelete,
  canResend,
  resendingId,
  onEdit,
  onDelete,
  onResend,
}: LeadersTableProps) {
  if (loading)
    return (
      <TableSkeleton
        headers={[
          'Líder',
          'Coordinador',
          'Sección',
          'Rol',
          'Barrio',
          'Meta',
          'Estado',
          'Cuenta',
          'Alta',
          'Acciones',
        ]}
      />
    );

  if (leaders.length === 0) {
    return (
      <Empty className="min-h-75">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>No hay líderes para mostrar</EmptyTitle>
          <EmptyDescription>
            Todavía no hay líderes registrados o los filtros no tienen resultados.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="overflow-x-auto overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Líder</TableHead>
            <TableHead>Coordinador</TableHead>
            <TableHead>Sección</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Barrio</TableHead>
            <TableHead>Meta</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Cuenta</TableHead>
            <TableHead>Alta</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leaders.map((leader) => {
            const resending = resendingId === leader.id;
            const userActive = leader.user?.isActive ?? false;
            return (
              <TableRow key={leader.id}>
                <TableCell>
                  <div className="min-w-55">
                    <div className="font-medium">{leader.fullName}</div>
                    <div className="text-sm text-muted-foreground">{leader.email ?? '—'}</div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{leader.coordinator?.fullName ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant="secondary">Sección {leader.section?.sectionCode ?? '—'}</Badge>
                </TableCell>
                <TableCell className="text-sm">{LEADER_ROLE_LABELS[leader.role]}</TableCell>
                <TableCell className="text-sm">{leader.neighborhood?.name ?? '—'}</TableCell>
                <TableCell className="text-sm">
                  {leader.promovidoQuota ? `${leader.promovidoQuota}` : '—'}
                </TableCell>
                <TableCell>
                  <TableStatusBadge active={leader.isActive} />
                </TableCell>
                <TableCell>
                  {leader.user ? (
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
                  {formatLeaderDate(leader.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canResend && (
                      <TableAction
                        disabled={!leader.user || userActive || resending}
                        onClick={() => onResend(leader)}
                        label={`Reenviar invitación a ${leader.fullName}`}
                        title={
                          !leader.user
                            ? 'Sin usuario vinculado'
                            : userActive
                              ? 'El líder ya activó su cuenta'
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
                        onClick={() => onEdit(leader)}
                        label={`Editar ${leader.fullName}`}
                      >
                        <Edit className="h-4 w-4" />
                      </TableAction>
                    )}
                    {canDelete && (
                      <TableAction
                        tone="danger"
                        disabled={!leader.isActive}
                        onClick={() => onDelete(leader)}
                        label={`Desactivar ${leader.fullName}`}
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
