'use client';

import { ProtectedEntityBadge } from '@/components/accesos/ProtectedEntityBadge';
import { formatDate } from '@/components/accesos/access-utils';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useIsMobile } from '@/hooks/shared/use-mobile';
import { isSystemRole, type RoleDto } from '@/lib/shared/roles-permissions-api';
import { Edit, Eye, KeyRound, Shield, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface RolesTableProps {
  roles: RoleDto[];
  loading: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManagePermissions: boolean;
  onEdit: (role: RoleDto) => void;
  onDelete: (role: RoleDto) => void;
}

export function RolesTable({
  roles,
  loading,
  canEdit,
  canDelete,
  canManagePermissions,
  onEdit,
  onDelete,
}: RolesTableProps) {
  const isMobile = useIsMobile();
  if (loading)
    return (
      <TableSkeleton
        headers={['Rol', 'Clave', 'Descripción', 'Permisos', 'Actualizado', 'Acciones']}
      />
    );

  if (roles.length === 0) {
    return (
      <Empty className="min-h-75">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Shield />
          </EmptyMedia>
          <EmptyTitle>No se encontraron roles</EmptyTitle>
          <EmptyDescription>
            Ajustá la búsqueda o creá un nuevo rol administrativo.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (isMobile) {
    return (
      <div className="space-y-3">
        {roles.map((role) => (
          <div key={role.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{role.name}</h3>
                  {isSystemRole(role) && <ProtectedEntityBadge />}
                </div>
                <code className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs">
                  {role.slug}
                </code>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {role.description || 'Sin descripción'}
                </p>
              </div>
              <Badge variant="secondary">{role.permissions.length} permisos</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <TableAction
                asChild
                touch
                label={`${canManagePermissions ? 'Administrar permisos' : 'Ver permisos'} de ${role.name}`}
              >
                <Link href={`/admin/accesos/roles/${role.id}/permissions`}>
                  {canManagePermissions ? (
                    <KeyRound className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Link>
              </TableAction>
              {canEdit && (
                <TableAction
                  touch
                  tone="primary"
                  onClick={() => onEdit(role)}
                  disabled={isSystemRole(role)}
                  label={`Editar ${role.name}`}
                >
                  <Edit className="size-4" />
                </TableAction>
              )}
              {canDelete && (
                <TableAction
                  touch
                  tone="danger"
                  onClick={() => onDelete(role)}
                  disabled={isSystemRole(role)}
                  label={`Eliminar ${role.name}`}
                >
                  <Trash2 className="size-4" />
                </TableAction>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rol</TableHead>
            <TableHead>Clave</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Permisos</TableHead>
            <TableHead>Actualizado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{role.name}</span>
                  {isSystemRole(role) && <ProtectedEntityBadge />}
                </div>
              </TableCell>
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{role.slug}</code>
              </TableCell>
              <TableCell className="max-w-[320px]">
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {role.description || '—'}
                </p>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{role.permissions.length}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(role.updatedAt)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <TableAction asChild label={`Ver permisos de ${role.name}`}>
                    <Link
                      href={`/admin/accesos/roles/${role.id}/permissions`}
                      aria-label={`Ver ${role.name}`}
                    >
                      <KeyRound className="h-4 w-4" />
                    </Link>
                  </TableAction>
                  {canEdit && (
                    <TableAction
                      tone="primary"
                      onClick={() => onEdit(role)}
                      disabled={isSystemRole(role)}
                      label={`Editar ${role.name}`}
                    >
                      <Edit className="h-4 w-4" />
                    </TableAction>
                  )}
                  {canDelete && (
                    <TableAction
                      tone="danger"
                      onClick={() => onDelete(role)}
                      disabled={isSystemRole(role)}
                      label={`Eliminar ${role.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </TableAction>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
