'use client';

import { AccessDeniedState } from '@/components/shared/access-control/AccessDeniedState';
import { PermissionForm } from '@/components/accesos/PermissionForm';
import { PermissionsTable } from '@/components/accesos/PermissionsTable';
import { permissionModuleLabel } from '@/components/accesos/access-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePermissionsCatalog } from '@/hooks/shared/useAccessControl';
import { usePermissions } from '@/hooks/shared/usePermissions';
import { cn } from '@/lib/shared/utils';
import {
  rolesPermissionsApi,
  type PermissionDto,
  type RoleDto,
} from '@/lib/shared/roles-permissions-api';
import { Info, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const PAGE_SIZE = 15;

export function PermissionsView() {
  const { guards } = usePermissions();
  const canView = guards.canViewPermissions();
  const canCreate = guards.canCreatePermissions();
  const canEdit = guards.canUpdatePermissions();
  const canChangeStatus = guards.canDeactivatePermissions();
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const filters = useMemo(
    () => ({
      search: search || undefined,
      module: moduleFilter === 'all' ? undefined : moduleFilter,
      status: statusFilter === 'all' ? undefined : (statusFilter as 'active' | 'inactive'),
      isSystem: typeFilter === 'all' ? undefined : typeFilter === 'system',
      page,
      limit: PAGE_SIZE,
    }),
    [search, moduleFilter, statusFilter, typeFilter, page],
  );
  const {
    permissions,
    modules,
    moduleFacets,
    pagination,
    loading,
    error,
    refresh,
    createPermission,
    updatePermission,
    setPermissionStatus,
  } = usePermissionsCatalog(filters);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<PermissionDto>();
  const [cloneSource, setCloneSource] = useState<PermissionDto>();
  const [statusTarget, setStatusTarget] = useState<PermissionDto>();
  const [rolesTarget, setRolesTarget] = useState<PermissionDto>();
  const [roles, setRoles] = useState<Pick<RoleDto, 'id' | 'name' | 'slug' | 'description'>[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  // "Cargar más" appends pages instead of replacing them, so keep the pages seen so far.
  const [rows, setRows] = useState<PermissionDto[]>([]);

  useEffect(() => {
    if (loading) return;
    setRows((previous) => {
      if (page === 1) return permissions;
      const byId = new Map(previous.map((row) => [row.id, row]));
      for (const permission of permissions) byId.set(permission.id, permission);
      return Array.from(byId.values());
    });
  }, [permissions, page, loading]);

  if (!canView)
    return (
      <div className="p-6">
        <AccessDeniedState />
      </div>
    );

  const resetPaging = () => setPage(1);
  const hasFilters =
    Boolean(search) || moduleFilter !== 'all' || statusFilter !== 'all' || typeFilter !== 'all';
  const clear = () => {
    setSearch('');
    setModuleFilter('all');
    setStatusFilter('all');
    setTypeFilter('all');
    resetPaging();
  };
  const showRoles = async (permission: PermissionDto) => {
    setRolesTarget(permission);
    setRolesLoading(true);
    const result = await rolesPermissionsApi.listPermissionRoles(permission.id);
    setRoles(result.ok ? result.data.roles : []);
    setRolesLoading(false);
  };
  const openCreate = () => {
    setSelected(undefined);
    setCloneSource(undefined);
    setFormOpen(true);
  };
  const openEdit = (permission: PermissionDto) => {
    setSelected(permission);
    setCloneSource(undefined);
    setFormOpen(true);
  };
  const openClone = (permission: PermissionDto) => {
    setSelected(undefined);
    setCloneSource(permission);
    setFormOpen(true);
  };
  const facetFor = (module: string) => moduleFacets.find((facet) => facet.module === module)?.count;
  const visible = rows.length;
  const canLoadMore = visible > 0 && visible < pagination.total;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Administración de permisos</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={refresh}
              disabled={loading}
              aria-label="Actualizar permisos"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo permiso
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar permisos"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPaging();
              }}
              placeholder="Nombre, clave o descripción…"
              className="pl-9"
            />
          </div>
          <Filter
            label="Módulos"
            value={moduleFilter}
            onChange={(value) => {
              setModuleFilter(value);
              resetPaging();
            }}
            all="Todos los módulos"
            values={modules}
            labels={modules.map(permissionModuleLabel)}
          />
          <Filter
            label="Estados"
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              resetPaging();
            }}
            all="Todos los estados"
            values={['active', 'inactive']}
            labels={['Activos', 'Inactivos']}
          />
          <Filter
            label="Tipos"
            value={typeFilter}
            onChange={(value) => {
              setTypeFilter(value);
              resetPaging();
            }}
            all="Todos los tipos"
            values={['system', 'custom']}
            labels={['Sistema', 'Personalizados']}
          />
          {hasFilters && (
            <Button variant="ghost" onClick={clear}>
              <X className="mr-1 h-4 w-4" />
              Limpiar
            </Button>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={refresh}>
              Reintentar
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-sky-900 dark:bg-sky-950/40">
          <div className="flex gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
            <p id="permissions-backend-note" className="text-sm text-sky-900 dark:text-sky-100">
              <strong>Importante:</strong> La creación de una clave de permiso no asigna
              automáticamente la regla de autorización en el backend. Asegúrese de que los
              desarrolladores realicen esta integración.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Switch
              id="permissions-backend-validation"
              checked
              disabled
              aria-describedby="permissions-backend-note"
            />
            <Label
              htmlFor="permissions-backend-validation"
              className="text-sm text-sky-900 dark:text-sky-100"
            >
              Validación en backend
            </Label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{pagination.total}</strong> permisos registrados
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Módulos de permisos"
          className="flex gap-1 overflow-x-auto border-b"
        >
          <ModuleTab
            selected={moduleFilter === 'all'}
            onSelect={() => {
              setModuleFilter('all');
              resetPaging();
            }}
          >
            General
          </ModuleTab>
          {modules.map((module) => {
            const count = facetFor(module);
            return (
              <ModuleTab
                key={module}
                selected={moduleFilter === module}
                onSelect={() => {
                  setModuleFilter(module);
                  resetPaging();
                }}
              >
                {permissionModuleLabel(module)}
                {count !== undefined && ` (${count})`}
              </ModuleTab>
            );
          })}
        </div>

        <div id="permissions-table-panel">
          <PermissionsTable
            permissions={rows}
            loading={loading && page === 1}
            canEdit={canEdit}
            canCreate={canCreate}
            canChangeStatus={canChangeStatus}
            onEdit={openEdit}
            onClone={openClone}
            onStatus={setStatusTarget}
            onRoles={(p) => void showRoles(p)}
          />
        </div>

        {visible > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              Mostrando {visible} de {pagination.total}
            </span>
            {canLoadMore && (
              <Button onClick={() => setPage((current) => current + 1)} disabled={loading}>
                {loading ? 'Cargando…' : 'Cargar más'}
              </Button>
            )}
          </div>
        )}
      </div>

      <PermissionForm
        open={formOpen}
        permission={selected}
        cloneFrom={cloneSource}
        canEdit={selected ? canEdit : canCreate}
        onOpenChange={setFormOpen}
        onSubmit={(payload) => {
          resetPaging();
          return selected ? updatePermission(selected.id, payload) : createPermission(payload);
        }}
      />
      <AlertDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => !open && setStatusTarget(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.isActive ? 'Desactivar' : 'Activar'} permiso
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{statusTarget?.name}</strong> · <code>{statusTarget?.slug}</code>.{' '}
              {statusTarget?.isActive
                ? `Está asignado a ${statusTarget.roleCount} roles. Dejará de autorizar acciones y no estará disponible para nuevas asignaciones; las relaciones existentes se conservarán.`
                : 'Volverá a autorizar acciones y a estar disponible para nuevas asignaciones.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (statusTarget) {
                  resetPaging();
                  void setPermissionStatus(statusTarget, !statusTarget.isActive);
                }
                setStatusTarget(undefined);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={Boolean(rolesTarget)}
        onOpenChange={(open) => !open && setRolesTarget(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Roles con {rolesTarget?.name}</DialogTitle>
            <DialogDescription>
              Asignaciones conservadas para la clave <code>{rolesTarget?.slug}</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {rolesLoading ? (
              <p className="text-sm text-muted-foreground">Cargando roles…</p>
            ) : roles.length ? (
              roles.map((role) => (
                <div key={role.id} className="rounded-lg border p-3">
                  <p className="font-medium">{role.name}</p>
                  <code className="text-xs text-muted-foreground">{role.slug}</code>
                </div>
              ))
            ) : (
              <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                Este permiso no está asignado a ningún rol.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModuleTab({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls="permissions-table-panel"
      onClick={onSelect}
      className={cn(
        '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
        selected
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Filter({
  label,
  value,
  onChange,
  all,
  values,
  labels,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  all: string;
  values: string[];
  labels?: string[];
}) {
  const selectedIndex = values.indexOf(value);
  const selectedLabel =
    value === 'all' ? label : (labels?.[selectedIndex] ?? values[selectedIndex] ?? label);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={all} className="w-40">
        <span className="truncate">{selectedLabel}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{all}</SelectItem>
        {values.map((item, index) => (
          <SelectItem key={item} value={item}>
            {labels?.[index] ?? item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
