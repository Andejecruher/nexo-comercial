'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PanelUserDto } from '@/lib/admin-users-api';
import type { Department } from '@/lib/catalog-api';
import { ArrowLeftRight, Bot, Building2, ChevronLeft, UserRound } from 'lucide-react';
import { useState } from 'react';

export type TransferDestinationType = 'department' | 'agent' | 'ai';

interface TransferOption {
  type: TransferDestinationType;
  label: string;
  description: string;
  icon: typeof Building2;
}

const TRANSFER_OPTIONS: TransferOption[] = [
  {
    type: 'department',
    label: 'Transferir a Departamento',
    description: 'Canaliza la conversación al flujo automático de un departamento',
    icon: Building2,
  },
  {
    type: 'agent',
    label: 'Transferir a Agente',
    description: 'Pasa el control a un agente específico',
    icon: UserRound,
  },
  {
    type: 'ai',
    label: 'Devolver al Agente IA',
    description: 'Libera el control y reactiva el asistente automático',
    icon: Bot,
  },
] as const;

export interface TransferButtonProps {
  departments: Department[];
  panelUsers: PanelUserDto[];
  usersLoading?: boolean;
  /** true mientras hay una transferencia en curso (evita doble envío) */
  running?: boolean;
  disabled?: boolean;
  /** Devuelve true si la transferencia se confirmó. Para 'ai' el id se ignora. */
  onTransfer: (type: TransferDestinationType, targetId: string) => Promise<boolean>;
}

function displayName(u: PanelUserDto): string {
  const n = u.fullName?.trim();
  if (n) return n;
  return u.email;
}

export function TransferButton({
  departments,
  panelUsers,
  usersLoading = false,
  running = false,
  disabled = false,
  onTransfer,
}: TransferButtonProps) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<TransferDestinationType | undefined>(undefined);
  const [targetId, setTargetId] = useState<string | undefined>(undefined);

  const activeDepts = departments.filter((d) => d.isActive);

  const resetFlow = () => {
    setSelectedType(undefined);
    setTargetId(undefined);
  };

  const close = () => {
    resetFlow();
    setOpen(false);
  };

  const confirm = async () => {
    if (selectedType === 'department' || selectedType === 'agent') {
      if (!targetId) return;
      const ok = await onTransfer(selectedType, targetId);
      if (ok) close();
    } else {
      const ok = await onTransfer('ai', '');
      if (ok) close();
    }
  };

  const busy = running || !selectedType ? running : false;
  const showTargetSelect = selectedType === 'department' || selectedType === 'agent';
  const canConfirm = selectedType === 'ai' || (showTargetSelect && !!targetId);

  const goBack = (
    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={resetFlow}>
      <ChevronLeft className="size-3.5" aria-hidden />
      Destinos
    </Button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true);
        } else {
          close();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled || running}>
          <ArrowLeftRight className="size-4" aria-hidden />
          Transferir
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        {selectedType === undefined ? (
          <div className="p-2 space-y-1">
            {TRANSFER_OPTIONS.map(({ type, label, description, icon: Icon }) => (
              <button
                key={type}
                type="button"
                className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSelectedType(type)}
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground leading-snug">
                    {description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {goBack}
            {showTargetSelect && (
              <div className="space-y-1.5">
                {selectedType === 'agent' && (
                  <Label className="text-xs text-muted-foreground">
                    {usersLoading ? 'Cargando usuarios…' : 'Agente destino'}
                  </Label>
                )}
                {selectedType === 'department' && (
                  <Label className="text-xs text-muted-foreground">Departamento destino</Label>
                )}
                <Select
                  value={targetId ?? '__none__'}
                  onValueChange={(v) => setTargetId(v === '__none__' ? undefined : v)}
                  disabled={selectedType === 'agent' && usersLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        selectedType === 'agent'
                          ? usersLoading
                            ? 'Cargando usuarios…'
                            : 'Elegí agente'
                          : 'Elegí departamento'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Seleccionar…</SelectItem>
                    {selectedType === 'agent'
                      ? panelUsers
                          .filter((u) => u.isActive)
                          .map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {displayName(u)}
                            </SelectItem>
                          ))
                      : activeDepts.map((d) => (
                          <SelectItem key={d.id} value={d.slug}>
                            {d.name}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {selectedType === 'ai' && (
              <p className="text-sm text-muted-foreground leading-snug">
                La conversación vuelve al flujo automático: se liberan las asignaciones y el
                asistente retoma el control.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={close}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canConfirm || busy}
                onClick={() => void confirm()}
              >
                {busy ? 'Transfiriendo…' : 'Confirmar Transferencia'}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
