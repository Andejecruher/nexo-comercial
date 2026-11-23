'use client';

import { AccessDeniedState } from '@/components/admin/access-control/AccessDeniedState';
import { ProtectedEntityBadge } from '@/components/admin/access-control/ProtectedEntityBadge';
import {
  filterPermissions,
  getPermissionDiff,
  groupPermissionsByModule,
} from '@/components/admin/access-control/access-utils';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissionsCatalog, useRoleDetail } from '@/hooks/useAccessControl';
import { usePermissions } from '@/hooks/usePermissions';
import { isSystemRole, type PermissionDto } from '@/lib/roles-permissions-api';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const SENSITIVE_PERMISSIONS = new Set([
  'roles.view',
  'roles.create',
  'roles.update',
  'roles.delete',
  'permissions.view',
  'permissions.manage',
  'users.view',
  'users.update',
]);

export function RolePermissionsManager({ roleId }: { roleId: string }) {
  const { guards } = usePermissions();
  const canView = guards.canViewRoles() && guards.canViewPermissions();
  const canManage = guards.canManagePermissions();
  const {
    role,
    loading: roleLoading,
    error: roleError,
    refresh: refreshRole,
    replacePermissions,
  } = useRoleDetail(roleId);
  const {
    permissions,
    modules,
    loading: permissionsLoading,
    error: permissionsError,
    refresh: refreshPermissions,
  } = usePermissionsCatalog({}, true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const originalIds = useMemo(
    () => new Set(role?.permissions.map((permission) => permission.id) ?? []),
    [role],
  );

  useEffect(() => {
    setSelectedIds(new Set(role?.permissions.map((permission) => permission.id) ?? []));
  }, [role]);

  useEffect(() => {
    if (modules.length > 0 && expanded.size === 0) setExpanded(new Set(modules));
  }, [modules, expanded.size]);

  useEffect(() => {
    const dirty = !setsEqual(originalIds, selectedIds);
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [originalIds, selectedIds]);

  const filteredPermissions = useMemo(
    () => filterPermissions(permissions, search, moduleFilter),
    [permissions, search, moduleFilter],
  );
  const groups = useMemo(
    () => groupPermissionsByModule(filteredPermissions),
    [filteredPermissions],
  );
  const diff = useMemo(
    () => getPermissionDiff(originalIds, selectedIds, permissions),
    [originalIds, selectedIds, permissions],
  );
  const dirty = diff.added.length > 0 || diff.removed.length > 0;
  const removesSensitive = diff.removed.some((permission) =>
    SENSITIVE_PERMISSIONS.has(permission.slug),
  );

  if (!canView)
    return (
      <div className="p-6">
        <AccessDeniedState />
      </div>
    );

  const togglePermission = (permissionId: string) => {
    if (!canManage) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const toggleModule = (items: PermissionDto[], checked: boolean) => {
    if (!canManage) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const permission of items) {
        if (checked) next.add(permission.id);
        else next.delete(permission.id);
      }
      return next;
    });
  };

  const save = async () => {
    if (!dirty || !canManage) return;
    setSaving(true);
    const result = await replacePermissions(Array.from(selectedIds));
    setSaving(false);
    if (result.success) setConfirmOpen(false);
  };

  const reset = () => setSelectedIds(new Set(originalIds));
  const loading = roleLoading || permissionsLoading;
  const error = roleError || permissionsError;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Button asChild variant="ghost" size="sm" className="w-fit">
              <Link href="/admin/accesos/roles">
                <ArrowLeft className="mr-2 h-4 w-4" /> Roles
              </Link>
            </Button>
            <div>
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
                Permisos del rol {role?.name && <span className="text-primary">{role.name}</span>}{' '}
                {role && isSystemRole(role) && <ProtectedEntityBadge />}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                {role?.description ||
                  'Seleccioná permisos por módulo y guardá el conjunto final mediante sincronización por lote.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refreshRole();
                void refreshPermissions();
              }}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" onClick={reset} disabled={!dirty || saving}>
              <RotateCcw className="mr-2 h-4 w-4" /> Descartar
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={!dirty || saving || !canManage}>
              <Save className="mr-2 h-4 w-4" /> Guardar cambios
            </Button>
          </div>
        </div>
        {error && (
          <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <span>{error}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void refreshRole();
                void refreshPermissions();
              }}
            >
              Reintentar
            </Button>
          </div>
        )}
        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : !role ? (
          <Empty className="min-h-[320px]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldAlert />
              </EmptyMedia>
              <EmptyTitle>Rol no encontrado</EmptyTitle>
              <EmptyDescription>No fue posible cargar el rol solicitado.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>{selectedIds.size}</CardTitle>
                  <CardDescription>Permisos seleccionados</CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-green-600">+{diff.added.length}</CardTitle>
                  <CardDescription>Permisos agregados</CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-destructive">-{diff.removed.length}</CardTitle>
                  <CardDescription>Permisos retirados</CardDescription>
                </CardHeader>
              </Card>
            </div>
            {!canManage && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                Tenés acceso de lectura. Para modificar permisos se requiere{' '}
                <code>permissions.manage</code>.
              </div>
            )}
            {dirty && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
                <strong>Cambios sin guardar.</strong> Revisá el resumen antes de salir de la
                pantalla.
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar permiso..."
                  className="pl-9"
                />
              </div>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los módulos</SelectItem>
                  {modules.map((module) => (
                    <SelectItem key={module} value={module}>
                      {module}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              {groups.map((group) => {
                const selectedCount = group.permissions.filter((permission) =>
                  selectedIds.has(permission.id),
                ).length;
                const allSelected =
                  selectedCount === group.permissions.length && group.permissions.length > 0;
                const partiallySelected = selectedCount > 0 && !allSelected;
                const isExpanded = expanded.has(group.module);
                return (
                  <Card key={group.module} className="gap-0 py-0">
                    <CardHeader
                      className="cursor-pointer gap-3 py-4"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.module)) next.delete(group.module);
                          else next.add(group.module);
                          return next;
                        })
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <div>
                            <CardTitle className="capitalize">{group.module}</CardTitle>
                            <CardDescription>
                              {selectedCount} de {group.permissions.length} seleccionados
                            </CardDescription>
                          </div>
                        </div>
                        <div
                          className="flex items-center gap-2"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Badge
                            variant={
                              allSelected ? 'default' : partiallySelected ? 'secondary' : 'outline'
                            }
                          >
                            {allSelected ? 'Completo' : partiallySelected ? 'Parcial' : 'Vacío'}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canManage}
                            onClick={() => toggleModule(group.permissions, !allSelected)}
                          >
                            {allSelected ? 'Deseleccionar' : 'Seleccionar'} módulo
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent className="space-y-2 pb-4">
                        {group.permissions.map((permission) => (
                          <label
                            key={permission.id}
                            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/60"
                          >
                            <Checkbox
                              checked={selectedIds.has(permission.id)}
                              disabled={!canManage}
                              onCheckedChange={() => togglePermission(permission.id)}
                              aria-label={`Seleccionar permiso ${permission.name}`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{permission.name}</span>
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                  {permission.slug}
                                </code>
                                {SENSITIVE_PERMISSIONS.has(permission.slug) && (
                                  <Badge variant="outline">Sensible</Badge>
                                )}
                              </span>
                              <span className="mt-1 block text-sm text-muted-foreground">
                                {permission.description || 'Sin descripción'}
                              </span>
                            </span>
                          </label>
                        ))}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Guardar cambios de permisos</AlertDialogTitle>
            <AlertDialogDescription>
              Se agregarán {diff.added.length} permisos y se retirarán {diff.removed.length}.{' '}
              {removesSensitive && (
                <span className="mt-2 block font-medium text-destructive">
                  Estás retirando permisos sensibles de administración. El backend debe validar que
                  no se pierda el acceso crítico.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-48 overflow-y-auto rounded-md bg-muted p-3 text-sm">
            <p className="font-medium text-green-700">Agregados</p>
            <p className="text-muted-foreground">
              {diff.added.map((p) => p.slug).join(', ') || 'Ninguno'}
            </p>
            <p className="mt-3 font-medium text-destructive">Retirados</p>
            <p className="text-muted-foreground">
              {diff.removed.map((p) => p.slug).join(', ') || 'Ninguno'}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving || !canManage}
              onClick={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              {saving ? 'Guardando...' : 'Confirmar guardado'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
