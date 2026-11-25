/**
 * TagsView — Vista administrativa de etiquetas
 *
 * Integra tabla, form, filtros, search, paginación y confirmaciones de eliminación.
 */

'use client';

import { PaginationControls } from '@/components/shared/catalogs/PaginationControls';
import { TagForm } from '@/components/etiquetas/TagForm';
import { TagTable } from '@/components/etiquetas/TagTable';
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
import { useTags } from '@/hooks/shared/useTags';
import type { Tag } from '@/lib/shared/catalog-api';
import { Plus, RefreshCw, Search, Tag as TagIcon, X } from 'lucide-react';
import { useState } from 'react';

export function TagsView() {
  const {
    tags,
    loading,
    search,
    setSearch,
    colorFilter,
    setColorFilter,
    hasNextPage,
    hasPreviousPage,
    totalCount,
    currentPage,
    nextPage,
    previousPage,
    firstPage,
    createTag,
    updateTag,
    deleteTag,
    refresh,
  } = useTags();

  // ─── Form State ────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | undefined>(undefined);

  // ─── Delete Confirmation ───────────────────────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTag, setDeletingTag] = useState<Tag | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = () => {
    setEditingTag(undefined);
    setFormOpen(true);
  };

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    setFormOpen(true);
  };

  const handleDeleteClick = (tag: Tag) => {
    setDeletingTag(tag);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTag) return;

    setDeleting(true);
    const result = await deleteTag(deletingTag.id);
    setDeleting(false);

    if (result.success) {
      setDeleteDialogOpen(false);
      setDeletingTag(undefined);
    }
  };

  const handleFormSubmit = async (data: { name: string; description?: string; color?: string }) => {
    if (editingTag) {
      return await updateTag(editingTag.id, data);
    } else {
      return await createTag(data);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setColorFilter(undefined);
  };

  const hasActiveFilters = search.trim() !== '' || colorFilter !== undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TagIcon className="w-6 h-6 text-primary" />
              Etiquetas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestión de catálogo de etiquetas para clasificación
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva etiqueta
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Color Filter (manual input) */}
          <Input
            placeholder="Filtrar por color (hex)..."
            value={colorFilter ?? ''}
            onChange={(e) => setColorFilter(e.target.value || undefined)}
            className="w-full sm:w-[200px]"
          />

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
            {colorFilter && (
              <Badge variant="secondary" className="gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colorFilter }} />
                Color: {colorFilter}
                <button onClick={() => setColorFilter(undefined)} className="hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
          </div>
        )}

        {/* Results Count */}
        <div className="text-sm text-muted-foreground">
          Mostrando <span className="font-medium text-foreground">{tags.length}</span> de{' '}
          <span className="font-medium text-foreground">{totalCount}</span> registros
        </div>

        {/* Table */}
        <TagTable tags={tags} loading={loading} onEdit={handleEdit} onDelete={handleDeleteClick} />
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
      <TagForm
        open={formOpen}
        onOpenChange={setFormOpen}
        tag={editingTag}
        onSubmit={handleFormSubmit}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar etiqueta?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás por eliminar la etiqueta <strong>{deletingTag?.name}</strong>. Esta acción no se
              puede deshacer.
              {deletingTag?.color && (
                <span className="flex items-center gap-2 mt-2 text-xs">
                  Color:
                  <div
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ backgroundColor: deletingTag.color }}
                  />
                  {deletingTag.color}
                </span>
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
