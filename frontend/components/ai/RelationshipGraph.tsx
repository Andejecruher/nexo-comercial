'use client';

import { Badge } from '@/components/ui/badge';
import type { AiAgent, AiTool, AiTopic, AiPrompt, CommunicationLine } from '@/lib/shared/ai-api';
import { Bot, FileText, Phone, BookOpen, Wrench, ArrowRight } from 'lucide-react';

interface RelationshipGraphProps {
  agents: AiAgent[];
  tools: AiTool[];
  topics: AiTopic[];
  prompts: AiPrompt[];
  lines: CommunicationLine[];
  loading?: boolean;
}

export function RelationshipGraph({
  agents,
  tools,
  topics,
  prompts,
  lines,
  loading = false,
}: RelationshipGraphProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Cargando relaciones…
      </div>
    );
  }

  const activeAgents = agents.filter((a) => a.isActive);
  const activeLines = lines.filter((l) => l.isActive && l.aiEnabled);
  const activeTopics = topics.filter((t) => t.isActive);
  const activeTools = tools.filter((t) => t.isActive);
  const activePrompts = prompts.filter((p) => p.isActive);

  return (
    <div className="flex flex-col gap-6">
      {/* Stats overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          {
            label: 'Agentes activos',
            count: activeAgents.length,
            total: agents.length,
            icon: Bot,
            color: 'text-purple-500',
          },
          {
            label: 'Líneas IA activas',
            count: activeLines.length,
            total: lines.length,
            icon: Phone,
            color: 'text-blue-500',
          },
          {
            label: 'Tópicos activos',
            count: activeTopics.length,
            total: topics.length,
            icon: BookOpen,
            color: 'text-green-500',
          },
          {
            label: 'Tools activas',
            count: activeTools.length,
            total: tools.length,
            icon: Wrench,
            color: 'text-yellow-500',
          },
          {
            label: 'Prompts activos',
            count: activePrompts.length,
            total: prompts.length,
            icon: FileText,
            color: 'text-orange-500',
          },
        ].map(({ label, count, total, icon: Icon, color }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1 rounded-xl border bg-card p-3 text-center"
          >
            <Icon className={`w-5 h-5 ${color}`} />
            <p className="text-xl font-bold">{count}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {total !== count && (
              <p className="text-xs text-muted-foreground opacity-60">/ {total} total</p>
            )}
          </div>
        ))}
      </div>

      {/* Agent → Lines mapping */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Agentes → Líneas, tópicos y prompts</h3>
        {activeAgents.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin agentes activos</p>
        ) : (
          <div className="flex flex-col gap-3">
            {activeAgents.map((agent) => {
              const agentLines = lines.filter((l) => l.agentId === agent.id);
              return (
                <div
                  key={agent.id}
                  className="flex items-start gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
                      <Bot className="w-4 h-4 text-purple-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {agent.provider} / {agent.model}
                      </p>
                    </div>
                  </div>

                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />

                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {agentLines.length > 0 ? (
                      agentLines.map((line) => (
                        <Badge key={line.id} variant="outline" className="text-xs gap-1">
                          <Phone className="w-2.5 h-2.5" />
                          {line.displayName}
                          {line.aiEnabled && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          )}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        Sin líneas asignadas
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 flex-1 text-xs">
                    {(agent.topics ?? []).map((link) => {
                      const prompt = link.prompt.isActive ? link.prompt : link.topic.systemPrompt;
                      return (
                        <span
                          key={link.id}
                          className={
                            !link.topic.isActive || !prompt?.isActive
                              ? 'text-destructive'
                              : undefined
                          }
                        >
                          {link.topic.name} → {prompt?.isActive ? prompt.name : 'Sin prompt activo'}
                          {link.isDefault ? ' · Predeterminado' : ''}
                          {!link.topic.isActive ? ' · Tópico inactivo' : ''}
                        </span>
                      );
                    })}
                    {!agent.topics?.length && (
                      <span className="text-destructive">Sin tópicos y prompts conectados</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Topics → Tools mapping */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Tópicos → Tools</h3>
        {activeTopics.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin tópicos activos</p>
        ) : (
          <div className="flex flex-col gap-3">
            {activeTopics.map((topic) => {
              const topicTools = (topic.tools as AiTool[] | undefined) ?? [];
              return (
                <div
                  key={topic.id}
                  className="flex items-start gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500/10 border border-green-500/20">
                      <BookOpen className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{topic.name}</p>
                      <code className="text-xs text-muted-foreground font-mono">{topic.slug}</code>
                    </div>
                  </div>

                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />

                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {topicTools.length > 0 ? (
                      topicTools.map((tool) => (
                        <Badge key={tool.id} variant="outline" className="text-xs gap-1">
                          <Wrench className="w-2.5 h-2.5" />
                          {tool.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Sin tools</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unassigned lines */}
      {lines.some((l) => !l.agentId && l.isActive) && (
        <div>
          <h3 className="text-sm font-semibold mb-3 text-destructive/80">
            Líneas sin agente asignado
          </h3>
          <div className="flex flex-wrap gap-2">
            {lines
              .filter((l) => !l.agentId && l.isActive)
              .map((line) => (
                <Badge
                  key={line.id}
                  variant="outline"
                  className="text-xs gap-1 border-destructive/30 text-destructive/80"
                >
                  <Phone className="w-2.5 h-2.5" />
                  {line.displayName}
                </Badge>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
