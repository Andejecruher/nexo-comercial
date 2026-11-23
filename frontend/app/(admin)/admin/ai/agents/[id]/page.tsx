'use client';

import { AgentForm } from '@/components/ai/AgentForm';
import { AgentTabs } from '@/components/ai/AgentTabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { agentsApi } from '@/lib/ai-api';
import type { AiAgent } from '@/lib/ai-api';
import { ArrowLeft, Bot, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export default function AgentDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';

  const [agent, setAgent] = useState<AiAgent | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void agentsApi.get(id).then((result) => {
      if (result.ok) {
        setAgent(result.data.agent);
      } else {
        toast.error('Error al cargar agente', { description: result.message });
      }
      setLoading(false);
    });
  }, [id]);

  const handleUpdateAgent = async (payload: Parameters<typeof agentsApi.update>[1]) => {
    if (!agent) return { success: false, error: 'Sin agente' };
    const result = await agentsApi.update(agent.id, payload);
    if (result.ok) {
      setAgent(result.data.agent);
      toast.success('Agente actualizado');
      return { success: true, data: result.data.agent };
    } else {
      toast.error('Error al actualizar', { description: result.message });
      return { success: false, error: result.message };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
        <Bot className="w-5 h-5 mr-2 animate-pulse" />
        Cargando agente…
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <Bot className="w-10 h-10 opacity-30" />
        <p className="text-sm font-medium">Agente no encontrado</p>
        <Link href="/admin/ai/agents">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Volver a agentes
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <Link href="/admin/ai/agents">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Volver">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 shrink-0">
          <Bot className="w-5 h-5 text-purple-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold">{agent.name}</h2>
            <Badge variant={agent.isActive ? 'default' : 'secondary'} className="text-xs">
              {agent.isActive ? 'Activo' : 'Inactivo'}
            </Badge>
            <Badge variant="outline" className="text-xs font-mono">
              {agent.provider}/{agent.model}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">{agent.slug}</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setEditOpen(true)}>
          <Pencil className="w-3.5 h-3.5 mr-1" />
          Editar
        </Button>
      </div>

      {/* Tabs content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <AgentTabs agent={agent} onAgentUpdated={(a) => setAgent(a)} />
      </div>

      {/* Edit form */}
      <AgentForm
        open={editOpen}
        agent={agent}
        onClose={() => setEditOpen(false)}
        onSubmit={handleUpdateAgent}
      />
    </div>
  );
}
