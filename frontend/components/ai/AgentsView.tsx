'use client';

import { AgentCard } from '@/components/ai/AgentCard';
import { AgentForm } from '@/components/ai/AgentForm';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAgents } from '@/hooks/ai/useAgents';
import { useLines } from '@/hooks/shared/useLines';
import type { AiAgent } from '@/lib/shared/ai-api';
import { Bot, Plus, RefreshCw, Search } from 'lucide-react';
import { useState } from 'react';

export function AgentsView() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AiAgent | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<AiAgent | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);

  const {
    agents,
    loading,
    error,
    totalCount,
    hasNextPage,
    hasPreviousPage,
    refresh,
    nextPage,
    previousPage,
    createAgent,
    updateAgent,
    toggleAgent,
    deleteAgent,
  } = useAgents({
    search: search || undefined,
    isActive: activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined,
  });

  const { lines } = useLines({});

  // Count lines per agent
  const lineCountByAgent: Record<string, number> = {};
  for (const line of lines) {
    if (line.agentId) {
      lineCountByAgent[line.agentId] = (lineCountByAgent[line.agentId] ?? 0) + 1;
    }
  }

  const handleCreate = () => {
    setEditingAgent(undefined);
    setFormOpen(true);
  };

  const handleEdit = (agent: AiAgent) => {
    setEditingAgent(agent);
    setFormOpen(true);
  };

  const handleFormSubmit = async (payload: Parameters<typeof createAgent>[0]) => {
    if (editingAgent) {
      return updateAgent(editingAgent.id, payload);
    }
    return createAgent(payload);
  };

  const handleDeleteClick = (agent: AiAgent) => {
    setDeletingAgent(agent);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingAgent) return;
    setDeleting(true);
    await deleteAgent(deletingAgent.id);
    setDeleting(false);
    setDeleteDialogOpen(false);
    setDeletingAgent(undefined);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Agentes IA</h2>
            <p className="text-xs text-muted-foreground">{totalCount} agente(s) en total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Nuevo agente
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
            placeholder="Buscar agentes…"
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

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Card grid */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            <Bot className="w-5 h-5 mr-2 animate-pulse" />
            Cargando agentes…
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Bot className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">No hay agentes configurados</p>
            <p className="text-xs opacity-60">Creá el primer agente para comenzar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                phoneLineCount={lineCountByAgent[agent.id]}
                onEdit={handleEdit}
                onToggle={(a) => void toggleAgent(a.id)}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {(hasNextPage || hasPreviousPage) && (
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={previousPage}
            disabled={!hasPreviousPage || loading}
          >
            Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={nextPage} disabled={!hasNextPage || loading}>
            Siguiente
          </Button>
        </div>
      )}

      {/* Form Dialog */}
      <AgentForm
        open={formOpen}
        agent={editingAgent}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      {/* Delete Confirm */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar el agente <strong>{deletingAgent?.name}</strong>. Esta acción no se
              puede deshacer. Las líneas de comunicación que usaban este agente quedarán sin agente
              asignado.
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
