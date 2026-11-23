'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AiTopic, AiTool } from '@/lib/ai-api';
import { BookOpen, Hash, Loader2, Wrench } from 'lucide-react';

interface TopicRelationsProps {
  topics: AiTopic[];
  loading?: boolean;
  selectedIds?: string[];
  saving?: boolean;
  onToggle?: (topic: AiTopic) => void;
  onEditTopic?: (topic: AiTopic) => void;
  highlightToolId?: string;
}

export function TopicRelations({
  topics,
  loading = false,
  selectedIds = [],
  saving = false,
  onToggle,
  onEditTopic,
  highlightToolId,
}: TopicRelationsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <BookOpen className="w-4 h-4 mr-2 animate-pulse" />
        Cargando tópicos…
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
        <BookOpen className="w-8 h-8 opacity-30" />
        <p className="text-sm">No hay tópicos</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {onToggle && (
        <p className="text-xs text-muted-foreground">
          {selectedIds.length} tópico(s) asignado(s) a este agente
        </p>
      )}
      {topics.map((topic) => {
        const tools = (topic.tools as AiTool[] | undefined) ?? [];
        const isSelected = selectedIds.includes(topic.id);
        return (
          <div
            key={topic.id}
            className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
              isSelected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
            } ${!topic.isActive ? 'opacity-60' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="w-4 h-4 shrink-0 text-blue-500" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{topic.name}</p>
                  <code className="text-xs text-muted-foreground font-mono">{topic.slug}</code>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant={topic.isActive ? 'default' : 'secondary'} className="text-xs">
                  {topic.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
                {isSelected && (
                  <Badge className="text-xs bg-primary/20 text-primary border-primary/30">
                    Asignado
                  </Badge>
                )}
                {onEditTopic && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => onEditTopic(topic)}
                  >
                    Editar
                  </Button>
                )}
                {onToggle && (
                  <Button
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => onToggle(topic)}
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

            {topic.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{topic.description}</p>
            )}

            {/* Keywords */}
            {topic.matcherKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {topic.matcherKeywords.slice(0, 6).map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-0.5 text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5"
                  >
                    <Hash className="w-2.5 h-2.5" />
                    {kw}
                  </span>
                ))}
                {topic.matcherKeywords.length > 6 && (
                  <span className="text-xs text-muted-foreground">
                    +{topic.matcherKeywords.length - 6}
                  </span>
                )}
              </div>
            )}

            {/* Tools */}
            {tools.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1 border-t border-border/50">
                {tools.map((tool) => (
                  <Badge
                    key={tool.id}
                    variant="outline"
                    className={`text-xs gap-1 ${
                      highlightToolId === tool.id
                        ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700'
                        : ''
                    }`}
                  >
                    <Wrench className="w-2.5 h-2.5" />
                    {tool.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
