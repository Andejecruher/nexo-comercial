'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CommunicationLine, AiAgent } from '@/lib/shared/ai-api';
import { Phone, Settings, Wifi, WifiOff } from 'lucide-react';

interface PhoneLineCardProps {
  line: CommunicationLine;
  availableAgents?: AiAgent[];
  onConfigure?: (line: CommunicationLine) => void;
}

export function PhoneLineCard({ line, onConfigure }: PhoneLineCardProps) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md ${
        line.isActive ? 'border-border' : 'border-border/50 opacity-60'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted">
            <Phone className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{line.displayName}</p>
            {line.phoneNumber && (
              <p className="text-xs text-muted-foreground font-mono">{line.phoneNumber}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={line.isActive ? 'default' : 'secondary'} className="text-xs">
            {line.isActive ? 'Activa' : 'Inactiva'}
          </Badge>
          {line.isDefault && (
            <Badge variant="outline" className="text-xs">
              Por defecto
            </Badge>
          )}
        </div>
      </div>

      {/* Channel + identifier */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-xs capitalize">
          {line.channel}
        </Badge>
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
          {line.externalIdentifier}
        </code>
      </div>

      {/* AI status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {line.aiEnabled ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">IA Habilitada</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">IA Deshabilitada</span>
            </>
          )}
        </div>
        {onConfigure && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onConfigure(line)}
          >
            <Settings className="w-3 h-3" />
            Configurar
          </Button>
        )}
      </div>

      {/* Agent */}
      {line.agent ? (
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          <div className="text-xs text-muted-foreground">Agente:</div>
          <div>
            <span className="text-xs font-medium">{line.agent.name}</span>
            <span className="text-xs text-muted-foreground ml-1.5">
              {line.agent.provider}/{line.agent.model}
            </span>
          </div>
        </div>
      ) : (
        <div className="pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground italic">Sin agente asignado</span>
        </div>
      )}
    </div>
  );
}
