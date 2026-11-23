/**
 * NeighborhoodsView — Vista administrativa de barrios
 *
 * Integra tabla, form, filtros, search, paginación y confirmaciones de eliminación.
 */

'use client';

import { NeighborhoodForm } from '@/components/domain/catalogs/NeighborhoodForm';
import { NeighborhoodTable } from '@/components/domain/catalogs/NeighborhoodTable';
import { PaginationControls } from '@/components/domain/catalogs/PaginationControls';
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
import { useNeighborhoods } from '@/hooks/useNeighborhoods';
import type { Neighborhood } from '@/lib/catalog-api';
import { MapPin, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

export function NeighborhoodsView() {
  const {
    neighborhoods,
    loading,
    search,
    setSearch,
    zoneFilter,
    setZoneFilter,
    municipalityFilter,
    setMunicipalityFilter,
    hasNextPage,
    hasPreviousPage,
    totalCount,
    currentPage,
    nextPage,
    previousPage,
    firstPage,
    createNeighborhood,
    updateNeighborhood,
    deleteNeighborhood,
    refresh,
  } = useNeighborhoods();

  // Unique municipalities for the filter dropdown (derived from loaded page).
  const municipalityOptions = useMemo(() => {
    const unique = Array.from(
      new Set(neighborhoods.map((n) => n.municipality).filter(Boolean) as string[]),
    ).sort((a, b) => a.localeCompare(b));
    return unique;
  }, [neighborhoods]);

  // ─── Form State ────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingNeighborhood, setEditingNeighborhood] = useState<Neighborhood | undefined>(
    undefined,
  );

  // ─── Delete Confirmation ───────────────────────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingNeighborhood, setDeletingNeighborhood] = useState<Neighborhood | undefined>(
    undefined,
  );
  const [deleting, setDeleting] = useState(false);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = () => {
    setEditingNeighborhood(undefined);
    setFormOpen(true);
  };

  const handleEdit = (neighborhood: Neighborhood) => {
    setEditingNeighborhood(neighborhood);
    setFormOpen(true);
  };

  const handleDeleteClick = (neighborhood: Neighborhood) => {
    setDeletingNeighborhood(neighborhood);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingNeighborhood) return;

    setDeleting(true);
    const result = await deleteNeighborhood(deletingNeighborhood.id);
    setDeleting(false);

    if (result.success) {
      setDeleteDialogOpen(false);
      setDeletingNeighborhood(undefined);
    }
  };

  const handleFormSubmit = async (data: {
    name: string;
    zone?: string;
    postalCode?: string;
    municipality?: string;
  }) => {
    if (editingNeighborhood) {
      return await updateNeighborhood(editingNeighborhood.id, data);
    } else {
      return await createNeighborhood(data);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setZoneFilter(undefined);
    setMunicipalityFilter(undefined);
  };

  const hasActiveFilters =
    search.trim() !== '' || zoneFilter !== undefined || municipalityFilter !== undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="w-6 h-6 text-primary" />
              Barrios
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestión de catálogo de barrios y colonias
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo barrio
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o zona..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Zone Filter (manual input) */}
          <Input
            placeholder="Filtrar por zona..."
            value={zoneFilter ?? ''}
            onChange={(e) => setZoneFilter(e.target.value || undefined)}
            className="w-full sm:w-50"
          />

          {/* Municipality Filter */}
          <Select
            value={municipalityFilter ?? 'all'}
            onValueChange={(value) => setMunicipalityFilter(value === 'all' ? undefined : value)}
          >
            <SelectTrigger className="w-full sm:w-55">
              <SelectValue placeholder="Todos los municipios" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los municipios</SelectItem>
              {municipalityOptions.map((municipio) => (
                <SelectItem key={municipio} value={municipio}>
                  {municipio}
                </SelectItem>
              ))}
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
            {zoneFilter && (
              <Badge variant="secondary" className="gap-1">
                Zona: {zoneFilter}
                <button onClick={() => setZoneFilter(undefined)} className="hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {municipalityFilter && (
              <Badge variant="secondary" className="gap-1">
                Municipio: {municipalityFilter}
                <button
                  onClick={() => setMunicipalityFilter(undefined)}
                  className="hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
          </div>
        )}

        {/* Results Count */}
        <div className="text-sm text-muted-foreground">
          Mostrando <span className="font-medium text-foreground">{neighborhoods.length}</span> de{' '}
          <span className="font-medium text-foreground">{totalCount}</span> registros
        </div>

        {/* Table */}
        <NeighborhoodTable
          neighborhoods={neighborhoods}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
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
      <NeighborhoodForm
        open={formOpen}
        onOpenChange={setFormOpen}
        neighborhood={editingNeighborhood}
        onSubmit={handleFormSubmit}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar barrio?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás por eliminar el barrio <strong>{deletingNeighborhood?.name}</strong>. Esta
              acción no se puede deshacer.
              {deletingNeighborhood?.zone && (
                <span className="block mt-2 text-xs">Zona: {deletingNeighborhood.zone}</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
