'use client';

import { Badge } from '@/components/ui/badge';
import { TableEmptyState, TableSkeleton } from '@/components/ui/table-states';
import { TableAction } from '@/components/ui/table-action';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import type { AiAgent } from '@/lib/ai-api';
import { Bot, Pencil, Trash2 } from 'lucide-react';

interface AgentTableProps {
  agents: AiAgent[];
  loading: boolean;
  onEdit: (agent: AiAgent) => void;
  onToggle: (agent: AiAgent) => void;
  onDelete: (agent: AiAgent) => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export function AgentTable({ agents, loading, onEdit, onToggle, onDelete }: AgentTableProps) {
  if (loading)
    return (
      <TableSkeleton
        headers={[
          'Nombre',
          'Slug',
          'Proveedor',
          'Modelo',
          'Temp.',
          'Max tokens',
          'Activo',
          'Acciones',
        ]}
      />
    );

  if (agents.length === 0)
    return (
      <TableEmptyState
        icon={Bot}
        title="No hay agentes configurados"
        description="Creá el primer agente para comenzar."
      />
    );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead>Modelo</TableHead>
            <TableHead className="text-center">Temp.</TableHead>
            <TableHead className="text-center">Max tokens</TableHead>
            <TableHead className="text-center">Activo</TableHead>
            <TableHead className="w-24 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => (
            <TableRow key={agent.id}>
              <TableCell className="font-medium">
                <div>
                  <p className="text-sm font-semibold">{agent.name}</p>
                  {agent.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 max-w-48">
                      {agent.description}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {agent.slug}
                </code>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {PROVIDER_LABELS[agent.provider] ?? agent.provider}
                </Badge>
              </TableCell>
              <TableCell>
                <code className="text-xs text-muted-foreground">{agent.model}</code>
              </TableCell>
              <TableCell className="text-center text-sm text-muted-foreground">
                {agent.temperature ?? '—'}
              </TableCell>
              <TableCell className="text-center text-sm text-muted-foreground">
                {agent.maxTokens ?? '—'}
              </TableCell>
              <TableCell className="text-center">
                <Switch
                  checked={agent.isActive}
                  onCheckedChange={() => onToggle(agent)}
                  aria-label={agent.isActive ? 'Desactivar agente' : 'Activar agente'}
                />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <TableAction tone="primary" onClick={() => onEdit(agent)} label="Editar agente">
                    <Pencil className="w-3.5 h-3.5" />
                  </TableAction>
                  <TableAction
                    tone="danger"
                    onClick={() => onDelete(agent)}
                    label="Eliminar agente"
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
  );
}
