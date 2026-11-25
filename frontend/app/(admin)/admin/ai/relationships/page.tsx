'use client';

import { RelationshipGraph } from '@/components/ai/RelationshipGraph';
import { Button } from '@/components/ui/button';
import { useAgents } from '@/hooks/ai/useAgents';
import { useLines } from '@/hooks/shared/useLines';
import { usePrompts } from '@/hooks/ai/usePrompts';
import { useTools } from '@/hooks/ai/useTools';
import { useTopics } from '@/hooks/ai/useTopics';
import { GitFork, RefreshCw } from 'lucide-react';

export default function AiRelationshipsPage() {
  const { agents, loading: loadingAgents, refresh: refreshAgents } = useAgents({ limit: 100 });
  const { lines, loading: loadingLines, refresh: refreshLines } = useLines({ limit: 100 });
  const { topics, loading: loadingTopics, refresh: refreshTopics } = useTopics({ limit: 100 });
  const { tools, loading: loadingTools, refresh: refreshTools } = useTools({ limit: 100 });
  const { prompts, loading: loadingPrompts, refresh: refreshPrompts } = usePrompts({ limit: 100 });

  const loading = loadingAgents || loadingLines || loadingTopics || loadingTools || loadingPrompts;

  const handleRefreshAll = () => {
    refreshAgents();
    refreshLines();
    refreshTopics();
    refreshTools();
    refreshPrompts();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <GitFork className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Relaciones IA</h2>
            <p className="text-xs text-muted-foreground">
              Mapa de dependencias entre agentes, líneas, tópicos y tools
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <RelationshipGraph
          agents={agents}
          tools={tools}
          topics={topics}
          prompts={prompts}
          lines={lines}
          loading={loading}
        />
      </div>
    </div>
  );
}
