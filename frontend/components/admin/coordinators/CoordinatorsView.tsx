'use client';

import { ExportButton } from '@/components/admin/ExportButton';
import { AccessDeniedState } from '@/components/admin/access-control/AccessDeniedState';
import { CoordinatorForm } from '@/components/admin/coordinators/CoordinatorForm';
import { CoordinatorsTable } from '@/components/admin/coordinators/CoordinatorsTable';
import { filterCoordinators } from '@/components/admin/coordinators/coordinator-utils';
import { StructureColorSwatch } from '@/components/admin/structures/StructureColorSwatch';
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
import { useCoordinators } from '@/hooks/useCoordinators';
import { usePermissions } from '@/hooks/usePermissions';
import { useSections } from '@/hooks/useSections';
import { useStructures } from '@/hooks/useStructures';
import type { CoordinatorDto } from '@/lib/coordinators-api';
import { Flag, RefreshCw, Search, UserRoundPlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';

export function CoordinatorsView() {
  const { guards } = usePermissions();
  const canView = guards.canViewCoordinators();
  const canCreate = guards.canCreateCoordinators();
  const canEdit = guards.canUpdateCoordinators();
  const canDelete = guards.canDeleteCoordinators();
  const {
    coordinators,
    loading,
    error,
    refresh,
    createCoordinator,
    updateCoordinator,
    removeCoordinator,
    reinviteCoordinator,
  } = useCoordinators();
  const { activeSections, sectionsLoading } = useSections();
  const {
    structures,
    activeStructures,
    loading: structuresLoading,
    createStructure,
  } = useStructures({ includeInactive: true });
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [structureFilter, setStructureFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingCoordinator, setEditingCoordinator] = useState<CoordinatorDto>();
  const [deleteTarget, setDeleteTarget] = useState<CoordinatorDto>();
  const [deleting, setDeleting] = useState(false);
  const [resendingId, setResendingId] = useState<string>();

  const filtered = useMemo(
    () => filterCoordinators(coordinators, search, sectionFilter, structureFilter),
    [coordinators, search, sectionFilter, structureFilter],
  );

  if (!canView)
    return (
      <div className="p-6">
        <AccessDeniedState />
      </div>
    );

  async function submitCoordinator(payload: {
    sectionId: string;
    fullName: string;
    phone?: string | null;
    email: string;
    structureId?: string | null;
  }) {
    if (editingCoordinator) {
      const updated = await updateCoordinator(editingCoordinator.id, {
        fullName: payload.fullName,
        phone: payload.phone,
        structureId: payload.structureId,
      });
      return { success: updated.success };
    }
    return createCoordinator(payload);
  }

  async function handleResend(coordinator: CoordinatorDto) {
    setResendingId(coordinator.id);
    await reinviteCoordinator(coordinator.id);
    setResendingId(undefined);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await removeCoordinator(deleteTarget.id);
    setDeleting(false);
    if (result.success) setDeleteTarget(undefined);
  }

  return (
    <main
      className="flex h-full flex-col overflow-hidden bg-muted/20"
      aria-labelledby="coordinators-title"
    >
      <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-6 lg:p-8">
        <section className="relative overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,.18),transparent_32%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)))] p-6 shadow-sm">
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <Badge variant="outline" className="mb-3">
                <Flag className="mr-1 h-3 w-3" />
                Liderazgo territorial
              </Badge>
              <h1 id="coordinators-title" className="text-3xl font-black tracking-tight">
                Coordinadores
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Administra los coordinadores de sección y sus invitaciones. Un coordinador tiene
                alcance sobre su cargo: sus líderes y los promovidos de esos líderes.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={refresh} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
              <ExportButton
                module="coordinators"
                filters={{
                  sectionId: sectionFilter === 'all' ? undefined : sectionFilter,
                  structureId: structureFilter === 'all' ? undefined : structureFilter,
                }}
              />
              {canCreate && (
                <Button
                  onClick={() => {
                    setEditingCoordinator(undefined);
                    setFormOpen(true);
                  }}
                >
                  <UserRoundPlus className="mr-2 h-4 w-4" />
                  Crear coordinador
                </Button>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-[1fr_200px_200px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, correo o sección..."
              className="pl-9"
            />
          </div>
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Sección" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las secciones</SelectItem>
              {activeSections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  Sección {section.sectionCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={structureFilter} onValueChange={setStructureFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Estructura" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las estructuras</SelectItem>
              {activeStructures.map((structure) => (
                <SelectItem key={structure.id} value={structure.id}>
                  <span className="inline-flex items-center gap-2">
                    <StructureColorSwatch color={structure.color} />
                    {structure.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(search || sectionFilter !== 'all' || structureFilter !== 'all') && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                setSectionFilter('all');
                setStructureFilter('all');
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
            Mostrando <strong className="text-foreground">{filtered.length}</strong> de{' '}
            <strong className="text-foreground">{coordinators.length}</strong> coordinadores
          </span>
        </div>

        <CoordinatorsTable
          coordinators={filtered}
          loading={loading || sectionsLoading}
          canEdit={canEdit}
          canDelete={canDelete}
          canResend={canCreate}
          resendingId={resendingId}
          onEdit={(coordinator) => {
            setEditingCoordinator(coordinator);
            setFormOpen(true);
          }}
          onDelete={(coordinator) => setDeleteTarget(coordinator)}
          onResend={(coordinator) => void handleResend(coordinator)}
        />
      </div>

      <CoordinatorForm
        open={formOpen}
        coordinator={editingCoordinator}
        sections={activeSections}
        sectionsLoading={sectionsLoading}
        structures={structures}
        structuresLoading={structuresLoading}
        canCreateStructure={canCreate}
        onCreateStructure={(payload) => createStructure(payload)}
        onOpenChange={setFormOpen}
        onSubmit={submitCoordinator}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="¿Desactivar coordinador?"
        description={
          <>
            Vas a desactivar a <strong>{deleteTarget?.fullName}</strong>. Su cuenta se conservará
            (baja lógica) y podrás reactivarlo después.
          </>
        }
        confirmText="Desactivar"
        confirmingText="Desactivando..."
        variant="destructive"
        confirming={deleting}
        onConfirm={confirmDelete}
      />
    </main>
  );
}
