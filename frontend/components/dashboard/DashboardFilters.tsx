'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { RefreshCcw, RotateCcw } from 'lucide-react';
import type { DashboardFilters as DashboardFiltersValue } from '@/hooks/dashboard/useDashboardMetrics';

const SELECT_TRIGGER_CLASS =
  'mt-1 w-full max-md:min-w-0 max-md:max-w-full max-md:*:data-[slot=select-value]:min-w-0 max-md:*:data-[slot=select-value]:block max-md:*:data-[slot=select-value]:truncate';

interface DashboardFiltersProps {
  filters: DashboardFiltersValue;
  departments: Array<{ slug: string; name: string }>;
  agents: Array<{ id: string; name: string }>;
  loadingDepartments: boolean;
  loadingAgents: boolean;
  pollingEnabled: boolean;
  onPollingChange: (value: boolean) => void;
  onFromChange: (value: string | undefined) => void;
  onToChange: (value: string | undefined) => void;
  onDepartmentChange: (value: string | undefined) => void;
  onAgentChange: (value: string | undefined) => void;
  onClear: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  className?: string;
}

export function DashboardFilters({
  filters,
  departments,
  agents,
  loadingDepartments,
  loadingAgents,
  pollingEnabled,
  onPollingChange,
  onFromChange,
  onToChange,
  onDepartmentChange,
  onAgentChange,
  onClear,
  onRefresh,
  refreshing,
  className,
}: DashboardFiltersProps) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-4 shadow-xs', className)}>
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="grid gap-3 max-md:min-w-0 max-md:grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          <div className="max-md:min-w-0">
            <label className="text-xs font-semibold text-muted-foreground">Desde</label>
            <Input
              type="date"
              value={filters.from ?? ''}
              onChange={(event) => onFromChange(event.target.value || undefined)}
              className="mt-1 max-md:min-w-0 max-md:max-w-full"
            />
          </div>
          <div className="max-md:min-w-0">
            <label className="text-xs font-semibold text-muted-foreground">Hasta</label>
            <Input
              type="date"
              value={filters.to ?? ''}
              onChange={(event) => onToChange(event.target.value || undefined)}
              className="mt-1 max-md:min-w-0 max-md:max-w-full"
            />
          </div>
          <div className="max-md:min-w-0">
            <label className="text-xs font-semibold text-muted-foreground">Departamento</label>
            <Select
              value={filters.department ?? 'all'}
              onValueChange={(value) => onDepartmentChange(value === 'all' ? undefined : value)}
              disabled={loadingDepartments}
            >
              <SelectTrigger className={SELECT_TRIGGER_CLASS} size="sm">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent className="max-md:max-w-(--radix-select-content-available-width) max-md:wrap-anywhere">
                <SelectItem value="all">Todos los departamentos</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.slug} value={dept.slug}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="max-md:min-w-0">
            <label className="text-xs font-semibold text-muted-foreground">Agente</label>
            <Select
              value={filters.agentId ?? 'all'}
              onValueChange={(value) => onAgentChange(value === 'all' ? undefined : value)}
              disabled={loadingAgents}
            >
              <SelectTrigger className={SELECT_TRIGGER_CLASS} size="sm">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent className="max-md:max-w-(--radix-select-content-available-width) max-md:wrap-anywhere">
                <SelectItem value="all">Todos los agentes</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={pollingEnabled} onCheckedChange={onPollingChange} />
            Auto-refresh
          </div>
          <Button variant="outline" size="sm" onClick={onClear} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Limpiar
          </Button>
          <Button size="sm" onClick={onRefresh} className="gap-2" disabled={refreshing}>
            <RefreshCcw className={cn('h-4 w-4', refreshing ? 'animate-spin' : '')} />
            Actualizar
          </Button>
        </div>
      </div>
    </div>
  );
}
