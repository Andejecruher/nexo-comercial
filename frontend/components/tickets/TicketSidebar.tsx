'use client';

/**
 * TicketSidebar — Panel lateral de acciones del ticket.
 *
 * Muestra:
 * - Info del ciudadano y ticket
 * - Cambiar asignación / handover / cerrar / reabrir
 * - Confirmaciones para acciones críticas (cerrar, handover)
 */

import { TicketPriorityBadge } from '@/components/shared/tickets/TicketPriorityBadge';
import { TicketStatusBadge } from '@/components/shared/tickets/TicketStatusBadge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { useAssignTicket } from '@/hooks/tickets/useAssignTicket';
import type { PanelUserDto } from '@/lib/shared/admin-users-api';
import type { Department } from '@/lib/shared/catalog-api';
import { FLOW_STATE_LABELS } from '@/lib/shared/conversation-fsm';
import type { ConversationActionFlags } from '@/lib/shared/conversation-ui-actions';
import type { TicketDetailDto } from '@/lib/shared/tickets-api';
import { Building2, RefreshCw, User, UserCheck } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

type AssignTicketHook = ReturnType<typeof useAssignTicket>;

interface TicketSidebarProps {
  ticket: TicketDetailDto;
  flags: ConversationActionFlags;
  isSupervisor: boolean;
  departments: Department[];
  panelUsers: PanelUserDto[];
  usersLoading: boolean;
  running: string | undefined;
  actions: AssignTicketHook;
}

const NO_DEPARTMENT_VALUE = '__no_department__';

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5 [overflow-wrap:anywhere]">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export const TicketSidebar = memo(function TicketSidebar({
  ticket,
  flags,
  isSupervisor,
  departments,
  panelUsers,
  usersLoading,
  running,
  actions,
}: TicketSidebarProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');

  const isRunning = (key: string) => running === key;

  const handleAssignUser = useCallback(async () => {
    if (!selectedUserId) return;
    await actions.assignToUser(selectedUserId, selectedDept || undefined);
    setSelectedUserId('');
  }, [actions, selectedUserId, selectedDept]);

  return (
    <div className="min-w-0 space-y-5 [&_button]:min-h-11 [&_button]:cursor-pointer [&_button]:whitespace-normal [&_button]:disabled:cursor-not-allowed">
      {/* Info card */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <h3 className="text-sm font-bold text-foreground">Detalles del ticket</h3>
        <Separator />

        <div className="space-y-3">
          <InfoRow label="Folio">
            <span className="font-mono text-xs text-foreground">{ticket.folio}</span>
          </InfoRow>

          <InfoRow label="Estado">
            <TicketStatusBadge status={ticket.status} />
          </InfoRow>

          <InfoRow label="Prioridad">
            <TicketPriorityBadge priority={ticket.priority} />
          </InfoRow>

          <InfoRow label="Flujo">
            <span className="text-foreground">{FLOW_STATE_LABELS[ticket.flowState]}</span>
          </InfoRow>

          <InfoRow label="Ciudadano">
            <div>
              <p className="font-medium text-foreground">{ticket.citizenName}</p>
              <p className="text-xs text-muted-foreground">{ticket.citizenPhone}</p>
            </div>
          </InfoRow>

          {ticket.departmentSlug && (
            <InfoRow label="Departamento">
              <span className="bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded-md">
                {ticket.departmentSlug}
              </span>
            </InfoRow>
          )}

          {ticket.assignedUserId && (
            <InfoRow label="Agente asignado">
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-mono text-xs">{ticket.assignedUserId.slice(0, 8)}…</span>
              </div>
            </InfoRow>
          )}

          <InfoRow label="Creado">
            <span className="text-muted-foreground">
              {new Date(ticket.createdAt).toLocaleString('es-MX')}
            </span>
          </InfoRow>
        </div>
      </div>

      {/* Acciones */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground">Acciones</h3>
        <Separator />

        {/* Asignarme */}
        {flags.canAssignSelf && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            disabled={isRunning('assign-self')}
            onClick={() => void actions.assignToSelf()}
          >
            <UserCheck className="w-4 h-4" />
            {isRunning('assign-self') ? 'Asignando…' : 'Asignarme este ticket'}
          </Button>
        )}

        {/* Handover con confirmación */}
        {flags.canHandover && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                disabled={isRunning('handover')}
              >
                <Building2 className="w-4 h-4" />
                {isRunning('handover') ? 'Transfiriendo…' : 'Pasar a agente humano'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-h-[90dvh] overflow-y-auto [&_button]:min-h-11 [&_button]:cursor-pointer">
              <AlertDialogHeader>
                <AlertDialogTitle>¿Pasar a agente humano?</AlertDialogTitle>
                <AlertDialogDescription>
                  La conversación cambiará al flujo HUMAN_FLOW. El bot dejará de responder
                  automáticamente. ¿Confirmar?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void actions.handover()}>
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Cerrar ticket con confirmación */}
        {flags.canClose && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={isRunning('close')}
              >
                {isRunning('close') ? 'Cerrando…' : 'Cerrar ticket'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-h-[90dvh] overflow-y-auto [&_button]:min-h-11 [&_button]:cursor-pointer">
              <AlertDialogHeader>
                <AlertDialogTitle>¿Cerrar este ticket?</AlertDialogTitle>
                <AlertDialogDescription>
                  El ticket quedará cerrado. Solo un supervisor podrá reabrirlo. ¿Confirmar cierre?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => void actions.close()}
                >
                  Cerrar ticket
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Reabrir */}
        {flags.canReopen && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            disabled={isRunning('reopen')}
            onClick={() => void actions.reopen()}
          >
            <RefreshCw className="w-4 h-4" />
            {isRunning('reopen') ? 'Reabriendo…' : 'Reabrir ticket'}
          </Button>
        )}
      </div>

      {/* Asignación a otro agente — solo supervisores */}
      {isSupervisor && flags.canAssignOther && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground">Reasignar agente</h3>
          <Separator />

          {usersLoading ? (
            <p className="text-xs text-muted-foreground">Cargando agentes…</p>
          ) : (
            <>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Seleccionar agente">
                  <SelectValue placeholder="Seleccionar agente…" />
                </SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)] [&_[role=option]]:min-h-11 [&_[role=option]]:cursor-pointer [&_[role=option]]:whitespace-normal [&_[role=option]]:[overflow-wrap:anywhere]">
                  {panelUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName ?? u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedDept}
                onValueChange={(value) =>
                  setSelectedDept(value === NO_DEPARTMENT_VALUE ? '' : value)
                }
              >
                <SelectTrigger
                  size="sm"
                  className="w-full min-w-0"
                  aria-label="Departamento opcional"
                >
                  <SelectValue placeholder="Depto. (opcional)" />
                </SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)] [&_[role=option]]:min-h-11 [&_[role=option]]:cursor-pointer [&_[role=option]]:whitespace-normal [&_[role=option]]:[overflow-wrap:anywhere]">
                  <SelectItem value={NO_DEPARTMENT_VALUE}>Sin departamento</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.slug}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                size="sm"
                className="w-full"
                disabled={!selectedUserId || isRunning('assign-user')}
                onClick={() => void handleAssignUser()}
              >
                {isRunning('assign-user') ? 'Asignando…' : 'Asignar agente'}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
});
