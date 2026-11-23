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
import type { PrecampanaFilterMode } from '@/hooks/usePrecampanaDashboard';
import type { PrecampanaFilterOptions } from '@/lib/precampana-api';

const SELECT_TRIGGER_CLASS =
  'w-full min-w-0 max-w-full *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate';

type PrecampanaFiltersBarProps = {
  filterMode: PrecampanaFilterMode;
  sectionId: string;
  leaderId: string;
  coordinatorId: string;
  dateFrom: string;
  dateTo: string;
  hasFilter: boolean;
  options: PrecampanaFilterOptions;
  onFilterModeChange: (mode: PrecampanaFilterMode) => void;
  onSectionIdChange: (value: string) => void;
  onLeaderIdChange: (value: string) => void;
  onCoordinatorIdChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClear: () => void;
};

export function PrecampanaFiltersBar({
  filterMode,
  sectionId,
  leaderId,
  coordinatorId,
  dateFrom,
  dateTo,
  hasFilter,
  options,
  onFilterModeChange,
  onSectionIdChange,
  onLeaderIdChange,
  onCoordinatorIdChange,
  onDateFromChange,
  onDateToChange,
  onClear,
}: PrecampanaFiltersBarProps) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-end gap-3">
      <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Filtro Global
        </label>
        <Select
          value={filterMode}
          onValueChange={(value) => onFilterModeChange(value as PrecampanaFilterMode)}
        >
          <SelectTrigger className={`${SELECT_TRIGGER_CLASS} sm:w-45`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="coordinator">Por Coordinador</SelectItem>
            <SelectItem value="section">Por Sección</SelectItem>
            <SelectItem value="leader">Por Líder</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filterMode === 'coordinator' && (
        <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Coordinador
          </label>
          <Select
            value={coordinatorId || 'none'}
            onValueChange={(value) => onCoordinatorIdChange(value === 'none' ? '' : value)}
          >
            <SelectTrigger className={`${SELECT_TRIGGER_CLASS} sm:w-60`}>
              <SelectValue placeholder="Seleccionar coordinador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Todos</SelectItem>
              {options.coordinators.map((coordinator) => (
                <SelectItem key={coordinator.id} value={coordinator.id}>
                  {coordinator.fullName} · S{coordinator.sectionCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {filterMode === 'section' && (
        <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Sección
          </label>
          <Select
            value={sectionId || 'none'}
            onValueChange={(value) => onSectionIdChange(value === 'none' ? '' : value)}
          >
            <SelectTrigger className={`${SELECT_TRIGGER_CLASS} sm:w-40`}>
              <SelectValue placeholder="Seleccionar sección" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Todas</SelectItem>
              {options.sections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.sectionCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {filterMode === 'leader' && (
        <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Líder
          </label>
          <Select
            value={leaderId || 'none'}
            onValueChange={(value) => onLeaderIdChange(value === 'none' ? '' : value)}
          >
            <SelectTrigger className={`${SELECT_TRIGGER_CLASS} sm:w-60`}>
              <SelectValue placeholder="Seleccionar líder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Todos</SelectItem>
              {options.leaders.map((leader) => (
                <SelectItem key={leader.id} value={leader.id}>
                  {leader.fullName}
                  {leader.coordinatorName ? ` · ${leader.coordinatorName}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Desde
        </label>
        <Input
          type="date"
          value={dateFrom}
          onChange={(event) => onDateFromChange(event.target.value)}
          className="min-w-0 w-full max-w-full sm:w-40"
        />
      </div>
      <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Hasta
        </label>
        <Input
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(event) => onDateToChange(event.target.value)}
          className="min-w-0 w-full max-w-full sm:w-40"
        />
      </div>

      {hasFilter && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Limpiar
        </Button>
      )}
    </div>
  );
}
