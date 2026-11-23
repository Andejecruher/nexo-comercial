'use client';

import { formatDate, roleInitials } from '@/components/admin/access-control/access-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableAction } from '@/components/ui/table-action';
import { TableStatusBadge } from '@/components/ui/table-status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import type { PermissionDto } from '@/lib/roles-permissions-api';
import { Copy, Cog, Edit, KeyRound, MoreHorizontal, Power, Users } from 'lucide-react';

interface PermissionsTableProps {
  permissions: PermissionDto[];
  loading: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canChangeStatus: boolean;
  onEdit: (permission: PermissionDto) => void;
  onClone: (permission: PermissionDto) => void;
  onStatus: (permission: PermissionDto) => void;
  onRoles: (permission: PermissionDto) => void;
}

export function PermissionsTable({
  permissions,
  loading,
  canEdit,
  canCreate,
  canChangeStatus,
  onEdit,
  onClone,
  onStatus,
  onRoles,
}: PermissionsTableProps) {
  const isMobile = useIsMobile();
  if (loading)
    return (
      <TableSkeleton
        headers={[
          'Permiso',
          'Clave',
          'Descripción',
          'Uso de Roles',
          'Tipo / Estado',
          'Última Actualización',
          'Acciones',
        ]}
      />
    );

  if (permissions.length === 0)
    return (
      <Empty className="min-h-75">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyRound />
          </EmptyMedia>
          <EmptyTitle>No se encontraron permisos</EmptyTitle>
          <EmptyDescription>
            Probá con otro texto o módulo. El catálogo se carga desde backend.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  if (isMobile)
    return (
      <div className="space-y-3">
        {permissions.map((permission) => (
          <div key={permission.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold">{permission.name}</h3>
                <code className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {permission.slug}
                </code>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {permission.description || 'Sin descripción'}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <TypeStatus permission={permission} />
                </div>
              </div>
              <RowActions
                permission={permission}
                canEdit={canEdit}
                canCreate={canCreate}
                canChangeStatus={canChangeStatus}
                onEdit={onEdit}
                onClone={onClone}
                onStatus={onStatus}
              />
            </div>
          </div>
        ))}
      </div>
    );
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Permiso</TableHead>
            <TableHead>Clave</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Uso de Roles</TableHead>
            <TableHead>Tipo / Estado</TableHead>
            <TableHead>Última Actualización</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {permissions.map((permission) => (
            <TableRow key={permission.id}>
              <TableCell className="font-medium">{permission.name}</TableCell>
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {permission.slug}
                </code>
              </TableCell>
              <TableCell className="max-w-[320px]">
                <Description text={permission.description} />
              </TableCell>
              <TableCell>
                <RoleUsage permission={permission} onRoles={onRoles} />
              </TableCell>
              <TableCell>
                <TypeStatus permission={permission} />
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                {formatDate(permission.updatedAt)}
              </TableCell>
              <TableCell className="text-right">
                <RowActions
                  permission={permission}
                  canEdit={canEdit}
                  canCreate={canCreate}
                  canChangeStatus={canChangeStatus}
                  onEdit={onEdit}
                  onClone={onClone}
                  onStatus={onStatus}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Description({ text }: { text?: string | null }) {
  if (!text) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p tabIndex={0} className="line-clamp-1 text-sm text-muted-foreground">
          {text}
        </p>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

function RoleUsage({
  permission,
  onRoles,
}: {
  permission: PermissionDto;
  onRoles: (permission: PermissionDto) => void;
}) {
  const preview = permission.rolesPreview ?? [];
  const overflow = permission.roleCount - preview.length;
  return (
    <Button
      size="sm"
      variant="ghost"
      className="gap-2 px-2"
      onClick={() => onRoles(permission)}
      aria-label={`Ver los ${permission.roleCount} roles con ${permission.name}`}
    >
      {preview.length > 0 ? (
        <span className="flex -space-x-2">
          {preview.map((role) => (
            <span
              key={role.id}
              title={role.name}
              className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-primary/10 text-[10px] font-semibold text-primary"
            >
              {roleInitials(role.name)}
            </span>
          ))}
        </span>
      ) : (
        <Users className="h-4 w-4" />
      )}
      <span className="text-xs text-muted-foreground">
        {overflow > 0
          ? `+${overflow} Rol${overflow > 1 ? 'es' : ''}`
          : `${permission.roleCount} Rol${permission.roleCount === 1 ? '' : 'es'}`}
      </span>
    </Button>
  );
}

function TypeStatus({ permission }: { permission: PermissionDto }) {
  return (
    <div className="flex items-center gap-2">
      {permission.isSystem ? (
        <Cog className="h-4 w-4 text-muted-foreground" aria-label="Permiso del sistema" />
      ) : (
        <Badge variant="outline">Personalizado</Badge>
      )}
      <TableStatusBadge active={permission.isActive} />
    </div>
  );
}

function RowActions({
  permission,
  canEdit,
  canCreate,
  canChangeStatus,
  onEdit,
  onClone,
  onStatus,
}: {
  permission: PermissionDto;
  canEdit: boolean;
  canCreate: boolean;
  canChangeStatus: boolean;
  onEdit: (permission: PermissionDto) => void;
  onClone: (permission: PermissionDto) => void;
  onStatus: (permission: PermissionDto) => void;
}) {
  const statusBlocked = permission.isSystem && permission.isActive;
  if (!canEdit && !canCreate && !canChangeStatus) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TableAction label={`Acciones para ${permission.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </TableAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem className="cursor-pointer" onSelect={() => onEdit(permission)}>
            <Edit className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
        )}
        {canCreate && (
          <DropdownMenuItem className="cursor-pointer" onSelect={() => onClone(permission)}>
            <Copy className="h-4 w-4" />
            Clonar
          </DropdownMenuItem>
        )}
        {canChangeStatus && (
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={statusBlocked}
            onSelect={() => onStatus(permission)}
          >
            <Power className="h-4 w-4" />
            {permission.isActive ? 'Desactivar' : 'Activar'}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
