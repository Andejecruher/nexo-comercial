'use client';

import { AccessDeniedState } from '@/components/admin/access-control/AccessDeniedState';
import { UserForm } from '@/components/admin/team/UserForm';
import { UsersTable } from '@/components/admin/team/UsersTable';
import { filterTeamUsers } from '@/components/admin/team/team-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRolesCatalog } from '@/hooks/useAccessControl';
import { usePermissions } from '@/hooks/usePermissions';
import { useTeamUsers } from '@/hooks/useTeamUsers';
import type { PanelUserDto } from '@/lib/admin-users-api';
import { RefreshCw, Search, ShieldCheck, UserRoundPlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';

export function TeamView() {
  const { guards } = usePermissions();
  const canView = guards.check('users.view');
  const canCreate = guards.check('users.create');
  const canEdit = guards.check('users.update');
  const canDeactivate = guards.check('users.deactivate');
  const canDelete = guards.check('users.delete');
  const canAssignRoles = guards.canAssignRoles();
  const {
    users,
    loading,
    error,
    refresh,
    createUser,
    updateUser,
    deactivateUser,
    replaceRoles,
    deleteUser,
    resendInvitation,
  } = useTeamUsers();
  const { roles, loading: rolesLoading } = useRolesCatalog();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PanelUserDto>();
  const [deactivateTarget, setDeactivateTarget] = useState<PanelUserDto>();
  const [deactivating, setDeactivating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PanelUserDto>();
  const [deleting, setDeleting] = useState(false);
  const [resendingUserId, setResendingUserId] = useState<string>();

  const filteredUsers = useMemo(
    () => filterTeamUsers(users, search, roleFilter, statusFilter),
    [users, search, roleFilter, statusFilter],
  );

  if (!canView)
    return (
      <div className="p-6">
        <AccessDeniedState />
      </div>
    );

  async function submitUser(payload: {
    fullName: string;
    email?: string;
    password?: string;
    isActive: boolean;
    roleIds: string[];
  }) {
    if (editingUser) {
      const updated = await updateUser(editingUser.id, {
        fullName: payload.fullName,
        password: payload.password,
        isActive: payload.isActive,
      });
      if (updated.success && canAssignRoles) {
        // Evitar doble toast "Usuario actualizado" + "Roles actualizados".
        await replaceRoles(editingUser, payload.roleIds, { silent: true });
      }
      return { success: updated.success };
    }
    return createUser({
      email: payload.email ?? '',
      fullName: payload.fullName,
      password: payload.password,
      isActive: payload.isActive,
      roleIds: canAssignRoles ? payload.roleIds : [],
    });
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    const result = await deactivateUser(deactivateTarget.id);
    setDeactivating(false);
    if (result.success) setDeactivateTarget(undefined);
  }

  async function handleResendInvitation(user: PanelUserDto) {
    setResendingUserId(user.id);
    await resendInvitation(user.id);
    setResendingUserId(undefined);
  }

  async function confirmDelete() {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    const result = await deleteUser(deleteTarget.id);
    setDeleting(false);
    if (result.success) setDeleteTarget(undefined);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <section className="relative overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,.18),transparent_32%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)))] p-6 shadow-sm">
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <Badge variant="outline" className="mb-3">
                <ShieldCheck className="mr-1 h-3 w-3" />
                Administración segura
              </Badge>
              <h1 className="text-3xl font-black tracking-tight">Equipo</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Administra las personas que tienen acceso a Voz Ciudadana, sus roles y el estado de
                sus cuentas. Las invitaciones y reenvíos se procesan desde el backend mediante
                correo transaccional.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={refresh} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
              {canCreate && (
                <Button
                  onClick={() => {
                    setEditingUser(undefined);
                    setFormOpen(true);
                  }}
                >
                  <UserRoundPlus className="mr-2 h-4 w-4" />
                  Crear integrante
                </Button>
              )}
            </div>
          </div>
        </section>
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o correo..."
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="inactive">Inactivos</SelectItem>
            </SelectContent>
          </Select>
          {(search || roleFilter !== 'all' || statusFilter !== 'all') && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                setRoleFilter('all');
                setStatusFilter('all');
              }}
            >
              <X className="mr-1 h-4 w-4" />
              Limpiar
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
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Mostrando <strong className="text-foreground">{filteredUsers.length}</strong> de{' '}
            <strong className="text-foreground">{users.length}</strong> integrantes
          </span>
        </div>
        <UsersTable
          users={filteredUsers}
          loading={loading || rolesLoading}
          canEdit={canEdit}
          canDeactivate={canDeactivate}
          onEdit={(user) => {
            setEditingUser(user);
            setFormOpen(true);
          }}
          onDelete={(user) => {
            setDeleteTarget(user);
          }}
          canDelete={canDelete}
          onDeactivate={(user) => {
            setDeactivateTarget(user);
          }}
          canResend={canCreate}
          resendingUserId={resendingUserId}
          onResend={(user) => {
            void handleResendInvitation(user);
          }}
        />
      </div>
      <UserForm
        open={formOpen}
        user={editingUser}
        roles={roles}
        canAssignRoles={canAssignRoles}
        onOpenChange={setFormOpen}
        onSubmit={submitUser}
      />
      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(undefined)}
        title="¿Desactivar integrante?"
        description={
          <>
            Esta persona perderá acceso a Voz Ciudadana. Sus datos, roles y actividad se conservarán
            porque el backend realiza baja lógica con <code>isActive=false</code>.
          </>
        }
        confirmText="Desactivar"
        confirmingText="Desactivando..."
        variant="destructive"
        confirming={deactivating}
        onConfirm={confirmDeactivate}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="¿Eliminar integrante?"
        description={
          <>
            Vas a eliminar de forma permanente a{' '}
            <strong>{deleteTarget?.fullName || deleteTarget?.email}</strong>. Se borrarán su cuenta
            y sus roles, y esta acción no se puede deshacer. Si solo querés quitarle el acceso,
            desactivá el integrante en lugar de eliminarlo.
          </>
        }
        confirmText="Eliminar"
        confirmingText="Eliminando..."
        variant="destructive"
        confirming={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
