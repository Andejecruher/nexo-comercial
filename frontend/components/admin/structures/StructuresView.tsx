'use client';

import { AccessDeniedState } from '@/components/admin/access-control/AccessDeniedState';
import {
  StructureForm,
  type StructureFormPayload,
} from '@/components/admin/structures/StructureForm';
import { StructuresTable } from '@/components/admin/structures/StructuresTable';
import {
  filterStructures,
  type StructureStatusFilter,
} from '@/components/admin/structures/structure-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { usePermissions } from '@/hooks/usePermissions';
import { useStructures } from '@/hooks/useStructures';
import type { OrganizationalStructureDto } from '@/lib/structures-api';
import { Layers, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

export function StructuresView() {
  const { guards } = usePermissions();
  const canView = guards.canViewCoordinators();
  const canCreate = guards.canCreateCoordinators();
  const canEdit = guards.canUpdateCoordinators();
  const canDelete = guards.canDeleteCoordinators();
  const { structures, loading, refresh, createStructure, updateStructure, removeStructure } =
    useStructures({ includeInactive: true });
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StructureStatusFilter>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editingStructure, setEditingStructure] = useState<OrganizationalStructureDto>();
  const [deactivateTarget, setDeactivateTarget] = useState<OrganizationalStructureDto>();
  const [deactivating, setDeactivating] = useState(false);

  const effectiveStatus: StructureStatusFilter = includeInactive ? statusFilter : 'active';

  const filtered = useMemo(
    () => filterStructures(structures, search, effectiveStatus),
    [structures, search, effectiveStatus],
  );

  if (!canView)
    return (
      <div className="p-6">
        <AccessDeniedState />
      </div>
    );

  async function submitStructure(payload: StructureFormPayload) {
    if (editingStructure) {
      return updateStructure(editingStructure.id, payload);
    }
    return createStructure(payload);
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    const result = await removeStructure(deactivateTarget.id);
    setDeactivating(false);
    if (result.success) setDeactivateTarget(undefined);
  }

  return (
    <main
      className="flex h-full flex-col overflow-hidden bg-muted/20"
      aria-labelledby="structures-title"
    >
      <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-6 lg:p-8">
        <section className="relative overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,.18),transparent_32%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)))] p-6 shadow-sm">
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <Badge variant="outline" className="mb-3">
                <Layers className="mr-1 h-3 w-3" />
                Jerarquía operativa
              </Badge>
              <h1 id="structures-title" className="text-3xl font-black tracking-tight">
                Estructuras
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Catálogo para agrupar coordinadores. Vive junto a Coordinadores y Líderes en Gestión
                de Campaña; el Catálogo electoral queda para datos geográficos.
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
                    setEditingStructure(undefined);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Crear estructura
                </Button>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o identificador..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
            <Switch
              id="structures-include-inactive"
              checked={includeInactive}
              onCheckedChange={(checked) => {
                setIncludeInactive(checked);
                setStatusFilter(checked ? 'all' : 'active');
              }}
            />
            <Label htmlFor="structures-include-inactive" className="text-sm font-normal">
              Incluir inactivas
            </Label>
          </div>
          {includeInactive && (
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StructureStatusFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="active">Activas</SelectItem>
                <SelectItem value="inactive">Inactivas</SelectItem>
              </SelectContent>
            </Select>
          )}
          {(search || includeInactive) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                setIncludeInactive(false);
                setStatusFilter('active');
              }}
            >
              <X className="mr-1 h-4 w-4" />
              Limpiar
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Mostrando <strong className="text-foreground">{filtered.length}</strong> de{' '}
            <strong className="text-foreground">{structures.length}</strong> estructuras
          </span>
        </div>

        <StructuresTable
          structures={filtered}
          loading={loading}
          canEdit={canEdit}
          canDelete={canDelete}
          onEdit={(structure) => {
            setEditingStructure(structure);
            setFormOpen(true);
          }}
          onDeactivate={(structure) => setDeactivateTarget(structure)}
          onReactivate={(structure) => void updateStructure(structure.id, { isActive: true })}
        />
      </div>

      <StructureForm
        open={formOpen}
        structure={editingStructure}
        onOpenChange={setFormOpen}
        onSubmit={submitStructure}
      />
      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(undefined)}
        title="¿Desactivar estructura?"
        description={
          <>
            Vas a desactivar <strong>{deactivateTarget?.name}</strong>. No se puede desactivar
            mientras tenga coordinadores activos.
          </>
        }
        confirmText="Desactivar"
        confirmingText="Desactivando..."
        variant="destructive"
        confirming={deactivating}
        onConfirm={confirmDeactivate}
      />
    </main>
  );
}
