'use client';

import { InvitationStatusBadge, UserStatusBadge } from '@/components/admin/team/StatusBadges';
import { formatTeamDate, isProtectedPanelUser } from '@/components/admin/team/team-utils';
import { Badge } from '@/components/ui/badge';
import { TableAction } from '@/components/ui/table-action';
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
import type { PanelUserDto } from '@/lib/admin-users-api';
import { Edit, MailPlus, ShieldAlert, Trash2, UserRoundX, Users } from 'lucide-react';

interface UsersTableProps {
  users: PanelUserDto[];
  loading: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  canDelete: boolean;
  canResend: boolean;
  resendingUserId?: string;
  onEdit: (user: PanelUserDto) => void;
  onDeactivate: (user: PanelUserDto) => void;
  onDelete: (user: PanelUserDto) => void;
  onResend: (user: PanelUserDto) => void;
}

export function UsersTable({
  users,
  loading,
  canEdit,
  canDeactivate,
  canDelete,
  canResend,
  resendingUserId,
  onEdit,
  onDeactivate,
  onDelete,
  onResend,
}: UsersTableProps) {
  if (loading)
    return (
      <TableSkeleton
        headers={['Integrante', 'Roles', 'Estado', 'Invitación', 'Alta', 'Acciones']}
      />
    );

  if (users.length === 0) {
    return (
      <Empty className="min-h-75">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>No hay integrantes para mostrar</EmptyTitle>
          <EmptyDescription>
            Todavía no hay integrantes registrados o los filtros no tienen resultados.
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
            <TableHead>Integrante</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Invitación</TableHead>
            <TableHead>Alta</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const protectedUser = isProtectedPanelUser(user);
            const resending = resendingUserId === user.id;
            return (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="min-w-55">
                    <div className="flex items-center gap-2 font-medium">
                      {user.fullName || 'Sin nombre'}
                      {protectedUser && (
                        <Badge variant="outline">
                          <ShieldAlert className="mr-1 h-3 w-3" />
                          Protegido
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex max-w-70 flex-wrap gap-1">
                    {user.roles.length ? (
                      user.roles.map((role) => (
                        <Badge key={role.id} variant="secondary">
                          {role.name}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">Sin rol</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <UserStatusBadge isActive={user.isActive} />
                </TableCell>
                <TableCell>
                  <InvitationStatusBadge invitation={user.invitation} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatTeamDate(user.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canResend && (
                      <TableAction
                        disabled={user.isActive || resending}
                        onClick={() => onResend(user)}
                        label={`Reenviar invitación a ${user.fullName || user.email}`}
                        title={
                          user.isActive
                            ? 'El integrante ya activó su cuenta'
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
                        onClick={() => onEdit(user)}
                        label={`Editar ${user.fullName || user.email}`}
                      >
                        <Edit className="h-4 w-4" />
                      </TableAction>
                    )}
                    {canDeactivate && (
                      <TableAction
                        tone="danger"
                        disabled={!user.isActive || protectedUser}
                        onClick={() => onDeactivate(user)}
                        label={`Desactivar ${user.fullName || user.email}`}
                      >
                        <UserRoundX className="h-4 w-4" />
                      </TableAction>
                    )}
                    {canDelete && (
                      <TableAction
                        tone="danger"
                        onClick={() => onDelete(user)}
                        label={`Eliminar ${user.fullName || user.email}`}
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
