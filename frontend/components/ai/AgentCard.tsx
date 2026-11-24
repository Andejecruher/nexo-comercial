'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { AiAgent } from '@/lib/shared/ai-api';
import { Bot, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface AgentCardProps {
  agent: AiAgent;
  phoneLineCount?: number;
  onEdit: (agent: AiAgent) => void;
  onToggle: (agent: AiAgent) => void;
  onDelete: (agent: AiAgent) => void;
}

const PROVIDER_COLOR: Record<string, string> = {
  openai: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  anthropic: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

export function AgentCard({
  agent,
  phoneLineCount = 0,
  onEdit,
  onToggle,
  onDelete,
}: AgentCardProps) {
  const providerClass =
    PROVIDER_COLOR[agent.provider] ?? 'bg-muted text-muted-foreground border-border';

  return (
    <div
      className={`group relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md ${
        agent.isActive ? 'border-border' : 'border-border/50 opacity-60'
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${providerClass}`}
          >
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{agent.name}</p>
            <code className="text-xs text-muted-foreground font-mono">{agent.slug}</code>
          </div>
        </div>
        <Switch
          checked={agent.isActive}
          onCheckedChange={() => onToggle(agent)}
          aria-label={agent.isActive ? 'Desactivar' : 'Activar'}
          className="shrink-0"
        />
      </div>

      {/* Description */}
      {agent.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
      )}

      {/* Model info */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={`text-xs border ${providerClass}`}>
          {agent.provider === 'openai' ? 'OpenAI' : 'Anthropic'}
        </Badge>
        <Badge variant="secondary" className="text-xs font-mono">
          {agent.model}
        </Badge>
        {agent.temperature !== undefined && agent.temperature !== null && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            T: {agent.temperature}
          </Badge>
        )}
        {agent.maxTokens !== undefined && agent.maxTokens !== null && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {agent.maxTokens} tok
          </Badge>
        )}
      </div>

      {/* Counts */}
      {phoneLineCount > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{phoneLineCount}</span> línea(s) asignada(s)
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 pt-1 border-t border-border/50">
        <Link href={`/admin/ai/agents/${agent.id}`} className="flex-1">
          <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-7">
            Ver detalle
            <ChevronRight className="w-3 h-3" />
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => onEdit(agent)}
          aria-label="Editar agente"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(agent)}
          aria-label="Eliminar agente"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
