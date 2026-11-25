/**
 * DepartmentsView — Vista administrativa de departamentos
 *
 * Integra tabla, form, filtros, search, paginación y confirmaciones de activación/desactivación.
 * Soft delete con isActive toggle.
 */

'use client';

import { DepartmentForm } from '@/components/shared/catalogs/DepartmentForm';
import { DepartmentTable } from '@/components/departamentos/DepartmentTable';
import { PaginationControls } from '@/components/shared/catalogs/PaginationControls';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDepartments } from '@/hooks/shared/useDepartments';
import type { Department } from '@/lib/shared/catalog-api';
import { Building2, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useState } from 'react';

export function DepartmentsView() {
  const {
    departments,
    loading,
    search,
    setSearch,
    activeFilter,
    setActiveFilter,
    hasNextPage,
    hasPreviousPage,
    totalCount,
    currentPage,
    nextPage,
    previousPage,
    firstPage,
    createDepartment,
    updateDepartment,
    toggleDepartment,
    refresh,
  } = useDepartments();

  // ─── Form State ────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | undefined>(undefined);

  // ─── Toggle Active Confirmation ────────────────────────────────────────────
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [togglingDepartment, setTogglingDepartment] = useState<Department | undefined>(undefined);
  const [toggling, setToggling] = useState(false);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = () => {
    setEditingDepartment(undefined);
    setFormOpen(true);
  };

  const handleEdit = (department: Department) => {
    setEditingDepartment(department);
    setFormOpen(true);
  };

  const handleToggleActiveClick = (department: Department) => {
    // Si es el departamento "general" activo, no permitir desactivación
    if (department.slug === 'general' && department.isActive) {
      return;
    }

    setTogglingDepartment(department);
    setToggleDialogOpen(true);
  };

  const handleToggleActiveConfirm = async () => {
    if (!togglingDepartment) return;

    setToggling(true);
    const result = await toggleDepartment(togglingDepartment.id);
    setToggling(false);

    if (result.success) {
      setToggleDialogOpen(false);
      setTogglingDepartment(undefined);
    }
  };

  const handleFormSubmit = async (data: {
    slug: string;
    name: string;
    description?: string;
    isActive?: boolean;
    keywords?: string[];
  }) => {
    if (editingDepartment) {
      // El slug es inmutable tras el alta (referenciado sin FK por tickets,
      // conversaciones y outbox realtime). Se descarta del payload de update.
      const { slug, ...updates } = data;
      void slug;
      return await updateDepartment(editingDepartment.id, updates);
    } else {
      return await createDepartment(data);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setActiveFilter('all');
  };

  const hasActiveFilters = search.trim() !== '' || activeFilter !== 'all';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" />
              Departamentos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestión de catálogo de departamentos para routing automático
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo departamento
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por slug, nombre, descripción o keywords..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Active Filter */}
          <Select
            value={activeFilter}
            onValueChange={(v) => setActiveFilter(v as 'all' | 'active' | 'inactive')}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="inactive">Inactivos</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-4 h-4 mr-1" />
              Limpiar
            </Button>
          )}
        </div>

        {/* Active Filters Badge */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtros activos:</span>
            {search && (
              <Badge variant="secondary" className="gap-1">
                Búsqueda: {search}
                <button onClick={() => setSearch('')} className="hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {activeFilter !== 'all' && (
              <Badge variant="secondary" className="gap-1">
                Estado: {activeFilter === 'active' ? 'Activos' : 'Inactivos'}
                <button onClick={() => setActiveFilter('all')} className="hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
          </div>
        )}

        {/* Results Count */}
        <div className="text-sm text-muted-foreground">
          Mostrando <span className="font-medium text-foreground">{departments.length}</span> de{' '}
          <span className="font-medium text-foreground">{totalCount}</span> registros
        </div>

        {/* Table */}
        <DepartmentTable
          departments={departments}
          loading={loading}
          onEdit={handleEdit}
          onToggleActive={handleToggleActiveClick}
        />
      </div>

      {/* Pagination */}
      <PaginationControls
        currentPage={currentPage}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        totalCount={totalCount}
        loading={loading}
        onNext={nextPage}
        onPrevious={previousPage}
        onFirst={firstPage}
      />

      {/* Form Dialog */}
      <DepartmentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        department={editingDepartment}
        onSubmit={handleFormSubmit}
      />

      {/* Toggle Active Confirmation */}
      <AlertDialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {togglingDepartment?.isActive ? '¿Desactivar' : '¿Activar'} departamento?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Estás por {togglingDepartment?.isActive ? 'desactivar' : 'activar'} el departamento{' '}
              <strong>{togglingDepartment?.name}</strong> (<code>{togglingDepartment?.slug}</code>).
              {togglingDepartment?.isActive ? (
                <>
                  <span className="block mt-2">
                    Los departamentos inactivos no aparecen en el routing automático.
                  </span>
                </>
              ) : (
                <>
                  <span className="block mt-2">
                    El departamento volverá a estar disponible para routing automático.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggling}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleActiveConfirm} disabled={toggling}>
              {toggling ? 'Procesando...' : togglingDepartment?.isActive ? 'Desactivar' : 'Activar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
