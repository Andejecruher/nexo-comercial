'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AiPrompt } from '@/lib/shared/ai-api';
import { CheckCircle2, Clock, FileText, Loader2 } from 'lucide-react';

interface PromptVersionsProps {
  prompts: AiPrompt[];
  loading?: boolean;
  /** Effective prompt IDs from the agent's runtime topic assignments. */
  selectedIds?: string[];
  saving?: boolean;
  onToggle?: (prompt: AiPrompt) => void;
  onActivate?: (prompt: AiPrompt) => void;
  onEdit?: (prompt: AiPrompt) => void;
}

const TYPE_LABEL: Record<string, string> = {
  topic: 'Tópico',
  system: 'Sistema',
  fallback: 'Fallback',
  tool: 'Tool',
};

const TYPE_COLOR: Record<string, string> = {
  topic: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  system: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  fallback: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  tool: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
};

export function PromptVersions({
  prompts,
  loading = false,
  selectedIds = [],
  saving = false,
  onToggle,
  onActivate,
  onEdit,
}: PromptVersionsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <FileText className="w-4 h-4 mr-2 animate-pulse" />
        Cargando prompts…
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
        <FileText className="w-8 h-8 opacity-30" />
        <p className="text-sm">No hay prompts</p>
      </div>
    );
  }

  // Group by topic/name
  const grouped = prompts.reduce<Record<string, AiPrompt[]>>((acc, p) => {
    const key = p.topic ? `${p.topic.name} / ${p.name}` : p.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {onToggle && (
        <p className="text-xs text-muted-foreground">
          {selectedIds.length} prompt(s) asignado(s) a este agente
        </p>
      )}
      {Object.entries(grouped).map(([groupName, versions]) => (
        <div key={groupName} className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {groupName}
          </p>
          {versions.map((prompt) => {
            const isSelected = selectedIds.includes(prompt.id);
            return (
              <div
                key={prompt.id}
                className={`flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? 'border-primary/40 bg-primary/5'
                    : prompt.isActive
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border bg-card'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    {prompt.isActive ? (
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    ) : (
                      <Clock className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium">v{prompt.version}</span>
                      <Badge
                        variant="outline"
                        className={`text-xs border ${TYPE_COLOR[prompt.type] ?? ''}`}
                      >
                        {TYPE_LABEL[prompt.type] ?? prompt.type}
                      </Badge>
                      {prompt.isActive && (
                        <Badge className="text-xs bg-primary/20 text-primary border-primary/30">
                          Activo
                        </Badge>
                      )}
                      {isSelected && (
                        <Badge className="text-xs bg-emerald-500/20 text-emerald-700 border-emerald-500/30">
                          Asignado
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {prompt.content}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {onEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => onEdit(prompt)}
                    >
                      Editar
                    </Button>
                  )}
                  {onActivate && !prompt.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => onActivate(prompt)}
                    >
                      Activar
                    </Button>
                  )}
                  {onToggle && (
                    <Button
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => onToggle(prompt)}
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
          })}
        </div>
      ))}
    </div>
  );
}
