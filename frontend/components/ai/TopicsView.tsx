'use client';

import { TopicForm } from '@/components/ai/TopicForm';
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
import { useTopics } from '@/hooks/ai/useTopics';
import { useTools } from '@/hooks/ai/useTools';
import { usePrompts } from '@/hooks/ai/usePrompts';
import type { AiTopic } from '@/lib/shared/ai-api';
import { BookOpen, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';

export function TopicsView() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<AiTopic | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTopic, setDeletingTopic] = useState<AiTopic | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);

  const {
    topics,
    loading,
    error,
    totalCount,
    hasNextPage,
    hasPreviousPage,
    currentPage,
    refresh,
    nextPage,
    previousPage,
    createTopic,
    updateTopic,
    toggleTopic,
    deleteTopic,
  } = useTopics({
    search: search || undefined,
    isActive: activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined,
  });

  const { tools } = useTools({ isActive: true });
  const { prompts } = usePrompts({ isActive: true });

  const handleFormSubmit = async (payload: Parameters<typeof createTopic>[0]) => {
    if (editingTopic) return updateTopic(editingTopic.id, payload);
    return createTopic(payload);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTopic) return;
    setDeleting(true);
    await deleteTopic(deletingTopic.id);
    setDeleting(false);
    setDeleteDialogOpen(false);
    setDeletingTopic(undefined);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Tópicos</h2>
            <p className="text-xs text-muted-foreground">{totalCount} tópico(s) en total</p>
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
              setEditingTopic(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Nuevo tópico
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
            placeholder="Buscar tópicos…"
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
            headers={['Nombre', 'Slug', 'Keywords', 'Herramientas', 'Activo', 'Acciones']}
          />
        ) : topics.length === 0 ? (
          <TableEmptyState icon={BookOpen} title="No hay tópicos configurados" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Keywords</TableHead>
                  <TableHead>Herramientas</TableHead>
                  <TableHead className="text-center">Activo</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topics.map((topic) => (
                  <TableRow key={topic.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-semibold">{topic.name}</p>
                        {topic.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 max-w-48">
                            {topic.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                        {topic.slug}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-48">
                        {topic.matcherKeywords.slice(0, 3).map((kw) => (
                          <Badge key={kw} variant="secondary" className="text-xs">
                            {kw}
                          </Badge>
                        ))}
                        {topic.matcherKeywords.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{topic.matcherKeywords.length - 3}
                          </Badge>
                        )}
                        {topic.matcherKeywords.length === 0 && (
                          <span className="text-xs text-muted-foreground">Sin keywords</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {topic.tools?.length ?? 0} tool(s)
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={topic.isActive}
                        onCheckedChange={() => toggleTopic(topic.id)}
                        aria-label={`${topic.isActive ? 'Desactivar' : 'Activar'} ${topic.name}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <TableAction
                          tone="primary"
                          label={`Editar ${topic.name}`}
                          onClick={() => {
                            setEditingTopic(topic);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </TableAction>
                        <TableAction
                          tone="danger"
                          label={`Eliminar ${topic.name}`}
                          onClick={() => {
                            setDeletingTopic(topic);
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

      <TopicForm
        open={formOpen}
        topic={editingTopic}
        availableTools={tools}
        availablePrompts={prompts}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tópico?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar el tópico <strong>{deletingTopic?.name}</strong>. Los agentes que lo
              tenían asignado perderán este tópico.
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
