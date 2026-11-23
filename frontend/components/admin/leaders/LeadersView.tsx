'use client';

import { AccessDeniedState } from '@/components/admin/access-control/AccessDeniedState';
import { LeaderForm } from '@/components/admin/leaders/LeaderForm';
import { LeadersTable } from '@/components/admin/leaders/LeadersTable';
import { PaginationControls } from '@/components/domain/catalogs/PaginationControls';
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
import { useLeaders } from '@/hooks/useLeaders';
import { usePermissions } from '@/hooks/usePermissions';
import { ExportButton } from '@/components/admin/ExportButton';
import { useSections } from '@/hooks/useSections';
import type { ElectoralLeader, LeaderProfilePayload } from '@/lib/ine-ocr-api';
import { Flag, RefreshCw, Search, UserRoundPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const PAGE_SIZE = 20;

function useDebounce(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function LeadersView() {
  const { guards } = usePermissions();
  const canView = guards.canViewLeaders();
  const canCreate = guards.canCreateLeaders();
  const canEdit = guards.canUpdateLeaders();
  const canDelete = guards.canDeleteLeaders();
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [coordinatorFilter, setCoordinatorFilter] = useState('all');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search);
  const {
    leaders,
    loading,
    error,
    totalCount,
    hasNextPage,
    refresh,
    createLeader,
    updateLeader,
    removeLeader,
    reinviteLeader,
  } = useLeaders({
    q: debouncedSearch.trim() || undefined,
    sectionId: sectionFilter === 'all' ? undefined : sectionFilter,
    coordinatorId: coordinatorFilter === 'all' ? undefined : coordinatorFilter,
    includeInactive: true,
    page,
    pageSize: PAGE_SIZE,
  });
  const { coordinators } = useCoordinators();
  const { activeSections, sectionsLoading } = useSections();
  const [formOpen, setFormOpen] = useState(false);
  const [editingLeader, setEditingLeader] = useState<ElectoralLeader>();
  const [deleteTarget, setDeleteTarget] = useState<ElectoralLeader>();
  const [deleting, setDeleting] = useState(false);
  const [resendingId, setResendingId] = useState<string>();

  useEffect(() => {
    if (!loading && leaders.length === 0 && page > 1) {
      setPage((current) => Math.max(1, current - 1));
    }
  }, [loading, leaders.length, page]);

  if (!canView)
    return (
      <div className="p-6">
        <AccessDeniedState />
      </div>
    );

  async function submitLeader(
    payload: { sectionId: string; fullName: string } & LeaderProfilePayload,
  ) {
    if (editingLeader) {
      const updated = await updateLeader(editingLeader.id, payload);
      return { success: updated.success };
    }
    return createLeader(payload);
  }

  async function handleResend(leader: ElectoralLeader) {
    setResendingId(leader.id);
    await reinviteLeader(leader.id);
    setResendingId(undefined);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await removeLeader(deleteTarget.id);
    setDeleting(false);
    if (result.success) setDeleteTarget(undefined);
  }

  const hasActiveFilters =
    Boolean(search) || sectionFilter !== 'all' || coordinatorFilter !== 'all';

  return (
    <main
      className="flex h-full flex-col overflow-hidden bg-muted/20"
      aria-labelledby="leaders-title"
    >
      <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-6 lg:p-8">
        <section className="relative overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,.18),transparent_32%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)))] p-6 shadow-sm">
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <Badge variant="outline" className="mb-3">
                <Flag className="mr-1 h-3 w-3" />
                Liderazgo territorial
              </Badge>
              <h1 id="leaders-title" className="text-3xl font-black tracking-tight">
                Líderes
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Administra los líderes de sección y sus invitaciones. Un líder reporta a un
                coordinador de la misma sección y concentra los promovidos de su cargo.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={refresh} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
              <ExportButton
                module="leaders"
                filters={{
                  q: debouncedSearch.trim() || undefined,
                  sectionId: sectionFilter === 'all' ? undefined : sectionFilter,
                  coordinatorId: coordinatorFilter === 'all' ? undefined : coordinatorFilter,
                  includeInactive: true,
                }}
              />
              {canCreate && (
                <Button
                  onClick={() => {
                    setEditingLeader(undefined);
                    setFormOpen(true);
                  }}
                >
                  <UserRoundPlus className="mr-2 h-4 w-4" />
                  Crear líder
                </Button>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto] lg:items-center">
          <div className="relative md:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nombre, correo, coordinador o sección..."
              className="pl-9"
            />
          </div>
          <Select
            value={sectionFilter}
            onValueChange={(value) => {
              setSectionFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full">
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
          <Select
            value={coordinatorFilter}
            onValueChange={(value) => {
              setCoordinatorFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Coordinador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los coordinadores</SelectItem>
              {coordinators.map((coordinator) => (
                <SelectItem key={coordinator.id} value={coordinator.id}>
                  {coordinator.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              className="md:col-span-2 lg:col-span-1"
              onClick={() => {
                setSearch('');
                setSectionFilter('all');
                setCoordinatorFilter('all');
                setPage(1);
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
            Mostrando <strong className="text-foreground">{leaders.length}</strong> de{' '}
            <strong className="text-foreground">{totalCount}</strong> líderes
          </span>
        </div>

        <LeadersTable
          leaders={leaders}
          loading={loading || sectionsLoading}
          canEdit={canEdit}
          canDelete={canDelete}
          canResend={canEdit}
          resendingId={resendingId}
          onEdit={(leader) => {
            setEditingLeader(leader);
            setFormOpen(true);
          }}
          onDelete={(leader) => setDeleteTarget(leader)}
          onResend={(leader) => void handleResend(leader)}
        />

        <PaginationControls
          currentPage={page}
          hasNextPage={hasNextPage}
          hasPreviousPage={page > 1}
          totalCount={totalCount}
          loading={loading}
          onNext={() => setPage((current) => current + 1)}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onFirst={() => setPage(1)}
        />
      </div>

      <LeaderForm
        open={formOpen}
        leader={editingLeader}
        sections={activeSections}
        sectionsLoading={sectionsLoading}
        onOpenChange={setFormOpen}
        onSubmit={submitLeader}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title="¿Desactivar líder?"
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
