'use client';

import { PromptEditor } from '@/components/ai/PromptEditor';
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
import { PaginationControls } from '@/components/shared/catalogs/PaginationControls';
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
import { usePrompts } from '@/hooks/ai/usePrompts';
import { useTopics } from '@/hooks/ai/useTopics';
import type { AiPrompt } from '@/lib/shared/ai-api';
import { FileText, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';

const TYPE_LABELS: Record<string, string> = {
  topic: 'Tópico',
  system: 'Sistema',
  fallback: 'Fallback',
};

const TYPE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  topic: 'secondary',
  system: 'default',
  fallback: 'outline',
};

export function PromptsView() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<AiPrompt | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingPrompt, setDeletingPrompt] = useState<AiPrompt | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);

  const {
    prompts,
    loading,
    error,
    totalCount,
    hasNextPage,
    hasPreviousPage,
    currentPage,
    refresh,
    nextPage,
    previousPage,
    createPrompt,
    updatePrompt,
    togglePrompt,
    deletePrompt,
  } = usePrompts({
    search: search || undefined,
    isActive: activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined,
  });

  const { topics } = useTopics({ isActive: undefined });

  const handleFormSubmit = async (payload: Parameters<typeof createPrompt>[0]) => {
    if (editingPrompt) return updatePrompt(editingPrompt.id, payload);
    return createPrompt(payload);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPrompt) return;
    setDeleting(true);
    await deletePrompt(deletingPrompt.id);
    setDeleting(false);
    setDeleteDialogOpen(false);
    setDeletingPrompt(undefined);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Prompts del sistema</h2>
            <p className="text-xs text-muted-foreground">{totalCount} prompt(s) en total</p>
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
              setEditingPrompt(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Nuevo prompt
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
            placeholder="Buscar prompts…"
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
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <TableSkeleton
            headers={['Nombre', 'Tipo', 'Tópico', 'Versión', 'Contenido', 'Activo', 'Acciones']}
          />
        ) : prompts.length === 0 ? (
          <TableEmptyState icon={FileText} title="No hay prompts configurados" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Tópico</TableHead>
                  <TableHead className="text-center">Versión</TableHead>
                  <TableHead className="w-40">Contenido</TableHead>
                  <TableHead className="text-center">Activo</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts.map((prompt) => (
                  <TableRow key={prompt.id}>
                    <TableCell className="font-medium text-sm">{prompt.name}</TableCell>
                    <TableCell>
                      <Badge variant={TYPE_VARIANTS[prompt.type] ?? 'outline'} className="text-xs">
                        {TYPE_LABELS[prompt.type] ?? prompt.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {prompt.topic ? (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {prompt.topic.slug}
                        </code>
                      ) : (
                        <span className="text-xs text-muted-foreground">Global</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs">
                        v{prompt.version}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-muted-foreground line-clamp-2 max-w-36">
                        {prompt.content}
                      </p>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={prompt.isActive}
                        onCheckedChange={() => togglePrompt(prompt.id)}
                        aria-label={`${prompt.isActive ? 'Desactivar' : 'Activar'} ${prompt.name}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <TableAction
                          tone="primary"
                          label={`Editar ${prompt.name}`}
                          onClick={() => {
                            setEditingPrompt(prompt);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </TableAction>
                        <TableAction
                          tone="danger"
                          label={`Eliminar ${prompt.name}`}
                          onClick={() => {
                            setDeletingPrompt(prompt);
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

      <PromptEditor
        open={formOpen}
        prompt={editingPrompt}
        availableTopics={topics}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar el prompt <strong>{deletingPrompt?.name}</strong> (v
              {deletingPrompt?.version}). Esta acción no se puede deshacer.
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
