'use client';

import { ToolForm } from '@/components/ai/ToolForm';
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
import { PaginationControls } from '@/components/domain/catalogs/PaginationControls';
import { TableAction } from '@/components/ui/table-action';
import { TableEmptyState, TableSkeleton } from '@/components/ui/table-states';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTools } from '@/hooks/ai/useTools';
import type { AiTool } from '@/lib/ai-api';
import { Pencil, Plus, RefreshCw, Search, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';

export function ToolsView() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<AiTool | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTool, setDeletingTool] = useState<AiTool | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);

  const {
    tools,
    loading,
    error,
    totalCount,
    hasNextPage,
    hasPreviousPage,
    currentPage,
    refresh,
    nextPage,
    previousPage,
    createTool,
    updateTool,
    toggleTool,
    deleteTool,
  } = useTools({
    search: search || undefined,
    isActive: activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined,
  });

  const handleFormSubmit = async (payload: Parameters<typeof createTool>[0]) => {
    if (editingTool) return updateTool(editingTool.id, payload);
    return createTool(payload);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTool) return;
    setDeleting(true);
    await deleteTool(deletingTool.id);
    setDeleting(false);
    setDeleteDialogOpen(false);
    setDeletingTool(undefined);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Herramientas</h2>
            <p className="text-xs text-muted-foreground">{totalCount} herramienta(s) en total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={refresh}
            disabled={loading}
            aria-label="Actualizar tabla"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingTool(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Nueva herramienta
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/30 shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar herramientas…"
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select
          value={activeFilter}
          onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}
        >
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="active">Activas</SelectItem>
            <SelectItem value="inactive">Inactivas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <TableSkeleton headers={['Nombre', 'Tipo', 'Config', 'Timeout', 'Activa', 'Acciones']} />
        ) : tools.length === 0 ? (
          <TableEmptyState icon={Wrench} title="No hay herramientas configuradas" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead className="text-center">Timeout</TableHead>
                  <TableHead className="text-center">Activa</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tools.map((tool) => (
                  <TableRow key={tool.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-semibold font-mono">{tool.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1 max-w-52">
                          {tool.description}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={tool.kind === 'internal' ? 'secondary' : 'outline'}
                        className="text-xs"
                      >
                        {tool.kind === 'internal' ? 'Interna' : 'Externa'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {tool.kind === 'internal' && tool.internalKey && (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {tool.internalKey}
                        </code>
                      )}
                      {tool.kind === 'external' && tool.externalUrl && (
                        <div className="flex items-center gap-1">
                          {tool.externalMethod && (
                            <Badge variant="outline" className="text-[10px] py-0">
                              {tool.externalMethod}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground truncate max-w-36">
                            {tool.externalUrl}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {tool.timeoutMs}ms
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={tool.isActive}
                        onCheckedChange={() => toggleTool(tool.id)}
                        aria-label={`${tool.isActive ? 'Desactivar' : 'Activar'} ${tool.name}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <TableAction
                          tone="primary"
                          label={`Editar ${tool.name}`}
                          onClick={() => {
                            setEditingTool(tool);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </TableAction>
                        <TableAction
                          tone="danger"
                          label={`Eliminar ${tool.name}`}
                          onClick={() => {
                            setDeletingTool(tool);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </TableAction>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {(hasNextPage || hasPreviousPage) && (
        <PaginationControls
          currentPage={currentPage}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          totalCount={totalCount}
          loading={loading}
          onFirst={refresh}
          onPrevious={previousPage}
          onNext={nextPage}
        />
      )}

      <ToolForm
        open={formOpen}
        tool={editingTool}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar herramienta?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar <strong>{deletingTool?.name}</strong>. Los tópicos que la usaban
              perderán esta herramienta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
