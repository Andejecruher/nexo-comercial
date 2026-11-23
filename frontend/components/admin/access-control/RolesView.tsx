'use client';

import { AccessDeniedState } from '@/components/admin/access-control/AccessDeniedState';
import { RoleForm } from '@/components/admin/access-control/RoleForm';
import { RolesTable } from '@/components/admin/access-control/RolesTable';
import { filterRoles } from '@/components/admin/access-control/access-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRolesCatalog } from '@/hooks/useAccessControl';
import { usePermissions } from '@/hooks/usePermissions';
import { isSystemRole, type CreateRolePayload, type RoleDto } from '@/lib/roles-permissions-api';
import { Plus, RefreshCw, Search, Shield, X } from 'lucide-react';
import { useMemo, useState } from 'react';

export function RolesView() {
  const { guards } = usePermissions();
  const canView = guards.canViewRoles();
  const canCreate = guards.canCreateRoles();
  const canEdit = guards.canUpdateRoles();
  const canDelete = guards.canDeleteRoles();
  const canManagePermissions = guards.canManagePermissions();
  const { roles, loading, error, refresh, createRole, updateRole, deleteRole } = useRolesCatalog();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDto | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<RoleDto | undefined>();
  const [deleting, setDeleting] = useState(false);
  const filteredRoles = useMemo(() => filterRoles(roles, search), [roles, search]);

  const openCreate = () => {
    setEditingRole(undefined);
    setFormOpen(true);
  };
  const openEdit = (role: RoleDto) => {
    setEditingRole(role);
    setFormOpen(true);
  };
  const submitRole = async (payload: CreateRolePayload) =>
    editingRole ? updateRole(editingRole.id, payload) : createRole(payload);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteRole(deleteTarget);
    setDeleting(false);
    if (result.success) setDeleteTarget(undefined);
  };

  if (!canView)
    return (
      <div className="p-6">
        <AccessDeniedState />
      </div>
    );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Shield className="h-6 w-6 text-primary" /> Roles
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Administrá perfiles de acceso y sus permisos asignados.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo rol
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, clave o descripción..."
              className="pl-9"
            />
          </div>
          {search && (
            <Button variant="ghost" onClick={() => setSearch('')}>
              <X className="mr-1 h-4 w-4" /> Limpiar
            </Button>
          )}
        </div>
        {error && (
          <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={refresh}>
              Reintentar
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Mostrando <strong className="text-foreground">{filteredRoles.length}</strong> de{' '}
            <strong className="text-foreground">{roles.length}</strong> roles
          </span>
          <Badge variant="secondary">Sin paginación backend</Badge>
        </div>
        <RolesTable
          roles={filteredRoles}
          loading={loading}
          canEdit={canEdit}
          canDelete={canDelete}
          canManagePermissions={canManagePermissions}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      </div>
      <RoleForm
        open={formOpen}
        role={editingRole}
        onOpenChange={setFormOpen}
        onSubmit={submitRole}
      />
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rol?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && isSystemRole(deleteTarget) ? (
                'Este rol está protegido por el sistema.'
              ) : (
                <>
                  Vas a eliminar el rol <strong>{deleteTarget?.name}</strong>. El backend actual
                  realiza eliminación física; usá esta acción solo si confirmaste que no tiene
                  usuarios asignados.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || !deleteTarget || isSystemRole(deleteTarget)}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
