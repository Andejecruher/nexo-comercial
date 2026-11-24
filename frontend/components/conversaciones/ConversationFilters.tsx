'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  InboxAssignmentFilter,
  InboxStatusFilter,
} from '@/hooks/conversaciones/useConversations';
import type { Department } from '@/lib/shared/catalog-api';
import type { ConversationFlowState } from '@/lib/shared/conversation-fsm';
import { FLOW_STATE_LABELS } from '@/lib/shared/conversation-fsm';

const FLOW_OPTIONS: Array<ConversationFlowState | 'all'> = [
  'all',
  'BOT_FLOW',
  'REGISTERING',
  'DEPARTMENT_ROUTING',
  'HUMAN_FLOW',
  'ESCALATED',
  'CLOSED',
];

interface ConversationFiltersProps {
  status: InboxStatusFilter;
  assignment: InboxAssignmentFilter;
  flowState: ConversationFlowState | 'all';
  departmentSlug: string | undefined;
  departments: Department[];
  onStatusChange: (v: InboxStatusFilter) => void;
  onAssignmentChange: (v: InboxAssignmentFilter) => void;
  onFlowStateChange: (v: ConversationFlowState | 'all') => void;
  onDepartmentChange: (slug: string | undefined) => void;
  onClear: () => void;
}

export function ConversationFilters({
  status,
  assignment,
  flowState,
  departmentSlug,
  departments,
  onStatusChange,
  onAssignmentChange,
  onFlowStateChange,
  onDepartmentChange,
  onClear,
}: ConversationFiltersProps) {
  return (
    <div className="rounded-2xl border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">Estado conversación</Label>
          <Select value={status} onValueChange={(v) => onStatusChange(v as InboxStatusFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="open">En Gestión</SelectItem>
              <SelectItem value="closed">Caso Resuelto</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">Asignación</Label>
          <Select
            value={assignment}
            onValueChange={(v) => onAssignmentChange(v as InboxAssignmentFilter)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Asignación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="unassigned">Sin asignar</SelectItem>
              <SelectItem value="mine">Mis conversaciones</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">Flujo (FSM)</Label>
          <Select
            value={flowState}
            onValueChange={(v) => onFlowStateChange(v as ConversationFlowState | 'all')}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Flujo" />
            </SelectTrigger>
            <SelectContent>
              {FLOW_OPTIONS.map((key) => (
                <SelectItem key={key} value={key}>
                  {key === 'all' ? 'Todos los estados' : FLOW_STATE_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">Departamento (routing)</Label>
          <Select
            value={departmentSlug ?? '__all__'}
            onValueChange={(v) => onDepartmentChange(v === '__all__' ? undefined : v)}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {departments
                .filter((d) => d.isActive)
                .map((d) => (
                  <SelectItem key={d.id} value={d.slug}>
                    {d.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="button" variant="outline" onClick={onClear} className="mb-0.5">
          Limpiar filtros
        </Button>
      </div>
    </div>
  );
}
