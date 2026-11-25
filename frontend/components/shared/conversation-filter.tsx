'use client';

import { DepartmentCheckboxGroup } from '@/components/shared/department-checkbox-group';
import { BotIcon } from '@/components/shared/messaging/bot-icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDepartments } from '@/hooks/shared/useDepartments';
import type { AiAgentSummaryApi } from '@/lib/shared/messaging-api';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useMemo } from 'react';

interface ConversationFilterProps {
  departmentIds: string[];
  onDepartmentIdsChange: (value: string[]) => void;
  /** `null` = "Todos los bots" (líneas con agente IA activo). */
  botIds: (string | null)[];
  onBotIdsChange: (value: (string | null)[]) => void;
  aiAgents: AiAgentSummaryApi[];
  disabled?: boolean;
  /** Identificador del trigger, para evitar colisiones cuando se reusa en modales. */
  id?: string;
  ariaLabel?: string;
}

function departmentSummary(departments: { id: string; name: string }[], ids: string[]) {
  const selected = departments.filter((department) => ids.includes(department.id));
  if (selected.length === 0) return undefined;
  if (selected.length === 1) return selected[0]?.name;
  return `${selected[0]?.name} +${selected.length - 1}`;
}

function botSummary(agents: AiAgentSummaryApi[], botIds: (string | null)[]) {
  if (botIds.length === 0) return undefined;
  if (botIds.length === 1) {
    const id = botIds[0];
    return id === null
      ? 'Todos los bots'
      : (agents.find((agent) => agent.id === id)?.name ?? 'Bot');
  }
  return `${botIds.length} bots`;
}

/**
 * Filtro de conversaciones de la bandeja: departamentos + agentes de IA en un
 * solo Popover con semántica OR (multi-select en ambos grupos).
 */
export function ConversationFilter({
  departmentIds,
  onDepartmentIdsChange,
  botIds,
  onBotIdsChange,
  aiAgents,
  disabled = false,
  id = 'inbox-dept-filter',
  ariaLabel = 'Seleccionar departamentos',
}: ConversationFilterProps) {
  const { departments } = useDepartments({ autoFetch: true, pageSize: 50 });
  const activeDepartments = useMemo(
    () => departments.filter((department) => department.isActive),
    [departments],
  );

  const botOptions = useMemo(
    () => [
      { id: 'all-bots', name: 'Todos los bots', value: null as string | null },
      ...aiAgents.map((agent) => ({ id: agent.id, name: agent.name, value: agent.id })),
    ],
    [aiAgents],
  );

  const deptSummary = departmentSummary(activeDepartments, departmentIds);
  const botsSummary = botSummary(aiAgents, botIds);
  const summary =
    deptSummary && botsSummary
      ? `${deptSummary} · ${botsSummary}`
      : (deptSummary ?? botsSummary ?? 'Todos');

  const toggleBot = (botId: string | null) => {
    if (disabled) return;
    const next = botIds.includes(botId) ? botIds.filter((id) => id !== botId) : [...botIds, botId];
    onBotIdsChange(next);
  };

  const clearDepartments = () => {
    if (disabled) return;
    onDepartmentIdsChange([]);
  };

  const clearBots = () => {
    if (disabled) return;
    onBotIdsChange([]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className="flex h-10 w-full items-center gap-2 rounded-md bg-muted/50 px-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={ariaLabel}
        >
          {botIds.length > 0 ? (
            <BotIcon className="size-3.5 shrink-0" />
          ) : (
            <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{summary}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="flex items-center justify-between px-2 py-1.5">
          <div>
            <p className="text-xs font-semibold text-foreground">Departamentos</p>
            <p className="text-[10px] text-muted-foreground">Combina una o varias áreas</p>
          </div>
          {departmentIds.length > 0 && (
            <button
              type="button"
              onClick={clearDepartments}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Ver todos
            </button>
          )}
        </div>
        <DepartmentCheckboxGroup
          idPrefix={`${id}-group`}
          departments={activeDepartments}
          value={departmentIds}
          onChange={onDepartmentIdsChange}
          disabled={disabled}
        />

        <div className="mx-2 my-1.5 border-t border-border" role="separator" />

        <div className="flex items-center justify-between px-2 py-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <BotIcon className="size-3.5" />
            Agentes de IA
          </p>
          {botIds.length > 0 && (
            <button
              type="button"
              onClick={clearBots}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Ver todos
            </button>
          )}
        </div>
        <div
          role="group"
          aria-label="Agentes de IA"
          className="mt-1 max-h-56 space-y-0.5 overflow-y-auto"
        >
          {botOptions.map((agent) => {
            const checked = botIds.includes(agent.value);
            return (
              <button
                key={agent.id}
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => toggleBot(agent.value)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                {checked && <Check className="size-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
