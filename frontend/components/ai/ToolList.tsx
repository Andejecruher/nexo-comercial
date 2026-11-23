'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AiTool } from '@/lib/ai-api';
import { ExternalLink, Loader2, Wrench, Zap } from 'lucide-react';

interface ToolListProps {
  tools: AiTool[];
  loading?: boolean;
  emptyMessage?: string;
  /** If provided, renders toggle buttons and highlights selected rows */
  selectedIds?: string[];
  saving?: boolean;
  onToggle?: (tool: AiTool) => void;
  onEdit?: (tool: AiTool) => void;
}

function ToolRow({
  tool,
  isSelected,
  saving,
  onToggle,
  onEdit,
}: {
  tool: AiTool;
  isSelected: boolean;
  saving: boolean;
  onToggle?: (tool: AiTool) => void;
  onEdit?: (tool: AiTool) => void;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors ${
        isSelected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <div className="mt-0.5 shrink-0">
          {tool.kind === 'internal' ? (
            <Zap className="w-4 h-4 text-yellow-500" />
          ) : (
            <ExternalLink className="w-4 h-4 text-blue-500" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{tool.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{tool.description}</p>
          {tool.internalKey && (
            <code className="text-xs text-muted-foreground font-mono">{tool.internalKey}</code>
          )}
          {tool.externalUrl && (
            <p className="text-xs text-muted-foreground truncate">{tool.externalUrl}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {!tool.isActive && (
          <Badge variant="secondary" className="text-xs">
            Inactiva
          </Badge>
        )}
        {isSelected && (
          <Badge className="text-xs bg-primary/20 text-primary border-primary/30">Asignada</Badge>
        )}
        {onEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => onEdit(tool)}
          >
            Editar
          </Button>
        )}
        {onToggle && (
          <Button
            variant={isSelected ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => onToggle(tool)}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : isSelected ? (
              'Quitar'
            ) : (
              'Asignar'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ToolList({
  tools,
  loading = false,
  emptyMessage = 'No hay tools disponibles',
  selectedIds = [],
  saving = false,
  onToggle,
  onEdit,
}: ToolListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <Wrench className="w-4 h-4 mr-2 animate-pulse" />
        Cargando tools…
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
        <Wrench className="w-8 h-8 opacity-30" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  const internal = tools.filter((t) => t.kind === 'internal');
  const external = tools.filter((t) => t.kind === 'external');

  const renderSection = (items: AiTool[], label: string) => {
    if (items.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          {label === 'Internas' ? (
            <Zap className="w-3 h-3 text-yellow-500" />
          ) : (
            <ExternalLink className="w-3 h-3 text-blue-500" />
          )}
          {label}
          <span className="font-normal">({items.length})</span>
        </p>
        {items.map((tool) => (
          <ToolRow
            key={tool.id}
            tool={tool}
            isSelected={selectedIds.includes(tool.id)}
            saving={saving}
            onToggle={onToggle}
            onEdit={onEdit}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {onToggle && (
        <p className="text-xs text-muted-foreground">
          {selectedIds.length} tool(s) asignada(s) a este agente
        </p>
      )}
      {renderSection(internal, 'Internas')}
      {renderSection(external, 'Externas')}
    </div>
  );
}
